// Apigee Edge for Private Cloud v4.53.01 installation topologies.
// Source: https://docs.apigee.com/private-cloud/v4.53.01/installation-topologies
// cassandraNodes / dataCenters are derived from the node layouts on that page.

export const DEFAULT_TOPOLOGY_ID = 'all-in-one'

export const TOPOLOGY_DOC_URL =
  'https://docs.apigee.com/private-cloud/v4.53.01/installation-topologies'

const INSTALL_BASE =
  'https://docs.apigee.com/private-cloud/v4.53.01/install-edge-components-node#installedgecomponents-'

export const TOPOLOGIES = [
  {
    id: 'all-in-one',
    name: 'All-in-One (1-node)',
    category: 'Non-production',
    nodeCount: 1,
    dataCenters: 1,
    cassandraNodes: 1,
    nodes: [
      {
        label: 'Node 1',
        components: [
          'Cassandra', 'Edge UI', 'Management Server', 'Message Processor',
          'SymasLDAP', 'Postgres Server', 'Qpid Server', 'Router', 'ZooKeeper',
        ],
      },
    ],
    notes: [
      'Non-production or development only; not for performance testing.',
      'No high availability.',
      'Monetization Services cannot be installed.',
    ],
    installUrl: `${INSTALL_BASE}allinoneinstallation`,
  },
  {
    id: 'two-node',
    name: '2-node (standalone)',
    category: 'Non-production',
    nodeCount: 2,
    dataCenters: 1,
    cassandraNodes: 1,
    nodes: [
      {
        label: 'Node 1',
        components: [
          'Cassandra', 'Edge UI', 'Management Server', 'Message Processor',
          'Router', 'SymasLDAP', 'ZooKeeper',
        ],
      },
      { label: 'Node 2', components: ['Postgres Server', 'Qpid Server'] },
    ],
    notes: [
      'Non-production or development only; not for performance testing.',
      'No high availability.',
    ],
    installUrl: `${INSTALL_BASE}2hoststandaloneinstallation`,
  },
  {
    id: 'five-node',
    name: '5-node',
    category: 'Non-production',
    nodeCount: 5,
    dataCenters: 1,
    cassandraNodes: 3,
    nodes: [
      {
        label: 'Node 1',
        components: ['Cassandra', 'Edge UI', 'Management Server', 'SymasLDAP', 'ZooKeeper'],
      },
      { label: 'Nodes 2 & 3', components: ['Cassandra', 'Message Processor', 'Router', 'ZooKeeper'] },
      { label: 'Nodes 4 & 5', components: ['Postgres Server', 'Qpid Server'] },
    ],
    notes: [
      'Non-production or development only; not for performance testing.',
      'Three-node Cassandra and ZooKeeper cluster.',
      'Limited scalability: only Routers and Message Processors expand easily.',
      'No high availability.',
    ],
    installUrl: `${INSTALL_BASE}5hostclusteredinstallation`,
  },
  {
    id: 'nine-node',
    name: '9-node (single data center)',
    category: 'Production',
    nodeCount: 9,
    dataCenters: 1,
    cassandraNodes: 3,
    nodes: [
      {
        label: 'Node 1',
        components: ['Cassandra', 'Edge UI', 'Management Server', 'SymasLDAP', 'ZooKeeper'],
      },
      { label: 'Nodes 2 & 3', components: ['Cassandra', 'ZooKeeper'] },
      { label: 'Nodes 4 & 5', components: ['Message Processor', 'Router'] },
      { label: 'Nodes 6 & 7', components: ['Qpid Server'] },
      { label: 'Nodes 8 & 9', components: ['Postgres Server'] },
    ],
    notes: [
      'Minimum node count for production, but not optimal for performance.',
      '3-node Cassandra ring with a quorum of two; limited ability to take a node out for maintenance.',
      'Routers and Message Processors share nodes (possible noisy-neighbor effects).',
    ],
    installUrl: `${INSTALL_BASE}9hostclusteredinstallation`,
  },
  {
    id: 'thirteen-node',
    name: '13-node (single data center)',
    category: 'Production',
    nodeCount: 13,
    dataCenters: 1,
    cassandraNodes: 3,
    nodes: [
      { label: 'Nodes 1, 2 & 3', components: ['Cassandra', 'ZooKeeper'] },
      { label: 'Nodes 4 & 5', components: ['SymasLDAP'] },
      { label: 'Nodes 6 & 7', components: ['Edge UI', 'Management Server'] },
      { label: 'Nodes 8 & 9', components: ['Postgres Server'] },
      { label: 'Nodes 10 & 11', components: ['Message Processor', 'Router'] },
      { label: 'Nodes 12 & 13', components: ['Qpid Server'] },
    ],
    notes: [
      'Apigee-recommended minimum topology for production.',
      '3-node Cassandra ring with a quorum of two; limited ability to take a node out for maintenance.',
      'Routers and Message Processors share nodes (possible noisy-neighbor effects).',
    ],
    installUrl: `${INSTALL_BASE}13hostclusteredinstallation`,
  },
  {
    id: 'twelve-node',
    name: '12-node (two data centers)',
    category: 'Production',
    nodeCount: 12,
    dataCenters: 2,
    cassandraNodes: 6,
    nodes: [
      {
        label: 'Nodes 1 & 7',
        components: ['Cassandra', 'Edge UI', 'Management Server', 'SymasLDAP', 'ZooKeeper'],
      },
      {
        label: 'Nodes 2, 3, 8 & 9',
        components: ['Cassandra', 'Message Processor', 'Router', 'ZooKeeper'],
      },
      { label: 'Nodes 4, 5, 10 & 11', components: ['Qpid Server'] },
      {
        label: 'Nodes 6 & 12',
        components: ['Postgres master (data center 1)', 'Postgres standby (data center 2)'],
      },
    ],
    notes: [
      'Two data centers of 6 nodes each; disaster recovery and analytics high availability.',
      'Cassandra runs on 3 nodes per data center (6 total), so migration covers both rings.',
      'Routers and Message Processors share nodes (possible noisy-neighbor effects).',
    ],
    installUrl: `${INSTALL_BASE}12hostclusteredinstallation`,
  },
]

export function getTopology(id) {
  return TOPOLOGIES.find((t) => t.id === id)
}
