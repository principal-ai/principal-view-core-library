import type { Meta, StoryObj } from '@storybook/react';
import { EventLog } from '../components/EventLog';
import type { GraphEvent, Violation } from '@principal-ai/principal-view-core';

const meta = {
  title: 'Components/EventLog',
  component: EventLog,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof EventLog>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample events
const sampleEvents: GraphEvent[] = [
  {
    id: 'evt-1',
    timestamp: Date.now() - 5000,
    type: 'node_added',
    category: 'node',
    operation: 'create',
    data: {
      nodeId: 'node-1',
      nodeType: 'process',
    },
    metadata: {},
  },
  {
    id: 'evt-2',
    timestamp: Date.now() - 4000,
    type: 'node_added',
    category: 'node',
    operation: 'create',
    data: {
      nodeId: 'node-2',
      nodeType: 'data',
    },
    metadata: {},
  },
  {
    id: 'evt-3',
    timestamp: Date.now() - 3000,
    type: 'edge_added',
    category: 'edge',
    operation: 'create',
    data: {
      edgeId: 'edge-1',
      source: 'node-1',
      target: 'node-2',
    },
    metadata: {},
  },
  {
    id: 'evt-4',
    timestamp: Date.now() - 2000,
    type: 'node_updated',
    category: 'node',
    operation: 'update',
    data: {
      nodeId: 'node-1',
      changes: { label: 'Updated Processor' },
    },
    metadata: {},
  },
  {
    id: 'evt-5',
    timestamp: Date.now() - 1000,
    type: 'validation_run',
    category: 'validation',
    operation: 'read',
    data: {
      violations: 2,
      warnings: 1,
    },
    metadata: {},
  },
];

// Sample violations
const sampleViolations: Violation[] = [
  {
    id: 'viol-1',
    type: 'connection',
    severity: 'error',
    message: 'Invalid connection between incompatible node types',
    context: {
      nodeId: 'node-1',
      edgeId: 'edge-1',
    },
    ruleId: 'conn-rule-1',
    timestamp: Date.now() - 1000,
  },
  {
    id: 'viol-2',
    type: 'structure',
    severity: 'warning',
    message: 'Node exceeds maximum connection limit',
    context: {
      nodeId: 'node-2',
    },
    ruleId: 'struct-rule-1',
    timestamp: Date.now() - 500,
  },
];

export const Default: Story = {
  args: {
    events: sampleEvents,
    violations: sampleViolations,
  },
};

export const EventsOnly: Story = {
  args: {
    events: sampleEvents,
    violations: [],
  },
};

export const EmptyLog: Story = {
  args: {
    events: [],
    violations: [],
  },
};

export const ManyEvents: Story = {
  args: {
    events: [
      ...sampleEvents,
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `evt-gen-${i}`,
        timestamp: Date.now() - (i * 500),
        type: 'node_updated',
        category: 'node' as const,
        operation: 'update' as const,
        data: {
          nodeId: `node-${i}`,
          changes: {},
        },
        metadata: {},
      })),
    ],
    violations: sampleViolations,
    maxHeight: '500px',
  },
};

export const WithClickHandler: Story = {
  args: {
    events: sampleEvents,
    violations: sampleViolations,
    onEventClick: (event) => {
      console.log('Event clicked:', event);
      alert(`Event clicked: ${event.type}`);
    },
  },
};
