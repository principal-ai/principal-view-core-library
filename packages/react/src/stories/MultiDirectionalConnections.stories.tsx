import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import type { GraphConfiguration, NodeState, EdgeState } from '@principal-ai/visual-validation-core';
import { ConfigurationValidator } from '@principal-ai/visual-validation-core';

const meta = {
  title: 'Features/Multi-Directional Connections',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Demonstrates multi-directional edge connections (top, bottom, left, right) and clickable edges with information panels.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

// Configuration with edge metadata schema
const configuration: GraphConfiguration = {
  metadata: {
    name: 'Multi-Directional Connection Demo',
    version: '1.0.0',
    description: 'Showcasing edges connecting from all sides with rich metadata',
  },
  nodeTypes: {
    service: {
      shape: 'rectangle',
      color: '#4A90E2',
      icon: 'Server',
      dataSchema: {
        name: { type: 'string', required: true, displayInLabel: true },
        status: { type: 'string', required: false },
      },
      states: {
        active: { color: '#22C55E', label: 'Active' },
        idle: { color: '#EAB308', label: 'Idle' },
        error: { color: '#EF4444', label: 'Error' },
      },
    },
    database: {
      shape: 'circle',
      color: '#7B68EE',
      icon: 'Database',
      dataSchema: {
        name: { type: 'string', required: true, displayInLabel: true },
        type: { type: 'string', required: false },
      },
    },
    cache: {
      shape: 'hexagon',
      color: '#F59E0B',
      icon: 'Zap',
      dataSchema: {
        name: { type: 'string', required: true, displayInLabel: true },
      },
    },
    gateway: {
      shape: 'diamond',
      color: '#06B6D4',
      icon: 'Network',
      dataSchema: {
        name: { type: 'string', required: true, displayInLabel: true },
      },
    },
  },
  edgeTypes: {
    http: {
      style: 'solid',
      color: '#22C55E',
      width: 2,
      directed: true,
      dataSchema: {
        method: {
          type: 'string',
          label: 'HTTP Method',
          displayInInfo: true,
        },
        endpoint: {
          type: 'string',
          label: 'Endpoint',
          displayInInfo: true,
        },
        latency: {
          type: 'number',
          label: 'Avg Latency (ms)',
          displayInInfo: true,
        },
        requestsPerSecond: {
          type: 'number',
          label: 'Requests/sec',
          displayInInfo: true,
        },
      },
    },
    database_query: {
      style: 'dashed',
      color: '#7B68EE',
      width: 2,
      directed: true,
      dataSchema: {
        queryType: {
          type: 'string',
          label: 'Query Type',
          displayInInfo: true,
        },
        table: {
          type: 'string',
          label: 'Table',
          displayInInfo: true,
        },
        avgDuration: {
          type: 'number',
          label: 'Avg Duration (ms)',
          displayInInfo: true,
        },
      },
    },
    cache_access: {
      style: 'dotted',
      color: '#F59E0B',
      width: 2,
      directed: true,
      dataSchema: {
        operation: {
          type: 'string',
          label: 'Operation',
          displayInInfo: true,
        },
        hitRate: {
          type: 'number',
          label: 'Cache Hit Rate (%)',
          displayInInfo: true,
        },
      },
    },
    websocket: {
      style: 'animated',
      color: '#06B6D4',
      width: 3,
      directed: false,
      dataSchema: {
        protocol: {
          type: 'string',
          label: 'Protocol',
          displayInInfo: true,
        },
        messagesPerSecond: {
          type: 'number',
          label: 'Messages/sec',
          displayInInfo: true,
        },
      },
    },
  },
  allowedConnections: [
    { from: 'gateway', to: 'service', via: 'http' },
    { from: 'service', to: 'database', via: 'database_query' },
    { from: 'service', to: 'cache', via: 'cache_access' },
    { from: 'gateway', to: 'gateway', via: 'websocket' },
    { from: 'service', to: 'service', via: 'http' },
  ],
};

ConfigurationValidator.validateOrThrow(configuration);

// Nodes arranged in a grid to show multi-directional connections
const nodes: NodeState[] = [
  {
    id: 'gateway-1',
    type: 'gateway',
    data: { name: 'API Gateway' },
    position: { x: 400, y: 50 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'service-1',
    type: 'service',
    data: { name: 'Auth Service', status: 'active' },
    state: 'active',
    position: { x: 200, y: 200 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'service-2',
    type: 'service',
    data: { name: 'API Service', status: 'active' },
    state: 'active',
    position: { x: 600, y: 200 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'cache-1',
    type: 'cache',
    data: { name: 'Redis Cache' },
    position: { x: 100, y: 400 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'database-1',
    type: 'database',
    data: { name: 'PostgreSQL', type: 'relational' },
    position: { x: 400, y: 400 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'service-3',
    type: 'service',
    data: { name: 'Notification Service', status: 'idle' },
    state: 'idle',
    position: { x: 700, y: 400 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// Edges with multi-directional connections and rich metadata
const edges: EdgeState[] = [
  // From top to services (top -> bottom connections)
  {
    id: 'edge-1',
    from: 'gateway-1',
    to: 'service-1',
    type: 'http',
    data: {
      method: 'POST',
      endpoint: '/auth/login',
      latency: 45,
      requestsPerSecond: 150,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'edge-2',
    from: 'gateway-1',
    to: 'service-2',
    type: 'http',
    data: {
      method: 'GET',
      endpoint: '/api/users',
      latency: 32,
      requestsPerSecond: 320,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  // Horizontal connections (left <-> right)
  {
    id: 'edge-3',
    from: 'service-1',
    to: 'service-2',
    type: 'http',
    data: {
      method: 'GET',
      endpoint: '/internal/validate',
      latency: 12,
      requestsPerSecond: 80,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  // Services to data layer (top -> bottom and diagonal)
  {
    id: 'edge-4',
    from: 'service-1',
    to: 'cache-1',
    type: 'cache_access',
    data: {
      operation: 'GET',
      hitRate: 87.5,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'edge-5',
    from: 'service-1',
    to: 'database-1',
    type: 'database_query',
    data: {
      queryType: 'SELECT',
      table: 'users',
      avgDuration: 18,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'edge-6',
    from: 'service-2',
    to: 'database-1',
    type: 'database_query',
    data: {
      queryType: 'UPDATE',
      table: 'sessions',
      avgDuration: 25,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'edge-7',
    from: 'service-2',
    to: 'service-3',
    type: 'http',
    data: {
      method: 'POST',
      endpoint: '/notify',
      latency: 8,
      requestsPerSecond: 15,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  // Cache to database (horizontal)
  {
    id: 'edge-8',
    from: 'cache-1',
    to: 'database-1',
    type: 'database_query',
    data: {
      queryType: 'SELECT',
      table: 'cache_fallback',
      avgDuration: 22,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export const Default: Story = {
  args: {
    configuration,
    nodes,
    edges,
    width: '100%',
    height: '800px',
    showMinimap: true,
    showControls: true,
    showBackground: true,
  },
};

export const WithViolations: Story = {
  args: {
    configuration,
    nodes,
    edges,
    violations: [
      {
        id: 'v1',
        severity: 'error',
        type: 'connection',
        description: 'Unauthorized connection detected',
        context: { edgeId: 'edge-3' },
      },
    ],
    width: '100%',
    height: '800px',
  },
};

export const MinimalView: Story = {
  args: {
    configuration,
    nodes: nodes.slice(0, 4),
    edges: edges.slice(0, 4),
    width: '100%',
    height: '600px',
    showMinimap: false,
    showControls: true,
    showBackground: true,
  },
};

export const ComplexMesh: Story = {
  args: {
    configuration,
    nodes: [
      ...nodes,
      {
        id: 'gateway-2',
        type: 'gateway',
        data: { name: 'Internal Gateway' },
        position: { x: 400, y: 600 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    edges: [
      ...edges,
      {
        id: 'edge-9',
        from: 'database-1',
        to: 'gateway-2',
        type: 'websocket',
        data: {
          protocol: 'wss',
          messagesPerSecond: 450,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    width: '100%',
    height: '900px',
  },
};
