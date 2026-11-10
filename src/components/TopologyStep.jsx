import { TOPOLOGIES, TOPOLOGY_DOC_URL, getTopology } from '../topologies.js'

export default function TopologyStep({ state, setState, errors }) {
  const selected = getTopology(state.topologyId)

  return (
    <section aria-labelledby="step-title">
      <h2 id="step-title">Select the Apigee OPDK installation topology</h2>
      <p className="hint">
        Choose the topology of the source Apigee Edge for Private Cloud (v4.53.01) installation.
        The Cassandra nodes in this topology are what will be migrated. See the{' '}
        <a href={TOPOLOGY_DOC_URL} target="_blank" rel="noreferrer">
          Apigee topology documentation
        </a>
        .
      </p>

      <fieldset>
        <legend>Installation topology</legend>
        {['Non-production', 'Production'].map((category) => (
          <div key={category} className="group">
            <h3>{category}</h3>
            {TOPOLOGIES.filter((t) => t.category === category).map((t) => (
              <label key={t.id} className="option">
                <input
                  type="radio"
                  name="topology"
                  value={t.id}
                  checked={state.topologyId === t.id}
                  onChange={() => setState((s) => ({ ...s, topologyId: t.id }))}
                />
                <span>
                  <strong>{t.name}</strong>
                  <small>
                    {t.nodeCount} node{t.nodeCount > 1 ? 's' : ''}, {t.cassandraNodes} Cassandra node
                    {t.cassandraNodes > 1 ? 's' : ''}
                    {t.dataCenters > 1 ? `, ${t.dataCenters} data centers` : ''}
                  </small>
                </span>
              </label>
            ))}
          </div>
        ))}
        {errors.topologyId && <p role="alert" className="error">{errors.topologyId}</p>}
      </fieldset>

      {selected && (
        <div className="panel" aria-live="polite">
          <h3>{selected.name}: node layout</h3>
          <table>
            <thead>
              <tr><th>Node(s)</th><th>Components</th></tr>
            </thead>
            <tbody>
              {selected.nodes.map((n) => (
                <tr key={n.label}>
                  <td>{n.label}</td>
                  <td>{n.components.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul>
            {selected.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
          <a href={selected.installUrl} target="_blank" rel="noreferrer">
            Installation instructions for this topology
          </a>
        </div>
      )}
    </section>
  )
}
