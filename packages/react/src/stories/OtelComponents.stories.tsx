import type { Meta, StoryObj } from '@storybook/react';
import React, { useState } from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import { GraphRenderer } from '../components/GraphRenderer';
import { NodeInfoPanel } from '../components/NodeInfoPanel';
import { NodeTooltip } from '../components/NodeTooltip';
import type { NodeState, NodeTypeDefinition } from '@principal-ai/principal-view-core/browser';

// OTEL Log Association canvas data
const otelCanvas = {
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
      id: 'orphaned-log',
      type: 'text',
      text: 'OrphanedLog',
      x: 150,
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
      id: 'match-operator',
      type: 'text',
      text: 'MatchOperator',
      x: -80,
      y: 300,
      width: 120,
      height: 117,
      pv: {
        nodeType: 'service',
        name: 'MatchOperator',
        description: 'Matching operators: exact, glob, regex, exists, oneOf',
        shape: 'diamond',
        icon: 'Code',
        fill: '#F5A623',
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
    },
    {
      id: 'router-to-orphan',
      fromNode: 'log-router',
      toNode: 'orphaned-log',
      fromSide: 'right',
      toSide: 'left',
      label: 'unmatched',
    },
    {
      id: 'router-to-operator',
      fromNode: 'log-router',
      toNode: 'match-operator',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'uses',
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'OTEL Components Demo',
    description: 'Demonstrates OTEL badges, tooltips, and info panel',
    nodeTypes: {
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
      service: {
        label: 'Component',
        description: 'System component',
        shape: 'hexagon',
      },
    },
  },
};

const meta: Meta = {
  title: 'OTEL/Components',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

/**
 * Shows nodes with OTEL badges (T/S/I circles) and hover tooltips.
 * Hover over any node to see the tooltip with OTEL kind, category, and description.
 */
export const OtelBadgesAndTooltips: StoryObj = {
  render: () => (
    <ThemeProvider theme="technology">
      <div style={{ width: '100%', height: '600px' }}>
        <GraphRenderer canvas={otelCanvas} initialViewport={{ x: 200, y: 50, zoom: 1 }} />
      </div>
    </ThemeProvider>
  ),
};

/**
 * Standalone NodeTooltip component demo showing all OTEL kinds.
 */
export const TooltipVariants: StoryObj = {
  render: () => (
    <ThemeProvider theme="technology">
      <div style={{ padding: '40px', display: 'flex', gap: '80px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: '200px', height: '150px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #4A90E2',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Type Node (hover below)
          </div>
          <NodeTooltip
            description="OpenTelemetry log record with timestamp, severity, body"
            otel={{ kind: 'type', category: 'log', isNew: true }}
            visible={true}
          />
        </div>

        <div style={{ position: 'relative', width: '200px', height: '150px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #7ED321',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Service Node (hover below)
          </div>
          <NodeTooltip
            description="Routes logs to canvas nodes based on resourceMatch"
            otel={{ kind: 'service', category: 'router' }}
            visible={true}
          />
        </div>

        <div style={{ position: 'relative', width: '200px', height: '150px' }}>
          <div
            style={{
              padding: '20px',
              border: '2px solid #9B59B6',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            Instance Node (hover below)
          </div>
          <NodeTooltip
            description="A specific running instance of a service"
            otel={{ kind: 'instance', category: 'runtime' }}
            visible={true}
          />
        </div>
      </div>
    </ThemeProvider>
  ),
};

/**
 * NodeInfoPanel with OTEL information section.
 */
export const InfoPanelWithOtel: StoryObj = {
  render: () => {
    const [selectedNode] = useState<NodeState>({
      id: 'log-router',
      type: 'otel-service',
      name: 'LogRouter',
      data: {
        description:
          'Routes incoming OTEL logs to canvas nodes based on scope and resourceMatch criteria',
        otel: {
          kind: 'service',
          category: 'router',
          isNew: true,
        },
        icon: 'GitBranch',
        color: '#7ED321',
        sources: ['src/services/LogRouter.ts'],
      },
      position: { x: 0, y: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const typeDefinition: NodeTypeDefinition = {
      shape: 'hexagon',
      color: '#7ED321',
      icon: 'GitBranch',
    };

    return (
      <ThemeProvider theme="technology">
        <div style={{ padding: '20px', position: 'relative', minHeight: '400px' }}>
          <h3 style={{ marginBottom: '20px' }}>NodeInfoPanel with OTEL Section</h3>
          <p style={{ marginBottom: '20px', color: '#666' }}>
            The panel shows the OpenTelemetry section with kind badge, category, and NEW indicator.
          </p>
          <NodeInfoPanel node={selectedNode} typeDefinition={typeDefinition} onClose={() => {}} />
        </div>
      </ThemeProvider>
    );
  },
};
