import { useEffect, useRef, useState } from 'react'
import { buildBobPrompt } from '../bobPrompt.js'
import geminiLogo from '../assets/gemini.svg'
import bobLogo from '../assets/bob.svg'
import { cancelJob, getJob, submitJob, TERMINAL_STATUSES } from '../bobClient.js'

export const DEFAULT_POLL_MS = 3000
const MAX_POLL_FAILURES = 3 // consecutive failed status polls tolerated before giving up

// Console that submits a Bob job (prompt built from the previous tabs) through the local proxy and
// polls its status. Nothing is sent until Migrate is clicked.
export default function BobConsole({ state, pollMs = DEFAULT_POLL_MS, onMigrate }) {
  const [prompt, setPrompt] = useState(() => buildBobPrompt(state))
  const [job, setJob] = useState(null) // latest job object from the Bob Jobs API
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const jobId = useRef(null)
  const timer = useRef(null)
  const alive = useRef(true)
  const failures = useRef(0)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(timer.current)
    }
  }, [])

  // 'unknown' is set locally when the job can no longer be tracked; it ends the active state too.
  const isTerminal = (j) => TERMINAL_STATUSES.includes(j?.status) || j?.status === 'unknown'
  const active = submitting || (job && !isTerminal(job))

  const poll = async () => {
    try {
      const data = await getJob(jobId.current)
      if (!alive.current) return
      failures.current = 0
      setJob(data)
      if (!isTerminal(data)) timer.current = setTimeout(poll, pollMs)
    } catch (e) {
      if (!alive.current) return
      failures.current += 1
      if (failures.current >= MAX_POLL_FAILURES) {
        setError(`Lost contact with the job: ${e.message}`)
        setJob((j) => (j ? { ...j, status: 'unknown' } : j))
      } else {
        timer.current = setTimeout(poll, pollMs)
      }
    }
  }

  const send = async () => {
    if (onMigrate) onMigrate()
    clearTimeout(timer.current)
    setError('')
    setJob(null)
    setSubmitting(true)
    failures.current = 0
    try {
      const data = await submitJob(prompt)
      if (!alive.current) return
      if (!data.id) throw new Error('Bob did not return a job id')
      jobId.current = data.id
      setJob(data)
      timer.current = setTimeout(poll, pollMs)
    } catch (e) {
      if (!alive.current) return
      setError(e.message)
    } finally {
      if (alive.current) setSubmitting(false)
    }
  }

  const cancel = async () => {
    clearTimeout(timer.current)
    try {
      const data = await cancelJob(jobId.current)
      if (!alive.current) return
      setJob((j) => ({ ...j, ...data, status: data.status || 'cancelled' }))
    } catch (e) {
      if (!alive.current) return
      setError(e.message)
      timer.current = setTimeout(poll, pollMs) // cancel failed: keep tracking the job
    }
  }

  const canCancel = job && ['queued', 'running'].includes(job.status)

  return (
    <div className="panel bob-console">
      <h3 className="console-heading">
        Migrate with Gemini and IBM Bob
        <img src={geminiLogo} alt="Google Gemini" className="console-logo" />
        <img src={bobLogo} alt="IBM Bob" className="console-logo" />
      </h3>
      <p className="hint">
        Clicking Migrate submits the prompt below to Bob as a background job (via the local proxy) and
        starts the progress bars below. The status is refreshed every few seconds. The prompt is
        built from the Source and Destination tabs; tokens, passwords, API keys and the bundle file
        contents are not included. The Bob API has no read-only or spending limit setting, so the
        prompt only asks for a read-only analysis. Nothing is sent until you click Migrate.
      </p>

      <label htmlFor="bob-prompt">Prompt</label>
      <textarea
        id="bob-prompt"
        rows={14}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={active}
      />

      <div className="nav">
        <button type="button" onClick={() => setPrompt(buildBobPrompt(state))} disabled={active}>
          Reset prompt
        </button>
        <button type="button" className="primary" onClick={send} disabled={active || !prompt.trim()}>
          Migrate
        </button>
        {canCancel && <button type="button" onClick={cancel}>Cancel</button>}
      </div>

      {error && <p role="alert" className="error">{error}</p>}

      {submitting && !job && (
        <div className="console-output" aria-label="Bob console output">Submitting job...</div>
      )}

      {job && (
        <div className="console-output" aria-label="Bob console output">
          <div>
            Job: <code>{job.id}</code> &middot; Status: <strong>{job.status}</strong>
            {job.status === 'queued' && job.queuePosition != null && <> &middot; Queue position: {job.queuePosition}</>}
            {job.toolCalls > 0 && <> &middot; Tool calls: {job.toolCalls}</>}
            {job.stopReason && <> &middot; Stop reason: <code>{job.stopReason}</code></>}
          </div>
          {job.lastActivityAt && !isTerminal(job) && <div>Last activity: {new Date(job.lastActivityAt).toLocaleTimeString()}</div>}
          {job.error && <div className="error">Error: {typeof job.error === 'string' ? job.error : JSON.stringify(job.error)}</div>}
          <div className="console-title">Output{isTerminal(job) ? '' : ' so far'}</div>
          <pre aria-label="Bob output">
            {job.output || (isTerminal(job) ? '(Bob returned no output text)' : '(waiting for output...)')}
          </pre>
        </div>
      )}
    </div>
  )
}
