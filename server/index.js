// Production server: serves the built wizard (dist/) and the Bob proxy. No dependencies.
import http from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createBobHandler } from './bobProxy.js'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
}

const isFile = (p) => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

export function createApp(env, distDir) {
  const root = path.resolve(distDir)
  const bob = createBobHandler(env)

  const serveStatic = (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      return res.end()
    }
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    } catch {
      res.statusCode = 400
      return res.end()
    }
    let file = path.join(root, pathname)
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.statusCode = 403 // path traversal
      return res.end()
    }
    // Single-page app: unknown paths get index.html; unknown asset files get a 404.
    if (!isFile(file)) {
      if (path.extname(pathname)) {
        res.statusCode = 404
        return res.end()
      }
      file = path.join(root, 'index.html')
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream')
    res.setHeader(
      'Cache-Control',
      pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    )
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.method === 'HEAD') return res.end()
    createReadStream(file).pipe(res)
  }

  return http.createServer((req, res) => {
    const pathname = (req.url || '').split('?')[0]
    if (pathname === '/healthz' || pathname === '/readyz') {
      res.setHeader('Content-Type', 'text/plain')
      return res.end('ok')
    }
    bob(req, res, () => serveStatic(req, res))
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const port = Number(process.env.PORT) || 8080
  const distDir = process.env.STATIC_DIR || path.join(here, '..', 'dist')
  if (!process.env.BOB_API_URL) console.warn('BOB_API_URL is not set: the Bob console will report "not configured"')
  const server = createApp(process.env, distDir)
  // A Bob run can take minutes; do not drop idle sockets while waiting for the answer.
  server.requestTimeout = 0
  server.listen(port, () => console.log(`opdk-migration-wizard listening on :${port}, serving ${distDir}`))
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)))
}
