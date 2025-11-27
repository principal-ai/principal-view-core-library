import React from 'react';
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
      icon: 'Settings',
      dataSchema: {
        name: { type: 'string', required: true, displayInLabel: true },
      },
    },
    data: {
      shape: 'circle',
      color: '#7B68EE',
      icon: 'Database',
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
    dependency: {
      style: 'dashed',
      color: '#F5A623',
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
    {
      from: 'process',
      to: 'process',
      via: 'dependency',
    },
    {
      from: 'data',
      to: 'data',
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

// Interactive story with editable mode
import type { GraphRendererHandle, PendingChanges } from '../components/GraphRenderer';

const EditableTemplate = () => {
  const graphRef = React.useRef<GraphRendererHandle>(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [lastSavedChanges, setLastSavedChanges] = React.useState<PendingChanges | null>(null);

  const handleSave = () => {
    const changes = graphRef.current?.getPendingChanges();
    if (changes?.hasChanges) {
      console.log('Saving changes:', changes);
      setLastSavedChanges(changes);
      // In a real app, you'd apply these changes to your config and persist
      // For this demo, we just show what would be saved
    }
  };

  const handleReset = () => {
    graphRef.current?.resetEditState();
    setHasChanges(false);
    setLastSavedChanges(null);
  };

  return (
    <div>
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
        <strong>Interactive Graph Editor</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li>Drag nodes to reposition them</li>
            <li>Drag from a node handle to another node to create an edge</li>
            <li>Click an edge to view info and delete it</li>
            <li>Click a node to view info, edit name/type, or delete it</li>
          </ul>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            style={{
              padding: '6px 12px',
              backgroundColor: hasChanges ? '#4A90E2' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: hasChanges ? 'pointer' : 'not-allowed',
            }}
          >
            Save Changes
          </button>
          <button
            onClick={handleReset}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f0f0f0',
              color: '#333',
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          {hasChanges && (
            <span style={{ fontSize: 12, color: '#f5a623', fontStyle: 'italic' }}>
              Unsaved changes
            </span>
          )}
        </div>
        {lastSavedChanges && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#666' }}>Last saved changes:</div>
            <pre style={{ marginTop: 4, fontSize: 10, backgroundColor: '#fff', padding: 8, borderRadius: 4, maxHeight: 150, overflow: 'auto' }}>
              {JSON.stringify(lastSavedChanges, null, 2)}
            </pre>
          </div>
        )}
      </div>
      <GraphRenderer
        ref={graphRef}
        configuration={sampleConfiguration}
        nodes={sampleNodes}
        edges={sampleEdges}
        width={800}
        height={500}
        editable={true}
        onPendingChangesChange={setHasChanges}
      />
    </div>
  );
};

export const Editable: Story = {
  render: () => <EditableTemplate />,
  parameters: {
    docs: {
      description: {
        story: 'Full editing mode with internal state management. Drag nodes, create/delete edges, delete nodes, and edit node properties. Changes are tracked internally and can be retrieved via the ref when saving.',
      },
    },
  },
};
