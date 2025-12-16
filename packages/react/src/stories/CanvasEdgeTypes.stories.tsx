import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/principal-view-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';

const meta = {
  title: 'Audit/CanvasEdgeTypes',
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

/**
 * Helper to create a simple node
 */
const createNode = (
  id: string,
  x: number,
  y: number,
  label: string,
  color: 1 | 2 | 3 | 4 | 5 | 6 = 4
) => ({
  id,
  type: 'text' as const,
  x,
  y,
  width: 120,
  height: 60,
  text: label,
  color,
  pv: {
    nodeType: 'example',
    shape: 'rectangle' as const,
  },
});

/**
 * Canvas showing all edge connection sides
 */
const edgeSidesCanvas: ExtendedCanvas = {
  nodes: [
    createNode('center', 300, 200, 'Center', 6),
    createNode('top', 300, 50, 'Top', 4),
    createNode('right', 500, 200, 'Right', 4),
    createNode('bottom', 300, 350, 'Bottom', 4),
    createNode('left', 100, 200, 'Left', 4),
  ],
  edges: [
    {
      id: 'top-edge',
      fromNode: 'top',
      toNode: 'center',
      fromSide: 'bottom',
      toSide: 'top',
      pv: { edgeType: 'connection' },
    },
    {
      id: 'right-edge',
      fromNode: 'center',
      toNode: 'right',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'connection' },
    },
    {
      id: 'bottom-edge',
      fromNode: 'center',
      toNode: 'bottom',
      fromSide: 'bottom',
      toSide: 'top',
      pv: { edgeType: 'connection' },
    },
    {
      id: 'left-edge',
      fromNode: 'left',
      toNode: 'center',
      fromSide: 'right',
      toSide: 'left',
      pv: { edgeType: 'connection' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edge Sides Demo',
    description: 'Demonstrating fromSide and toSide fields',
    edgeTypes: {
      connection: {
        style: 'solid',
        color: '#22c55e',
        directed: true,
      },
    },
  },
};

export const EdgeSides: Story = {
  args: {
    canvas: edgeSidesCanvas,
    width: 700,
    height: 500,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edge Connection Sides**

Edges can connect to any of the 4 sides of a node:

- \`fromSide\` - Which side of the source node the edge starts from
- \`toSide\` - Which side of the target node the edge connects to

Values: \`'top'\` | \`'right'\` | \`'bottom'\` | \`'left'\`

If not specified, the renderer automatically chooses the best sides.
        `,
      },
    },
  },
};

/**
 * Canvas showing endpoint shapes
 */
const edgeEndpointsCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a1', 100, 100, 'Source', 5),
    createNode('b1', 350, 100, 'Target', 5),
    createNode('a2', 100, 200, 'Source', 5),
    createNode('b2', 350, 200, 'Target', 5),
    createNode('a3', 100, 300, 'Source', 5),
    createNode('b3', 350, 300, 'Target', 5),
    createNode('a4', 100, 400, 'Source', 5),
    createNode('b4', 350, 400, 'Target', 5),
  ],
  edges: [
    {
      id: 'default',
      fromNode: 'a1',
      toNode: 'b1',
      fromSide: 'right',
      toSide: 'left',
      label: 'default (none → arrow)',
      pv: { edgeType: 'demo' },
    },
    {
      id: 'arrow-arrow',
      fromNode: 'a2',
      toNode: 'b2',
      fromSide: 'right',
      toSide: 'left',
      fromEnd: 'arrow',
      toEnd: 'arrow',
      label: 'arrow → arrow',
      pv: { edgeType: 'demo' },
    },
    {
      id: 'none-none',
      fromNode: 'a3',
      toNode: 'b3',
      fromSide: 'right',
      toSide: 'left',
      fromEnd: 'none',
      toEnd: 'none',
      label: 'none → none',
      pv: { edgeType: 'demo' },
    },
    {
      id: 'arrow-none',
      fromNode: 'a4',
      toNode: 'b4',
      fromSide: 'right',
      toSide: 'left',
      fromEnd: 'arrow',
      toEnd: 'none',
      label: 'arrow → none',
      pv: { edgeType: 'demo' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edge Endpoints Demo',
    description: 'Demonstrating fromEnd and toEnd fields',
    edgeTypes: {
      demo: {
        style: 'solid',
        color: '#06b6d4',
        directed: true,
      },
    },
  },
};

export const EdgeEndpoints: Story = {
  args: {
    canvas: edgeEndpointsCanvas,
    width: 600,
    height: 550,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edge Endpoint Shapes**

Control the arrow markers at each end of an edge:

- \`fromEnd\` - Shape at the source end (default: \`'none'\`)
- \`toEnd\` - Shape at the target end (default: \`'arrow'\`)

Values: \`'none'\` | \`'arrow'\`

This allows creating undirected edges, bidirectional arrows, or reversed arrows.
        `,
      },
    },
  },
};

/**
 * Canvas showing edge colors
 */
const edgeColorsCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a1', 100, 80, 'Node', 1),
    createNode('b1', 320, 80, 'Node', 1),
    createNode('a2', 100, 160, 'Node', 2),
    createNode('b2', 320, 160, 'Node', 2),
    createNode('a3', 100, 240, 'Node', 3),
    createNode('b3', 320, 240, 'Node', 3),
    createNode('a4', 100, 320, 'Node', 4),
    createNode('b4', 320, 320, 'Node', 4),
    createNode('a5', 100, 400, 'Node', 5),
    createNode('b5', 320, 400, 'Node', 5),
    createNode('a6', 100, 480, 'Node', 6),
    createNode('b6', 320, 480, 'Node', 6),
  ],
  edges: [
    {
      id: 'red',
      fromNode: 'a1',
      toNode: 'b1',
      fromSide: 'right',
      toSide: 'left',
      color: 1,
      label: 'color: 1 (red)',
      pv: { edgeType: 'colored' },
    },
    {
      id: 'orange',
      fromNode: 'a2',
      toNode: 'b2',
      fromSide: 'right',
      toSide: 'left',
      color: 2,
      label: 'color: 2 (orange)',
      pv: { edgeType: 'colored' },
    },
    {
      id: 'yellow',
      fromNode: 'a3',
      toNode: 'b3',
      fromSide: 'right',
      toSide: 'left',
      color: 3,
      label: 'color: 3 (yellow)',
      pv: { edgeType: 'colored' },
    },
    {
      id: 'green',
      fromNode: 'a4',
      toNode: 'b4',
      fromSide: 'right',
      toSide: 'left',
      color: 4,
      label: 'color: 4 (green)',
      pv: { edgeType: 'colored' },
    },
    {
      id: 'cyan',
      fromNode: 'a5',
      toNode: 'b5',
      fromSide: 'right',
      toSide: 'left',
      color: 5,
      label: 'color: 5 (cyan)',
      pv: { edgeType: 'colored' },
    },
    {
      id: 'purple',
      fromNode: 'a6',
      toNode: 'b6',
      fromSide: 'right',
      toSide: 'left',
      color: 6,
      label: 'color: 6 (purple)',
      pv: { edgeType: 'colored' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edge Colors Demo',
    description: 'Demonstrating edge color presets',
    edgeTypes: {
      colored: {
        style: 'solid',
        directed: true,
      },
    },
  },
};

export const EdgeColors: Story = {
  args: {
    canvas: edgeColorsCanvas,
    width: 550,
    height: 620,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edge Colors**

Edges support the same color system as nodes:

| Preset | Color   |
|--------|---------|
| 1      | Red     |
| 2      | Orange  |
| 3      | Yellow  |
| 4      | Green   |
| 5      | Cyan    |
| 6      | Purple  |

You can also use hex strings: \`color: '#3b82f6'\`
        `,
      },
    },
  },
};

/**
 * Canvas showing edge line styles (PV extension)
 */
const edgeStylesCanvas: ExtendedCanvas = {
  nodes: [
    createNode('a1', 100, 100, 'Source', 6),
    createNode('b1', 380, 100, 'Target', 6),
    createNode('a2', 100, 200, 'Source', 6),
    createNode('b2', 380, 200, 'Target', 6),
    createNode('a3', 100, 300, 'Source', 6),
    createNode('b3', 380, 300, 'Target', 6),
    createNode('a4', 100, 400, 'Source', 6),
    createNode('b4', 380, 400, 'Target', 6),
  ],
  edges: [
    {
      id: 'solid',
      fromNode: 'a1',
      toNode: 'b1',
      fromSide: 'right',
      toSide: 'left',
      label: 'solid',
      pv: { edgeType: 'solid' },
    },
    {
      id: 'dashed',
      fromNode: 'a2',
      toNode: 'b2',
      fromSide: 'right',
      toSide: 'left',
      label: 'dashed',
      pv: { edgeType: 'dashed' },
    },
    {
      id: 'dotted',
      fromNode: 'a3',
      toNode: 'b3',
      fromSide: 'right',
      toSide: 'left',
      label: 'dotted',
      pv: { edgeType: 'dotted' },
    },
    {
      id: 'animated',
      fromNode: 'a4',
      toNode: 'b4',
      fromSide: 'right',
      toSide: 'left',
      label: 'animated',
      pv: { edgeType: 'animated' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edge Styles Demo',
    description: 'Demonstrating PV edge style extension',
    edgeTypes: {
      solid: {
        style: 'solid',
        color: '#8b5cf6',
        directed: true,
      },
      dashed: {
        style: 'dashed',
        color: '#8b5cf6',
        directed: true,
      },
      dotted: {
        style: 'dotted',
        color: '#8b5cf6',
        directed: true,
      },
      animated: {
        style: 'animated',
        color: '#8b5cf6',
        directed: true,
        animation: {
          type: 'flow',
          duration: 1000,
        },
      },
    },
  },
};

export const EdgeStyles: Story = {
  args: {
    canvas: edgeStylesCanvas,
    width: 600,
    height: 550,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edge Line Styles (PV Extension)**

The \`pv.style\` field controls line rendering:

- \`'solid'\` - Continuous line
- \`'dashed'\` - Dashed line (- - -)
- \`'dotted'\` - Dotted line (...)
- \`'animated'\` - Animated flow effect

These styles are defined in \`pv.edgeTypes\` at the canvas level.
        `,
      },
    },
  },
};

/**
 * Canvas showing labeled edges
 */
const edgeLabelsCanvas: ExtendedCanvas = {
  nodes: [
    createNode('user', 100, 150, 'User', 5),
    createNode('api', 320, 80, 'API', 4),
    createNode('db', 320, 220, 'Database', 4),
    createNode('cache', 540, 150, 'Cache', 3),
  ],
  edges: [
    {
      id: 'user-api',
      fromNode: 'user',
      toNode: 'api',
      fromSide: 'right',
      toSide: 'left',
      label: 'HTTP Request',
      pv: { edgeType: 'request' },
    },
    {
      id: 'api-db',
      fromNode: 'api',
      toNode: 'db',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'Query',
      pv: { edgeType: 'data' },
    },
    {
      id: 'api-cache',
      fromNode: 'api',
      toNode: 'cache',
      fromSide: 'right',
      toSide: 'left',
      label: 'Read/Write',
      pv: { edgeType: 'cache' },
    },
    {
      id: 'cache-db',
      fromNode: 'cache',
      toNode: 'db',
      fromSide: 'bottom',
      toSide: 'right',
      label: 'Sync',
      pv: { edgeType: 'sync' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edge Labels Demo',
    description: 'Demonstrating edge label field',
    edgeTypes: {
      request: {
        style: 'solid',
        color: '#3b82f6',
        directed: true,
      },
      data: {
        style: 'solid',
        color: '#22c55e',
        directed: true,
      },
      cache: {
        style: 'dashed',
        color: '#eab308',
        directed: true,
      },
      sync: {
        style: 'dotted',
        color: '#f97316',
        directed: true,
      },
    },
  },
};

export const EdgeLabels: Story = {
  args: {
    canvas: edgeLabelsCanvas,
    width: 750,
    height: 400,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edge Labels**

The \`label\` field adds text to an edge:

\`\`\`json
{
  "id": "user-api",
  "fromNode": "user",
  "toNode": "api",
  "label": "HTTP Request"
}
\`\`\`

Labels are positioned at the center of the edge and help describe the relationship.
        `,
      },
    },
  },
};

/**
 * Canvas showing edge type definitions
 */
const edgeTypeDefinitionsCanvas: ExtendedCanvas = {
  nodes: [
    createNode('service-a', 100, 100, 'Service A', 5),
    createNode('service-b', 350, 100, 'Service B', 5),
    createNode('service-c', 100, 250, 'Service C', 5),
    createNode('service-d', 350, 250, 'Service D', 5),
    createNode('service-e', 225, 400, 'Service E', 5),
  ],
  edges: [
    {
      id: 'a-b',
      fromNode: 'service-a',
      toNode: 'service-b',
      fromSide: 'right',
      toSide: 'left',
      label: 'depends-on',
      pv: { edgeType: 'depends-on' },
    },
    {
      id: 'c-d',
      fromNode: 'service-c',
      toNode: 'service-d',
      fromSide: 'right',
      toSide: 'left',
      label: 'publishes-to',
      pv: { edgeType: 'publishes-to' },
    },
    {
      id: 'a-c',
      fromNode: 'service-a',
      toNode: 'service-c',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'calls',
      pv: { edgeType: 'calls' },
    },
    {
      id: 'b-d',
      fromNode: 'service-b',
      toNode: 'service-d',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'inherits',
      pv: { edgeType: 'inherits' },
    },
    {
      id: 'd-e',
      fromNode: 'service-d',
      toNode: 'service-e',
      fromSide: 'bottom',
      toSide: 'right',
      label: 'aggregates',
      pv: { edgeType: 'aggregates' },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Edge Type Definitions',
    description: 'Showing canvas-level edgeTypes configuration',
    edgeTypes: {
      'depends-on': {
        label: 'Dependency',
        style: 'solid',
        color: '#ef4444',
        width: 2,
        directed: true,
      },
      'publishes-to': {
        label: 'Event Publishing',
        style: 'dashed',
        color: '#22c55e',
        width: 2,
        directed: true,
      },
      calls: {
        label: 'RPC Call',
        style: 'solid',
        color: '#3b82f6',
        width: 1,
        directed: true,
      },
      inherits: {
        label: 'Inheritance',
        style: 'dotted',
        color: '#8b5cf6',
        width: 2,
        directed: true,
      },
      aggregates: {
        label: 'Aggregation',
        style: 'solid',
        color: '#f97316',
        width: 3,
        directed: false,
      },
    },
  },
};

export const EdgeTypeDefinitions: Story = {
  args: {
    canvas: edgeTypeDefinitionsCanvas,
    width: 600,
    height: 550,
  },
  parameters: {
    docs: {
      description: {
        story: `
**Edge Type Definitions (PV Extension)**

Define reusable edge types at the canvas level in \`pv.edgeTypes\`:

\`\`\`json
{
  "pv": {
    "edgeTypes": {
      "depends-on": {
        "label": "Dependency",
        "style": "solid",
        "color": "#ef4444",
        "width": 2,
        "directed": true
      }
    }
  }
}
\`\`\`

**Edge Type Definition Fields:**
- \`label\` - Display name for the edge type
- \`style\` - Line style: \`solid\`, \`dashed\`, \`dotted\`, \`animated\`
- \`color\` - Hex color string
- \`width\` - Line width in pixels
- \`directed\` - Whether to show arrow (true/false)
- \`animation\` - Animation configuration
- \`labelConfig\` - Label positioning options
        `,
      },
    },
  },
};

/**
 * Interactive comparison template
 */
const EdgeFieldsComparisonTemplate = () => {
  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h2 style={{ marginBottom: 20 }}>JSON Canvas Edge Fields Reference</h2>

      <h3 style={{ marginTop: 24, marginBottom: 12 }}>Standard JSON Canvas Fields</h3>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          marginBottom: 24,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6' }}>
            <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e5e7eb' }}>Field</th>
            <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e5e7eb' }}>Type</th>
            <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e5e7eb' }}>Required</th>
            <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e5e7eb' }}>
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>id</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>string</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Yes</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Unique identifier</td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>fromNode</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>string</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Yes</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Source node ID</td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>toNode</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>string</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Yes</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Target node ID</td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>fromSide</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              'top' | 'right' | 'bottom' | 'left'
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>No</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              Side of source node to connect from
            </td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>toSide</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              'top' | 'right' | 'bottom' | 'left'
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>No</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              Side of target node to connect to
            </td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>fromEnd</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>'none' | 'arrow'</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>No</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              Endpoint shape at source (default: 'none')
            </td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>toEnd</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>'none' | 'arrow'</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>No</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              Endpoint shape at target (default: 'arrow')
            </td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>color</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>string | 1-6</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>No</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              Hex color or preset (1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple)
            </td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>label</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>string</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>No</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Text label displayed on edge</td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 24, marginBottom: 12 }}>Principal View Extension Fields (pv)</h3>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13,
          marginBottom: 24,
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#ede9fe' }}>
            <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e5e7eb' }}>Field</th>
            <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e5e7eb' }}>Type</th>
            <th style={{ padding: 10, textAlign: 'left', border: '1px solid #e5e7eb' }}>
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>pv.edgeType</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>string</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              References an edge type defined in canvas pv.edgeTypes
            </td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>pv.style</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              'solid' | 'dashed' | 'dotted' | 'animated'
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Line style override</td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>pv.width</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>number</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>Line width in pixels</td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>pv.animation</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>object</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              Animation config: {'{'}type, duration, color{'}'}
            </td>
          </tr>
          <tr>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              <code>pv.activatedBy</code>
            </td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>array</td>
            <td style={{ padding: 10, border: '1px solid #e5e7eb' }}>
              Event triggers for edge activation
            </td>
          </tr>
        </tbody>
      </table>

      <h3 style={{ marginTop: 24, marginBottom: 12 }}>Canvas-Level Edge Type Definition</h3>
      <div
        style={{
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          padding: 16,
          borderRadius: 8,
          fontSize: 12,
          fontFamily: 'monospace',
          overflow: 'auto',
        }}
      >
        <pre style={{ margin: 0 }}>
          {`{
  "pv": {
    "edgeTypes": {
      "depends-on": {
        "label": "Dependency",      // Display name
        "style": "solid",           // solid | dashed | dotted | animated
        "color": "#ef4444",         // Hex color
        "width": 2,                 // Line width in pixels
        "directed": true,           // Show arrow head
        "animation": {              // Optional animation
          "type": "flow",           // flow | pulse | particle | glow
          "duration": 1000,         // Duration in ms
          "color": "#ff0000"        // Animation color
        },
        "labelConfig": {            // Label positioning
          "field": "weight",        // Data field to display
          "position": "middle"      // start | middle | end
        }
      }
    }
  }
}`}
        </pre>
      </div>

      <h3 style={{ marginTop: 32, marginBottom: 16 }}>Live Example</h3>
      <GraphRenderer canvas={edgeLabelsCanvas} width={750} height={350} />

      <div
        style={{
          marginTop: 24,
          padding: 16,
          backgroundColor: '#f5f5f5',
          borderRadius: 8,
        }}
      >
        <h4 style={{ margin: '0 0 12px 0' }}>JSON Canvas Spec</h4>
        <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          Standard edge fields follow the{' '}
          <a
            href="https://jsoncanvas.org/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3b82f6' }}
          >
            JSON Canvas specification
          </a>
          . Principal View extensions are stored in the <code>pv</code> field and provide enhanced
          rendering capabilities while maintaining compatibility with standard canvas tools.
        </p>
      </div>
    </div>
  );
};

export const EdgeFieldsReference: Story = {
  render: () => <EdgeFieldsComparisonTemplate />,
  parameters: {
    docs: {
      description: {
        story:
          'Complete reference for all JSON Canvas edge fields and Principal View extensions.',
      },
    },
  },
};
