import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import fs from 'fs'

const CONFIG_PATH = path.resolve(__dirname, 'config.json')

function configApiPlugin(): Plugin {
  return {
    name: 'config-api',
    configureServer(server) {
      server.middlewares.use('/api/spotify/token', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(chunk as Buffer)
        }
        const body = JSON.parse(Buffer.concat(chunks).toString())
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

        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(chunk as Buffer)
        }
        const body = JSON.parse(Buffer.concat(chunks).toString())
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
            const chunks: Buffer[] = []
            for await (const chunk of req) {
              chunks.push(chunk as Buffer)
            }
            fetchOptions.body = Buffer.concat(chunks).toString()
            fetchOptions.headers = { 'Content-Type': 'application/json' }
          }

          const proxyRes = await fetch(url, fetchOptions)
          if (!proxyRes.ok) {
            res.statusCode = proxyRes.status
            res.end(`Upstream error: ${proxyRes.status}`)
            return
          }
          const text = await proxyRes.text()
          res.setHeader('Content-Type', proxyRes.headers.get('content-type') || 'text/plain')
          res.end(text)
        } catch (e) {
          res.statusCode = 500
          res.end(`Proxy fetch failed: ${e}`)
        }
      })

      server.middlewares.use('/api/config', async (req, res) => {
        if (req.method === 'GET') {
          if (fs.existsSync(CONFIG_PATH)) {
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
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(chunk as Buffer)
          }
          const body = Buffer.concat(chunks).toString()
          fs.writeFileSync(CONFIG_PATH, body, 'utf-8')
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
  },
})
