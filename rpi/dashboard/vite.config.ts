import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import fs from 'fs'
import http from 'http'
import https from 'https'
import net from 'net'

const CONFIG_PATH = path.resolve(__dirname, 'config.json')
const DASHBOARDS_DIR = path.resolve(__dirname, 'dashboards')
const DEVICES_PATH = path.resolve(__dirname, 'devices.json')
const INSTANCES_DIR = path.resolve(__dirname, 'instances')
const CREDENTIALS_PATH = path.resolve(__dirname, 'credentials.json')

function ensureDashboardsDir(): void {
  if (!fs.existsSync(DASHBOARDS_DIR)) {
    fs.mkdirSync(DASHBOARDS_DIR, { recursive: true })
    // Migrate existing config.json to dashboards/default.json
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      const now = new Date().toISOString()
      const dashboardFile = {
        meta: {
          id: 'default',
          name: 'Default',
          layoutMode: 'grid' as const,
          createdAt: now,
          updatedAt: now,
        },
        config,
      }
      fs.writeFileSync(
        path.join(DASHBOARDS_DIR, 'default.json'),
        JSON.stringify(dashboardFile, null, 2),
        'utf-8'
      )
    }
  }
}

async function readBody(req: import('http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString()
}

function configApiPlugin(): Plugin {
  return {
    name: 'config-api',
    configureServer(server) {
      // WebSocket proxy for HA connections (avoids mixed content HTTPS → ws://)
      server.httpServer?.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
        const url = new URL(req.url || '', 'http://localhost')
        if (!url.pathname.startsWith('/api/ha-ws')) return

        const targetUrl = url.searchParams.get('url')
        if (!targetUrl) {
          socket.destroy()
          return
        }

        // Parse the target and create a TCP connection to HA
        const target = new URL(targetUrl)
        const targetPort = parseInt(target.port) || 8123
        const targetHost = target.hostname

        const proxy = net.createConnection({ host: targetHost, port: targetPort }, () => {
          // Send the upgrade request to HA
          const reqPath = target.pathname
          const headers = [
            `GET ${reqPath} HTTP/1.1`,
            `Host: ${targetHost}:${targetPort}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
            `Sec-WebSocket-Version: ${req.headers['sec-websocket-version']}`,
          ]
          if (req.headers['sec-websocket-protocol']) {
            headers.push(`Sec-WebSocket-Protocol: ${req.headers['sec-websocket-protocol']}`)
          }
          proxy.write(headers.join('\r\n') + '\r\n\r\n')
          if (head.length) proxy.write(head)
        })

        // Once HA responds with the upgrade, pipe both ways
        let headersParsed = false
        proxy.on('data', (chunk: Buffer) => {
          if (!headersParsed) {
            const str = chunk.toString()
            if (str.includes('\r\n\r\n')) {
              headersParsed = true
              // Forward the full response (including upgrade headers) to the client
              socket.write(chunk)
              // Now pipe bidirectionally
              proxy.pipe(socket)
              socket.pipe(proxy)
            } else {
              socket.write(chunk)
            }
          }
        })

        proxy.on('error', () => socket.destroy())
        socket.on('error', () => proxy.destroy())
        proxy.on('close', () => socket.destroy())
        socket.on('close', () => proxy.destroy())
      })

      // Ensure dashboards dir exists on first request
      let initialized = false
      server.middlewares.use((_req, _res, next) => {
        if (!initialized) {
          ensureDashboardsDir()
          initialized = true
        }
        next()
      })

      // --- Dashboard API routes (must come before /api/config) ---

      server.middlewares.use('/api/dashboards', async (req, res, next) => {
        const url = req.url || '/'
        // Parse path after /api/dashboards
        // req.url here is relative to the mount point, e.g. "/" or "/kitchen" or "/kitchen/clone"
        const segments = url.split('?')[0].split('/').filter(Boolean)

        // GET /api/dashboards - list all
        if (segments.length === 0 && req.method === 'GET') {
          const files = fs.readdirSync(DASHBOARDS_DIR).filter(f => f.endsWith('.json'))
          const metas = files.map(f => {
            const data = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, f), 'utf-8'))
            return data.meta
          })
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(metas))
          return
        }

        // Routes with :id
        if (segments.length >= 1) {
          const id = segments[0]
          const filePath = path.join(DASHBOARDS_DIR, `${id}.json`)

          // POST /api/dashboards/:id/clone
          if (segments.length === 2 && segments[1] === 'clone' && req.method === 'POST') {
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'Dashboard not found' }))
              return
            }
            const body = JSON.parse(await readBody(req))
            const { newId, newName } = body
            const source = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            const now = new Date().toISOString()
            const cloned = {
              meta: {
                ...source.meta,
                id: newId,
                name: newName,
                createdAt: now,
                updatedAt: now,
              },
              config: source.config,
            }
            const newPath = path.join(DASHBOARDS_DIR, `${newId}.json`)
            fs.writeFileSync(newPath, JSON.stringify(cloned, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(cloned.meta))
            return
          }

          // GET /api/dashboards/:id
          if (segments.length === 1 && req.method === 'GET') {
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'Dashboard not found' }))
              return
            }
            const data = fs.readFileSync(filePath, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
            return
          }

          // POST /api/dashboards/:id
          if (segments.length === 1 && req.method === 'POST') {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            // Ensure meta.updatedAt is set
            parsed.meta.updatedAt = new Date().toISOString()
            fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
            return
          }

          // DELETE /api/dashboards/:id
          if (segments.length === 1 && req.method === 'DELETE') {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath)
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
            return
          }

          // PATCH /api/dashboards/:id — partial meta update (rename)
          if (segments.length === 1 && req.method === 'PATCH') {
            if (!fs.existsSync(filePath)) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'Dashboard not found' }))
              return
            }
            const body = JSON.parse(await readBody(req))
            const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            if (body.name !== undefined) {
              existing.meta.name = body.name
            }
            existing.meta.updatedAt = new Date().toISOString()
            fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(existing.meta))
            return
          }
        }

        next()
      })

      // --- Device assignments API ---
      // GET  /api/devices                     → full {name: dashboardId} map
      // POST /api/devices                     → replace the whole map
      // PUT  /api/devices/:name               → idempotent register; no-op if name exists
      // POST /api/devices/:name/signal        → push a signal (reload) to the device
      // GET  /api/devices/:name/signal        → pulled by the device every 30s
      //
      // Signals are in-memory only — stored as the latest-pushed entry per
      // device. If the server restarts the signal is dropped, which is
      // fine: Pis reconnect on restart anyway.
      const deviceSignals = new Map<string, { id: string; type: string; createdAt: string }>()

      server.middlewares.use('/api/devices', async (req, res) => {
        const url = req.url || '/'
        const segments = url.split('?')[0].split('/').filter(Boolean)

        // GET/POST /api/devices/:name/signal
        if (segments.length === 2 && segments[1] === 'signal') {
          const name = segments[0].replace(/[^a-zA-Z0-9_-]/g, '')
          if (!name) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid device name' }))
            return
          }
          if (req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ signal: deviceSignals.get(name) || null }))
            return
          }
          if (req.method === 'POST') {
            const body = await readBody(req)
            const parsed = body ? JSON.parse(body) : {}
            const type = parsed.type || 'reload'
            const sig = {
              id: (globalThis.crypto?.randomUUID?.() || `sig-${Date.now()}-${Math.random().toString(36).slice(2)}`),
              type,
              createdAt: new Date().toISOString(),
            }
            deviceSignals.set(name, sig)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, signal: sig }))
            return
          }
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        // Per-device PUT for auto-registration.
        if (req.method === 'PUT' && segments.length === 1) {
          const name = segments[0].replace(/[^a-zA-Z0-9_-]/g, '')
          if (!name) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Invalid device name' }))
            return
          }
          const existing: Record<string, string> = fs.existsSync(DEVICES_PATH)
            ? JSON.parse(fs.readFileSync(DEVICES_PATH, 'utf-8'))
            : {}
          const added = !(name in existing)
          if (added) {
            existing[name] = 'default'
            fs.writeFileSync(DEVICES_PATH, JSON.stringify(existing, null, 2), 'utf-8')
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, added }))
          return
        }

        if (req.method === 'GET' && segments.length === 0) {
          if (fs.existsSync(DEVICES_PATH)) {
            const data = fs.readFileSync(DEVICES_PATH, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
          } else {
            res.setHeader('Content-Type', 'application/json')
            res.end('{}')
          }
          return
        }

        if (req.method === 'POST' && segments.length === 0) {
          const body = await readBody(req)
          fs.writeFileSync(DEVICES_PATH, body, 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.statusCode = 405
        res.end('Method not allowed')
      })

      // --- Per-device instance overrides API ---
      // GET  /api/instances/:deviceId  → returns stored overrides (or {} if none)
      // POST /api/instances/:deviceId  → body is the InstanceFile JSON

      server.middlewares.use('/api/instances', async (req, res) => {
        const url = req.url || '/'
        const segments = url.split('?')[0].split('/').filter(Boolean)

        if (segments.length !== 1) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Device id required' }))
          return
        }

        const deviceId = segments[0].replace(/[^a-zA-Z0-9_-]/g, '')
        if (!deviceId) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid device id' }))
          return
        }

        const filePath = path.join(INSTANCES_DIR, `${deviceId}.json`)

        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json')
          if (fs.existsSync(filePath)) {
            res.end(fs.readFileSync(filePath, 'utf-8'))
          } else {
            res.end(JSON.stringify({ version: 1, deviceId, updatedAt: '', overrides: {} }))
          }
          return
        }

        if (req.method === 'POST') {
          if (!fs.existsSync(INSTANCES_DIR)) {
            fs.mkdirSync(INSTANCES_DIR, { recursive: true })
          }
          const body = await readBody(req)
          const parsed = JSON.parse(body)
          parsed.updatedAt = new Date().toISOString()
          parsed.deviceId = deviceId
          parsed.version = 1
          fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.statusCode = 405
        res.end('Method not allowed')
      })

      // --- Credentials API ---

      server.middlewares.use('/api/credentials', async (req, res) => {
        if (req.method === 'GET') {
          if (fs.existsSync(CREDENTIALS_PATH)) {
            const data = fs.readFileSync(CREDENTIALS_PATH, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
          } else {
            res.setHeader('Content-Type', 'application/json')
            res.end('{}')
          }
          return
        }

        if (req.method === 'POST') {
          const body = await readBody(req)
          fs.writeFileSync(CREDENTIALS_PATH, body, 'utf-8')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.statusCode = 405
        res.end('Method not allowed')
      })

      // --- Existing routes below ---

      server.middlewares.use('/api/spotify/token', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const body = JSON.parse(await readBody(req))
        const { code, clientId, clientSecret, redirectUri } = body

        try {
          const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
              client_id: clientId,
              client_secret: clientSecret,
            }),
          })

          const data = await tokenRes.json()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Token exchange failed' }))
        }
      })

      server.middlewares.use('/api/google/token', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const body = JSON.parse(await readBody(req))
        const { code, clientId, clientSecret, redirectUri, refreshToken } = body

        try {
          const params: Record<string, string> = {
            client_id: clientId,
            client_secret: clientSecret,
          }

          if (refreshToken) {
            params.grant_type = 'refresh_token'
            params.refresh_token = refreshToken
          } else {
            params.grant_type = 'authorization_code'
            params.code = code
            params.redirect_uri = redirectUri
          }

          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params),
          })

          const data = await tokenRes.json()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Google token exchange failed' }))
        }
      })

      server.middlewares.use('/api/microsoft/token', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const body = JSON.parse(await readBody(req))
        const { code, clientId, clientSecret, redirectUri, refreshToken } = body

        try {
          const params: Record<string, string> = {
            client_id: clientId,
            client_secret: clientSecret,
          }

          if (refreshToken) {
            params.grant_type = 'refresh_token'
            params.refresh_token = refreshToken
            params.scope = 'Tasks.ReadWrite offline_access'
          } else {
            params.grant_type = 'authorization_code'
            params.code = code
            params.redirect_uri = redirectUri
            params.scope = 'Tasks.ReadWrite offline_access'
          }

          const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params),
          })

          const data = await tokenRes.json()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Microsoft token exchange failed' }))
        }
      })

      // Proxy for HA API calls (forwards Authorization header, bypasses CORS)
      server.middlewares.use('/api/ha-proxy', async (req, res) => {
        const parsedUrl = new URL(req.url || '', 'http://localhost')
        const url = parsedUrl.searchParams.get('url')
        if (!url) {
          res.statusCode = 400
          res.end('Missing url parameter')
          return
        }

        try {
          const headers: Record<string, string> = {}
          if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization as string
          }

          const fetchOptions: RequestInit = { method: req.method || 'GET', headers }

          if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
            fetchOptions.body = await readBody(req)
            headers['Content-Type'] = 'application/json'
          }

          const proxyRes = await fetch(url, fetchOptions)
          const contentType = proxyRes.headers.get('content-type') || 'application/json'
          res.statusCode = proxyRes.status
          res.setHeader('Content-Type', contentType)
          const isText = /^(text\/|application\/(json|xml|javascript))/.test(contentType)
          if (isText) {
            const text = await proxyRes.text()
            res.end(text)
          } else {
            const buffer = Buffer.from(await proxyRes.arrayBuffer())
            res.end(buffer)
          }
        } catch (e) {
          res.statusCode = 500
          res.end(`HA proxy failed: ${e}`)
        }
      })

      // --- HA camera snapshot proxy ---
      // Browser <img src> can't set Authorization headers, but we need auth
      // to hit HA's /api/camera_proxy/. Read the HA token from the
      // server-side credentials.json and inject it here. Used by the
      // motion/doorbell popup to display live snapshots.
      server.middlewares.use('/api/ha-camera/snapshot', async (req, res) => {
        const parsedUrl = new URL(req.url || '', 'http://localhost')
        const entity = parsedUrl.searchParams.get('entity')
        if (!entity || !/^[a-z_]+\.[a-zA-Z0-9_]+$/.test(entity)) {
          res.statusCode = 400
          res.end('Missing or invalid entity')
          return
        }
        try {
          const creds = fs.existsSync(CREDENTIALS_PATH)
            ? JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'))
            : {}
          const haUrl = creds?.homeAssistant?.url
          const haToken = creds?.homeAssistant?.token
          if (!haUrl || !haToken) {
            res.statusCode = 503
            res.end('Home Assistant credentials not configured')
            return
          }
          const target = `${haUrl.replace(/\/$/, '')}/api/camera_proxy/${entity}`
          const upstream = await fetch(target, {
            headers: { Authorization: `Bearer ${haToken}` },
          })
          res.statusCode = upstream.status
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg')
          res.setHeader('Cache-Control', 'no-cache, no-store')
          const buf = Buffer.from(await upstream.arrayBuffer())
          res.end(buf)
        } catch (e) {
          res.statusCode = 502
          res.end(`HA camera fetch failed: ${e}`)
        }
      })

      // --- UniFi Protect proxy (cookie-based auth) ---
      const unifiTokens = new Map<string, string>()

      function unifiFetch(targetUrl: string, cookie?: string): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
        return new Promise((resolve, reject) => {
          const parsed = new URL(targetUrl)
          const isHttps = parsed.protocol === 'https:'
          const options: https.RequestOptions = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            rejectUnauthorized: false,
            headers: cookie ? { Cookie: cookie } : {},
          }
          // For self-signed certs
          if (isHttps) {
            (options as any).rejectUnauthorized = false
          }
          const mod = isHttps ? https : http
          const r = mod.request(options, (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.on('end', () => {
              const respHeaders: Record<string, string> = {}
              for (const [k, v] of Object.entries(response.headers)) {
                if (v) respHeaders[k] = Array.isArray(v) ? v.join(', ') : v
              }
              resolve({ status: response.statusCode || 500, headers: respHeaders, body: Buffer.concat(chunks) })
            })
          })
          r.on('error', reject)
          r.end()
        })
      }

      function unifiPost(targetUrl: string, bodyStr: string, cookie?: string): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
        return new Promise((resolve, reject) => {
          const parsed = new URL(targetUrl)
          const isHttps = parsed.protocol === 'https:'
          const options: https.RequestOptions = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(bodyStr),
              ...(cookie ? { Cookie: cookie } : {}),
            },
          }
          if (isHttps) {
            (options as any).rejectUnauthorized = false
          }
          const mod = isHttps ? https : http
          const r = mod.request(options, (response) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.on('end', () => {
              const respHeaders: Record<string, string> = {}
              for (const [k, v] of Object.entries(response.headers)) {
                if (v) respHeaders[k] = Array.isArray(v) ? v.join(', ') : v
              }
              resolve({ status: response.statusCode || 500, headers: respHeaders, body: Buffer.concat(chunks) })
            })
          })
          r.on('error', reject)
          r.write(bodyStr)
          r.end()
        })
      }

      server.middlewares.use('/api/unifi-proxy', async (req, res) => {
        const parsedUrl = new URL(req.url || '', 'http://localhost')
        const pathAfterMount = parsedUrl.pathname

        try {
          // POST /api/unifi-proxy/login
          if (pathAfterMount === '/login' && req.method === 'POST') {
            const body = JSON.parse(await readBody(req))
            const { host, username, password } = body
            if (!host || !username || !password) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing host, username, or password' }))
              return
            }
            const loginUrl = `${host.replace(/\/$/, '')}/api/auth/login`
            const result = await unifiPost(loginUrl, JSON.stringify({ username, password }))
            // Extract TOKEN from set-cookie
            const setCookie = result.headers['set-cookie'] || ''
            const tokenMatch = setCookie.match(/TOKEN=([^;]+)/)
            if (tokenMatch) {
              unifiTokens.set(host.replace(/\/$/, ''), tokenMatch[1])
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } else if (result.status === 200 || result.status === 204) {
              // Some firmware versions return token differently
              const bodyText = result.body.toString()
              try {
                const json = JSON.parse(bodyText)
                if (json.accessToken) {
                  unifiTokens.set(host.replace(/\/$/, ''), json.accessToken)
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ ok: true }))
                  return
                }
              } catch { /* not JSON */ }
              res.statusCode = 401
              res.end(JSON.stringify({ error: 'Login failed — no token in response' }))
            } else {
              res.statusCode = result.status
              res.end(JSON.stringify({ error: `Login failed (${result.status})` }))
            }
            return
          }

          // GET /api/unifi-proxy/bootstrap?host=...
          if (pathAfterMount === '/bootstrap') {
            const host = (parsedUrl.searchParams.get('host') || '').replace(/\/$/, '')
            const token = unifiTokens.get(host)
            if (!host || !token) {
              res.statusCode = 401
              res.end(JSON.stringify({ error: 'Not authenticated — login first' }))
              return
            }
            const url = `${host}/proxy/protect/api/bootstrap`
            const result = await unifiFetch(url, `TOKEN=${token}`)
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.end(result.body)
            return
          }

          // GET /api/unifi-proxy/snapshot?host=...&cameraId=...&w=640&h=360
          if (pathAfterMount === '/snapshot') {
            const host = (parsedUrl.searchParams.get('host') || '').replace(/\/$/, '')
            const cameraId = parsedUrl.searchParams.get('cameraId')
            const w = parsedUrl.searchParams.get('w') || '640'
            const h = parsedUrl.searchParams.get('h') || '360'
            const token = unifiTokens.get(host)
            if (!host || !token || !cameraId) {
              res.statusCode = 401
              res.end(JSON.stringify({ error: 'Not authenticated or missing params' }))
              return
            }
            const url = `${host}/proxy/protect/api/cameras/${cameraId}/snapshot?w=${w}&h=${h}`
            const result = await unifiFetch(url, `TOKEN=${token}`)
            res.statusCode = result.status
            const ct = result.headers['content-type'] || 'image/jpeg'
            res.setHeader('Content-Type', ct)
            res.setHeader('Cache-Control', 'no-cache, no-store')
            res.end(result.body)
            return
          }

          res.statusCode = 404
          res.end(JSON.stringify({ error: 'Unknown unifi-proxy endpoint' }))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: `UniFi proxy error: ${e}` }))
        }
      })

      // Proxy for fetching external URLs (iCal, etc.) to bypass CORS
      server.middlewares.use('/api/proxy', async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const parsedUrl = new URL(req.url || '', 'http://localhost')
        const url = parsedUrl.searchParams.get('url')
        if (!url) {
          res.statusCode = 400
          res.end('Missing url parameter')
          return
        }

        try {
          const fetchOptions: RequestInit = { method: req.method }

          if (req.method === 'POST') {
            fetchOptions.body = await readBody(req)
            fetchOptions.headers = { 'Content-Type': 'application/json' }
          }

          const proxyRes = await fetch(url, fetchOptions)
          const contentType = proxyRes.headers.get('content-type') || 'text/plain'
          res.statusCode = proxyRes.status
          res.setHeader('Content-Type', contentType)

          // Use buffer for binary content (images), text for everything else
          if (contentType.startsWith('image/') || contentType.startsWith('application/octet')) {
            const buffer = Buffer.from(await proxyRes.arrayBuffer())
            res.end(buffer)
          } else {
            const text = await proxyRes.text()
            res.end(text)
          }
        } catch (e) {
          res.statusCode = 500
          res.end(`Proxy fetch failed: ${e}`)
        }
      })

      server.middlewares.use('/api/config', async (req, res) => {
        if (req.method === 'GET') {
          // Try to serve from dashboards/default.json for backward compat
          const defaultDashboard = path.join(DASHBOARDS_DIR, 'default.json')
          if (fs.existsSync(defaultDashboard)) {
            const data = JSON.parse(fs.readFileSync(defaultDashboard, 'utf-8'))
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data.config))
          } else if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
          } else {
            res.statusCode = 404
            res.end('Not found')
          }
          return
        }

        if (req.method === 'POST') {
          const body = await readBody(req)
          // Save to both config.json and dashboards/default.json
          fs.writeFileSync(CONFIG_PATH, body, 'utf-8')
          const defaultDashboard = path.join(DASHBOARDS_DIR, 'default.json')
          if (fs.existsSync(defaultDashboard)) {
            const existing = JSON.parse(fs.readFileSync(defaultDashboard, 'utf-8'))
            existing.config = JSON.parse(body)
            existing.meta.updatedAt = new Date().toISOString()
            fs.writeFileSync(defaultDashboard, JSON.stringify(existing, null, 2), 'utf-8')
          }
          res.setHeader('Content-Type', 'application/json')
          res.end('{"ok":true}')
          return
        }

        res.statusCode = 405
        res.end('Method not allowed')
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl(), configApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ['**/dashboards/**', '**/devices.json', '**/config.json', '**/credentials.json'],
    },
  },
})
