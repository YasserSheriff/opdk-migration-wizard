// Browser client for the Bob prompt API (POST /api/prompt on the Bob ACP route). Calls go to the
// local proxy (/api/bob/prompt), which forwards them; the browser never talks to Bob directly.
// The API is synchronous: one request returns the whole result when the agent finishes.
export const PROXY_URL = '/api/bob/prompt'

// Session updates that are noise in the console (the command list and the answer text, which is
// already in `output`).
const HIDDEN_UPDATES = ['available_commands_update', 'agent_message_chunk', 'agent_thought_chunk', 'session_info_update']

export function summarizeUpdates(updates = []) {
  return updates
    .map((u) => u?.update)
    .filter((u) => u && !HIDDEN_UPDATES.includes(u.sessionUpdate))
    .map((u) => {
      const detail = [u.title, u.kind, u.status].filter(Boolean).join(' - ')
      return detail ? `${u.sessionUpdate}: ${detail}` : u.sessionUpdate || JSON.stringify(u)
    })
}

// Fallback when `output` is empty: join the streamed answer chunks.
const chunkText = (updates = []) =>
  updates
    .map((u) => u?.update)
    .filter((u) => u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text')
    .map((u) => u.content.text)
    .join('')

export async function sendPrompt(prompt, signal) {
  let res
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal,
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new Error(`Cannot reach the Bob proxy (${PROXY_URL}): ${e.message}`)
  }

  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`Bob proxy returned HTTP ${res.status} with a non-JSON body`)
  }
  if (!res.ok) throw new Error(body.error?.message || body.error || `Bob proxy returned HTTP ${res.status}`)
  if (body.error) throw new Error(body.error.message || 'Bob returned an error')

  return {
    sessionId: body.sessionId || '',
    output: body.output || chunkText(body.updates),
    activity: summarizeUpdates(body.updates),
    stopReason: body.result?.stopReason || '',
  }
}
