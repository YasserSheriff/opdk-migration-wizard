import { useEffect, useRef, useState } from 'react'
import { buildBobPrompt } from '../bobPrompt.js'
import geminiLogo from '../assets/gemini.svg'
import bobLogo from '../assets/bob.svg'
import { cancelJob, getJob, submitJob, TERMINAL_STATUSES } from '../bobClient.js'

export const DEFAULT_POLL_MS = 5000 // status check interval
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
  const outputBox = useRef(null)
  const [log, setLog] = useState([]) // timestamped status-check lines shown in the console
  const checks = useRef(0)

  const addLog = (text) => setLog((l) => [...l, { time: new Date().toLocaleTimeString(), text }])

  // Keep the fixed-size console following new output, unless the user has scrolled up to read.
  useEffect(() => {
    const el = outputBox.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) el.scrollTop = el.scrollHeight
  }, [job, submitting, error, log])

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
      checks.current += 1
      setJob(data)
      addLog(
        `Status check #${checks.current}: ${data.status}` +
          (data.toolCalls > 0 ? `, ${data.toolCalls} tool calls` : '') +
          (data.status === 'queued' && data.queuePosition != null ? `, queue position ${data.queuePosition}` : '') +
          (isTerminal(data) ? ' (finished, no more checks)' : `, next check in ${Math.round(pollMs / 1000)}s`),
      )
      if (!isTerminal(data)) timer.current = setTimeout(poll, pollMs)
    } catch (e) {
      if (!alive.current) return
      failures.current += 1
      addLog(`Status check failed (${failures.current}/${MAX_POLL_FAILURES}): ${e.message}`)
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
    setLog([])
    checks.current = 0
    setSubmitting(true)
    failures.current = 0
    try {
      const data = await submitJob(prompt)
      if (!alive.current) return
      if (!data.id) throw new Error('Bob did not return a job id')
      jobId.current = data.id
      setJob(data)
      addLog(`Job submitted: ${data.id} (${data.status}). Checking status every ${Math.round(pollMs / 1000)}s.`)
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
      addLog('Cancel requested: job cancelled.')
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
        starts the progress bars below. The job status is checked every 5 seconds and each check is logged below. The prompt is
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

      <div className="console-output" ref={outputBox} tabIndex={0} aria-label="Bob console output">
        {!job && !submitting && <div className="console-idle">Ready. Click Migrate to submit the prompt to Bob.</div>}
        {submitting && !job && <div>Submitting job...</div>}
        {job && (
          <>
            <div>
              Job: <code>{job.id}</code> &middot; Status: <strong>{job.status}</strong>
              {job.status === 'queued' && job.queuePosition != null && <> &middot; Queue position: {job.queuePosition}</>}
              {job.toolCalls > 0 && <> &middot; Tool calls: {job.toolCalls}</>}
              {job.stopReason && <> &middot; Stop reason: <code>{job.stopReason}</code></>}
            </div>
            {job.lastActivityAt && !isTerminal(job) && <div>Last activity: {new Date(job.lastActivityAt).toLocaleTimeString()}</div>}
            {job.error && <div className="error">Error: {typeof job.error === 'string' ? job.error : JSON.stringify(job.error)}</div>}
            <div className="console-title">Status checks</div>
            <ul className="status-log" aria-label="Bob status checks">
              {log.map((l, i) => (
                <li key={i}><span className="log-time">{l.time}</span> {l.text}</li>
              ))}
            </ul>
            <div className="console-title">Output{isTerminal(job) ? '' : ' so far'}</div>
            <pre aria-label="Bob output">
              {job.output || (isTerminal(job) ? '(Bob returned no output text)' : '(waiting for output...)')}
            </pre>
          </>
        )}
      </div>
    </div>
  )
}
