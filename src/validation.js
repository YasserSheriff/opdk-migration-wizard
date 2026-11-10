import { getTopology, DEFAULT_TOPOLOGY_ID } from './topologies.js'

export const TARGETS = [
  { id: 'astra', name: 'Astra DB (Cloud)', description: 'DataStax managed Cassandra-compatible service.' },
  { id: 'hcd', name: 'DataStax HCD', description: 'Hyper-Converged Database, self-managed on Kubernetes.' },
]

export const emptyCluster = () => ({
  apiServer: '',
  namespace: '',
  authMode: 'token', // 'token' | 'password'
  token: '',
  username: '',
  password: '',
})

// Astra DB connection details; only used when targetId === 'astra'. bundle is a File held in memory.
export const emptyAstra = () => ({ hostUrl: '', apiKey: '', bundle: null })

export const initialState = () => ({
  topologyId: DEFAULT_TOPOLOGY_ID,
  source: { ...emptyCluster(), namespace: 'apigee' },
  targetId: 'astra',
  astra: emptyAstra(),
  destination: { ...emptyCluster(), namespace: 'cassandra' },
})

const K8S_NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/

export function validateTopology(state) {
  return getTopology(state.topologyId) ? {} : { topologyId: 'Select an installation topology.' }
}

export function validateCluster(cluster) {
  const errors = {}
  const url = (cluster.apiServer || '').trim()
  if (!url) {
    errors.apiServer = 'API server URL is required.'
  } else {
    try {
      const u = new URL(url)
      if (u.protocol !== 'https:') errors.apiServer = 'API server URL must use https.'
    } catch {
      errors.apiServer = 'Enter a valid URL, e.g. https://api.cluster.example.com:6443.'
    }
  }

  const ns = (cluster.namespace || '').trim()
  if (!ns) errors.namespace = 'Namespace is required.'
  else if (ns.length > 63 || !K8S_NAME.test(ns)) errors.namespace = 'Not a valid Kubernetes namespace name.'

  if (cluster.authMode === 'token') {
    if (!(cluster.token || '').trim()) errors.token = 'Token is required.'
  } else if (cluster.authMode === 'password') {
    if (!(cluster.username || '').trim()) errors.username = 'Username is required.'
    if (!cluster.password) errors.password = 'Password is required.'
  } else {
    errors.authMode = 'Choose an authentication method.'
  }
  return errors
}

export function validateAstra(astra) {
  const errors = {}
  const url = (astra.hostUrl || '').trim()
  if (!url) {
    errors.astraHostUrl = 'Host URL is required.'
  } else {
    try {
      if (new URL(url).protocol !== 'https:') errors.astraHostUrl = 'Host URL must use https.'
    } catch {
      errors.astraHostUrl = 'Enter a valid URL, e.g. https://<db-id>-<region>.apps.astra.datastax.com.'
    }
  }
  if (!(astra.apiKey || '').trim()) errors.astraApiKey = 'API key is required.'
  if (!astra.bundle) errors.astraBundle = 'Secure connection bundle is required.'
  else if (!/\.zip$/i.test(astra.bundle.name)) errors.astraBundle = 'The bundle must be a .zip file.'
  return errors
}

export function validateTarget(state) {
  if (!TARGETS.some((t) => t.id === state.targetId)) return { targetId: 'Select a destination.' }
  return state.targetId === 'astra' ? validateAstra(state.astra) : {}
}

export const STEPS = [
  { id: 'topology', title: 'OPDK topology', validate: validateTopology },
  { id: 'source', title: 'Source cluster', validate: (s) => validateCluster(s.source) },
  {
    id: 'destination',
    title: 'Destination',
    // The destination Kubernetes cluster is only collected for HCD; Astra uses host URL, API key and bundle.
    validate: (s) => ({
      ...validateTarget(s),
      ...(s.targetId === 'hcd' ? validateCluster(s.destination) : {}),
    }),
  },
]
