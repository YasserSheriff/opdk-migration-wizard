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
        bobBodies.push({ url: req.url, body: Buffer.concat(chunks).toString() })
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ sessionId: 's1', output: 'OK', updates: [], result: { stopReason: 'end_turn' } }))
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
    fetch(base + '/api/bob/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })

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

  it('forwards only the prompt to <BOB_API_URL>/api/prompt and returns the reply', async () => {
    const res = await post(appUrl, JSON.stringify({ prompt: 'hello', extra: 'dropped' }))
    expect(res.status).toBe(200)
    expect((await res.json()).output).toBe('OK')
    expect(bobBodies.at(-1)).toEqual({ url: '/api/prompt', body: JSON.stringify({ prompt: 'hello' }) })
  })

  it('rejects invalid bodies without calling Bob', async () => {
    const before = bobBodies.length
    expect((await post(appUrl, '{}')).status).toBe(400)
    expect((await post(appUrl, 'not json')).status).toBe(400)
    expect((await post(appUrl, JSON.stringify({ prompt: '   ' }))).status).toBe(400)
    expect(bobBodies.length).toBe(before)
  })

  it('rejects oversized prompts and non-POST methods', async () => {
    expect((await post(appUrl, JSON.stringify({ prompt: 'x'.repeat(70 * 1024) }))).status).toBe(413)
    expect((await fetch(appUrl + '/api/bob/prompt')).status).toBe(405)
  })

  it('reports a missing BOB_API_URL', async () => {
    const res = await post(unconfiguredUrl, JSON.stringify({ prompt: 'hi' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/BOB_API_URL/)
  })
})
