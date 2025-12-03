import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import type { GraphRendererHandle, PendingChanges } from '../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/visual-validation-core';

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

// ============================================================================
// Sample Canvas Documents
// ============================================================================

/**
 * Basic canvas with process and data nodes
 */
const sampleCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Input Processor',
      color: '#4A90E2',
      vv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
    {
      id: 'node-2',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: 'Database',
      color: '#7B68EE',
      vv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Database',
      },
    },
    {
      id: 'node-3',
      type: 'text',
      x: 500,
      y: 100,
      width: 140,
      height: 70,
      text: 'Output Handler',
      color: '#4A90E2',
      vv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'node-1',
      toNode: 'node-2',
      vv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      vv: { edgeType: 'dataflow' },
    },
  ],
  vv: {
    version: '1.0.0',
    name: 'Sample Validation Graph',
    description: 'Example graph configuration',
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
  },
};

/**
 * Empty canvas
 */
const emptyCanvas: ExtendedCanvas = {
  nodes: [],
  edges: [],
  vv: {
    version: '1.0.0',
    name: 'Empty Graph',
    edgeTypes: {},
  },
};

/**
 * Single node canvas
 */
const singleNodeCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Input Processor',
      color: '#4A90E2',
      vv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
  ],
  edges: [],
  vv: {
    version: '1.0.0',
    name: 'Single Node',
    edgeTypes: {},
  },
};

/**
 * Larger canvas with more nodes
 */
const largeCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Input Processor',
      color: '#4A90E2',
      vv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
    {
      id: 'node-2',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: 'Database',
      color: '#7B68EE',
      vv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Database',
      },
    },
    {
      id: 'node-3',
      type: 'text',
      x: 500,
      y: 100,
      width: 140,
      height: 70,
      text: 'Output Handler',
      color: '#4A90E2',
      vv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
    {
      id: 'node-4',
      type: 'text',
      x: 200,
      y: 250,
      width: 140,
      height: 70,
      text: 'Validator',
      color: '#4A90E2',
      vv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Check',
      },
    },
    {
      id: 'node-5',
      type: 'text',
      x: 400,
      y: 250,
      width: 100,
      height: 100,
      text: 'Cache',
      color: '#7B68EE',
      vv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Zap',
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'node-1',
      toNode: 'node-2',
      vv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      vv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-3',
      fromNode: 'node-1',
      toNode: 'node-4',
      vv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-4',
      fromNode: 'node-4',
      toNode: 'node-5',
      vv: { edgeType: 'dataflow' },
    },
  ],
  vv: {
    version: '1.0.0',
    name: 'Large Graph',
    edgeTypes: {
      dataflow: {
        style: 'solid',
        color: '#50E3C2',
        directed: true,
      },
    },
  },
};

/**
 * Service architecture canvas (richer example)
 */
const serviceArchitectureCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'client',
      type: 'text',
      x: 100,
      y: 200,
      width: 120,
      height: 120,
      text: '# Client',
      color: 5, // cyan preset
      vv: {
        nodeType: 'client',
        shape: 'circle',
        icon: 'user',
        states: {
          idle: { color: '#94a3b8', icon: 'user' },
          connected: { color: '#22c55e', icon: 'user-check' },
          error: { color: '#ef4444', icon: 'user-x' },
        },
      },
    },
    {
      id: 'api-server',
      type: 'text',
      x: 350,
      y: 180,
      width: 200,
      height: 140,
      text: '# API Server\n\nHandles REST endpoints',
      color: 6, // purple preset
      vv: {
        nodeType: 'api-server',
        shape: 'rectangle',
        icon: 'server',
        states: {
          idle: { color: '#94a3b8' },
          processing: { color: '#3b82f6' },
          error: { color: '#ef4444' },
        },
      },
    },
    {
      id: 'database',
      type: 'text',
      x: 620,
      y: 200,
      width: 150,
      height: 100,
      text: '# Database',
      color: 4, // green preset
      vv: {
        nodeType: 'database',
        shape: 'hexagon',
        icon: 'database',
      },
    },
    {
      id: 'cache',
      type: 'text',
      x: 350,
      y: 380,
      width: 140,
      height: 80,
      text: '# Cache',
      color: 2, // orange preset
      vv: {
        nodeType: 'cache',
        shape: 'diamond',
        icon: 'zap',
      },
    },
  ],
  edges: [
    {
      id: 'client-to-api',
      fromNode: 'client',
      toNode: 'api-server',
      fromSide: 'right',
      toSide: 'left',
      label: 'HTTP',
      vv: {
        edgeType: 'http-request',
      },
    },
    {
      id: 'api-to-db',
      fromNode: 'api-server',
      toNode: 'database',
      fromSide: 'right',
      toSide: 'left',
      label: 'SQL',
      vv: {
        edgeType: 'db-query',
      },
    },
    {
      id: 'api-to-cache',
      fromNode: 'api-server',
      toNode: 'cache',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'GET/SET',
      vv: {
        edgeType: 'cache-access',
      },
    },
  ],
  vv: {
    version: '1.0.0',
    name: 'Simple Service Architecture',
    description: 'A basic client-server architecture with caching',
    edgeTypes: {
      'http-request': {
        style: 'solid',
        color: '#3b82f6',
        width: 3,
        directed: true,
        animation: {
          type: 'flow',
          duration: 1500,
        },
      },
      'db-query': {
        style: 'dashed',
        color: '#22c55e',
        width: 2,
        directed: true,
      },
      'cache-access': {
        style: 'dotted',
        color: '#f97316',
        width: 2,
        directed: true,
        animation: {
          type: 'pulse',
          duration: 1000,
        },
      },
    },
    display: {
      layout: 'manual',
      animations: {
        enabled: true,
        speed: 1.0,
      },
    },
  },
};

// ============================================================================
// Stories
// ============================================================================

export const Default: Story = {
  args: {
    canvas: sampleCanvas,
    width: 800,
    height: 600,
  },
};

export const EmptyGraph: Story = {
  args: {
    canvas: emptyCanvas,
    width: 800,
    height: 600,
  },
};

export const SingleNode: Story = {
  args: {
    canvas: singleNodeCanvas,
    width: 800,
    height: 600,
  },
};

export const LargeGraph: Story = {
  args: {
    canvas: largeCanvas,
    width: 800,
    height: 600,
  },
};

export const ServiceArchitecture: Story = {
  args: {
    canvas: serviceArchitectureCanvas,
    width: 900,
    height: 600,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Service Architecture** - A realistic example showing:
- Multiple node shapes (circle, rectangle, hexagon, diamond)
- Edge types with different styles (solid, dashed, dotted)
- Edge animations (flow, pulse)
- State definitions for dynamic coloring
        `,
      },
    },
  },
};

// Interactive story with editable mode
const EditableTemplate = () => {
  const graphRef = React.useRef<GraphRendererHandle>(null);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [lastSavedChanges, setLastSavedChanges] = React.useState<PendingChanges | null>(null);

  const handleSave = () => {
    const changes = graphRef.current?.getPendingChanges();
    if (changes?.hasChanges) {
      console.log('Saving changes:', changes);
      setLastSavedChanges(changes);
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
            <span style={{ fontSize: 12, color: '#f5a623', fontStyle: 'italic' }}>Unsaved changes</span>
          )}
        </div>
        {lastSavedChanges && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#666' }}>Last saved changes:</div>
            <pre
              style={{
                marginTop: 4,
                fontSize: 10,
                backgroundColor: '#fff',
                padding: 8,
                borderRadius: 4,
                maxHeight: 150,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(lastSavedChanges, null, 2)}
            </pre>
          </div>
        )}
      </div>
      <GraphRenderer
        ref={graphRef}
        canvas={sampleCanvas}
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
        story:
          'Full editing mode with internal state management. Drag nodes, create/delete edges, delete nodes, and edit node properties. Changes are tracked internally and can be retrieved via the ref when saving.',
      },
    },
  },
};

const ServiceArchitectureEditableTemplate = () => {
  const graphRef = React.useRef<GraphRendererHandle>(null);
  const [hasChanges, setHasChanges] = React.useState(false);

  return (
    <div>
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          backgroundColor: '#f0f9ff',
          borderRadius: 4,
          border: '1px solid #3b82f6',
        }}
      >
        <strong style={{ color: '#1e40af' }}>Service Architecture + Editing</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#1e40af' }}>
          This graph is rendered from an ExtendedCanvas document. You can edit it interactively.
          {hasChanges && <span style={{ marginLeft: 8, color: '#f97316' }}>(unsaved changes)</span>}
        </div>
      </div>
      <GraphRenderer
        ref={graphRef}
        canvas={serviceArchitectureCanvas}
        width={900}
        height={500}
        editable={true}
        onPendingChangesChange={setHasChanges}
      />
    </div>
  );
};

export const ServiceArchitectureEditable: Story = {
  render: () => <ServiceArchitectureEditableTemplate />,
  parameters: {
    docs: {
      description: {
        story: 'Service architecture canvas with editing enabled. Edit nodes, create edges, and track changes.',
      },
    },
  },
};
