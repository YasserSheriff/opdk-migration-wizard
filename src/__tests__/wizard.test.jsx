import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App.jsx'

const fillCluster = async (user, prefix, { server, ns, token }) => {
  const url = screen.getByLabelText('Cluster API server URL')
  await user.clear(url)
  await user.type(url, server)
  const nsField = screen.getByLabelText('Namespace')
  await user.clear(nsField)
  await user.type(nsField, ns)
  await user.type(screen.getByLabelText('Token'), token)
}

const zip = (name = 'secure-connect-db.zip') => new File(['zip'], name, { type: 'application/zip' })

const fillAstra = async (user, { host = 'https://abc-us-east-2.apps.astra.datastax.com', key = 'AstraCS:KEY', file = zip() } = {}) => {
  await user.type(screen.getByLabelText('Host URL'), host)
  await user.type(screen.getByLabelText('API key'), key)
  await user.upload(screen.getByLabelText(/Secure connection bundle/), file)
}

const bobDone = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ id: 'job-1', status: 'completed', output: 'ok', stopReason: 'end_turn' })),
  })

describe('wizard flow', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('starts on the topology step with All-in-One selected and shows its layout', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Google Apigee - Cassandra migration' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /installation topology/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/All-in-One/)).toBeChecked()
    expect(screen.getByText(/Cassandra, Edge UI, Management Server/)).toBeInTheDocument()
  })

  it('lets the user choose another topology', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByLabelText(/13-node/))
    expect(screen.getByLabelText(/13-node/)).toBeChecked()
    expect(screen.getByText(/Apigee-recommended minimum topology/)).toBeInTheDocument()
  })

  it('blocks Next on invalid source cluster and shows errors', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.clear(screen.getByLabelText('Namespace'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('API server URL is required.')).toBeInTheDocument()
    expect(screen.getByText('Namespace is required.')).toBeInTheDocument()
    expect(screen.getByText('Token is required.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Source Kubernetes/ })).toBeInTheDocument()
  })

  it('completes all steps and shows a review with secrets masked', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await fillCluster(user, 'source', { server: 'https://src.example.com:6443', ns: 'apigee', token: 'SECRET-SRC' })
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // With Astra selected there is no destination Kubernetes cluster section
    expect(screen.getByRole('heading', { level: 2, name: 'Destination' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Astra DB/)).toBeChecked()
    expect(screen.queryByText('Destination Kubernetes cluster')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cluster API server URL')).not.toBeInTheDocument()

    await fillAstra(user, { key: 'SECRET-KEY' })
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getByText('https://src.example.com:6443')).toBeInTheDocument()
    expect(screen.getByText('Astra DB (Cloud)')).toBeInTheDocument()
    expect(screen.getByText('https://abc-us-east-2.apps.astra.datastax.com')).toBeInTheDocument()
    expect(screen.getByText('secure-connect-db.zip')).toBeInTheDocument()
    expect(screen.queryByText('Destination Kubernetes cluster')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('SECRET-SRC')
    expect(document.body.textContent).not.toContain('SECRET-KEY')
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Migrate' })).not.toBeInTheDocument()
  })

  it('Review Next opens the Migration tab; progress starts only after Migrate is clicked', async () => {
    global.fetch = vi.fn(bobDone)
    const user = userEvent.setup()
    render(<App phaseMs={5} />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await fillCluster(user, 'source', { server: 'https://src.example.com:6443', ns: 'apigee', token: 't' })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await fillAstra(user)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Migration' })).toBeInTheDocument()
    // Bob console is above the progress bars
    const consoleHeading = screen.getByRole('heading', { name: /Migrate with Gemini and IBM Bob/ })
    expect(consoleHeading).toContainElement(screen.getByAltText('Google Gemini'))
    expect(consoleHeading).toContainElement(screen.getByAltText('IBM Bob'))
    const firstSection = screen.getByRole('heading', { name: 'Connectivity and ZDM proxy' })
    expect(consoleHeading.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Progress' }).querySelector('[aria-current="step"]').textContent).toMatch(/Migration/)
    // no wizard navigation while migrating
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()

    // Two sections, each with its own progress bar
    const setup = screen.getByRole('list', { name: 'Connectivity and ZDM proxy items' })
    const data = screen.getByRole('list', { name: 'Data migration items' })
    expect(screen.getAllByRole('progressbar')).toHaveLength(2)
    expect(screen.getByText('Connectivity and ZDM proxy progress: 0%')).toBeInTheDocument()
    expect(screen.getByText('Data migration progress: 0%')).toBeInTheDocument()

    const texts = (list) => Array.from(list.querySelectorAll('li > span:first-child'), (s) => s.textContent)
    expect(texts(setup)).toEqual([
      'Connect to source cluster (apigee)',
      'Connect to Astra DB (Cloud)',
      'Deploy Zero Downtime Migration (ZDM) proxy pods',
      'Validate connectivity from source to ZDM proxy',
    ])
    expect(texts(data)).toEqual([
      'Export schema from 1 Cassandra node',
      'Create schema on Astra DB (Cloud)',
      'Copy data',
      'Verify migrated data',
    ])

    // Nothing moves until Migrate is clicked
    await new Promise((r) => setTimeout(r, 60))
    expect(screen.getByText('Connectivity and ZDM proxy progress: 0%')).toBeInTheDocument()
    expect(screen.getByText('Data migration progress: 0%')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Migrate' }))
    expect(global.fetch).toHaveBeenCalled()

    // Sections run in order: the data section does not start until the setup section is done
    await waitFor(() => expect(screen.getByText('Connectivity and ZDM proxy progress: 100%')).toBeInTheDocument())
    expect(screen.getByText(/Data migration progress: (0|25)%/)).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('Data migration progress: 100%')).toBeInTheDocument())
    expect(screen.queryByText(/Migration complete/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Done')).toHaveLength(8)
  })

  it('has a single Destination step and a Migration step after Review', () => {
    render(<App />)
    const steps = screen.getByRole('list', { name: 'Progress' }).querySelectorAll('li')
    expect(Array.from(steps, (li) => li.textContent.replace(/^\d+\s*/, ''))).toEqual([
      'OPDK topology', 'Source cluster', 'Destination', 'Review', 'Migration',
    ])
  })

  it('swaps Astra fields for the Kubernetes cluster section when HCD is selected', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await fillCluster(user, 'source', { server: 'https://src.example.com:6443', ns: 'apigee', token: 't' })
    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Astra: connection fields, no Kubernetes cluster section
    expect(screen.getByLabelText('Host URL')).toBeInTheDocument()
    expect(screen.getByLabelText('API key')).toBeInTheDocument()
    expect(screen.getByLabelText(/Secure connection bundle/)).toBeInTheDocument()
    expect(screen.queryByText('Destination Kubernetes cluster')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Cluster API server URL')).not.toBeInTheDocument()

    // HCD: Kubernetes cluster section, no Astra fields
    await user.click(screen.getByLabelText(/DataStax HCD/))
    expect(screen.queryByLabelText('Host URL')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Secure connection bundle/)).not.toBeInTheDocument()
    expect(screen.getByText('Destination Kubernetes cluster')).toBeInTheDocument()
    expect(screen.getByLabelText('Cluster API server URL')).toBeInTheDocument()

    // and back to Astra
    await user.click(screen.getByLabelText(/Astra DB/))
    expect(screen.queryByText('Destination Kubernetes cluster')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Host URL')).toBeInTheDocument()
  })

  it('requires the Astra host URL, API key and bundle before continuing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await fillCluster(user, 'source', { server: 'https://src.example.com:6443', ns: 'apigee', token: 't' })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByText('Host URL is required.')).toBeInTheDocument()
    expect(screen.getByText('API key is required.')).toBeInTheDocument()
    expect(screen.getByText('Secure connection bundle is required.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Destination' })).toBeInTheDocument()
  })

  it('proceeds with DataStax HCD using only the Kubernetes cluster details', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await fillCluster(user, 'source', { server: 'https://src.example.com:6443', ns: 'apigee', token: 't' })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByLabelText(/DataStax HCD/))
    await fillCluster(user, 'destination', { server: 'https://dst.example.com:6443', ns: 'hcd-ns', token: 't' })
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getByText('DataStax HCD')).toBeInTheDocument()
    expect(screen.getByText('https://dst.example.com:6443')).toBeInTheDocument()
    expect(screen.getByText('Destination Kubernetes cluster')).toBeInTheDocument()
    expect(screen.queryByText('Secure connection bundle')).not.toBeInTheDocument()
  })

  it('blocks Next on the HCD Destination step until the cluster details are valid', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await fillCluster(user, 'source', { server: 'https://src.example.com:6443', ns: 'apigee', token: 't' })
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(screen.getByLabelText(/DataStax HCD/))
    await user.clear(screen.getByLabelText('Namespace'))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('API server URL is required.')).toBeInTheDocument()
    expect(screen.getByText('Namespace is required.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Destination' })).toBeInTheDocument()
  })

  it('keeps entered values when going Back', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(screen.getByLabelText('Cluster API server URL'), 'https://src.example.com')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Next' }).closest('div').querySelector('button.primary'))
    expect(screen.getByLabelText('Cluster API server URL')).toHaveValue('https://src.example.com')
  })

  it('does not write secrets to browser storage', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.type(screen.getByLabelText('Token'), 'SECRET')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})
