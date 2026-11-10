import { TARGETS } from '../validation.js'
import { ClusterFields } from './ClusterStep.jsx'

function AstraFields({ astra, onChange, errors }) {
  const err = (key, id) => errors[key] && (
    <p id={`${id}-err`} role="alert" className="error">{errors[key]}</p>
  )

  return (
    <div className="panel">
      <h3>Astra DB connection</h3>

      <div className="field">
        <label htmlFor="astra-host">Host URL</label>
        <input
          id="astra-host"
          type="url"
          value={astra.hostUrl}
          onChange={(e) => onChange({ ...astra, hostUrl: e.target.value })}
          placeholder="https://<db-id>-<region>.apps.astra.datastax.com"
          autoComplete="off"
          aria-invalid={errors.astraHostUrl ? 'true' : undefined}
          aria-describedby={errors.astraHostUrl ? 'astra-host-err' : undefined}
        />
        {err('astraHostUrl', 'astra-host')}
      </div>

      <div className="field">
        <label htmlFor="astra-key">API key</label>
        <input
          id="astra-key"
          type="password"
          value={astra.apiKey}
          onChange={(e) => onChange({ ...astra, apiKey: e.target.value })}
          autoComplete="off"
          aria-invalid={errors.astraApiKey ? 'true' : undefined}
          aria-describedby={errors.astraApiKey ? 'astra-key-err' : undefined}
        />
        {err('astraApiKey', 'astra-key')}
      </div>

      <div className="field">
        <label htmlFor="astra-bundle">Secure connection bundle (.zip)</label>
        <input
          id="astra-bundle"
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => onChange({ ...astra, bundle: e.target.files[0] || null })}
          aria-invalid={errors.astraBundle ? 'true' : undefined}
          aria-describedby={errors.astraBundle ? 'astra-bundle-err' : undefined}
        />
        {astra.bundle && <small>Selected: {astra.bundle.name}</small>}
        {err('astraBundle', 'astra-bundle')}
      </div>
    </div>
  )
}

// Single step: choose the destination platform and enter its connection details
// (Astra: host URL, API key, bundle; HCD: Kubernetes cluster).
export default function DestinationStep({ state, setState, errors }) {
  const setDestination = (destination) => setState((s) => ({ ...s, destination }))
  const setAstra = (astra) => setState((s) => ({ ...s, astra }))

  return (
    <section aria-labelledby="step-title">
      <h2 id="step-title">Destination</h2>
      <p className="hint">
        Select where the Apigee Cassandra data will be migrated to, and enter its connection details.
      </p>

      <fieldset>
        <legend>Destination platform</legend>
        {TARGETS.map((t) => (
          <label key={t.id} className="option">
            <input
              type="radio"
              name="target"
              value={t.id}
              checked={state.targetId === t.id}
              onChange={() => setState((s) => ({ ...s, targetId: t.id }))}
            />
            <span>
              <strong>{t.name}</strong>
              <small>{t.description}</small>
            </span>
          </label>
        ))}
        {errors.targetId && <p role="alert" className="error">{errors.targetId}</p>}
      </fieldset>

      {state.targetId === 'astra' && (
        <AstraFields astra={state.astra} onChange={setAstra} errors={errors} />
      )}

      {state.targetId === 'hcd' && (
        <>
          <h3>Destination Kubernetes cluster</h3>
          <ClusterFields
            idPrefix="destination"
            cluster={state.destination}
            onChange={setDestination}
            errors={errors}
          />
        </>
      )}
    </section>
  )
}
