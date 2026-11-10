import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildBobPrompt } from '../bobPrompt.js'
import { initialState } from '../validation.js'
import BobConsole from '../components/BobConsole.jsx'

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

  it('never includes tokens, passwords or the API key', () => {
    const p = buildBobPrompt(stateWith())
    for (const secret of ['SRC-TOKEN-SECRET', 'SRC-PW-SECRET', 'API-KEY-SECRET']) expect(p).not.toContain(secret)
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
    expect(screen.getByLabelText('Prompt')).toHaveValue(buildBobPrompt(stateWith()))
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
    for (const secret of ['SRC-TOKEN-SECRET', 'SRC-PW-SECRET', 'API-KEY-SECRET']) expect(init.body).not.toContain(secret)
    const poll = fetch.mock.calls[1]
    expect(poll[0]).toBe('/api/bob/jobs/job-1')
    expect(poll[1].method).toBe('GET')
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
