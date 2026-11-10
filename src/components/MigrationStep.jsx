import { useEffect, useState } from 'react'
import { getTopology } from '../topologies.js'
import { TARGETS } from '../validation.js'
import BobConsole from './BobConsole.jsx'

export const DEFAULT_PHASE_MS = 1500

// Sections run in order, each with its own progress bar. Items are placeholders until the
// real migration steps are defined.
export function buildSections(state) {
  const topology = getTopology(state.topologyId)
  const target = TARGETS.find((t) => t.id === state.targetId)
  const n = topology.cassandraNodes
  return [
    {
      id: 'setup',
      title: 'Connectivity and ZDM proxy',
      items: [
        `Connect to source cluster (${state.source.namespace})`,
        state.targetId === 'hcd'
          ? `Connect to destination cluster (${state.destination.namespace})`
          : `Connect to ${target.name}`,
        'Deploy Zero Downtime Migration (ZDM) proxy pods',
        'Validate connectivity from source to ZDM proxy',
      ],
    },
    {
      id: 'data',
      title: 'Data migration',
      items: [
        `Export schema from ${n} Cassandra node${n > 1 ? 's' : ''}`,
        `Create schema on ${target.name}`,
        'Copy data',
        'Verify migrated data',
      ],
    },
  ]
}

const statusOf = (index, completed, started) =>
  index < completed ? 'Done' : started && index === completed ? 'In progress' : 'Pending'

// SIMULATED progress: advances one item per `phaseMs`, section by section. No cluster is contacted.
export default function MigrationStep({ state, phaseMs = DEFAULT_PHASE_MS }) {
  const [sections] = useState(() => buildSections(state))
  const [started, setStarted] = useState(false) // set when the user clicks Migrate in the Bob console
  const [completed, setCompleted] = useState(0) // items finished across all sections, in order

  const total = sections.reduce((sum, s) => sum + s.items.length, 0)

  useEffect(() => {
    if (!started || completed >= total) return undefined
    const timer = setTimeout(() => setCompleted((c) => c + 1), phaseMs)
    return () => clearTimeout(timer)
  }, [started, completed, total, phaseMs])

  let offset = 0

  return (
    <section aria-labelledby="step-title">
      <h2 id="step-title">Migration</h2>

      <BobConsole state={state} onMigrate={() => setStarted(true)} />

      <p className="hint">
        The progress bars start when you click Migrate. They are simulated for now: no cluster is
        contacted by them and no data is moved.
      </p>

      {sections.map((section) => {
        const start = offset
        offset += section.items.length
        const sectionDone = Math.min(Math.max(completed - start, 0), section.items.length)
        const percent = Math.round((sectionDone / section.items.length) * 100)

        return (
          <div key={section.id} className="panel migration-section">
            <h3>{section.title}</h3>
            <label htmlFor={`progress-${section.id}`} className="progress-label">
              {section.title} progress: {percent}%
            </label>
            <progress id={`progress-${section.id}`} max={100} value={percent} />

            <ol className="phases" aria-label={`${section.title} items`}>
              {section.items.map((item, i) => {
                const status = statusOf(start + i, completed, started)
                return (
                  <li
                    key={item}
                    className={status === 'Done' ? 'done' : status === 'In progress' ? 'current' : ''}
                  >
                    <span>{item}</span>
                    <span className="status">{status}</span>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}

    </section>
  )
}
