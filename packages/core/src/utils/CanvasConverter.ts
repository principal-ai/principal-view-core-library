/**
 * Canvas Converter
 *
 * Utilities for converting between Extended Canvas format and React Flow nodes/edges.
 */

import type {
  ExtendedCanvas,
  ExtendedCanvasNode,
  ExtendedCanvasTextNode,
  ExtendedCanvasEdge,
  PVEdgeTypeDefinition,
  PVNodeShape,
  PVEdgeStyle,
  PVAnimationType,
  CanvasSide,
  PVNodeState,
  PVOtelExtension,
  PVEventSchema,
  PVBoundaryExtension,
} from '../types/canvas';
import type { JsonValue } from '../types';
import { resolveCanvasColor, isOtelNode } from '../types/canvas';
import type { NodeState, EdgeState } from '../types';
import type { ResourceMatch } from '../types/resource-match';

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
    sources?: string[]; // deprecated, use references
    references?: string[];
    status?: 'draft' | 'approved' | 'implemented';
    // actions removed - legacy path-based patterns
    canvasType?: 'text' | 'file' | 'link' | 'group' | 'otel-event' | 'otel-span-convention' | 'otel-scope' | 'otel-resource' | 'otel-boundary';
    text?: string;
    file?: string;
    url?: string;
    description?: string;
    otel?: PVOtelExtension;
    resourceMatch?: ResourceMatch;
    event?: PVEventSchema;
    eventRef?: string;
    events?: Record<string, PVEventSchema>;
    boundary?: PVBoundaryExtension;
    dataSchema?: Record<string, {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      displayInLabel?: boolean;
    }>;
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
    // activatedBy removed - legacy path-based patterns
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
  private static convertNode(node: ExtendedCanvasNode, _canvas: ExtendedCanvas): ReactFlowNode {
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
      // OTEL node types use the label field directly
      case 'otel-event':
      case 'otel-span-convention':
      case 'otel-scope':
      case 'otel-resource':
      case 'otel-boundary':
        nodeName = node.label;
        break;
    }

    // Build the data object based on canvas node type
    // For OTEL nodes, use the node type directly; for standard canvas types, use pv or default
    const isOtelType = isOtelNode(node);
    const data: ReactFlowNode['data'] = {
      name: nodeName,
      nodeType: isOtelType ? node.type : (pv?.nodeType || node.type),
      canvasType: node.type,
      shape: isOtelType ? (node.shape || 'rectangle') : (pv?.shape || 'rectangle'),
      icon: isOtelType ? node.icon : pv?.icon,
      color: pv?.states?.idle?.color || color,
      width: node.width,
      height: node.height,
    };

    // Add type-specific data for JSON Canvas types
    if (node.type === 'text') {
      data.text = node.text;
    } else if (node.type === 'file') {
      data.file = node.file;
    } else if (node.type === 'link') {
      data.url = node.url;
    }

    // Handle OTEL node types (new format with top-level fields)
    if (
      node.type === 'otel-event' ||
      node.type === 'otel-span-convention' ||
      node.type === 'otel-scope' ||
      node.type === 'otel-resource' ||
      node.type === 'otel-boundary'
    ) {
      // OTEL nodes use top-level fields, not pv wrapper
      data.nodeType = node.type;
      if (node.icon) data.icon = node.icon;
      if (node.fill) data.color = node.fill;
      if (node.shape) data.shape = node.shape;
      if ('description' in node && node.description) data.description = node.description;

      // Add OTEL-specific data
      if ('otel' in node && node.otel) {
        (data as Record<string, unknown>).otel = node.otel;
        if (node.otel.status) data.status = node.otel.status;
        if (node.otel.references) data.references = node.otel.references;
      }
      if ('event' in node && node.event) {
        (data as Record<string, unknown>).event = node.event;
      }
      if ('eventRef' in node && node.eventRef) {
        (data as Record<string, unknown>).eventRef = node.eventRef;
      }
      if ('dataSchema' in node && node.dataSchema) {
        data.dataSchema = node.dataSchema;
      }
      if ('boundary' in node && node.boundary) {
        (data as Record<string, unknown>).boundary = node.boundary;
      }
      // Pass through workflow chips if present (for span convention nodes)
      if ('workflowChips' in node && node.workflowChips) {
        (data as Record<string, unknown>).workflowChips = node.workflowChips;
      }
    }

    // Add PV extensions if present (for standard canvas nodes only)
    // OTEL nodes use top-level fields, not pv wrapper
    if (pv && !isOtelType) {
      if (pv.states) data.states = pv.states;
      if (pv.sources) data.sources = pv.sources; // deprecated, use references
      if (pv.references) data.references = pv.references;
      if (pv.status) data.status = pv.status;
      if (pv.dataSchema) data.dataSchema = pv.dataSchema;
    }

    // Determine React Flow node type from shape
    let reactFlowType = 'default';
    if (isOtelType && node.shape) {
      reactFlowType = node.shape;
    } else if (pv?.shape) {
      reactFlowType = pv.shape;
    }

    return {
      id: node.id,
      type: reactFlowType,
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
    // Support both top-level edgeType (new) and pv.edgeType (deprecated)
    const edgeType = edge.edgeType || pv?.edgeType;
    // Support both top-level edgeTypes (new) and pv.edgeTypes (deprecated)
    const edgeTypes = canvas.edgeTypes || canvas.pv?.edgeTypes;
    const edgeTypeDef = edgeType ? edgeTypes?.[edgeType] : undefined;
    const color = resolveCanvasColor(edge.color) || edgeTypeDef?.color;

    const rfEdge: ReactFlowEdge = {
      id: edge.id,
      source: edge.fromNode,
      target: edge.toNode,
      sourceHandle: sideToHandle(edge.fromSide),
      targetHandle: sideToHandle(edge.toSide),
      label: edge.label,
      data: {
        edgeType: edgeType || 'default',
        style: pv?.style || edgeTypeDef?.style || 'solid',
        color,
        width: pv?.width || edgeTypeDef?.width || 2,
        animation: pv?.animation || edgeTypeDef?.animation,
        // activatedBy removed - legacy path-based
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
          // OTEL node types use the label field directly
          case 'otel-event':
          case 'otel-span-convention':
          case 'otel-scope':
          case 'otel-resource':
          case 'otel-boundary':
            nodeName = node.label;
            break;
          default:
            // For unknown custom types, use node id
            nodeName = (node as { id: string }).id;
            break;
        }

        // pv.name takes priority over parsed name from text
        const finalName = pv?.name || nodeName;
        // pv.description takes priority over parsed description from text
        const finalDescription = pv?.description || nodeDescription;

        // Check if this is an OTEL node type
        const isOtelType = isOtelNode(node);

        // Build data object, filtering out undefined values
        const nodeData: Record<string, JsonValue> = {
          description: finalDescription || '',
          shape: isOtelType ? (node.shape || 'rectangle') : (pv?.shape || 'rectangle'),
          color: isOtelType ? (node.fill || resolveCanvasColor(node.color) || '') : (pv?.fill || resolveCanvasColor(node.color) || ''),
          width: node.width,
          height: node.height,
          sources: pv?.sources || [], // deprecated, use references
          references: pv?.references || [],
          canvasType: node.type,
        };

        // Add optional pv properties for standard canvas nodes only
        // Note: pv.otel and pv.resourceMatch are removed - use otel-* node types instead
        if (!isOtelType && pv) {
          if (pv.icon) nodeData.icon = pv.icon;
          if (pv.stroke) nodeData.stroke = pv.stroke;
          if (pv.states) nodeData.states = pv.states as JsonValue;
          if (pv.status) nodeData.status = pv.status;
        }

        // Add type-specific data
        if (node.type === 'text' && node.text) nodeData.text = node.text;
        if (node.type === 'file' && node.file) nodeData.file = node.file;
        if (node.type === 'link' && node.url) nodeData.url = node.url;

        // Handle OTEL node types (new format with top-level fields)
        if (isOtelNode(node)) {
          nodeData.nodeType = node.type;
          if (node.icon) nodeData.icon = node.icon;
          if (node.fill) nodeData.color = node.fill;
          if (node.shape) nodeData.shape = node.shape;
          if ('description' in node && node.description) nodeData.description = node.description;

          // Add OTEL-specific data from top-level fields
          if ('otel' in node && node.otel) {
            nodeData.otel = node.otel as JsonValue;
            if (node.otel.status) nodeData.status = node.otel.status;
            if (node.otel.references) nodeData.references = node.otel.references;
          }
          if ('event' in node && node.event) {
            nodeData.event = node.event as unknown as JsonValue;
          }
          if ('eventRef' in node && node.eventRef) {
            nodeData.eventRef = node.eventRef;
          }
          if ('dataSchema' in node && node.dataSchema) {
            nodeData.dataSchema = node.dataSchema as JsonValue;
          }
          if ('boundary' in node && node.boundary) {
            nodeData.boundary = node.boundary as unknown as JsonValue;
          }
          // Pass through workflow chips if present (for span convention nodes)
          if ('workflowChips' in node && node.workflowChips) {
            nodeData.workflowChips = node.workflowChips as unknown as JsonValue;
          }
        }

        nodes.push({
          id: node.id,
          type: pv?.nodeType || node.type,
          name: finalName,
          data: nodeData,
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
      // Support both top-level edgeTypes (new) and pv.edgeTypes (deprecated)
      const edgeTypes = canvas.edgeTypes || canvas.pv?.edgeTypes;

      for (const edge of canvas.edges) {
        const pv = edge.pv;
        // Support both top-level edgeType (new) and pv.edgeType (deprecated)
        const edgeType = edge.edgeType || pv?.edgeType;
        const edgeTypeDef = edgeType ? edgeTypes?.[edgeType] : undefined;

        // Build data object, filtering out undefined values
        const edgeData: Record<string, JsonValue> = {
          style: pv?.style || edgeTypeDef?.style || 'solid',
        };

        // Add optional properties only if defined
        if (edge.label) edgeData.label = edge.label;
        const color = resolveCanvasColor(edge.color) || edgeTypeDef?.color;
        if (color) edgeData.color = color;
        const width = pv?.width || edgeTypeDef?.width;
        if (width !== undefined) edgeData.width = width;
        const animation = pv?.animation || edgeTypeDef?.animation;
        if (animation) edgeData.animation = animation as JsonValue;
        // activatedBy removed - legacy path-based
        if (edge.fromSide) edgeData.fromSide = edge.fromSide;
        if (edge.toSide) edgeData.toSide = edge.toSide;

        edges.push({
          id: edge.id,
          type: edgeType || 'default',
          from: edge.fromNode,
          to: edge.toNode,
          data: edgeData,
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
    metadata?: { name?: string; description?: string }
  ): ExtendedCanvas {
    const canvas: ExtendedCanvas = {
      name: metadata?.name || 'Untitled',
      nodes: [],
      edges: [],
      pv: {
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
        text: node.data.text || '',
      } as ExtendedCanvasNode;

      // Add color if present
      if (node.data.color && typeof node.data.color === 'string') {
        canvasNode.color = node.data.color;
      }

      // Add PV extension if there's custom data
      if (node.data.nodeType || node.data.shape || node.data.sources?.length || node.data.references?.length) {
        canvasNode.pv = {
          nodeType: (node.data.nodeType as string) || node.id,
          shape: node.data.shape as PVNodeShape | undefined,
          icon: node.data.icon as string | undefined,
          states: node.data.states as Record<string, PVNodeState> | undefined,
          sources: node.data.sources as string[] | undefined, // deprecated, use references
          references: node.data.references as string[] | undefined,
          // actions removed - legacy path-based
          dataSchema: node.data.dataSchema as Record<string, { type: 'string' | 'number' | 'boolean' | 'object' | 'array'; required?: boolean; displayInLabel?: boolean }> | undefined,
        };
      }

      // For text nodes, combine name and description into text field
      // Format: "# Name\n\nDescription" or just "# Name" if no description
      if (node.data.canvasType === 'text' || !node.data.canvasType) {
        const name = node.data.name || node.id;
        const description = node.data.description;
        (canvasNode as ExtendedCanvasTextNode).text = description ? `# ${name}\n\n${description}` : `# ${name}`;
      }

      canvas.nodes!.push(canvasNode);
    }

    // Convert edges
    for (const edge of edges) {
      const canvasEdge: ExtendedCanvasEdge = {
        id: edge.id,
        fromNode: edge.source,
        toNode: edge.target,
        fromSide: edge.sourceHandle as CanvasSide | undefined,
        toSide: edge.targetHandle as CanvasSide | undefined,
        label: edge.label as string | undefined,
      };

      // Add color
      if (edge.style?.stroke) {
        canvasEdge.color = edge.style.stroke;
      }

      // Add PV extension
      if (edge.data?.edgeType) {
        canvasEdge.pv = {
          edgeType: edge.data.edgeType as string,
          style: edge.data.style as PVEdgeStyle | undefined,
          width: edge.data.width as number | undefined,
          animation: edge.data.animation as
            | { type: PVAnimationType; duration?: number; color?: string }
            | undefined,
          // activatedBy removed - legacy path-based
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
            // activatedBy removed - legacy path-based
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
