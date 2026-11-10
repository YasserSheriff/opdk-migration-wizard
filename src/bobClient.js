// Browser client for the Bob Jobs API (via the local proxy under /api/bob/jobs). A job runs in the
// background: submit it, then poll its status until it is completed, failed or cancelled.
export const PROXY_URL = '/api/bob/jobs'
export const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled']

async function request(method, url, body) {
  let res
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw new Error(`Cannot reach the Bob proxy (${PROXY_URL}): ${e.message}`)
  }

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Bob proxy returned HTTP ${res.status} with a non-JSON body`)
  }
  if (res.status === 404) throw new Error('Bob job not found (it may have expired or Bob restarted)')
  if (!res.ok) throw new Error(data.error?.message || data.error || `Bob proxy returned HTTP ${res.status}`)
  return data
}

export const submitJob = (prompt) => request('POST', PROXY_URL, { prompt })

export const getJob = (id) => request('GET', `${PROXY_URL}/${encodeURIComponent(id)}`)

// Cancels a queued/running job. (On a finished job the same call deletes its record.)
export const cancelJob = (id) => request('DELETE', `${PROXY_URL}/${encodeURIComponent(id)}`)
