/**
 * Canvas Converter
 *
 * Utilities for converting between Extended Canvas format and React Flow nodes/edges.
 */

import type {
  ExtendedCanvas,
  ExtendedCanvasNode,
  ExtendedCanvasEdge,
  PVEdgeTypeDefinition,
  PVNodeShape,
  PVEdgeStyle,
  PVAnimationType,
} from '../types/canvas';
import { resolveCanvasColor } from '../types/canvas';
import type { NodeState, EdgeState } from '../types';

/**
 * React Flow node format
 */
export interface ReactFlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    name: string;
    nodeType: string;
    shape?: string;
    icon?: string;
    color?: string;
    width?: number;
    height?: number;
    states?: Record<string, { color?: string; icon?: string; label?: string }>;
    sources?: string[];
    actions?: any[];
    canvasType?: 'text' | 'file' | 'link' | 'group';
    text?: string;
    file?: string;
    url?: string;
    [key: string]: any;
  };
  style?: {
    width?: number;
    height?: number;
  };
}

/**
 * React Flow edge format
 */
export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  data?: {
    edgeType: string;
    style?: string;
    color?: string;
    width?: number;
    animation?: {
      type: string;
      duration?: number;
      color?: string;
    };
    activatedBy?: any[];
    [key: string]: any;
  };
  style?: {
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: string;
  };
  animated?: boolean;
  markerEnd?: {
    type: string;
    color?: string;
  };
}

/**
 * Convert canvas side to React Flow handle position
 */
function sideToHandle(side?: string): string | undefined {
  if (!side) return undefined;
  // React Flow uses 'top', 'right', 'bottom', 'left' - same as canvas
  return side;
}

/**
 * Convert edge style to stroke-dasharray
 */
function styleToStrokeDasharray(style?: string): string | undefined {
  switch (style) {
    case 'dashed':
      return '5,5';
    case 'dotted':
      return '2,2';
    default:
      return undefined;
  }
}

/**
 * Canvas Converter utility class
 */
export class CanvasConverter {
  /**
   * Convert Extended Canvas to React Flow nodes and edges
   */
  static canvasToReactFlow(canvas: ExtendedCanvas): {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
  } {
    const nodes: ReactFlowNode[] = [];
    const edges: ReactFlowEdge[] = [];

    // Convert nodes
    if (canvas.nodes) {
      for (const node of canvas.nodes) {
        nodes.push(this.convertNode(node, canvas));
      }
    }

    // Convert edges
    if (canvas.edges) {
      for (const edge of canvas.edges) {
        edges.push(this.convertEdge(edge, canvas));
      }
    }

    return { nodes, edges };
  }

  /**
   * Convert a single canvas node to React Flow node
   */
  private static convertNode(node: ExtendedCanvasNode, canvas: ExtendedCanvas): ReactFlowNode {
    const pv = node.pv;
    const color = resolveCanvasColor(node.color);

    // Get name based on node type
    let nodeName: string;
    switch (node.type) {
      case 'text':
        nodeName = node.text?.split('\n')[0].replace(/^#+ /, '').substring(0, 50) || 'Text';
        break;
      case 'file':
        nodeName = node.file?.split('/').pop() || node.file || 'File';
        break;
      case 'link':
        nodeName = node.url || 'Link';
        break;
      case 'group':
        nodeName = node.label || 'Group';
        break;
    }

    // Build the data object based on canvas node type
    const data: ReactFlowNode['data'] = {
      name: nodeName,
      nodeType: pv?.nodeType || node.id,
      canvasType: node.type,
      shape: pv?.shape || 'rectangle',
      icon: pv?.icon,
      color: pv?.states?.idle?.color || color,
      width: node.width,
      height: node.height,
    };

    // Add type-specific data
    if (node.type === 'text') {
      data.text = node.text;
    } else if (node.type === 'file') {
      data.file = node.file;
    } else if (node.type === 'link') {
      data.url = node.url;
    }

    // Add PV extensions if present
    if (pv) {
      data.states = pv.states;
      data.sources = pv.sources;
      data.actions = pv.actions;
      if (pv.dataSchema) {
        data.dataSchema = pv.dataSchema;
      }
    }

    return {
      id: node.id,
      type: pv?.shape || 'default',
      position: { x: node.x, y: node.y },
      data,
      style: {
        width: node.width,
        height: node.height,
      },
    };
  }

  /**
   * Convert a single canvas edge to React Flow edge
   */
  private static convertEdge(edge: ExtendedCanvasEdge, canvas: ExtendedCanvas): ReactFlowEdge {
    const pv = edge.pv;
    const edgeTypeDef = pv?.edgeType ? canvas.pv?.edgeTypes?.[pv.edgeType] : undefined;
    const color = resolveCanvasColor(edge.color) || edgeTypeDef?.color;

    const rfEdge: ReactFlowEdge = {
      id: edge.id,
      source: edge.fromNode,
      target: edge.toNode,
      sourceHandle: sideToHandle(edge.fromSide),
      targetHandle: sideToHandle(edge.toSide),
      label: edge.label,
      data: {
        edgeType: pv?.edgeType || 'default',
        style: pv?.style || edgeTypeDef?.style || 'solid',
        color,
        width: pv?.width || edgeTypeDef?.width || 2,
        animation: pv?.animation || edgeTypeDef?.animation,
        activatedBy: pv?.activatedBy || edgeTypeDef?.activatedBy,
      },
      style: {
        stroke: color,
        strokeWidth: pv?.width || edgeTypeDef?.width || 2,
        strokeDasharray: styleToStrokeDasharray(pv?.style || edgeTypeDef?.style),
      },
      animated: pv?.style === 'animated' || edgeTypeDef?.style === 'animated',
    };

    // Add marker based on canvas endpoint settings
    if (edge.toEnd !== 'none') {
      rfEdge.markerEnd = {
        type: 'arrowclosed',
        color,
      };
    }

    return rfEdge;
  }

  /**
   * Convert Extended Canvas to internal NodeState/EdgeState format
   */
  static canvasToGraph(canvas: ExtendedCanvas): {
    nodes: NodeState[];
    edges: EdgeState[];
  } {
    const nodes: NodeState[] = [];
    const edges: EdgeState[] = [];
    const now = Date.now();

    // Convert nodes
    if (canvas.nodes) {
      for (const node of canvas.nodes) {
        const pv = node.pv;
        // Get name and description based on node type
        // For text nodes: line 1 = name, rest = description
        let nodeName: string;
        let nodeDescription: string | undefined;
        switch (node.type) {
          case 'text': {
            const lines = node.text?.split('\n') || [];
            nodeName = lines[0]?.replace(/^#+ /, '').substring(0, 50) || 'Text';
            // Description is everything after the first line, trimmed
            nodeDescription = lines.slice(1).join('\n').trim() || undefined;
            break;
          }
          case 'file':
            nodeName = node.file?.split('/').pop() || node.file || 'File';
            break;
          case 'link':
            nodeName = node.url || 'Link';
            break;
          case 'group':
            nodeName = node.label || 'Group';
            break;
          default:
            // For custom types, use pv.nodeType or fall back to node id
            nodeName = pv?.nodeType || (node as { id: string }).id;
            break;
        }

        // pv.name takes priority over parsed name from text
        const finalName = pv?.name || nodeName;
        // pv.description takes priority over parsed description from text
        const finalDescription = pv?.description || nodeDescription;

        nodes.push({
          id: node.id,
          type: pv?.nodeType || node.type,
          name: finalName,
          data: {
            description: finalDescription,
            shape: pv?.shape || 'rectangle',
            icon: pv?.icon,
            // Color priority: pv.fill > node.color
            color: pv?.fill || resolveCanvasColor(node.color),
            // Stroke color for borders
            stroke: pv?.stroke,
            width: node.width,
            height: node.height,
            sources: pv?.sources || [],
            actions: pv?.actions || [],
            states: pv?.states,
            // OTEL metadata for visualization
            otel: pv?.otel,
            // Resource matching for log association
            resourceMatch: pv?.resourceMatch,
            canvasType: node.type,
            ...(node.type === 'text' ? { text: node.text } : {}),
            ...(node.type === 'file' ? { file: node.file } : {}),
            ...(node.type === 'link' ? { url: node.url } : {}),
          },
          position: { x: node.x, y: node.y },
          // Persist node dimensions at top level for xyflow
          width: node.width,
          height: node.height,
          // Don't set a default state - only show state labels when explicitly set via events
          state: undefined,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Convert edges
    if (canvas.edges) {
      for (const edge of canvas.edges) {
        const pv = edge.pv;
        const edgeTypeDef = pv?.edgeType ? canvas.pv?.edgeTypes?.[pv.edgeType] : undefined;

        edges.push({
          id: edge.id,
          type: pv?.edgeType || 'default',
          from: edge.fromNode,
          to: edge.toNode,
          data: {
            label: edge.label,
            style: pv?.style || edgeTypeDef?.style || 'solid',
            color: resolveCanvasColor(edge.color) || edgeTypeDef?.color,
            width: pv?.width || edgeTypeDef?.width,
            animation: pv?.animation || edgeTypeDef?.animation,
            activatedBy: pv?.activatedBy || edgeTypeDef?.activatedBy,
            fromSide: edge.fromSide,
            toSide: edge.toSide,
          },
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Convert React Flow nodes/edges back to Extended Canvas format
   */
  static reactFlowToCanvas(
    nodes: ReactFlowNode[],
    edges: ReactFlowEdge[],
    metadata?: { name?: string; version?: string; description?: string }
  ): ExtendedCanvas {
    const canvas: ExtendedCanvas = {
      nodes: [],
      edges: [],
      pv: {
        version: metadata?.version || '1.0.0',
        name: metadata?.name || 'Untitled',
        description: metadata?.description,
        edgeTypes: {},
      },
    };

    // Collect edge types
    const edgeTypes = new Map<string, PVEdgeTypeDefinition>();

    // Convert nodes
    for (const node of nodes) {
      const canvasNode: ExtendedCanvasNode = {
        id: node.id,
        type: node.data.canvasType || 'text',
        x: node.position.x,
        y: node.position.y,
        width: node.style?.width || node.data.width || 150,
        height: node.style?.height || node.data.height || 80,
        text: node.data.text || node.data.label || '',
      } as ExtendedCanvasNode;

      // Add color if present
      if (node.data.color) {
        canvasNode.color = node.data.color;
      }

      // Add PV extension if there's custom data
      if (node.data.nodeType || node.data.shape || node.data.sources?.length) {
        canvasNode.pv = {
          nodeType: node.data.nodeType || node.id,
          shape: node.data.shape as PVNodeShape | undefined,
          icon: node.data.icon,
          states: node.data.states,
          sources: node.data.sources,
          actions: node.data.actions,
          dataSchema: node.data.dataSchema,
        };
      }

      // For text nodes, combine name and description into text field
      // Format: "# Name\n\nDescription" or just "# Name" if no description
      if (node.data.canvasType === 'text' || !node.data.canvasType) {
        const name = node.data.name || node.data.label || node.id;
        const description = node.data.description;
        (canvasNode as any).text = description ? `# ${name}\n\n${description}` : `# ${name}`;
      }

      canvas.nodes!.push(canvasNode);
    }

    // Convert edges
    for (const edge of edges) {
      const canvasEdge: ExtendedCanvasEdge = {
        id: edge.id,
        fromNode: edge.source,
        toNode: edge.target,
        fromSide: edge.sourceHandle as any,
        toSide: edge.targetHandle as any,
        label: edge.label as string | undefined,
      };

      // Add color
      if (edge.style?.stroke) {
        canvasEdge.color = edge.style.stroke;
      }

      // Add PV extension
      if (edge.data?.edgeType) {
        canvasEdge.pv = {
          edgeType: edge.data.edgeType,
          style: edge.data.style as PVEdgeStyle | undefined,
          width: edge.data.width,
          animation: edge.data.animation as
            | { type: PVAnimationType; duration?: number; color?: string }
            | undefined,
          activatedBy: edge.data.activatedBy,
        };

        // Collect edge type definition
        if (!edgeTypes.has(edge.data.edgeType)) {
          edgeTypes.set(edge.data.edgeType, {
            style: edge.data.style as PVEdgeStyle | undefined,
            color: edge.data.color,
            width: edge.data.width,
            animation: edge.data.animation as
              | { type: PVAnimationType; duration?: number; color?: string }
              | undefined,
            activatedBy: edge.data.activatedBy,
          });
        }
      }

      canvas.edges!.push(canvasEdge);
    }

    // Add collected edge types to canvas
    canvas.pv!.edgeTypes = Object.fromEntries(edgeTypes);

    return canvas;
  }
}
