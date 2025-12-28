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
