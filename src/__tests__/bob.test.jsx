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

describe('BobConsole', () => {
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { vi.restoreAllMocks() })

  it('sends nothing until Migrate is clicked', () => {
    render(<BobConsole state={stateWith()} />)
    expect(screen.getByLabelText('Prompt')).toHaveValue(buildBobPrompt(stateWith()))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the prompt to the proxy and shows session, activity and output', async () => {
    fetch.mockImplementationOnce(() =>
      reply({
        sessionId: 'sess-1',
        output: 'The plan.',
        updates: [
          { update: { sessionUpdate: 'available_commands_update', availableCommands: [] } },
          { update: { sessionUpdate: 'tool_call', title: 'Read file', kind: 'read', status: 'completed' } },
          { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'The plan.' } } },
        ],
        result: { stopReason: 'end_turn' },
      }),
    )
    const user = userEvent.setup()
    render(<BobConsole state={stateWith()} />)
    await user.click(screen.getByRole('button', { name: 'Migrate' }))

    await waitFor(() => expect(screen.getByLabelText('Bob output')).toHaveTextContent('The plan.'))
    expect(screen.getByText('completed')).toBeInTheDocument()
    expect(screen.getByText('sess-1')).toBeInTheDocument()
    const activity = screen.getByLabelText('Bob activity')
    expect(activity).toHaveTextContent('tool_call: Read file - read - completed')
    expect(activity).not.toHaveTextContent('available_commands_update')

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/bob/prompt')
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body)
    expect(Object.keys(sent)).toEqual(['prompt'])
    expect(sent.prompt).toContain('apigee-prod')
    expect(sent.prompt).not.toContain('SRC-TOKEN-SECRET')
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
  })

  it('falls back to the streamed message chunks when output is empty', async () => {
    fetch.mockImplementationOnce(() =>
      reply({ sessionId: 's', output: '', updates: [
        { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello ' } } },
        { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'world' } } },
      ] }),
    )
    const user = userEvent.setup()
    render(<BobConsole state={stateWith()} />)
    await user.click(screen.getByRole('button', { name: 'Migrate' }))
    await waitFor(() => expect(screen.getByLabelText('Bob output')).toHaveTextContent('Hello world'))
  })

  it('says so when there is no output text at all', async () => {
    fetch.mockImplementationOnce(() => reply({ sessionId: 's', output: '', updates: [] }))
    const user = userEvent.setup()
    render(<BobConsole state={stateWith()} />)
    await user.click(screen.getByRole('button', { name: 'Migrate' }))
    await waitFor(() => expect(screen.getByLabelText('Bob output')).toHaveTextContent('Bob returned no output text'))
  })

  it('shows an error when the proxy is unreachable', async () => {
    fetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    const user = userEvent.setup()
    render(<BobConsole state={stateWith()} />)
    await user.click(screen.getByRole('button', { name: 'Migrate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Cannot reach the Bob proxy/)
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
  })

  it('shows proxy configuration and upstream errors', async () => {
    fetch.mockImplementationOnce(() => reply({ error: 'Bob proxy not configured: set BOB_API_URL' }, false, 500))
    const user = userEvent.setup()
    render(<BobConsole state={stateWith()} />)
    await user.click(screen.getByRole('button', { name: 'Migrate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bob proxy not configured')
  })

  it('Cancel stops waiting for a running request', async () => {
    fetch.mockImplementationOnce((url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      }),
    )
    const user = userEvent.setup()
    render(<BobConsole state={stateWith()} />)
    await user.click(screen.getByRole('button', { name: 'Migrate' }))
    expect(screen.getByText(/Waiting for Bob to finish/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByText('cancelled')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Migrate' })).toBeEnabled()
  })
})
