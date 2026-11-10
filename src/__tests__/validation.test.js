import { describe, it, expect } from 'vitest'
import { validateCluster, emptyCluster, initialState, validateTopology, validateTarget, validateAstra, STEPS } from '../validation.js'
import { TOPOLOGIES, getTopology } from '../topologies.js'

const valid = (over = {}) => ({
  ...emptyCluster(),
  apiServer: 'https://api.example.com:6443',
  namespace: 'apigee',
  token: 'abc',
  ...over,
})

describe('topologies', () => {
  it('has the six Apigee v4.53.01 topologies with unique ids', () => {
    expect(TOPOLOGIES.map((t) => t.nodeCount)).toEqual([1, 2, 5, 9, 13, 12])
    expect(new Set(TOPOLOGIES.map((t) => t.id)).size).toBe(6)
  })
  it('defaults to All-in-One', () => {
    expect(initialState().topologyId).toBe('all-in-one')
    expect(getTopology('all-in-one').cassandraNodes).toBe(1)
  })
})

describe('validateCluster', () => {
  it('accepts a valid token config', () => {
    expect(validateCluster(valid())).toEqual({})
  })
  it('accepts a valid user/password config', () => {
    expect(validateCluster(valid({ authMode: 'password', username: 'u', password: 'p', token: '' }))).toEqual({})
  })
  it('requires all fields when empty', () => {
    const e = validateCluster(emptyCluster())
    expect(Object.keys(e).sort()).toEqual(['apiServer', 'namespace', 'token'])
  })
  it('rejects non-https and malformed URLs', () => {
    expect(validateCluster(valid({ apiServer: 'http://x.com' })).apiServer).toMatch(/https/)
    expect(validateCluster(valid({ apiServer: 'not a url' })).apiServer).toMatch(/valid URL/)
  })
  it('rejects invalid namespace names', () => {
    expect(validateCluster(valid({ namespace: 'Bad_NS' })).namespace).toBeDefined()
  })
  it('requires username and password in password mode', () => {
    const e = validateCluster(valid({ authMode: 'password', token: '' }))
    expect(Object.keys(e).sort()).toEqual(['password', 'username'])
  })
})

describe('validateAstra', () => {
  const file = (name) => ({ name })
  const ok = { hostUrl: 'https://x.apps.astra.datastax.com', apiKey: 'k', bundle: file('b.zip') }
  it('accepts valid details', () => {
    expect(validateAstra(ok)).toEqual({})
  })
  it('requires all three fields', () => {
    expect(Object.keys(validateAstra({ hostUrl: '', apiKey: '', bundle: null })).sort())
      .toEqual(['astraApiKey', 'astraBundle', 'astraHostUrl'])
  })
  it('rejects non-https host and non-zip bundle', () => {
    expect(validateAstra({ ...ok, hostUrl: 'http://x.com' }).astraHostUrl).toMatch(/https/)
    expect(validateAstra({ ...ok, bundle: file('b.tar') }).astraBundle).toMatch(/zip/)
  })
  it('is only enforced for Astra, not HCD', () => {
    expect(validateTarget({ targetId: 'hcd', astra: { hostUrl: '', apiKey: '', bundle: null } })).toEqual({})
    expect(Object.keys(validateTarget({ targetId: 'astra', astra: { hostUrl: '', apiKey: '', bundle: null } }))).toHaveLength(3)
  })
})

describe('destination step validation', () => {
  const dest = STEPS.find((s) => s.id === 'destination')
  const astra = { hostUrl: 'https://x.apps.astra.datastax.com', apiKey: 'k', bundle: { name: 'b.zip' } }

  it('does not require the Kubernetes cluster for Astra', () => {
    const s = { ...initialState(), targetId: 'astra', astra }
    expect(dest.validate(s)).toEqual({})
  })
  it('requires the Kubernetes cluster for HCD', () => {
    const s = { ...initialState(), targetId: 'hcd' }
    expect(Object.keys(dest.validate(s)).sort()).toEqual(['apiServer', 'token'])
  })
})

describe('other validators', () => {
  it('validates topology and target', () => {
    expect(validateTopology({ topologyId: 'nope' }).topologyId).toBeDefined()
    expect(validateTarget({ targetId: 'hcd' })).toEqual({})
    expect(validateTarget({ targetId: 'x' }).targetId).toBeDefined()
  })
})
