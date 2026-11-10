import { useState } from 'react'
import { STEPS, initialState } from './validation.js'
import TopologyStep from './components/TopologyStep.jsx'
import ClusterStep from './components/ClusterStep.jsx'
import DestinationStep from './components/DestinationStep.jsx'
import ReviewStep from './components/ReviewStep.jsx'
import MigrationStep from './components/MigrationStep.jsx'
import logo from './assets/logo.svg'

const REVIEW_INDEX = STEPS.length
const MIGRATION_INDEX = STEPS.length + 1

// phaseMs: duration of each simulated migration phase (overridable for tests)
export default function App({ phaseMs }) {
  const [state, setState] = useState(initialState)
  const [index, setIndex] = useState(0)
  const [errors, setErrors] = useState({})

  const isReview = index === REVIEW_INDEX
  const isMigration = index === MIGRATION_INDEX
  const titles = [...STEPS.map((s) => s.title), 'Review', 'Migration']

  const next = () => {
    const found = STEPS[index].validate(state)
    setErrors(found)
    if (Object.keys(found).length === 0) setIndex(index + 1)
  }
  const back = () => {
    setErrors({})
    setIndex(index - 1)
  }

  const setSource = (source) => setState((s) => ({ ...s, source }))

  let body
  switch (index) {
    case 0:
      body = <TopologyStep state={state} setState={setState} errors={errors} />
      break
    case 1:
      body = (
        <ClusterStep
          title="Source Kubernetes environment"
          hint="Cluster where the Apigee OPDK Cassandra data is reachable."
          idPrefix="source"
          cluster={state.source}
          onChange={setSource}
          errors={errors}
        />
      )
      break
    case 2:
      body = <DestinationStep state={state} setState={setState} errors={errors} />
      break
    case REVIEW_INDEX:
      body = <ReviewStep state={state} />
      break
    default:
      body = <MigrationStep state={state} phaseMs={phaseMs} />
  }

  return (
    <main className="wizard">
      <h1 className="title">
        <img src={logo} alt="" className="logo" />
        Google Apigee - Cassandra migration
      </h1>
      <ol className="steps" aria-label="Progress">
        {titles.map((t, i) => (
          <li
            key={t}
            className={i === index ? 'current' : i < index ? 'done' : ''}
            aria-current={i === index ? 'step' : undefined}
          >
            <span className="num">{i + 1}</span> {t}
          </li>
        ))}
      </ol>

      {body}

      {!isMigration && (
        <div className="nav">
          <button type="button" onClick={back} disabled={index === 0}>Back</button>
          {isReview ? (
            <button type="button" className="primary" onClick={() => setIndex(MIGRATION_INDEX)}>
              Next
            </button>
          ) : (
            <button type="button" className="primary" onClick={next}>Next</button>
          )}
        </div>
      )}
    </main>
  )
}
