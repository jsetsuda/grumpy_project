// Grumpy Dashboard — Production Server
// Zero dependencies beyond Node built-ins. Serves the Vite dist/ build
// and replicates every API route from vite.config.ts.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '5173', 10);
const TLS = (process.env.TLS ?? 'true') !== 'false';
const DIST_DIR = path.join(__dirname, 'dist');
const DASHBOARDS_DIR = path.join(__dirname, 'dashboards');
const DEVICES_PATH = path.join(__dirname, 'devices.json');
const INSTANCES_DIR = path.join(__dirname, 'instances');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

// In-memory per-device signal store. One latest-signal per device.
// Dropped on process restart (Pis reconnect anyway).
const deviceSignals = new Map();
const CONFIG_PATH = path.join(__dirname, 'config.json');
const CERT_DIR = path.join(__dirname, '.certs');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');

// ---------------------------------------------------------------------------
// MIME types for static file serving
// ---------------------------------------------------------------------------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

// ---------------------------------------------------------------------------
// Migration: ensure dashboards/ exists, migrate config.json if needed
// ---------------------------------------------------------------------------
function ensureDashboardsDir() {
  if (!fs.existsSync(DASHBOARDS_DIR)) {
    fs.mkdirSync(DASHBOARDS_DIR, { recursive: true });
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      const now = new Date().toISOString();
      const dashboardFile = {
        meta: {
          id: 'default',
          name: 'Default',
          layoutMode: 'grid',
          createdAt: now,
          updatedAt: now,
        },
        config,
      };
      fs.writeFileSync(
        path.join(DASHBOARDS_DIR, 'default.json'),
        JSON.stringify(dashboardFile, null, 2),
        'utf-8'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Self-signed certificate generation (TLS mode)
// ---------------------------------------------------------------------------
async function ensureCerts() {
  if (fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH)) return;
  fs.mkdirSync(CERT_DIR, { recursive: true });

  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const { execSync } = await import('node:child_process');

  // Write the private key so openssl can read it
  fs.writeFileSync(KEY_PATH, privateKey, 'utf-8');

  try {
    execSync(
      `openssl req -new -x509 -key "${KEY_PATH}" -out "${CERT_PATH}" -days 3650 -subj "/CN=grumpy-dashboard" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Fallback: openssl without -addext (older versions)
    execSync(
      `openssl req -new -x509 -key "${KEY_PATH}" -out "${CERT_PATH}" -days 3650 -subj "/CN=grumpy-dashboard"`,
      { stdio: 'pipe' }
    );
  }

  console.log('[TLS] Generated self-signed certificate in .certs/');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

async function readBodyBuffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function send405(res) {
  res.writeHead(405);
  res.end('Method not allowed');
}

// ---------------------------------------------------------------------------
// Static file serving + SPA fallback
// ---------------------------------------------------------------------------
function serveStatic(req, res) {
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Security: prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);

  // If it's a directory, try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } else {
    // SPA fallback: serve index.html for non-file, non-API paths
    const indexPath = path.join(DIST_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
      const html = fs.readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}

// ---------------------------------------------------------------------------
// API Router
// ---------------------------------------------------------------------------
async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = parsedUrl.pathname;

  // ── Dashboard API ────────────────────────────────────────────────────
  if (pathname === '/api/dashboards' || pathname === '/api/dashboards/') {
    if (req.method === 'GET') {
      const files = fs.readdirSync(DASHBOARDS_DIR).filter(f => f.endsWith('.json'));
      const metas = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(DASHBOARDS_DIR, f), 'utf-8'));
        return data.meta;
      });
      return sendJSON(res, metas);
    }
    return send405(res);
  }

  // /api/dashboards/:id/clone
  const cloneMatch = pathname.match(/^\/api\/dashboards\/([^/]+)\/clone$/);
  if (cloneMatch) {
    if (req.method !== 'POST') return send405(res);
    const id = cloneMatch[1];
    const filePath = path.join(DASHBOARDS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
      return sendJSON(res, { error: 'Dashboard not found' }, 404);
    }
    const body = JSON.parse(await readBody(req));
    const { newId, newName } = body;
    const source = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const now = new Date().toISOString();
    const cloned = {
      meta: { ...source.meta, id: newId, name: newName, createdAt: now, updatedAt: now },
      config: source.config,
    };
    fs.writeFileSync(
      path.join(DASHBOARDS_DIR, `${newId}.json`),
      JSON.stringify(cloned, null, 2),
      'utf-8'
    );
    return sendJSON(res, cloned.meta);
  }

  // /api/dashboards/:id
  const dashMatch = pathname.match(/^\/api\/dashboards\/([^/]+)$/);
  if (dashMatch) {
    const id = dashMatch[1];
    const filePath = path.join(DASHBOARDS_DIR, `${id}.json`);

    if (req.method === 'GET') {
      if (!fs.existsSync(filePath)) return sendJSON(res, { error: 'Dashboard not found' }, 404);
      return sendJSON(res, fs.readFileSync(filePath, 'utf-8'));
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      parsed.meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
      return sendJSON(res, { ok: true });
    }

    if (req.method === 'DELETE') {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return sendJSON(res, { ok: true });
    }

    if (req.method === 'PATCH') {
      if (!fs.existsSync(filePath)) return sendJSON(res, { error: 'Dashboard not found' }, 404);
      const body = JSON.parse(await readBody(req));
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (body.name !== undefined) existing.meta.name = body.name;
      existing.meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
      return sendJSON(res, existing.meta);
    }

    return send405(res);
  }

  // ── Devices API ──────────────────────────────────────────────────────
  if (pathname === '/api/devices' || pathname === '/api/devices/') {
    if (req.method === 'GET') {
      if (fs.existsSync(DEVICES_PATH)) {
        return sendJSON(res, fs.readFileSync(DEVICES_PATH, 'utf-8'));
      }
      return sendJSON(res, '{}');
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      fs.writeFileSync(DEVICES_PATH, body, 'utf-8');
      return sendJSON(res, { ok: true });
    }
    return send405(res);
  }

  // PUT /api/devices/:name — idempotent auto-register.
  if (pathname.startsWith('/api/devices/') && !pathname.endsWith('/signal') && req.method === 'PUT') {
    const rawName = pathname.slice('/api/devices/'.length).split('/')[0];
    const name = rawName.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!name) { res.writeHead(400); return res.end('Invalid device name'); }
    const existing = fs.existsSync(DEVICES_PATH)
      ? JSON.parse(fs.readFileSync(DEVICES_PATH, 'utf-8'))
      : {};
    const added = !(name in existing);
    if (added) {
      existing[name] = 'default';
      fs.writeFileSync(DEVICES_PATH, JSON.stringify(existing, null, 2), 'utf-8');
    }
    return sendJSON(res, { ok: true, added });
  }

  // GET/POST /api/devices/:name/signal — push a reload signal to a device.
  if (pathname.startsWith('/api/devices/') && pathname.endsWith('/signal')) {
    const middle = pathname.slice('/api/devices/'.length, -'/signal'.length);
    const name = middle.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!name) { res.writeHead(400); return res.end('Invalid device name'); }
    if (req.method === 'GET') {
      return sendJSON(res, { signal: deviceSignals.get(name) || null });
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const type = parsed.type || 'reload';
      const sig = {
        id: (globalThis.crypto?.randomUUID?.() || `sig-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        type,
        createdAt: new Date().toISOString(),
      };
      deviceSignals.set(name, sig);
      return sendJSON(res, { ok: true, signal: sig });
    }
    return send405(res);
  }

  // ── Instance overrides API ──────────────────────────────────────────
  // GET /api/instances/:deviceId   → returns stored overrides (or empty)
  // POST /api/instances/:deviceId  → body is the InstanceFile JSON
  if (pathname.startsWith('/api/instances/')) {
    const rawId = pathname.slice('/api/instances/'.length).split('/')[0];
    const deviceId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!deviceId) { res.writeHead(400); return res.end('Invalid device id'); }
    const filePath = path.join(INSTANCES_DIR, `${deviceId}.json`);

    if (req.method === 'GET') {
      if (fs.existsSync(filePath)) {
        return sendJSON(res, fs.readFileSync(filePath, 'utf-8'));
      }
      return sendJSON(res, JSON.stringify({ version: 1, deviceId, updatedAt: '', overrides: {} }));
    }
    if (req.method === 'POST') {
      if (!fs.existsSync(INSTANCES_DIR)) {
        fs.mkdirSync(INSTANCES_DIR, { recursive: true });
      }
      const body = await readBody(req);
      const parsed = JSON.parse(body);
      parsed.updatedAt = new Date().toISOString();
      parsed.deviceId = deviceId;
      parsed.version = 1;
      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
      return sendJSON(res, { ok: true });
    }
    return send405(res);
  }

  // ── Credentials API ─────────────────────────────────────────────────
  if (pathname === '/api/credentials' || pathname === '/api/credentials/') {
    if (req.method === 'GET') {
      if (fs.existsSync(CREDENTIALS_PATH)) {
        return sendJSON(res, fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      }
      return sendJSON(res, '{}');
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      fs.writeFileSync(CREDENTIALS_PATH, body, 'utf-8');
      return sendJSON(res, { ok: true });
    }
    return send405(res);
  }

  // ── Spotify token exchange ──────────────────────────────────────────
  if (pathname === '/api/spotify/token') {
    if (req.method !== 'POST') return send405(res);
    const body = JSON.parse(await readBody(req));
    const { code, clientId, clientSecret, redirectUri } = body;
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
      });
      const data = await tokenRes.json();
      return sendJSON(res, data);
    } catch {
      return sendJSON(res, { error: 'Token exchange failed' }, 500);
    }
  }

  // ── Google token exchange ───────────────────────────────────────────
  if (pathname === '/api/google/token') {
    if (req.method !== 'POST') return send405(res);
    const body = JSON.parse(await readBody(req));
    const { code, clientId, clientSecret, redirectUri, refreshToken } = body;
    try {
      const params = { client_id: clientId, client_secret: clientSecret };
      if (refreshToken) {
        params.grant_type = 'refresh_token';
        params.refresh_token = refreshToken;
      } else {
        params.grant_type = 'authorization_code';
        params.code = code;
        params.redirect_uri = redirectUri;
      }
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      });
      const data = await tokenRes.json();
      return sendJSON(res, data);
    } catch {
      return sendJSON(res, { error: 'Google token exchange failed' }, 500);
    }
  }

  // ── HA proxy (forwards Authorization, bypasses CORS) ────────────────
  if (pathname === '/api/ha-proxy' || pathname === '/api/ha-proxy/') {
    const url = parsedUrl.searchParams.get('url');
    if (!url) { res.writeHead(400); return res.end('Missing url parameter'); }
    try {
      const headers = {};
      if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
      const fetchOptions = { method: req.method || 'GET', headers };
      if (req.method === 'POST') {
        fetchOptions.body = await readBody(req);
        headers['Content-Type'] = 'application/json';
      }
      const proxyRes = await fetch(url, fetchOptions);
      const contentType = proxyRes.headers.get('content-type') || 'application/json';
      res.writeHead(proxyRes.status, { 'Content-Type': contentType });
      const isText = /^(text\/|application\/(json|xml|javascript))/.test(contentType);
      if (isText) {
        const text = await proxyRes.text();
        return res.end(text);
      }
      const buffer = Buffer.from(await proxyRes.arrayBuffer());
      return res.end(buffer);
    } catch (e) {
      res.writeHead(500);
      return res.end(`HA proxy failed: ${e}`);
    }
  }

  // ── Generic proxy (iCal, images, etc.) ──────────────────────────────
  if (pathname === '/api/proxy' || pathname === '/api/proxy/') {
    if (req.method !== 'GET' && req.method !== 'POST') return send405(res);
    const url = parsedUrl.searchParams.get('url');
    if (!url) { res.writeHead(400); return res.end('Missing url parameter'); }
    try {
      const fetchOptions = { method: req.method };
      if (req.method === 'POST') {
        fetchOptions.body = await readBody(req);
        fetchOptions.headers = { 'Content-Type': 'application/json' };
      }
      const proxyRes = await fetch(url, fetchOptions);
      const contentType = proxyRes.headers.get('content-type') || 'text/plain';
      res.writeHead(proxyRes.status, { 'Content-Type': contentType });
      if (contentType.startsWith('image/') || contentType.startsWith('application/octet')) {
        const buffer = Buffer.from(await proxyRes.arrayBuffer());
        return res.end(buffer);
      }
      const text = await proxyRes.text();
      return res.end(text);
    } catch (e) {
      res.writeHead(500);
      return res.end(`Proxy fetch failed: ${e}`);
    }
  }

  // ── Legacy config API ───────────────────────────────────────────────
  if (pathname === '/api/config' || pathname === '/api/config/') {
    if (req.method === 'GET') {
      const defaultDashboard = path.join(DASHBOARDS_DIR, 'default.json');
      if (fs.existsSync(defaultDashboard)) {
        const data = JSON.parse(fs.readFileSync(defaultDashboard, 'utf-8'));
        return sendJSON(res, data.config);
      }
      if (fs.existsSync(CONFIG_PATH)) {
        return sendJSON(res, fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
      res.writeHead(404);
      return res.end('Not found');
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      fs.writeFileSync(CONFIG_PATH, body, 'utf-8');
      const defaultDashboard = path.join(DASHBOARDS_DIR, 'default.json');
      if (fs.existsSync(defaultDashboard)) {
        const existing = JSON.parse(fs.readFileSync(defaultDashboard, 'utf-8'));
        existing.config = JSON.parse(body);
        existing.meta.updatedAt = new Date().toISOString();
        fs.writeFileSync(defaultDashboard, JSON.stringify(existing, null, 2), 'utf-8');
      }
      return sendJSON(res, { ok: true });
    }
    return send405(res);
  }

  // ── Static files / SPA fallback ─────────────────────────────────────
  serveStatic(req, res);
}

// ---------------------------------------------------------------------------
// WebSocket upgrade handler for /api/ha-ws (TCP proxy to Home Assistant)
// ---------------------------------------------------------------------------
function handleUpgrade(req, socket, head) {
  const parsedUrl = new URL(req.url || '', 'http://localhost');
  if (!parsedUrl.pathname.startsWith('/api/ha-ws')) return;

  const targetUrl = parsedUrl.searchParams.get('url');
  if (!targetUrl) { socket.destroy(); return; }

  const target = new URL(targetUrl);
  const targetPort = parseInt(target.port) || 8123;
  const targetHost = target.hostname;

  const proxy = net.createConnection({ host: targetHost, port: targetPort }, () => {
    const reqPath = target.pathname;
    const headers = [
      `GET ${reqPath} HTTP/1.1`,
      `Host: ${targetHost}:${targetPort}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
      `Sec-WebSocket-Version: ${req.headers['sec-websocket-version']}`,
    ];
    if (req.headers['sec-websocket-protocol']) {
      headers.push(`Sec-WebSocket-Protocol: ${req.headers['sec-websocket-protocol']}`);
    }
    proxy.write(headers.join('\r\n') + '\r\n\r\n');
    if (head.length) proxy.write(head);
  });

  let headersParsed = false;
  proxy.on('data', (chunk) => {
    if (!headersParsed) {
      const str = chunk.toString();
      if (str.includes('\r\n\r\n')) {
        headersParsed = true;
        socket.write(chunk);
        proxy.pipe(socket);
        socket.pipe(proxy);
      } else {
        socket.write(chunk);
      }
    }
  });

  proxy.on('error', () => socket.destroy());
  socket.on('error', () => proxy.destroy());
  proxy.on('close', () => socket.destroy());
  socket.on('close', () => proxy.destroy());
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
async function main() {
  ensureDashboardsDir();

  let server;

  if (TLS) {
    await ensureCerts();
    const cert = fs.readFileSync(CERT_PATH);
    const key = fs.readFileSync(KEY_PATH);
    server = https.createServer({ cert, key }, handleRequest);
  } else {
    server = http.createServer(handleRequest);
  }

  server.on('upgrade', handleUpgrade);

  server.listen(PORT, '0.0.0.0', () => {
    const proto = TLS ? 'https' : 'http';
    console.log(`Grumpy Dashboard running at ${proto}://0.0.0.0:${PORT}`);
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
