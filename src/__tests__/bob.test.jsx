import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildBobPrompt, resolveBobPrompt } from '../bobPrompt.js'
import { initialState } from '../validation.js'
import BobConsole, { DEFAULT_POLL_MS } from '../components/BobConsole.jsx'

const stateWith = (over = {}) => {
  const s = initialState()
  s.source = { ...s.source, apiServer: 'https://api.src.example:6443', namespace: 'apigee-prod', token: 'SRC-TOKEN-SECRET', password: 'SRC-PW-SECRET' }
  s.astra = { hostUrl: 'https://abc-us-east-2.apps.astra.datastax.com', apiKey: 'AstraCS:API-KEY-SECRET', bundle: new File(['z'], 'secure-connect-db.zip') }
  return { ...s, ...over }
}

const reply = (body, ok = true, status = 200) =>
  Promise.resolve({ ok, status, text: () => Promise.resolve(JSON.stringify(body)) })

describe('buildBobPrompt', () => {
  it('includes source and Astra connectivity details', () => {
    const p = buildBobPrompt(stateWith())
    expect(p).toContain('https://api.src.example:6443')
    expect(p).toContain('apigee-prod')
    expect(p).toContain('https://abc-us-east-2.apps.astra.datastax.com')
    expect(p).toContain('secure-connect-db.zip')
  })

  it('shows OpenShift and Astra URLs plus placeholders, never the real secrets', () => {
    const p = buildBobPrompt(stateWith())
    expect(p).toContain('Kubernetes API server: https://api.src.example:6443')
    expect(p).toContain('{{OPENSHIFT_SOURCE_TOKEN}}')
    expect(p).toContain('Astra Endpoint: https://abc-us-east-2.apps.astra.datastax.com')
    expect(p).toContain('{{ASTRA_TOKEN}}')
    for (const secret of ['SRC-TOKEN-SECRET', 'SRC-PW-SECRET', 'API-KEY-SECRET']) expect(p).not.toContain(secret)
  })

  it('uses username/password placeholders when the source uses password auth', () => {
    const s = stateWith()
    s.source = { ...s.source, authMode: 'password', username: 'admin' }
    const p = buildBobPrompt(s)
    expect(p).toContain('username/password: admin / {{OPENSHIFT_SOURCE_PASSWORD}}')
    expect(p).toContain('{{OPENSHIFT_SOURCE_PASSWORD}}')
    expect(p).not.toContain('{{OPENSHIFT_SOURCE_TOKEN}}')
  })

  it('resolveBobPrompt substitutes the real credentials for the placeholders', () => {
    const s = stateWith()
    const out = resolveBobPrompt(buildBobPrompt(s), s)
    expect(out).toContain('Authentication: bearer token: SRC-TOKEN-SECRET')
    expect(out).toContain('Astra Token: AstraCS:API-KEY-SECRET')
    expect(out).not.toContain('{{')
  })

  it('follows the two-step wording: deploy 3 ZDM pods first, then migrate', () => {
    const p = buildBobPrompt(stateWith())
    expect(p).toMatch(/^You are assisting in migrating Apache Cassandra database to Astra DB\. Follow these 2 steps in sequence\./)
    expect(p).toContain('Step 1: You will first start with deploying DataStax Zero Down Time (ZDM)')
    expect(p).toContain('check the 3 ZDM pods are in Running state before moving to the next step')
    expect(p).toContain('Step 2: Migrate the Cassandra database to Astra.')
    expect(p.indexOf('Step 1')).toBeLessThan(p.indexOf('Step 2'))
    expect(p.indexOf('SOURCE (Apigee OPDK Cassandra)')).toBeLessThan(p.indexOf('Step 2'))
    expect(p.indexOf('Step 2')).toBeLessThan(p.indexOf('Target Astra DB:'))
    expect(p).toContain('Astra Source connection bundle: secure-connect-db.zip')
  })

  it('resolves HCD destination credentials', () => {
    const s = stateWith({ targetId: 'hcd' })
    s.destination = { ...s.destination, apiServer: 'https://api.dst.example:6443', namespace: 'hcd-ns', token: 'DST-TOKEN-SECRET' }
    expect(buildBobPrompt(s)).toContain('{{OPENSHIFT_DESTINATION_TOKEN}}')
    expect(buildBobPrompt(s)).not.toContain('DST-TOKEN-SECRET')
    expect(resolveBobPrompt(buildBobPrompt(s), s)).toContain('bearer token: DST-TOKEN-SECRET')
  })

  it('describes the HCD cluster when HCD is the target', () => {
    const s = stateWith({ targetId: 'hcd' })
    s.destination = { ...s.destination, apiServer: 'https://api.dst.example:6443', namespace: 'hcd-ns' }
    const p = buildBobPrompt(s)
    expect(p).toContain('https://api.dst.example:6443')
    expect(p).toContain('hcd-ns')
    expect(p).not.toContain('abc-us-east-2.apps.astra')
  })
})

describe('BobConsole (Jobs API)', () => {
  const POLL = 5
  const job = (over = {}) => ({ id: 'job-1', status: 'running', toolCalls: 0, ...over })
  const migrate = async (user) => user.click(screen.getByRole('button', { name: 'Migrate' }))
  const renderConsole = (props = {}) => render(<BobConsole state={stateWith()} pollMs={POLL} {...props} />)

  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('sends nothing until Migrate is clicked', () => {
    renderConsole()
    expect(screen.getByLabelText('Deployment Steps')).toHaveValue(buildBobPrompt(stateWith()))
    expect(screen.queryByLabelText('Prompt')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Deployment Steps').value).not.toContain('SRC-TOKEN-SECRET')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows the scrollable console box (focusable, idle text) before anything is sent', () => {
    renderConsole()
    const box = screen.getByLabelText('Bob console output')
    expect(box).toHaveClass('console-output')
    expect(box).toHaveAttribute('tabindex', '0')
    expect(box).toHaveTextContent('Click Migrate')
  })

  it('submits a job, polls it and shows the final output', async () => {
    fetch
      .mockImplementationOnce(() => reply(job({ status: 'queued' }), true, 202))
      .mockImplementationOnce(() => reply(job({ output: 'Partial', toolCalls: 2 })))
      .mockImplementation(() => reply(job({ status: 'completed', output: 'The plan.', toolCalls: 2, stopReason: 'end_turn' })))
    const onMigrate = vi.fn()
    const user = userEvent.setup()
    renderConsole({ onMigrate })
    await migrate(user)

    expect(onMigrate).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByLabelText('Bob output')).toHaveTextContent('The plan.'))
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText('job-1')).toBeInTheDocument()
    expect(screen.getByText('end_turn')).toBeInTheDocument()
    expect(screen.getByText(/Tool calls: 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/bob/jobs')
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body)
    expect(Object.keys(sent)).toEqual(['prompt'])
    expect(sent.prompt).toContain('apigee-prod')
    // the real credentials are substituted into what is sent, but never shown in the textarea
    expect(sent.prompt).toContain('Kubernetes API server: https://api.src.example:6443')
    expect(sent.prompt).toContain('bearer token: SRC-TOKEN-SECRET')
    expect(sent.prompt).toContain('Astra Token: AstraCS:API-KEY-SECRET')
    expect(sent.prompt).not.toContain('{{')
    expect(screen.getByLabelText('Deployment Steps').value).not.toContain('SRC-TOKEN-SECRET')
    expect(screen.getByLabelText('Deployment Steps').value).toContain('{{OPENSHIFT_SOURCE_TOKEN}}')
    const poll = fetch.mock.calls[1]
    expect(poll[0]).toBe('/api/bob/jobs/job-1')
    expect(poll[1].method).toBe('GET')
  })

  it('checks the job status every 5 seconds by default', async () => {
    expect(DEFAULT_POLL_MS).toBe(5000)
    vi.useFakeTimers()
    try {
      fetch.mockImplementation((url, init) =>
        init.method === 'POST' ? reply(job(), true, 202) : reply(job({ output: 'working' })),
      )
      render(<BobConsole state={stateWith()} />)
      fireEvent.click(screen.getByRole('button', { name: 'Migrate' }))
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(fetch).toHaveBeenCalledTimes(1) // POST only
      await act(() => vi.advanceTimersByTimeAsync(4999))
      expect(fetch).toHaveBeenCalledTimes(1)
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(fetch).toHaveBeenCalledTimes(2) // first check at 5 s
      await act(() => vi.advanceTimersByTimeAsync(5000))
      expect(fetch).toHaveBeenCalledTimes(3) // second check at 10 s
      expect(screen.getByLabelText('Bob status checks')).toHaveTextContent('Status check #2: running')
      expect(screen.getByLabelText('Bob status checks')).toHaveTextContent('next check in 5s')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports each status check in the console, with the final one marked finished', async () => {
    fetch
      .mockImplementationOnce(() => reply(job({ status: 'queued' }), true, 202))
      .mockImplementationOnce(() => reply(job({ status: 'queued', queuePosition: 2 })))
      .mockImplementationOnce(() => reply(job({ toolCalls: 3 })))
      .mockImplementation(() => reply(job({ status: 'completed', output: 'done', toolCalls: 3 })))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    const log = screen.getByLabelText('Bob status checks')
    await waitFor(() => expect(log).toHaveTextContent('Status check #3: completed'))
    expect(log).toHaveTextContent('Job submitted: job-1 (queued)')
    expect(log).toHaveTextContent('Status check #1: queued, queue position 2')
    expect(log).toHaveTextContent('Status check #2: running, 3 tool calls')
    expect(log).toHaveTextContent('finished, no more checks')
    expect(log.querySelectorAll('li')).toHaveLength(4)
  })

  it('logs failed status checks', async () => {
    fetch
      .mockImplementationOnce(() => reply(job(), true, 202))
      .mockRejectedValueOnce(new Error('blip'))
      .mockImplementation(() => reply(job({ status: 'completed', output: 'ok' })))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    const log = screen.getByLabelText('Bob status checks')
    await waitFor(() => expect(log).toHaveTextContent('Status check #1: completed'))
    expect(log).toHaveTextContent('Status check failed (1/3)')
  })

  it('stops polling once the job is terminal', async () => {
    fetch
      .mockImplementationOnce(() => reply(job(), true, 202))
      .mockImplementation(() => reply(job({ status: 'completed', output: 'done' })))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    await waitFor(() => expect(screen.getByLabelText('Bob output')).toHaveTextContent('done'))
    const calls = fetch.mock.calls.length
    await new Promise((r) => setTimeout(r, POLL * 6))
    expect(fetch.mock.calls.length).toBe(calls)
  })

  it('shows the queue position while the job is queued', async () => {
    fetch
      .mockImplementationOnce(() => reply(job({ status: 'queued' }), true, 202))
      .mockImplementationOnce(() => reply(job({ status: 'queued', queuePosition: 3 })))
      .mockImplementation(() => reply(job({ status: 'queued', queuePosition: 3 })))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    expect(await screen.findByText(/Queue position: 3/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeDisabled()
  })

  it('shows the error of a failed job', async () => {
    fetch
      .mockImplementationOnce(() => reply(job(), true, 202))
      .mockImplementation(() => reply(job({ status: 'failed', error: 'agent crashed' })))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    expect(await screen.findByText(/Error: agent crashed/)).toBeInTheDocument()
    expect(screen.getByText('failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
  })

  it('says so when a finished job has no output text', async () => {
    fetch
      .mockImplementationOnce(() => reply(job(), true, 202))
      .mockImplementation(() => reply(job({ status: 'completed', output: '' })))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    await waitFor(() => expect(screen.getByLabelText('Bob output')).toHaveTextContent('Bob returned no output text'))
  })

  it('Cancel sends DELETE for the job and shows it as cancelled', async () => {
    fetch.mockImplementation((url, init) => {
      if (init.method === 'POST') return reply(job(), true, 202)
      if (init.method === 'DELETE') return reply({ id: 'job-1', status: 'cancelled' })
      return reply(job({ output: 'working' }))
    })
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByText('cancelled')).toBeInTheDocument())
    const del = fetch.mock.calls.find(([, init]) => init.method === 'DELETE')
    expect(del[0]).toBe('/api/bob/jobs/job-1')
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a job that disappeared (404 on poll)', async () => {
    fetch
      .mockImplementationOnce(() => reply(job(), true, 202))
      .mockImplementation(() => reply({ error: 'Job not found' }, false, 404))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Lost contact with the job.*not found/)
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
  })

  it('tolerates transient poll failures but gives up after three in a row', async () => {
    fetch
      .mockImplementationOnce(() => reply(job(), true, 202))
      .mockRejectedValueOnce(new Error('blip'))
      .mockImplementationOnce(() => reply(job({ output: 'still going' })))
      .mockRejectedValue(new Error('down'))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Lost contact with the job.*down/)
    // 1 POST + blip + success + 3 consecutive failures
    expect(fetch).toHaveBeenCalledTimes(6)
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
  })

  it('shows an error when the proxy is unreachable on submit', async () => {
    fetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the Bob proxy/)
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
  })

  it('shows proxy configuration errors on submit', async () => {
    fetch.mockImplementationOnce(() => reply({ error: 'Bob proxy not configured: set BOB_API_URL' }, false, 500))
    const user = userEvent.setup()
    renderConsole()
    await migrate(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Bob proxy not configured')
  })
})
