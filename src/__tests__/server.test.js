// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createApp } from '../../server/index.js'

const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)))

describe('production server', () => {
  let dist, fakeBob, bobUrl, bobBodies, app, appUrl, unconfigured, unconfiguredUrl

  beforeAll(async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'wizard-dist-'))
    fs.mkdirSync(path.join(dist, 'assets'))
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>wizard</title>')
    fs.writeFileSync(path.join(dist, 'assets', 'app-abc.js'), 'console.log(1)')

    bobBodies = []
    fakeBob = http.createServer((req, res) => {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        bobBodies.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() })
        res.setHeader('Content-Type', 'application/json')
        if (req.url === '/api/jobs/html') {
          res.statusCode = 502
          res.setHeader('Content-Type', 'text/html')
          return res.end('<html>bad gateway</html>')
        }
        if (req.url === '/api/jobs/missing') {
          res.statusCode = 404
          return res.end(JSON.stringify({ error: 'Job not found' }))
        }
        if (req.method === 'POST') {
          res.statusCode = 202
          return res.end(JSON.stringify({ id: 'job-1', status: 'queued', statusUrl: '/api/jobs/job-1' }))
        }
        if (req.method === 'DELETE') return res.end(JSON.stringify({ id: 'job-1', status: 'cancelled' }))
        res.end(JSON.stringify({ id: 'job-1', status: 'completed', output: 'OK', stopReason: 'end_turn' }))
      })
    })
    bobUrl = await listen(fakeBob)

    app = createApp({ BOB_API_URL: bobUrl + '/' }, dist)
    appUrl = await listen(app)
    unconfigured = createApp({}, dist)
    unconfiguredUrl = await listen(unconfigured)
  })

  afterAll(() => {
    for (const s of [fakeBob, app, unconfigured]) s.close()
    fs.rmSync(dist, { recursive: true, force: true })
  })

  const post = (base, body) =>
    fetch(base + '/api/bob/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })

  it('answers health probes', async () => {
    for (const p of ['/healthz', '/readyz']) {
      const res = await fetch(appUrl + p)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('ok')
    }
  })

  it('serves index.html, assets and falls back to index.html for app routes', async () => {
    expect(await (await fetch(appUrl + '/')).text()).toContain('<title>wizard</title>')
    expect(await (await fetch(appUrl + '/some/route')).text()).toContain('<title>wizard</title>')
    const asset = await fetch(appUrl + '/assets/app-abc.js')
    expect(asset.headers.get('content-type')).toMatch(/javascript/)
    expect(asset.headers.get('cache-control')).toMatch(/immutable/)
    expect((await fetch(appUrl + '/assets/missing.js')).status).toBe(404)
  })

  it('blocks path traversal', async () => {
    const res = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: new URL(appUrl).port, path: '/..%2f..%2fetc/passwd' }, resolve)
    })
    expect([403, 404]).toContain(res.statusCode)
    res.resume()
  })

  it('submits a job: forwards only the prompt to <BOB_API_URL>/api/jobs', async () => {
    const res = await post(appUrl, JSON.stringify({ prompt: 'hello', extra: 'dropped', sessionId: 'x' }))
    expect(res.status).toBe(202)
    expect((await res.json()).id).toBe('job-1')
    expect(bobBodies.at(-1)).toEqual({ method: 'POST', url: '/api/jobs', body: JSON.stringify({ prompt: 'hello' }) })
  })

  it('polls a job: GET /api/bob/jobs/:id -> GET /api/jobs/:id', async () => {
    const res = await fetch(appUrl + '/api/bob/jobs/job-1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: 'job-1', status: 'completed', output: 'OK' })
    expect(bobBodies.at(-1)).toEqual({ method: 'GET', url: '/api/jobs/job-1', body: '' })
  })

  it('cancels a job: DELETE /api/bob/jobs/:id -> DELETE /api/jobs/:id', async () => {
    const res = await fetch(appUrl + '/api/bob/jobs/job-1', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('cancelled')
    expect(bobBodies.at(-1)).toEqual({ method: 'DELETE', url: '/api/jobs/job-1', body: '' })
  })

  it('passes through upstream status codes and wraps non-JSON upstream bodies', async () => {
    const missing = await fetch(appUrl + '/api/bob/jobs/missing')
    expect(missing.status).toBe(404)
    expect((await missing.json()).error).toBe('Job not found')
    const html = await fetch(appUrl + '/api/bob/jobs/html')
    expect(html.status).toBe(502)
    expect((await html.json()).error).toMatch(/HTTP 502/)
  })

  it('rejects invalid bodies without calling Bob', async () => {
    const before = bobBodies.length
    expect((await post(appUrl, '{}')).status).toBe(400)
    expect((await post(appUrl, 'not json')).status).toBe(400)
    expect((await post(appUrl, JSON.stringify({ prompt: '   ' }))).status).toBe(400)
    expect(bobBodies.length).toBe(before)
  })

  it('rejects invalid job ids, wrong methods and oversized prompts without calling Bob', async () => {
    const before = bobBodies.length
    expect((await fetch(appUrl + '/api/bob/jobs/' + encodeURIComponent('a b'))).status).toBe(400)
    expect((await fetch(appUrl + '/api/bob/jobs/' + 'x'.repeat(65))).status).toBe(400)
    const listing = await fetch(appUrl + '/api/bob/jobs') // GET on the collection = listing, not exposed
    expect(listing.status).toBe(405)
    expect(listing.headers.get('allow')).toBe('POST')
    const put = await fetch(appUrl + '/api/bob/jobs/job-1', { method: 'PUT' })
    expect(put.status).toBe(405)
    expect(put.headers.get('allow')).toBe('GET, DELETE')
    expect((await post(appUrl, JSON.stringify({ prompt: 'x'.repeat(70 * 1024) }))).status).toBe(413)
    expect(bobBodies.length).toBe(before)
  })

  it('reports a missing BOB_API_URL', async () => {
    const res = await post(unconfiguredUrl, JSON.stringify({ prompt: 'hi' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/BOB_API_URL/)
    expect((await fetch(unconfiguredUrl + '/api/bob/jobs/job-1')).status).toBe(500)
  })

  it('returns 502 when Bob is unreachable', async () => {
    const dead = createApp({ BOB_API_URL: 'http://127.0.0.1:1' }, dist)
    const deadUrl = await listen(dead)
    const res = await post(deadUrl, JSON.stringify({ prompt: 'hi' }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/unreachable/)
    dead.close()
  })
})
