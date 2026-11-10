// Kubernetes cluster connection fields, shared by the source step and the combined destination step.
export function ClusterFields({ idPrefix, cluster, onChange, errors }) {
  const set = (field) => (e) => onChange({ ...cluster, [field]: e.target.value })

  const field = (name, label, props = {}) => (
    <div className="field">
      <label htmlFor={`${idPrefix}-${name}`}>{label}</label>
      <input
        id={`${idPrefix}-${name}`}
        value={cluster[name]}
        onChange={set(name)}
        aria-invalid={errors[name] ? 'true' : undefined}
        aria-describedby={errors[name] ? `${idPrefix}-${name}-err` : undefined}
        autoComplete="off"
        {...props}
      />
      {errors[name] && (
        <p id={`${idPrefix}-${name}-err`} role="alert" className="error">{errors[name]}</p>
      )}
    </div>
  )

  return (
    <>
      {field('apiServer', 'Cluster API server URL', { placeholder: 'https://api.cluster.example.com:6443', type: 'url' })}
      {field('namespace', 'Namespace', { placeholder: 'namespace' })}

      <fieldset>
        <legend>Authentication</legend>
        <label className="option">
          <input
            type="radio"
            name={`${idPrefix}-auth`}
            checked={cluster.authMode === 'token'}
            onChange={() => onChange({ ...cluster, authMode: 'token' })}
          />
          <span>Bearer token</span>
        </label>
        <label className="option">
          <input
            type="radio"
            name={`${idPrefix}-auth`}
            checked={cluster.authMode === 'password'}
            onChange={() => onChange({ ...cluster, authMode: 'password' })}
          />
          <span>Username and password</span>
        </label>
      </fieldset>

      {cluster.authMode === 'token'
        ? field('token', 'Token', { type: 'password' })
        : (
          <>
            {field('username', 'Username')}
            {field('password', 'Password', { type: 'password' })}
          </>
        )}
    </>
  )
}

export default function ClusterStep({ title, hint, ...fieldProps }) {
  return (
    <section aria-labelledby="step-title">
      <h2 id="step-title">{title}</h2>
      <p className="hint">{hint}</p>
      <ClusterFields {...fieldProps} />
    </section>
  )
}
