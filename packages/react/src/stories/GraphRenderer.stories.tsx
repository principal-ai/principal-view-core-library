import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import type { GraphRendererHandle, PendingChanges } from '../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/principal-view-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Components/GraphRenderer',
  component: GraphRenderer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
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
      pv: {
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
      pv: {
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
      pv: {
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
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      pv: { edgeType: 'dataflow' },
    },
  ],
  pv: {
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
  pv: {
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
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'Settings',
      },
    },
  ],
  edges: [],
  pv: {
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
      pv: {
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
      pv: {
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
      pv: {
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
      pv: {
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
      pv: {
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
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-3',
      fromNode: 'node-1',
      toNode: 'node-4',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-4',
      fromNode: 'node-4',
      toNode: 'node-5',
      pv: { edgeType: 'dataflow' },
    },
  ],
  pv: {
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
      pv: {
        nodeType: 'client',
        shape: 'circle',
        icon: 'User',
        states: {
          idle: { color: '#94a3b8', icon: 'User' },
          connected: { color: '#22c55e', icon: 'UserCheck' },
          error: { color: '#ef4444', icon: 'UserX' },
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
      pv: {
        nodeType: 'api-server',
        shape: 'rectangle',
        icon: 'Server',
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
      pv: {
        nodeType: 'database',
        shape: 'hexagon',
        icon: 'Database',
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
      pv: {
        nodeType: 'cache',
        shape: 'diamond',
        icon: 'Zap',
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
      pv: {
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
      pv: {
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
      pv: {
        edgeType: 'cache-access',
      },
    },
  ],
  pv: {
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
            <span style={{ fontSize: 12, color: '#f5a623', fontStyle: 'italic' }}>
              Unsaved changes
            </span>
          )}
        </div>
        {lastSavedChanges && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', color: '#666' }}>
              Last saved changes:
            </div>
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
        story:
          'Service architecture canvas with editing enabled. Edit nodes, create edges, and track changes.',
      },
    },
  },
};

// ============================================================================
// OTEL Log Association Canvas
// ============================================================================

/**
 * OTEL Log Association architecture canvas
 * Demonstrates OTEL badges, tooltips, and info panel integration
 */
const otelLogAssociationCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'otel-log',
      type: 'text',
      text: 'OtelLog',
      x: -304,
      y: 147,
      width: 120,
      height: 118,
      pv: {
        nodeType: 'otel-type',
        name: 'OtelLog',
        description:
          'OpenTelemetry log record with timestamp, severity, body, resource, and trace context',
        otel: {
          kind: 'type',
          category: 'log',
          isNew: true,
        },
        shape: 'rectangle',
        icon: 'FileText',
        fill: '#4A90E2',
      },
    },
    {
      id: 'otel-resource',
      type: 'text',
      text: 'OtelResource',
      x: -305,
      y: 316,
      width: 120,
      height: 117,
      pv: {
        nodeType: 'otel-type',
        name: 'OtelResource',
        description: 'OTEL resource attributes like service.name, k8s.*, deployment.*',
        otel: {
          kind: 'type',
          category: 'resource',
        },
        shape: 'rectangle',
        icon: 'Box',
        fill: '#4A90E2',
      },
    },
    {
      id: 'canvas-scope',
      type: 'text',
      text: 'CanvasScope',
      x: -77,
      y: -48,
      width: 130,
      height: 118,
      pv: {
        nodeType: 'service',
        name: 'CanvasScope',
        description: 'Filters which logs are relevant to this canvas based on resource attributes',
        shape: 'hexagon',
        icon: 'Filter',
        fill: '#9B59B6',
      },
    },
    {
      id: 'log-router',
      type: 'text',
      text: 'LogRouter',
      x: -80,
      y: 150,
      width: 130,
      height: 118,
      pv: {
        nodeType: 'otel-service',
        name: 'LogRouter',
        description:
          'Routes incoming OTEL logs to canvas nodes based on scope and resourceMatch criteria',
        otel: {
          kind: 'service',
          category: 'router',
          isNew: true,
        },
        shape: 'hexagon',
        icon: 'GitBranch',
        fill: '#7ED321',
      },
    },
    {
      id: 'resource-matcher',
      type: 'text',
      text: 'ResourceMatcher',
      x: -82,
      y: 440,
      width: 130,
      height: 119,
      pv: {
        nodeType: 'service',
        name: 'ResourceMatcher',
        description: 'Matches log resources against node resourceMatch criteria',
        otel: {
          kind: 'service',
          category: 'match',
        },
        shape: 'hexagon',
        icon: 'Search',
        fill: '#7ED321',
      },
    },
    {
      id: 'resource-match',
      type: 'text',
      text: 'ResourceMatch',
      x: 179,
      y: 445,
      width: 120,
      height: 117,
      pv: {
        nodeType: 'otel-type',
        name: 'ResourceMatch',
        description: 'Criteria for matching OTEL resources to canvas nodes',
        otel: {
          kind: 'type',
          category: 'match',
        },
        shape: 'rectangle',
        icon: 'Target',
        fill: '#4A90E2',
      },
    },
    {
      id: 'match-operator',
      type: 'text',
      text: 'MatchOperator',
      x: 178,
      y: 632,
      width: 120,
      height: 117,
      pv: {
        nodeType: 'otel-type',
        name: 'MatchOperator',
        description: 'Matching operators: exact, glob, regex, exists, oneOf',
        otel: {
          kind: 'type',
          category: 'match',
        },
        shape: 'diamond',
        icon: 'Code',
        fill: '#F5A623',
      },
    },
    {
      id: 'canvas-node',
      type: 'text',
      text: 'Canvas Node',
      x: 172,
      y: 277,
      width: 132,
      height: 121,
      pv: {
        nodeType: 'service',
        name: 'Canvas Node',
        description: 'A node in the canvas that can receive routed logs',
        shape: 'rectangle',
        icon: 'Square',
        fill: '#00BCD4',
      },
    },
    {
      id: 'routing-result',
      type: 'text',
      text: 'LogRoutingResult',
      x: 169,
      y: 80,
      width: 150,
      height: 135,
      pv: {
        nodeType: 'otel-type',
        name: 'LogRoutingResult',
        description: 'Result of routing a log: routed, orphaned, or out-of-scope',
        otel: {
          kind: 'type',
          category: 'audit',
        },
        shape: 'rectangle',
        icon: 'CheckCircle',
        fill: '#4A90E2',
      },
    },
    {
      id: 'audit-collector',
      type: 'text',
      text: 'AuditCollector',
      x: 380,
      y: 150,
      width: 130,
      height: 117,
      pv: {
        nodeType: 'otel-service',
        name: 'AuditCollector',
        description:
          'Tracks routing metrics, orphaned logs, silent nodes, and generates coverage reports',
        otel: {
          kind: 'service',
          category: 'collector',
          isNew: true,
        },
        shape: 'hexagon',
        icon: 'BarChart2',
        fill: '#7ED321',
      },
    },
    {
      id: 'orphaned-log',
      type: 'text',
      text: 'OrphanedLog',
      x: 618,
      y: 150,
      width: 127,
      height: 118,
      pv: {
        nodeType: 'otel-type',
        name: 'OrphanedLog',
        description:
          'Logs that matched canvas scope but no node resourceMatch - indicates missing nodes or misconfiguration',
        otel: {
          kind: 'type',
          category: 'audit',
          isNew: true,
        },
        shape: 'rectangle',
        icon: 'AlertTriangle',
        fill: '#D0021B',
      },
    },
    {
      id: 'audit-report',
      type: 'text',
      text: 'AuditReport',
      x: 618,
      y: 288,
      width: 124,
      height: 123,
      pv: {
        nodeType: 'otel-type',
        name: 'AuditReport',
        description: 'Coverage report with node activity, orphans, and recommendations',
        otel: {
          kind: 'type',
          category: 'audit',
        },
        shape: 'rectangle',
        icon: 'FileText',
        fill: '#4A90E2',
      },
    },
  ],
  edges: [
    {
      id: 'log-to-router',
      fromNode: 'otel-log',
      toNode: 'log-router',
      fromSide: 'right',
      toSide: 'left',
      label: 'route()',
      pv: { edgeType: 'http-request' },
    },
    {
      id: 'router-checks-scope',
      fromNode: 'log-router',
      toNode: 'canvas-scope',
      fromSide: 'top',
      toSide: 'bottom',
      label: 'isInScope()',
      pv: { edgeType: 'http-request' },
    },
    {
      id: 'router-uses-matcher',
      fromNode: 'log-router',
      toNode: 'resource-matcher',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'match()',
      pv: { edgeType: 'http-request' },
    },
    {
      id: 'matcher-uses-match',
      fromNode: 'resource-matcher',
      toNode: 'resource-match',
      fromSide: 'right',
      toSide: 'left',
      label: 'criteria',
      pv: { edgeType: 'db-query' },
    },
    {
      id: 'match-has-operator',
      fromNode: 'resource-match',
      toNode: 'match-operator',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'operators',
      pv: { edgeType: 'db-query' },
    },
    {
      id: 'router-to-node',
      fromNode: 'log-router',
      toNode: 'canvas-node',
      fromSide: 'right',
      toSide: 'left',
      label: 'routed',
      pv: { edgeType: 'http-request' },
    },
    {
      id: 'router-returns-result',
      fromNode: 'log-router',
      toNode: 'routing-result',
      fromSide: 'right',
      toSide: 'left',
      label: 'returns',
      pv: { edgeType: 'http-request' },
    },
    {
      id: 'result-to-audit',
      fromNode: 'routing-result',
      toNode: 'audit-collector',
      fromSide: 'right',
      toSide: 'left',
      label: 'track()',
      pv: { edgeType: 'http-request' },
    },
    {
      id: 'audit-tracks-orphans',
      fromNode: 'audit-collector',
      toNode: 'orphaned-log',
      fromSide: 'right',
      toSide: 'left',
      label: 'unmatched',
      pv: { edgeType: 'db-query' },
    },
    {
      id: 'audit-generates-report',
      fromNode: 'audit-collector',
      toNode: 'audit-report',
      fromSide: 'right',
      toSide: 'left',
      label: 'generate()',
      pv: { edgeType: 'db-query' },
    },
    {
      id: 'node-has-match',
      fromNode: 'canvas-node',
      toNode: 'resource-match',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'resourceMatch',
      pv: { edgeType: 'db-query' },
    },
    {
      id: 'log-has-resource',
      fromNode: 'otel-log',
      toNode: 'otel-resource',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'resource',
      pv: { edgeType: 'db-query' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'OTEL Log Association Architecture',
    description: 'Shows how OtelLog flows through LogRouter to Canvas Nodes, with audit tracking',
    nodeTypes: {
      service: {
        label: 'Component',
        description: 'System component',
        shape: 'hexagon',
      },
      'otel-type': {
        label: 'Type',
        description: 'TypeScript type or interface representing OTEL concepts',
        shape: 'rectangle',
      },
      'otel-service': {
        label: 'Service',
        description: 'Runtime service component for OTEL processing',
        shape: 'hexagon',
      },
    },
    edgeTypes: {
      'http-request': {
        label: 'Flow',
        style: 'solid',
        color: '#4A90E2',
        directed: true,
      },
      'db-query': {
        label: 'Reference',
        style: 'dashed',
        color: '#999',
        directed: true,
      },
    },
  },
};

export const OtelLogAssociation: Story = {
  args: {
    canvas: otelLogAssociationCanvas,
    width: 1000,
    height: 800,
  },
  parameters: {
    docs: {
      description: {
        story: `
**OTEL Log Association Architecture** - Demonstrates the new OTEL visualization features:
- **OTEL Badges**: Circular badges (T/S/I) in the top-right corner of nodes indicating Type, Service, or Instance
- **Hover Tooltips**: Hover over any node to see the OTEL kind, category, NEW indicator, and description
- **Node Info Panel**: Click a node to see the OpenTelemetry section in the info panel

Color coding:
- **Blue (T)**: Type nodes - TypeScript types/interfaces
- **Green (S)**: Service nodes - Runtime services
- **Purple (I)**: Instance nodes - Specific running instances
        `,
      },
    },
  },
};

// ============================================================================
// Sources Tooltip Canvas
// ============================================================================

/**
 * Canvas demonstrating source file associations in tooltips
 */
const sourcesTooltipCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'auth-service',
      type: 'text',
      x: 100,
      y: 150,
      width: 160,
      height: 100,
      text: '# Auth Service\n\nHandles user authentication',
      color: '#3b82f6',
      pv: {
        nodeType: 'service',
        shape: 'rectangle',
        icon: 'Lock',
        sources: [
          'src/services/auth/AuthService.ts',
          'src/services/auth/TokenManager.ts',
        ],
      },
    },
    {
      id: 'user-controller',
      type: 'text',
      x: 350,
      y: 150,
      width: 160,
      height: 100,
      text: '# User Controller\n\nManages user CRUD operations',
      color: '#8b5cf6',
      pv: {
        nodeType: 'controller',
        shape: 'rectangle',
        icon: 'User',
        sources: [
          'src/controllers/UserController.ts',
        ],
      },
    },
    {
      id: 'database',
      type: 'text',
      x: 600,
      y: 150,
      width: 140,
      height: 100,
      text: '# Database\n\nPostgreSQL instance',
      color: '#22c55e',
      pv: {
        nodeType: 'database',
        shape: 'hexagon',
        icon: 'Database',
        sources: [
          'src/db/connection.ts',
          'src/db/migrations/001_init.sql',
          'src/db/queries/users.ts',
        ],
      },
    },
    {
      id: 'cache-layer',
      type: 'text',
      x: 225,
      y: 320,
      width: 150,
      height: 90,
      text: '# Cache Layer\n\nRedis caching',
      color: '#f59e0b',
      pv: {
        nodeType: 'cache',
        shape: 'diamond',
        icon: 'Zap',
        sources: [
          'src/cache/RedisCache.ts',
          'src/cache/CacheManager.ts',
        ],
      },
    },
    {
      id: 'logger',
      type: 'text',
      x: 450,
      y: 320,
      width: 140,
      height: 90,
      text: '# Logger\n\nCentralized logging',
      color: '#6366f1',
      pv: {
        nodeType: 'utility',
        shape: 'circle',
        icon: 'FileText',
        sources: [
          'src/utils/logger.ts',
        ],
      },
    },
  ],
  edges: [
    {
      id: 'auth-to-user',
      fromNode: 'auth-service',
      toNode: 'user-controller',
      fromSide: 'right',
      toSide: 'left',
      label: 'validates',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'user-to-db',
      fromNode: 'user-controller',
      toNode: 'database',
      fromSide: 'right',
      toSide: 'left',
      label: 'queries',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'auth-to-cache',
      fromNode: 'auth-service',
      toNode: 'cache-layer',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'stores tokens',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'user-to-cache',
      fromNode: 'user-controller',
      toNode: 'cache-layer',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'caches',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'auth-to-logger',
      fromNode: 'auth-service',
      toNode: 'logger',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'logs',
      pv: { edgeType: 'logging' },
    },
    {
      id: 'user-to-logger',
      fromNode: 'user-controller',
      toNode: 'logger',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'logs',
      pv: { edgeType: 'logging' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Service Architecture with Sources',
    description: 'Demonstrates source file associations in shift-hover tooltips',
    edgeTypes: {
      dataflow: {
        style: 'solid',
        color: '#3b82f6',
        width: 2,
        directed: true,
      },
      logging: {
        style: 'dashed',
        color: '#94a3b8',
        width: 2,
        directed: true,
      },
    },
  },
};

const SourcesInTooltipTemplate = () => {
  const [lastClickedSource, setLastClickedSource] = React.useState<{ nodeId: string; source: string } | null>(null);

  const handleSourceClick = (nodeId: string, source: string) => {
    console.log('Source clicked:', source, 'from node:', nodeId);
    setLastClickedSource({ nodeId, source });
    alert(`Source clicked!\n\nNode: ${nodeId}\nFile: ${source}`);
  };

  return (
    <div>
      {lastClickedSource && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            backgroundColor: '#f0f9ff',
            borderRadius: 4,
            border: '1px solid #3b82f6',
          }}
        >
          <strong style={{ color: '#1e40af' }}>Last Clicked Source:</strong>
          <div style={{ marginTop: 4, fontSize: 12, color: '#1e40af', fontFamily: 'monospace' }}>
            Node: {lastClickedSource.nodeId}
          </div>
          <div style={{ fontSize: 12, color: '#1e40af', fontFamily: 'monospace' }}>
            File: {lastClickedSource.source}
          </div>
        </div>
      )}
      <GraphRenderer
        canvas={sourcesTooltipCanvas}
        width={900}
        height={550}
        onSourceClick={handleSourceClick}
      />
    </div>
  );
};

export const SourcesInTooltip: Story = {
  render: () => <SourcesInTooltipTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Sources in Tooltips and Info Panel** - Demonstrates source file associations:

**How to view sources:**
1. Hold the **Shift** key and hover over any node to see sources in the tooltip
2. Click on a node to open the info panel at the bottom
3. Click on any source file path to trigger the \`onSourceClick\` callback

**Features:**
- **Green "S" Badge**: Nodes with sources show a green badge in the top-left corner
- **Tooltip Sources**: Source files appear below the description in shift-hover tooltips
- **Clickable Sources**: In the info panel, sources are clickable buttons with dotted underlines
- **Callback Integration**: \`onSourceClick(nodeId, source)\` fires when a source is clicked
- **Visual Feedback**: Sources show hover effects and are clearly interactive

**Try it:**
1. Click on "Auth Service" to open the info panel
2. Click on any of its 2 source files in the panel
3. An alert will show the clicked source information
4. Also try: Database (3 sources), Cache Layer (2 sources), Logger (1 source)
        `,
      },
    },
  },
};

const EditModeToggleTemplate = () => {
  const [isEditMode, setIsEditMode] = React.useState(false);
  const graphRef = React.useRef<GraphRendererHandle>(null);
  const [hasChanges, setHasChanges] = React.useState(false);

  const handleSave = () => {
    if (graphRef.current) {
      const changes = graphRef.current.getPendingChanges();
      console.log('Saving changes:', changes);
      alert('Changes saved! Check console for details.');
      graphRef.current.resetEditState();
    }
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setIsEditMode(!isEditMode)}
            style={{
              padding: '8px 16px',
              backgroundColor: isEditMode ? '#ef4444' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            {isEditMode ? '🔓 Exit Edit Mode' : '🔒 Enter Edit Mode'}
          </button>
          {isEditMode && hasChanges && (
            <button
              onClick={handleSave}
              style={{
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              💾 Save Changes
            </button>
          )}
          <div style={{ fontSize: 13, color: '#1e40af' }}>
            Mode: <strong>{isEditMode ? 'Editable' : 'Read-only'}</strong>
            {isEditMode && hasChanges && (
              <span style={{ marginLeft: 8, color: '#f97316', fontWeight: 'bold' }}>
                (unsaved changes)
              </span>
            )}
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          Toggle between read-only and edit mode. Try dragging nodes after switching modes to verify
          the NaN error fix.
        </div>
      </div>
      <GraphRenderer
        ref={graphRef}
        canvas={sampleCanvas}
        width={800}
        height={500}
        editable={isEditMode}
        onPendingChangesChange={setHasChanges}
      />
    </div>
  );
};

export const EditModeToggle: Story = {
  render: () => <EditModeToggleTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Edit Mode Toggle** - Demonstrates toggling between read-only and editable modes without remounting.

This story tests the fix for the NaN coordinate error that occurred when transitioning between modes:
- Click "Enter Edit Mode" to enable editing
- Try dragging nodes (should work without NaN errors)
- Click "Exit Edit Mode" to return to read-only
- Toggle back to edit mode and drag again (should still work)

Previously, this would cause \`NaN\` errors in edge coordinates due to ReactFlow's internal state corruption.
The fix uses \`updateNodeInternals()\` to reset ReactFlow's measurement tracking when entering edit mode.
        `,
      },
    },
  },
};

/**
 * Canvas for demonstrating the selected prop styling
 */
const selectionStylingCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 70,
      text: 'Click Me!',
      color: '#4A90E2',
      pv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'MousePointer',
        eventRef: 'user.clicked',
      },
    },
    {
      id: 'node-2',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: 'Or Me!',
      color: '#7B68EE',
      pv: {
        nodeType: 'data',
        shape: 'circle',
        icon: 'Circle',
        eventRef: 'data.processed',
      },
    },
    {
      id: 'node-3',
      type: 'text',
      x: 500,
      y: 100,
      width: 140,
      height: 70,
      text: 'Me Three!',
      color: '#22c55e',
      pv: {
        nodeType: 'process',
        shape: 'hexagon',
        icon: 'Hexagon',
        eventRef: 'workflow.executed',
      },
    },
    {
      id: 'node-4',
      type: 'text',
      x: 200,
      y: 250,
      width: 120,
      height: 120,
      text: 'Diamond',
      color: '#f59e0b',
      pv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'GitBranch',
        eventRef: 'decision.evaluated',
      },
    },
    {
      id: 'node-5',
      type: 'text',
      x: 400,
      y: 250,
      width: 140,
      height: 80,
      text: 'Inline Event',
      color: '#8b5cf6',
      pv: {
        nodeType: 'event',
        shape: 'rectangle',
        icon: 'Zap',
        event: {
          name: 'order.completed',
          description: 'Triggered when an order is successfully completed and payment is confirmed',
          attributes: {
            orderId: { type: 'string', required: true, description: 'Unique order identifier' },
            userId: { type: 'string', required: true, description: 'User who placed the order' },
            amount: { type: 'number', required: true, description: 'Order total amount' },
            timestamp: { type: 'string', description: 'Order completion timestamp' },
          },
        },
      },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      fromNode: 'node-1',
      toNode: 'node-2',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-2',
      fromNode: 'node-2',
      toNode: 'node-3',
      pv: { edgeType: 'dataflow' },
    },
    {
      id: 'edge-3',
      fromNode: 'node-1',
      toNode: 'node-4',
      pv: { edgeType: 'dataflow' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Selection Styling Demo',
    description: 'Demonstrates ReactFlow selected prop visual styling',
    edgeTypes: {
      dataflow: {
        style: 'solid',
        color: '#50E3C2',
        directed: true,
      },
    },
  },
};

const SelectionStylingTemplate = () => {
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
        <strong style={{ color: '#1e40af' }}>ReactFlow Selection Styling Demo</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          <p style={{ margin: '4px 0' }}>
            This demonstrates the <code>selected</code> prop that ReactFlow passes to CustomNode.
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Visual effects when a node is selected:</strong>
          </p>
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>2px box-shadow outline</strong> in the node's stroke color</li>
            <li><strong>Resize handles</strong> (only visible in edit mode - not shown in this demo)</li>
          </ul>
          <p style={{ margin: '8px 0 4px 0' }}>
            <strong>Try these interactions:</strong>
          </p>
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>Click</strong> any node → see the outline appear</li>
            <li><strong>Click another</strong> node → outline moves to new selection</li>
            <li><strong>Click background</strong> → outline disappears</li>
            <li><strong>Shift+Drag</strong> box around multiple nodes → all get outlined</li>
          </ul>
          <p style={{ margin: '8px 0 4px 0', fontSize: 11, fontStyle: 'italic', color: '#64748b' }}>
            Note: The <code>selected</code> prop is purely for visual feedback.
            The info panel uses a separate <code>selectedNodeIds</code> state.
          </p>
        </div>
      </div>
      <GraphRenderer
        canvas={selectionStylingCanvas}
        width={800}
        height={500}
        showNodeDetailPanel={false}
      />
    </div>
  );
};

export const SelectionStyling: Story = {
  render: () => <SelectionStylingTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Selection Styling** - Demonstrates the visual effects of ReactFlow's \`selected\` prop in read-only mode.

When a node is selected (via click or box selection), ReactFlow sets \`selected={true}\` on the node component.
This triggers visual changes in \`CustomNode\`:

1. **Box-shadow outline** (line 253-254 in CustomNode.tsx):
   - 2px solid outline using the node's stroke color
   - Appears immediately on selection
   - Removed when selection is cleared
   - **Click any node to see the outline appear!**

2. **NodeResizer visibility** (line 441 in CustomNode.tsx):
   - Shows resize handles when \`selected={true}\` AND \`editable={true}\`
   - Not visible in this demo (read-only mode)
   - See the "Editable" story for resize handle demos

**Key Point:** The \`selected\` prop is purely for ReactFlow's visual feedback. It's separate from
\`selectedNodeIds\` state which controls the info panel display.

In this demo, the info panel is hidden (\`showNodeDetailPanel={false}\`) and edit mode is disabled,
so you can focus on just the selection outline effect.
        `,
      },
    },
  },
};

const HighlightedNodeSyncTemplate = () => {
  const [highlightedNodeId, setHighlightedNodeId] = React.useState<string | null>(null);
  const nodeIds = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'];
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const handleCycleNodes = () => {
    const nextIndex = (currentIndex + 1) % nodeIds.length;
    setCurrentIndex(nextIndex);
    setHighlightedNodeId(nodeIds[nextIndex]);
  };

  const handleClearHighlight = () => {
    setHighlightedNodeId(null);
    setCurrentIndex(0);
  };

  // Mock event registry to demonstrate resolveEventRef
  const resolveEventRef = (eventRef: string) => {
    const eventRegistry: Record<string, any> = {
      'user.clicked': {
        name: 'user.clicked',
        description: 'Triggered when a user clicks on an interactive element',
        attributes: {
          elementId: { type: 'string', required: true, description: 'ID of the clicked element' },
          userId: { type: 'string', required: true, description: 'ID of the user who clicked' },
          timestamp: { type: 'string', required: true, description: 'ISO 8601 timestamp' },
          position: { type: 'object', description: 'Click coordinates (x, y)' },
        },
      },
      'data.processed': {
        name: 'data.processed',
        description: 'Emitted when data processing completes successfully',
        attributes: {
          dataId: { type: 'string', required: true, description: 'Unique identifier for the data' },
          recordsProcessed: { type: 'number', required: true, description: 'Number of records processed' },
          duration: { type: 'number', description: 'Processing time in milliseconds' },
          status: { type: 'string', required: true, description: 'Processing status (success/partial/failed)' },
        },
      },
      'workflow.executed': {
        name: 'workflow.executed',
        description: 'Fired when a workflow completes execution',
        attributes: {
          workflowId: { type: 'string', required: true, description: 'Workflow identifier' },
          executionId: { type: 'string', required: true, description: 'Execution run identifier' },
          steps: { type: 'array', description: 'List of executed step IDs' },
          result: { type: 'object', description: 'Workflow execution result' },
        },
      },
      'decision.evaluated': {
        name: 'decision.evaluated',
        description: 'Published when a decision point is evaluated in the flow',
        attributes: {
          decisionId: { type: 'string', required: true, description: 'Decision point identifier' },
          condition: { type: 'string', description: 'Evaluated condition expression' },
          result: { type: 'boolean', required: true, description: 'Evaluation result' },
          branchTaken: { type: 'string', required: true, description: 'Branch selected (true/false/error)' },
        },
      },
    };

    return eventRegistry[eventRef];
  };

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
        <strong style={{ color: '#1e40af' }}>Highlighted Node Sync Demo</strong>
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          <p style={{ margin: '4px 0' }}>
            This demonstrates how <code>highlightedNodeId</code> automatically syncs with selection
            and shows the node info panel.
          </p>
          <p style={{ margin: '8px 0 4px 0' }}>
            <strong>Current highlighted node:</strong>{' '}
            {highlightedNodeId ? (
              <span style={{ fontFamily: 'monospace', color: '#3b82f6' }}>{highlightedNodeId}</span>
            ) : (
              <span style={{ color: '#94a3b8' }}>None</span>
            )}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={handleCycleNodes}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              Cycle Nodes ({nodeIds[currentIndex]})
            </button>
            <button
              onClick={handleClearHighlight}
              style={{
                padding: '8px 16px',
                backgroundColor: '#94a3b8',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Clear Highlight
            </button>
          </div>
          <p style={{ margin: '12px 0 4px 0', fontSize: 11, fontStyle: 'italic', color: '#64748b' }}>
            When you cycle nodes, watch how:
          </p>
          <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 11, color: '#64748b' }}>
            <li>The highlighted node gets a <strong>blue glow</strong></li>
            <li>The node is automatically <strong>selected</strong> (selection outline)</li>
            <li>The <strong>info panel shows</strong> at the bottom with node details</li>
          </ul>
        </div>
      </div>
      <GraphRenderer
        canvas={selectionStylingCanvas}
        width={800}
        height={500}
        highlightedNodeId={highlightedNodeId}
        showNodeDetailPanel={true}
        resolveEventRef={resolveEventRef}
      />
    </div>
  );
};

export const HighlightedNodeSync: Story = {
  render: () => <HighlightedNodeSyncTemplate />,
  parameters: {
    docs: {
      description: {
        story: `
**Highlighted Node Sync** - Demonstrates automatic synchronization between \`highlightedNodeId\` and selection state.

This simulates what happens during execution playback in the CanvasDetailPanel:

**How it works:**
1. When \`highlightedNodeId\` prop changes, GraphRenderer automatically:
   - Selects that node (adds it to \`selectedNodeIds\`)
   - Shows the node info panel (\`showNodePanel = true\`)
   - Applies both the highlight glow and selection outline

2. This creates a seamless connection between:
   - Narrative events on the left (which set \`highlightedNodeId\`)
   - Visual feedback on the canvas (glow + outline)
   - Node details panel at the bottom (showing node info)

**Use case:**
In the CanvasDetailPanel, when users:
- Click a scenario template → Nodes involved in that scenario are highlighted
- Click a narrative event → The corresponding node on the canvas is highlighted
- Click a node on the canvas → The corresponding narrative event is highlighted

All of these actions update \`highlightedNodeId\`, which now automatically shows the node info panel!
        `,
      },
    },
  },
};
