/**
 * Tests for validate command
 */
import { describe, test, expect } from 'bun:test';
import type { ExtendedCanvas } from '@principal-ai/principal-view-core';

// Import validateCanvas function (we'll need to export it from validate.ts)
// For now, we'll inline the validation logic for testing

/**
 * Test helper to validate a canvas and return issues
 */
function validateCanvasColor(canvas: ExtendedCanvas, library: { nodeComponents: Record<string, { color?: string }> } | null = null): Array<{ type: 'error' | 'warning'; message: string }> {
  const issues: Array<{ type: 'error' | 'warning'; message: string }> = [];

  if (!canvas || typeof canvas !== 'object') {
    return issues;
  }

  const c = canvas as Record<string, unknown>;

  if (!Array.isArray(c.nodes)) {
    return issues;
  }

  c.nodes.forEach((node: unknown, index: number) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    const n = node as Record<string, unknown>;
    const nodeLabel = n.id || index;

    // Validate color - all nodes must have a color either directly or via nodeType
    const hasDirectColor = typeof n.color === 'string' && n.color;
    let hasNodeTypeColor = false;

    if (!hasDirectColor && n.pv && typeof n.pv === 'object') {
      const nodePv = n.pv as Record<string, unknown>;
      const nodeTypeName = nodePv.nodeType as string;

      if (typeof nodeTypeName === 'string' && nodeTypeName) {
        // Check if nodeType has a color defined in canvas pv.nodeTypes
        if (c.pv && typeof c.pv === 'object') {
          const canvasPv = c.pv as Record<string, unknown>;
          if (canvasPv.nodeTypes && typeof canvasPv.nodeTypes === 'object') {
            const nodeTypes = canvasPv.nodeTypes as Record<string, unknown>;
            const nodeTypeDef = nodeTypes[nodeTypeName];
            if (nodeTypeDef && typeof nodeTypeDef === 'object') {
              const typeDef = nodeTypeDef as Record<string, unknown>;
              if (typeof typeDef.color === 'string' && typeDef.color) {
                hasNodeTypeColor = true;
              }
            }
          }
        }

        // Check if nodeType has a color defined in library.nodeComponents
        if (!hasNodeTypeColor && library) {
          const nodeComponent = library.nodeComponents[nodeTypeName];
          if (nodeComponent && typeof nodeComponent === 'object') {
            const component = nodeComponent as Record<string, unknown>;
            if (typeof component.color === 'string' && component.color) {
              hasNodeTypeColor = true;
            }
          }
        }
      }
    }

    if (!hasDirectColor && !hasNodeTypeColor) {
      issues.push({
        type: 'error',
        message: `Node "${nodeLabel}" must have a color`,
      });
    }
  });

  return issues;
}

describe('validate command - color validation', () => {
  test('should require color on nodes without pv metadata', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'title',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: '# Title',
          // No color field
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('must have a color');
  });

  test('should accept nodes with direct color field', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'title',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: '# Title',
          color: '#64748B',
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(0);
  });

  test('should accept nodes with color from canvas nodeType', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node',
          pv: {
            nodeType: 'service',
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
        nodeTypes: {
          service: {
            label: 'Service',
            description: 'Service node',
            color: '#3B82F6',
          },
        },
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(0);
  });

  test('should accept nodes with color from library nodeComponent', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node',
          pv: {
            nodeType: 'database',
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
      },
    };

    const library = {
      nodeComponents: {
        database: {
          color: '#10B981',
        },
      },
    };

    const issues = validateCanvasColor(canvas, library);
    expect(issues).toHaveLength(0);
  });

  test('should require color when nodeType exists but has no color', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node',
          pv: {
            nodeType: 'service',
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
        nodeTypes: {
          service: {
            label: 'Service',
            description: 'Service node',
            // No color defined
          },
        },
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('error');
    expect(issues[0].message).toContain('must have a color');
  });

  test('should validate multiple nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node 1',
          color: '#64748B',
        },
        {
          id: 'node2',
          type: 'text',
          x: 300,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node 2',
          // No color
        },
        {
          id: 'node3',
          type: 'text',
          x: 600,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node 3',
          pv: {
            nodeType: 'service',
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
        nodeTypes: {
          service: {
            label: 'Service',
            description: 'Service node',
            color: '#3B82F6',
          },
        },
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('node2');
  });

  test('should prioritize direct color over nodeType color', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'Node',
          color: '#FF0000', // Direct color
          pv: {
            nodeType: 'service', // Also has nodeType with color
          },
        },
      ],
      edges: [],
      pv: {
        name: 'Test Canvas',
        version: '1.0.0',
        nodeTypes: {
          service: {
            label: 'Service',
            description: 'Service node',
            color: '#3B82F6',
          },
        },
      },
    };

    const issues = validateCanvasColor(canvas);
    expect(issues).toHaveLength(0);
  });
});
