import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import type { GraphConfiguration, NodeState, EdgeState } from '@principal-ai/visual-validation-core';
import { ConfigurationValidator } from '@principal-ai/visual-validation-core';

const meta = {
  title: 'Components/GraphRenderer',
  component: GraphRenderer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample configuration
const sampleConfiguration: GraphConfiguration = {
  metadata: {
    name: 'Sample Validation Graph',
    version: '1.0.0',
    description: 'Example graph configuration',
  },
  nodeTypes: {
    process: {
      shape: 'rectangle',
      color: '#4A90E2',
      icon: '⚙️',
      dataSchema: {
        name: { type: 'string', required: true, displayInLabel: true },
      },
    },
    data: {
      shape: 'circle',
      color: '#7B68EE',
      icon: '💾',
      dataSchema: {
        name: { type: 'string', required: true, displayInLabel: true },
      },
    },
  },
  edgeTypes: {
    dataflow: {
      style: 'solid',
      color: '#50E3C2',
      directed: true,
    },
  },
  allowedConnections: [
    {
      from: 'process',
      to: 'data',
      via: 'dataflow',
    },
    {
      from: 'data',
      to: 'process',
      via: 'dataflow',
    },
  ],
};

// Validate configuration (will log warnings if any)
ConfigurationValidator.validateOrThrow(sampleConfiguration);

// Sample nodes
const sampleNodes: NodeState[] = [
  {
    id: 'node-1',
    type: 'process',
    data: { name: 'Input Processor' },
    position: { x: 100, y: 100 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'node-2',
    type: 'data',
    data: { name: 'Database' },
    position: { x: 300, y: 100 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'node-3',
    type: 'process',
    data: { name: 'Output Handler' },
    position: { x: 500, y: 100 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

// Sample edges
const sampleEdges: EdgeState[] = [
  {
    id: 'edge-1',
    from: 'node-1',
    to: 'node-2',
    type: 'dataflow',
    data: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'edge-2',
    from: 'node-2',
    to: 'node-3',
    type: 'dataflow',
    data: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export const Default: Story = {
  args: {
    configuration: sampleConfiguration,
    nodes: sampleNodes,
    edges: sampleEdges,
    width: 800,
    height: 600,
  },
};

export const EmptyGraph: Story = {
  args: {
    configuration: sampleConfiguration,
    nodes: [],
    edges: [],
    width: 800,
    height: 600,
  },
};

export const SingleNode: Story = {
  args: {
    configuration: sampleConfiguration,
    nodes: [sampleNodes[0]],
    edges: [],
    width: 800,
    height: 600,
  },
};

export const LargeGraph: Story = {
  args: {
    configuration: sampleConfiguration,
    nodes: [
      ...sampleNodes,
      {
        id: 'node-4',
        type: 'process',
        data: { name: 'Validator' },
        position: { x: 200, y: 250 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'node-5',
        type: 'data',
        data: { name: 'Cache' },
        position: { x: 400, y: 250 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    edges: [
      ...sampleEdges,
      {
        id: 'edge-3',
        from: 'node-1',
        to: 'node-4',
        type: 'dataflow',
        data: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'edge-4',
        from: 'node-4',
        to: 'node-5',
        type: 'dataflow',
        data: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    width: 800,
    height: 600,
  },
};
