import { useEffect, useRef, useState } from 'react'
import { buildBobPrompt } from '../bobPrompt.js'
import geminiLogo from '../assets/gemini.svg'
import bobLogo from '../assets/bob.svg'
import { sendPrompt } from '../bobClient.js'

// Console that sends a prompt (built from the previous tabs) to Bob through the local proxy and
// shows the session, activity and output. Nothing is sent until Migrate is clicked.
export default function BobConsole({ state, onMigrate }) {
  const [prompt, setPrompt] = useState(() => buildBobPrompt(state))
  const [status, setStatus] = useState('idle') // idle | running | completed | cancelled | failed
  const [result, setResult] = useState(null) // { sessionId, output, activity, stopReason }
  const [error, setError] = useState('')
  const controller = useRef(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      controller.current?.abort()
    }
  }, [])

  const send = async () => {
    if (onMigrate) onMigrate()
    setError('')
    setResult(null)
    setStatus('running')
    controller.current = new AbortController()
    try {
      const data = await sendPrompt(prompt, controller.current.signal)
      if (!alive.current) return
      setResult(data)
      setStatus('completed')
    } catch (e) {
      if (!alive.current) return
      if (e.name === 'AbortError') {
        setStatus('cancelled')
      } else {
        setError(e.message)
        setStatus('failed')
      }
    }
  }

  // Stops waiting for the answer. The request is aborted on our side only; Bob may still finish it.
  const cancel = () => controller.current?.abort()

  const running = status === 'running'

  return (
    <div className="panel bob-console">
      <h3 className="console-heading">
        Migrate with Gemini and IBM Bob
        <img src={geminiLogo} alt="Google Gemini" className="console-logo" />
        <img src={bobLogo} alt="IBM Bob" className="console-logo" />
      </h3>
      <p className="hint">
        Clicking Migrate sends the prompt below to Bob (via the local proxy) and starts the progress
        bars below. The prompt is built from the Source and Destination tabs; tokens, passwords, API
        keys and the bundle file contents are not included. The Bob API has no read-only or spending
        limit setting, so the prompt only asks for a read-only analysis. Nothing is sent until you
        click Migrate.
      </p>

      <label htmlFor="bob-prompt">Prompt</label>
      <textarea
        id="bob-prompt"
        rows={14}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={running}
      />

      <div className="nav">
        <button type="button" onClick={() => setPrompt(buildBobPrompt(state))} disabled={running}>
          Reset prompt
        </button>
        <button type="button" className="primary" onClick={send} disabled={running || !prompt.trim()}>
          Migrate
        </button>
        {running && <button type="button" onClick={cancel}>Cancel</button>}
      </div>

      {error && <p role="alert" className="error">{error}</p>}

      {status !== 'idle' && (
        <div className="console-output" aria-label="Bob console output">
          <div>
            State: <strong>{status}</strong>
            {result?.sessionId && <> &middot; Session: <code>{result.sessionId}</code></>}
            {result?.stopReason && <> &middot; Stop reason: <code>{result.stopReason}</code></>}
          </div>
          {status === 'running' && <div>Waiting for Bob to finish (this can take a few minutes)...</div>}
          {status === 'cancelled' && <div>Stopped waiting. Bob may still complete the request.</div>}
          {result?.activity.length > 0 && (
            <>
              <div className="console-title">Activity</div>
              <ul aria-label="Bob activity">
                {result.activity.map((a, i) => (
                  <li key={i}><code>{a}</code></li>
                ))}
              </ul>
            </>
          )}
          {status === 'completed' && (
            <>
              <div className="console-title">Output</div>
              <pre aria-label="Bob output">{result.output || '(Bob returned no output text)'}</pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
