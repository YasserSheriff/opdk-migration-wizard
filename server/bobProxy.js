// Proxy for the Bob prompt API, shared by the Vite dev server and the production Node server.
// The browser cannot call Bob directly (no CORS headers), so POST /api/bob/prompt is forwarded to
// `${BOB_API_URL}/api/prompt`. The API is synchronous and a run can take minutes.
export const PROXY_PATH = '/api/bob/prompt'
export const MAX_BODY_BYTES = 64 * 1024
export const UPSTREAM_TIMEOUT_MS = 10 * 60 * 1000

export function createBobHandler(env, { timeoutMs = UPSTREAM_TIMEOUT_MS } = {}) {
  return async function bobHandler(req, res, next) {
    if (!req.url || !req.url.startsWith(PROXY_PATH)) return next()

    const send = (status, body) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }

    if (req.method !== 'POST') return send(405, { error: 'POST only' })
    if (!env.BOB_API_URL) return send(500, { error: 'Bob proxy not configured: set BOB_API_URL' })

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

    try {
      const upstream = await fetch(env.BOB_API_URL.replace(/\/+$/, '') + '/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }), // only the prompt is forwarded
        signal: AbortSignal.timeout(timeoutMs),
      })
      const text = await upstream.text()
      res.statusCode = upstream.status
      res.setHeader('Content-Type', 'application/json')
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
