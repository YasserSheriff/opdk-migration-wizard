import { getTopology } from './topologies.js'

// Builds the "Deployment Steps" text sent to Bob from the wizard state.
// The text shown to the user contains placeholders ({{OPENSHIFT_TOKEN}}, ...) instead of secrets.
// resolveBobPrompt() swaps the placeholders for the real values only when the job is submitted, so
// tokens and passwords are never displayed in the page. The Astra secure connect bundle is a binary
// zip and is not sent; only its file name is.

// Placeholder -> value taken from the wizard state.
function secretValues(state) {
  const { source, destination, astra } = state
  return {
    '{{OPENSHIFT_SOURCE_TOKEN}}': source.token,
    '{{OPENSHIFT_SOURCE_PASSWORD}}': source.password,
    '{{OPENSHIFT_DESTINATION_TOKEN}}': destination.token,
    '{{OPENSHIFT_DESTINATION_PASSWORD}}': destination.password,
    '{{ASTRA_TOKEN}}': astra.apiKey,
  }
}

// Replaces the placeholders with the real credentials. Call this just before sending.
export function resolveBobPrompt(text, state) {
  let out = text
  for (const [placeholder, value] of Object.entries(secretValues(state))) {
    out = out.split(placeholder).join(value || '')
  }
  return out
}

// Kubernetes/OpenShift connection lines. The credential is a placeholder, resolved at send time.
function clusterLines(cluster, prefix) {
  const auth =
    cluster.authMode === 'token'
      ? `- Authentication: bearer token: {{${prefix}_TOKEN}}`
      : `- Authentication: username/password: ${cluster.username} / {{${prefix}_PASSWORD}}`
  return [`- Kubernetes API server: ${cluster.apiServer}`, `- Namespace: ${cluster.namespace}`, auth]
}

export function buildBobPrompt(state) {
  const { source, astra } = state

  const target =
    state.targetId === 'hcd'
      ? ['Target DataStax HCD (OpenShift/Kubernetes):', ...clusterLines(state.destination, 'OPENSHIFT_DESTINATION')]
      : [
          'Target Astra DB:',
          `- Astra Endpoint: ${astra.hostUrl}`,
          '- Astra Token: {{ASTRA_TOKEN}}',
          `- Astra Source connection bundle: ${astra.bundle ? astra.bundle.name : '(not provided)'} (file name only; the bundle contents are not included)`,
        ]

  return [
    'You are assisting in migrating Apache Cassandra database to Astra DB. Follow these 2 steps in sequence.',
    '',
    'Step 1: You will first start with deploying DataStax Zero Down Time (ZDM) to the namespace where the Cassandra is deployed. After it is deployed, check the 3 ZDM pods are in Running state before moving to the next step.',
    '',
    'Here is the namespace and OpenShift login information:',
    '',
    'SOURCE (Apigee OPDK Cassandra)',
    ...clusterLines(source, 'OPENSHIFT_SOURCE'),
    '',
    'Step 2: Migrate the Cassandra database to ' + (state.targetId === 'hcd' ? 'DataStax HCD' : 'Astra') + '. Review the connectivity details above and list what must be reachable from the ZDM proxy to the source Cassandra nodes and to the destination.',
    '',
    ...target,
  ].join('\n')
}
