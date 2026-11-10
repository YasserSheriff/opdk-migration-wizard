// Proxy for the Bob Jobs API, shared by the Vite dev server and the production Node server.
// The browser cannot call Bob directly (no CORS headers), so these routes are forwarded to
// `${BOB_API_URL}/api/jobs`:
//   POST   /api/bob/jobs        -> POST   /api/jobs        (submit; body {prompt})
//   GET    /api/bob/jobs/:id    -> GET    /api/jobs/:id    (status and output so far)
//   DELETE /api/bob/jobs/:id    -> DELETE /api/jobs/:id    (cancel a running job / delete a finished one)
// Listing jobs is deliberately not exposed.
export const PROXY_PATH = '/api/bob/jobs'
export const MAX_BODY_BYTES = 64 * 1024
export const UPSTREAM_TIMEOUT_MS = 30 * 1000

const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/

export function createBobHandler(env, { timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  return async function bobHandler(req, res, next) {
    const pathname = (req.url || '').split('?')[0]
    if (pathname !== PROXY_PATH && !pathname.startsWith(PROXY_PATH + '/')) return next()

    const send = (status, body) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(body))
    }

    const id = pathname === PROXY_PATH ? null : pathname.slice(PROXY_PATH.length + 1)
    if (id !== null && !JOB_ID.test(id)) return send(400, { error: 'Invalid job id' })

    const allowed = id === null ? ['POST'] : ['GET', 'DELETE']
    if (!allowed.includes(req.method)) {
      res.setHeader('Allow', allowed.join(', '))
      return send(405, { error: `${allowed.join(' or ')} only` })
    }
    if (!env.BOB_API_URL) return send(500, { error: 'Bob proxy not configured: set BOB_API_URL' })

    let body
    if (id === null) {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_BODY_BYTES) return send(413, { error: 'Prompt too large' })
        chunks.push(chunk)
      }
      let prompt
      try {
        prompt = JSON.parse(Buffer.concat(chunks).toString('utf8')).prompt
      } catch {
        return send(400, { error: 'Body must be JSON: {"prompt": "..."}' })
      }
      if (typeof prompt !== 'string' || !prompt.trim()) {
        return send(400, { error: 'A non-empty "prompt" string is required' })
      }
      body = JSON.stringify({ prompt }) // only the prompt is forwarded
    }

    try {
      const upstream = await fetch(
        env.BOB_API_URL.replace(/\/+$/, '') + '/api/jobs' + (id ? `/${id}` : ''),
        {
          method: req.method,
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body,
          signal: AbortSignal.timeout(timeoutMs),
        },
      )
      const text = await upstream.text()
      res.statusCode = upstream.status
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      // Non-JSON upstream bodies (e.g. an HTML error page) are wrapped so the client can always parse.
      try {
        JSON.parse(text)
        res.end(text)
      } catch {
        res.end(JSON.stringify({ error: `Bob server returned HTTP ${upstream.status}` }))
      }
    } catch (e) {
      send(502, { error: `Bob server unreachable: ${e.message}` })
    }
  }
}
