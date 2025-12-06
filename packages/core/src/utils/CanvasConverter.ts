/**
 * Canvas Converter
 *
 * Utilities for converting between Extended Canvas format and React Flow nodes/edges.
 */

import type {
  ExtendedCanvas,
  ExtendedCanvasNode,
  ExtendedCanvasEdge,
  VVEdgeTypeDefinition,
  VVNodeShape,
  VVEdgeStyle,
  VVAnimationType,
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
    label: string;
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
    const vv = node.vv;
    const color = resolveCanvasColor(node.color);

    // Build the data object based on canvas node type
    const data: ReactFlowNode['data'] = {
      label: this.getNodeLabel(node),
      nodeType: vv?.nodeType || node.id,
      canvasType: node.type,
      shape: vv?.shape || 'rectangle',
      icon: vv?.icon,
      color: vv?.states?.idle?.color || color,
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
    } else if (node.type === 'group') {
      data.label = node.label || data.label;
    }

    // Add VV extensions if present
    if (vv) {
      data.states = vv.states;
      data.sources = vv.sources;
      data.actions = vv.actions;
      if (vv.dataSchema) {
        data.dataSchema = vv.dataSchema;
      }
    }

    return {
      id: node.id,
      type: vv?.shape || 'default',
      position: { x: node.x, y: node.y },
      data,
      style: {
        width: node.width,
        height: node.height,
      },
    };
  }

  /**
   * Get display label for a node
   */
  private static getNodeLabel(node: ExtendedCanvasNode): string {
    if (node.vv?.nodeType) {
      return node.vv.nodeType;
    }
    switch (node.type) {
      case 'text':
        // Use first line of text as label
        const firstLine = node.text.split('\n')[0];
        return firstLine.replace(/^#+ /, '').substring(0, 50);
      case 'file':
        // Use filename as label
        return node.file.split('/').pop() || node.file;
      case 'link':
        return node.url;
      case 'group':
        return node.label || 'Group';
    }
  }

  /**
   * Convert a single canvas edge to React Flow edge
   */
  private static convertEdge(edge: ExtendedCanvasEdge, canvas: ExtendedCanvas): ReactFlowEdge {
    const vv = edge.vv;
    const edgeTypeDef = vv?.edgeType ? canvas.vv?.edgeTypes?.[vv.edgeType] : undefined;
    const color = resolveCanvasColor(edge.color) || edgeTypeDef?.color;

    const rfEdge: ReactFlowEdge = {
      id: edge.id,
      source: edge.fromNode,
      target: edge.toNode,
      sourceHandle: sideToHandle(edge.fromSide),
      targetHandle: sideToHandle(edge.toSide),
      label: edge.label,
      data: {
        edgeType: vv?.edgeType || 'default',
        style: vv?.style || edgeTypeDef?.style || 'solid',
        color,
        width: vv?.width || edgeTypeDef?.width || 2,
        animation: vv?.animation || edgeTypeDef?.animation,
        activatedBy: vv?.activatedBy || edgeTypeDef?.activatedBy,
      },
      style: {
        stroke: color,
        strokeWidth: vv?.width || edgeTypeDef?.width || 2,
        strokeDasharray: styleToStrokeDasharray(vv?.style || edgeTypeDef?.style),
      },
      animated: vv?.style === 'animated' || edgeTypeDef?.style === 'animated',
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
        const vv = node.vv;
        nodes.push({
          id: node.id,
          type: vv?.nodeType || node.type,
          data: {
            label: this.getNodeLabel(node),
            shape: vv?.shape || 'rectangle',
            icon: vv?.icon,
            // Color priority: vv.fill > node.color
            color: vv?.fill || resolveCanvasColor(node.color),
            // Stroke color for borders
            stroke: vv?.stroke,
            width: node.width,
            height: node.height,
            sources: vv?.sources || [],
            actions: vv?.actions || [],
            states: vv?.states,
            canvasType: node.type,
            ...(node.type === 'text' ? { text: node.text } : {}),
            ...(node.type === 'file' ? { file: node.file } : {}),
            ...(node.type === 'link' ? { url: node.url } : {}),
          },
          position: { x: node.x, y: node.y },
          state: 'idle',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Convert edges
    if (canvas.edges) {
      for (const edge of canvas.edges) {
        const vv = edge.vv;
        const edgeTypeDef = vv?.edgeType ? canvas.vv?.edgeTypes?.[vv.edgeType] : undefined;

        edges.push({
          id: edge.id,
          type: vv?.edgeType || 'default',
          from: edge.fromNode,
          to: edge.toNode,
          data: {
            label: edge.label,
            style: vv?.style || edgeTypeDef?.style || 'solid',
            color: resolveCanvasColor(edge.color) || edgeTypeDef?.color,
            width: vv?.width || edgeTypeDef?.width,
            animation: vv?.animation || edgeTypeDef?.animation,
            activatedBy: vv?.activatedBy || edgeTypeDef?.activatedBy,
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
      vv: {
        version: metadata?.version || '1.0.0',
        name: metadata?.name || 'Untitled',
        description: metadata?.description,
        edgeTypes: {},
      },
    };

    // Collect edge types
    const edgeTypes = new Map<string, VVEdgeTypeDefinition>();

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

      // Add VV extension if there's custom data
      if (node.data.nodeType || node.data.shape || node.data.sources?.length) {
        canvasNode.vv = {
          nodeType: node.data.nodeType || node.id,
          shape: node.data.shape as VVNodeShape | undefined,
          icon: node.data.icon,
          states: node.data.states,
          sources: node.data.sources,
          actions: node.data.actions,
          dataSchema: node.data.dataSchema,
        };
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

      // Add VV extension
      if (edge.data?.edgeType) {
        canvasEdge.vv = {
          edgeType: edge.data.edgeType,
          style: edge.data.style as VVEdgeStyle | undefined,
          width: edge.data.width,
          animation: edge.data.animation as { type: VVAnimationType; duration?: number; color?: string } | undefined,
          activatedBy: edge.data.activatedBy,
        };

        // Collect edge type definition
        if (!edgeTypes.has(edge.data.edgeType)) {
          edgeTypes.set(edge.data.edgeType, {
            style: edge.data.style as VVEdgeStyle | undefined,
            color: edge.data.color,
            width: edge.data.width,
            animation: edge.data.animation as { type: VVAnimationType; duration?: number; color?: string } | undefined,
            activatedBy: edge.data.activatedBy,
          });
        }
      }

      canvas.edges!.push(canvasEdge);
    }

    // Add collected edge types to canvas
    canvas.vv!.edgeTypes = Object.fromEntries(edgeTypes);

    return canvas;
  }
}
