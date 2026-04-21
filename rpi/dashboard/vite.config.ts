import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import fs from 'fs'

const CONFIG_PATH = path.resolve(__dirname, 'config.json')
const DASHBOARDS_DIR = path.resolve(__dirname, 'dashboards')
const DEVICES_PATH = path.resolve(__dirname, 'devices.json')

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
        }

        next()
      })

      // --- Device assignments API ---

      server.middlewares.use('/api/devices', async (req, res) => {
        if (req.method === 'GET') {
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

        if (req.method === 'POST') {
          const body = await readBody(req)
          fs.writeFileSync(DEVICES_PATH, body, 'utf-8')
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

          if (req.method === 'POST') {
            fetchOptions.body = await readBody(req)
            headers['Content-Type'] = 'application/json'
          }

          const proxyRes = await fetch(url, fetchOptions)
          const contentType = proxyRes.headers.get('content-type') || 'application/json'
          res.statusCode = proxyRes.status
          res.setHeader('Content-Type', contentType)
          const text = await proxyRes.text()
          res.end(text)
        } catch (e) {
          res.statusCode = 500
          res.end(`HA proxy failed: ${e}`)
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
      ignored: ['**/dashboards/**', '**/devices.json', '**/config.json'],
    },
  },
})
