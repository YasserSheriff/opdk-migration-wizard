import { getTopology } from './topologies.js'

// Builds the prompt sent to Bob from the wizard state.
// Credentials (token, password, Astra API key) are NEVER included: the prompt only names the
// connectivity endpoints and says that credentials are provided separately.
export function buildBobPrompt(state) {
  const topology = getTopology(state.topologyId)
  const { source, astra } = state
  const n = topology.cassandraNodes

  const destination =
    state.targetId === 'hcd'
      ? [
          'DESTINATION (DataStax HCD on Kubernetes)',
          `- Kubernetes API server: ${state.destination.apiServer}`,
          `- Namespace: ${state.destination.namespace}`,
          '- Credentials: provided separately, not included here',
        ]
      : [
          'DESTINATION (DataStax Astra DB)',
          `- Astra host URL: ${astra.hostUrl}`,
          `- Secure connect bundle: ${astra.bundle ? astra.bundle.name : '(not provided)'} (provided separately, not included here)`,
          '- Astra application token: provided separately, not included here',
        ]

  const lines = [
    'You are assisting with migrating the Cassandra database of a Google Apigee OPDK (Private Cloud, Edge v4.53.01) installation to the DataStax destination below using Zero Downtime Migration (ZDM).',
    '',
    'SOURCE (Apigee OPDK Cassandra)',
    `- OPDK topology: ${topology.name} (${n} Cassandra node${n > 1 ? 's' : ''})`,
    `- Kubernetes API server: ${source.apiServer}`,
    `- Namespace: ${source.namespace}`,
    `- Authentication: ${source.authMode === 'token' ? 'bearer token' : 'username/password'} (credentials provided separately, not included here)`,
    '',
    ...destination,
    '',
    'TASK',
    '1. Review the connectivity details above and list what must be reachable from the ZDM proxy to the source Cassandra nodes and to the destination.',
    '2. Outline the ordered steps to deploy the ZDM proxy, export the Apigee keyspaces schema, create it on the destination, copy the data and verify it.',
    '3. Flag any risks or missing information. Do not change or connect to any system; this is a read-only analysis.',
  ]
  return lines.join('\n')
}
