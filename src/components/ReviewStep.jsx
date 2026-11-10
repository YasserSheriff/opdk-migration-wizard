import { getTopology } from '../topologies.js'
import { TARGETS } from '../validation.js'

function ClusterSummary({ cluster }) {
  return (
    <dl>
      <dt>API server</dt><dd>{cluster.apiServer}</dd>
      <dt>Namespace</dt><dd>{cluster.namespace}</dd>
      <dt>Authentication</dt>
      <dd>
        {cluster.authMode === 'token'
          ? 'Bearer token (hidden)'
          : `Username ${cluster.username}, password (hidden)`}
      </dd>
    </dl>
  )
}

export default function ReviewStep({ state }) {
  const topology = getTopology(state.topologyId)
  const target = TARGETS.find((t) => t.id === state.targetId)

  return (
    <section aria-labelledby="step-title">
      <h2 id="step-title">Review</h2>
      <p className="hint">Credentials are held in memory only and are never stored in the browser.</p>

      <div className="panel">
        <h3>OPDK topology</h3>
        <p>
          {topology.name}: {topology.cassandraNodes} Cassandra node
          {topology.cassandraNodes > 1 ? 's' : ''} to migrate
        </p>
      </div>
      <div className="panel">
        <h3>Source Kubernetes cluster</h3>
        <ClusterSummary cluster={state.source} />
      </div>
      <div className="panel">
        <h3>Destination</h3>
        <p>{target.name}</p>
        {state.targetId === 'astra' && (
          <dl>
            <dt>Host URL</dt><dd>{state.astra.hostUrl}</dd>
            <dt>API key</dt><dd>(hidden)</dd>
            <dt>Secure connection bundle</dt><dd>{state.astra.bundle?.name}</dd>
          </dl>
        )}
      </div>
      {state.targetId === 'hcd' && (
        <div className="panel">
          <h3>Destination Kubernetes cluster</h3>
          <ClusterSummary cluster={state.destination} />
        </div>
      )}
    </section>
  )
}
