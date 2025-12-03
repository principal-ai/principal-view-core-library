import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/visual-validation-core';

const meta = {
  title: 'Audit/NodeShapes',
  component: GraphRenderer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Canvas showing all available node shapes for visual auditing
 */
const allShapesCanvas: ExtendedCanvas = {
  nodes: [
    // Row 1: Basic shapes
    {
      id: 'rectangle',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 80,
      text: '# Rectangle\nDefault shape',
      color: 6, // purple
      vv: {
        nodeType: 'rectangle-demo',
        shape: 'rectangle',
        icon: 'square',
      },
    },
    {
      id: 'circle',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: '# Circle',
      color: 5, // cyan
      vv: {
        nodeType: 'circle-demo',
        shape: 'circle',
        icon: 'circle',
      },
    },
    {
      id: 'hexagon',
      type: 'text',
      x: 480,
      y: 100,
      width: 120,
      height: 120,
      text: '# Hexagon',
      color: 4, // green
      vv: {
        nodeType: 'hexagon-demo',
        shape: 'hexagon',
        icon: 'hexagon',
        size: { width: 120, height: 120 },
      },
    },
    {
      id: 'diamond',
      type: 'text',
      x: 680,
      y: 100,
      width: 70,
      height: 70,
      text: 'Diamond',
      color: 2, // orange
      vv: {
        nodeType: 'diamond-demo',
        shape: 'diamond',
        icon: 'diamond',
        size: { width: 70, height: 70 },
      },
    },
    {
      id: 'custom',
      type: 'text',
      x: 860,
      y: 100,
      width: 140,
      height: 80,
      text: '# Custom\n(Falls back to rect)',
      color: 1, // red
      vv: {
        nodeType: 'custom-demo',
        shape: 'custom',
        icon: 'settings',
      },
    },
  ],
  edges: [],
  vv: {
    version: '1.0.0',
    name: 'Node Shapes Audit',
    description: 'All available node shapes for visual inspection',
    edgeTypes: {},
  },
};

export const AllShapes: Story = {
  args: {
    canvas: allShapesCanvas,
    width: 1100,
    height: 350,
  } as any,
  parameters: {
    docs: {
      description: {
        story: `
**All Node Shapes**

This story displays all 5 available node shapes:
- **Rectangle** - Default shape with rounded corners (borderRadius: 8px)
- **Circle** - Circular nodes (borderRadius: 50%)
- **Hexagon** - Flat-top style with points on left/right sides
- **Diamond** - Rotated 45° square with counter-rotated content
- **Custom** - Placeholder that falls back to rectangle styling
        `,
      },
    },
  },
};

/**
 * Canvas showing shapes with different sizes
 */
const shapeSizesCanvas: ExtendedCanvas = {
  nodes: [
    // Small shapes
    {
      id: 'rect-small',
      type: 'text',
      x: 100,
      y: 80,
      width: 80,
      height: 50,
      text: 'Small',
      color: 6,
      vv: {
        nodeType: 'rect-small',
        shape: 'rectangle',
        size: { width: 80, height: 50 },
      },
    },
    {
      id: 'circle-small',
      type: 'text',
      x: 250,
      y: 80,
      width: 60,
      height: 60,
      text: 'S',
      color: 5,
      vv: {
        nodeType: 'circle-small',
        shape: 'circle',
        size: { width: 60, height: 60 },
      },
    },
    {
      id: 'hex-small',
      type: 'text',
      x: 380,
      y: 80,
      width: 80,
      height: 60,
      text: 'Small',
      color: 4,
      vv: {
        nodeType: 'hex-small',
        shape: 'hexagon',
        size: { width: 80, height: 60 },
      },
    },
    {
      id: 'diamond-small',
      type: 'text',
      x: 520,
      y: 80,
      width: 60,
      height: 60,
      text: 'S',
      color: 2,
      vv: {
        nodeType: 'diamond-small',
        shape: 'diamond',
        size: { width: 60, height: 60 },
      },
    },

    // Medium shapes (default)
    {
      id: 'rect-medium',
      type: 'text',
      x: 100,
      y: 200,
      width: 120,
      height: 70,
      text: 'Medium',
      color: 6,
      vv: {
        nodeType: 'rect-medium',
        shape: 'rectangle',
      },
    },
    {
      id: 'circle-medium',
      type: 'text',
      x: 250,
      y: 200,
      width: 80,
      height: 80,
      text: 'M',
      color: 5,
      vv: {
        nodeType: 'circle-medium',
        shape: 'circle',
      },
    },
    {
      id: 'hex-medium',
      type: 'text',
      x: 380,
      y: 200,
      width: 100,
      height: 80,
      text: 'Medium',
      color: 4,
      vv: {
        nodeType: 'hex-medium',
        shape: 'hexagon',
      },
    },
    {
      id: 'diamond-medium',
      type: 'text',
      x: 520,
      y: 200,
      width: 80,
      height: 80,
      text: 'M',
      color: 2,
      vv: {
        nodeType: 'diamond-medium',
        shape: 'diamond',
      },
    },

    // Large shapes
    {
      id: 'rect-large',
      type: 'text',
      x: 100,
      y: 340,
      width: 180,
      height: 100,
      text: '# Large\nWith content',
      color: 6,
      vv: {
        nodeType: 'rect-large',
        shape: 'rectangle',
        size: { width: 180, height: 100 },
      },
    },
    {
      id: 'circle-large',
      type: 'text',
      x: 250,
      y: 340,
      width: 120,
      height: 120,
      text: 'Large',
      color: 5,
      vv: {
        nodeType: 'circle-large',
        shape: 'circle',
        size: { width: 120, height: 120 },
      },
    },
    {
      id: 'hex-large',
      type: 'text',
      x: 380,
      y: 340,
      width: 140,
      height: 110,
      text: 'Large',
      color: 4,
      vv: {
        nodeType: 'hex-large',
        shape: 'hexagon',
        size: { width: 140, height: 110 },
      },
    },
    {
      id: 'diamond-large',
      type: 'text',
      x: 520,
      y: 340,
      width: 110,
      height: 110,
      text: 'Large',
      color: 2,
      vv: {
        nodeType: 'diamond-large',
        shape: 'diamond',
        size: { width: 110, height: 110 },
      },
    },
  ],
  edges: [],
  vv: {
    version: '1.0.0',
    name: 'Node Sizes Audit',
    description: 'Node shapes at different sizes',
    edgeTypes: {},
  },
};

export const ShapeSizes: Story = {
  args: {
    canvas: shapeSizesCanvas,
    width: 700,
    height: 550,
  } as any,
  parameters: {
    docs: {
      description: {
        story: `
**Shape Sizes**

Shows each shape at small, medium, and large sizes to verify scaling behavior.
        `,
      },
    },
  },
};

/**
 * Canvas showing shapes with icons
 */
const shapesWithIconsCanvas: ExtendedCanvas = {
  nodes: [
    {
      id: 'rect-icon',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 80,
      text: 'Server',
      color: 6,
      vv: {
        nodeType: 'server',
        shape: 'rectangle',
        icon: 'server',
      },
    },
    {
      id: 'circle-icon',
      type: 'text',
      x: 300,
      y: 100,
      width: 100,
      height: 100,
      text: 'User',
      color: 5,
      vv: {
        nodeType: 'user',
        shape: 'circle',
        icon: 'user',
      },
    },
    {
      id: 'hex-icon',
      type: 'text',
      x: 480,
      y: 100,
      width: 140,
      height: 100,
      text: 'Database',
      color: 4,
      vv: {
        nodeType: 'database',
        shape: 'hexagon',
        icon: 'database',
      },
    },
    {
      id: 'diamond-icon',
      type: 'text',
      x: 680,
      y: 100,
      width: 100,
      height: 100,
      text: 'Cache',
      color: 2,
      vv: {
        nodeType: 'cache',
        shape: 'diamond',
        icon: 'zap',
      },
    },
  ],
  edges: [],
  vv: {
    version: '1.0.0',
    name: 'Shapes with Icons',
    description: 'Node shapes with Lucide icons',
    edgeTypes: {},
  },
};

export const ShapesWithIcons: Story = {
  args: {
    canvas: shapesWithIconsCanvas,
    width: 900,
    height: 300,
  } as any,
  parameters: {
    docs: {
      description: {
        story: `
**Shapes with Icons**

Shows each shape with a Lucide icon to verify icon placement and sizing within different shapes.
        `,
      },
    },
  },
};

/**
 * Canvas showing shapes with states
 */
const shapesWithStatesCanvas: ExtendedCanvas = {
  nodes: [
    // Idle state
    {
      id: 'rect-idle',
      type: 'text',
      x: 100,
      y: 80,
      width: 120,
      height: 70,
      text: 'Idle',
      color: 6,
      vv: {
        nodeType: 'process',
        shape: 'rectangle',
        icon: 'box',
        states: {
          idle: { color: '#94a3b8', icon: 'box' },
          active: { color: '#3b82f6', icon: 'play' },
          error: { color: '#ef4444', icon: 'alert-circle' },
        },
      },
    },
    {
      id: 'circle-idle',
      type: 'text',
      x: 280,
      y: 80,
      width: 90,
      height: 90,
      text: 'Idle',
      color: 5,
      vv: {
        nodeType: 'agent',
        shape: 'circle',
        icon: 'user',
        states: {
          idle: { color: '#94a3b8', icon: 'user' },
          active: { color: '#22c55e', icon: 'user-check' },
          error: { color: '#ef4444', icon: 'user-x' },
        },
      },
    },
    {
      id: 'hex-idle',
      type: 'text',
      x: 430,
      y: 80,
      width: 120,
      height: 90,
      text: 'Idle',
      color: 4,
      vv: {
        nodeType: 'storage',
        shape: 'hexagon',
        icon: 'database',
        states: {
          idle: { color: '#94a3b8', icon: 'database' },
          active: { color: '#22c55e', icon: 'hard-drive' },
          error: { color: '#ef4444', icon: 'database' },
        },
      },
    },
    {
      id: 'diamond-idle',
      type: 'text',
      x: 600,
      y: 80,
      width: 90,
      height: 90,
      text: 'Idle',
      color: 2,
      vv: {
        nodeType: 'decision',
        shape: 'diamond',
        icon: 'git-branch',
        states: {
          idle: { color: '#94a3b8', icon: 'git-branch' },
          active: { color: '#f97316', icon: 'git-commit' },
          error: { color: '#ef4444', icon: 'git-branch' },
        },
      },
    },

    // Active state
    {
      id: 'rect-active',
      type: 'text',
      x: 100,
      y: 220,
      width: 120,
      height: 70,
      text: 'Active',
      color: 6,
      vv: {
        nodeType: 'process-active',
        shape: 'rectangle',
        icon: 'play',
        color: '#3b82f6',
      },
    },
    {
      id: 'circle-active',
      type: 'text',
      x: 280,
      y: 220,
      width: 90,
      height: 90,
      text: 'Active',
      color: 5,
      vv: {
        nodeType: 'agent-active',
        shape: 'circle',
        icon: 'user-check',
        color: '#22c55e',
      },
    },
    {
      id: 'hex-active',
      type: 'text',
      x: 430,
      y: 220,
      width: 120,
      height: 90,
      text: 'Active',
      color: 4,
      vv: {
        nodeType: 'storage-active',
        shape: 'hexagon',
        icon: 'hard-drive',
        color: '#22c55e',
      },
    },
    {
      id: 'diamond-active',
      type: 'text',
      x: 600,
      y: 220,
      width: 90,
      height: 90,
      text: 'Active',
      color: 2,
      vv: {
        nodeType: 'decision-active',
        shape: 'diamond',
        icon: 'git-commit',
        color: '#f97316',
      },
    },

    // Error state
    {
      id: 'rect-error',
      type: 'text',
      x: 100,
      y: 360,
      width: 120,
      height: 70,
      text: 'Error',
      color: 1,
      vv: {
        nodeType: 'process-error',
        shape: 'rectangle',
        icon: 'alert-circle',
        color: '#ef4444',
      },
    },
    {
      id: 'circle-error',
      type: 'text',
      x: 280,
      y: 360,
      width: 90,
      height: 90,
      text: 'Error',
      color: 1,
      vv: {
        nodeType: 'agent-error',
        shape: 'circle',
        icon: 'user-x',
        color: '#ef4444',
      },
    },
    {
      id: 'hex-error',
      type: 'text',
      x: 430,
      y: 360,
      width: 120,
      height: 90,
      text: 'Error',
      color: 1,
      vv: {
        nodeType: 'storage-error',
        shape: 'hexagon',
        icon: 'database',
        color: '#ef4444',
      },
    },
    {
      id: 'diamond-error',
      type: 'text',
      x: 600,
      y: 360,
      width: 90,
      height: 90,
      text: 'Error',
      color: 1,
      vv: {
        nodeType: 'decision-error',
        shape: 'diamond',
        icon: 'git-branch',
        color: '#ef4444',
      },
    },
  ],
  edges: [],
  vv: {
    version: '1.0.0',
    name: 'Shapes with States',
    description: 'Node shapes in different states (idle, active, error)',
    edgeTypes: {},
  },
};

export const ShapesWithStates: Story = {
  args: {
    canvas: shapesWithStatesCanvas,
    width: 800,
    height: 550,
  } as any,
  parameters: {
    docs: {
      description: {
        story: `
**Shapes with States**

Shows each shape in different visual states:
- **Row 1**: Idle state (gray)
- **Row 2**: Active state (blue/green/orange)
- **Row 3**: Error state (red)
        `,
      },
    },
  },
};

/**
 * Interactive comparison of all shapes side by side
 */
const ShapeComparisonTemplate = () => {
  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 20, fontFamily: 'system-ui' }}>Node Shape Comparison</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20, marginBottom: 30 }}>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Rectangle</h4>
          <code style={{ fontSize: 11 }}>shape: 'rectangle'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
            borderRadius: 8px
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Circle</h4>
          <code style={{ fontSize: 11 }}>shape: 'circle'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
            borderRadius: 50%
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Hexagon</h4>
          <code style={{ fontSize: 11 }}>shape: 'hexagon'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
            CSS clip-path polygon
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Diamond</h4>
          <code style={{ fontSize: 11 }}>shape: 'diamond'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
            rotate(45deg)
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Custom</h4>
          <code style={{ fontSize: 11 }}>shape: 'custom'</code>
          <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
            Falls back to rectangle
          </div>
        </div>
      </div>

      <GraphRenderer
        canvas={allShapesCanvas}
        width={1100}
        height={280}
      />

      <div style={{ marginTop: 30, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
        <h4 style={{ marginBottom: 10, fontFamily: 'system-ui' }}>Implementation Notes</h4>
        <ul style={{ fontSize: 13, lineHeight: 1.8, margin: 0, paddingLeft: 20 }}>
          <li><strong>Rectangle</strong>: Standard box with 8px border radius</li>
          <li><strong>Circle</strong>: Forces equal width/height, 50% border radius</li>
          <li><strong>Hexagon</strong>: Flat-top style using <code>clipPath: polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)</code></li>
          <li><strong>Diamond</strong>: Fixed square rotated 45°, inner content rotated -45° to keep text upright</li>
          <li><strong>Custom</strong>: Currently renders as rectangle (placeholder for future custom shapes)</li>
        </ul>
      </div>
    </div>
  );
};

export const ShapeComparison: Story = {
  render: () => <ShapeComparisonTemplate />,
  parameters: {
    docs: {
      description: {
        story: 'Interactive comparison view with implementation details for each shape.',
      },
    },
  },
};
