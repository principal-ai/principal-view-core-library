/**
 * Library Converter
 *
 * Utilities for converting library components to canvas nodes/edges.
 * Used when adding components from the library to a canvas.
 */

import type { LibraryNodeComponent, LibraryEdgeComponent, ComponentLibrary } from '../types/library';
import type {
  ExtendedCanvasTextNode,
  ExtendedCanvasEdge,
  VVNodeExtension,
  VVEdgeExtension,
  VVEdgeTypeDefinition,
} from '../types/canvas';

/**
 * Options for creating a canvas node from a library component
 */
export interface CreateNodeOptions {
  /** Unique ID for the node */
  id: string;

  /** X position in pixels */
  x: number;

  /** Y position in pixels */
  y: number;

  /** Optional label override (defaults to component's defaultLabel or the component key) */
  label?: string;

  /** Optional initial data values */
  data?: Record<string, unknown>;
}

/**
 * Options for creating a canvas edge from a library component
 */
export interface CreateEdgeOptions {
  /** Unique ID for the edge */
  id: string;

  /** Source node ID */
  fromNode: string;

  /** Target node ID */
  toNode: string;

  /** Optional label */
  label?: string;

  /** Optional side of source node */
  fromSide?: 'top' | 'right' | 'bottom' | 'left';

  /** Optional side of target node */
  toSide?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Library Converter utility class
 */
export class LibraryConverter {
  /**
   * Create a canvas node from a library node component
   *
   * @param componentKey - The key of the component in the library
   * @param component - The library node component definition
   * @param options - Node creation options (id, position, etc.)
   * @returns Extended canvas text node ready to add to a canvas
   */
  static createCanvasNode(
    componentKey: string,
    component: LibraryNodeComponent,
    options: CreateNodeOptions
  ): ExtendedCanvasTextNode {
    const { id, x, y, label, data } = options;

    // Build the VV extension from the library component
    const vv: VVNodeExtension = {
      nodeType: componentKey,
      shape: component.shape,
      icon: component.icon,
      states: component.states,
      sources: component.sources,
      actions: component.actions,
      dataSchema: component.dataSchema,
      layout: component.layout,
    };

    // Build the canvas node
    const node: ExtendedCanvasTextNode = {
      id,
      type: 'text',
      text: label || component.defaultLabel || componentKey,
      x,
      y,
      width: component.size?.width || 120,
      height: component.size?.height || 60,
      color: component.color,
      vv,
    };

    // If there's initial data, merge it with the text
    if (data) {
      // Store additional data in the vv extension
      // The data will be accessible via the node's data field when converted to React Flow
      (vv as VVNodeExtension & { initialData?: Record<string, unknown> }).initialData = data;
    }

    return node;
  }

  /**
   * Create a canvas edge from a library edge component
   *
   * @param componentKey - The key of the component in the library
   * @param component - The library edge component definition
   * @param options - Edge creation options
   * @returns Extended canvas edge ready to add to a canvas
   */
  static createCanvasEdge(
    componentKey: string,
    component: LibraryEdgeComponent,
    options: CreateEdgeOptions
  ): ExtendedCanvasEdge {
    const { id, fromNode, toNode, label, fromSide, toSide } = options;

    // Build the VV extension
    const vv: VVEdgeExtension = {
      edgeType: componentKey,
      style: component.style,
      width: component.width,
      animation: component.animation,
    };

    // Build the canvas edge
    const edge: ExtendedCanvasEdge = {
      id,
      fromNode,
      toNode,
      label,
      fromSide,
      toSide,
      color: component.color,
      toEnd: component.directed !== false ? 'arrow' : 'none',
      vv,
    };

    return edge;
  }

  /**
   * Convert library edge components to canvas-level edge type definitions
   *
   * This is useful when initializing a new canvas from a library.
   *
   * @param edgeComponents - Library edge components
   * @returns Record of edge type definitions for the canvas vv.edgeTypes field
   */
  static createEdgeTypeDefinitions(
    edgeComponents: Record<string, LibraryEdgeComponent>
  ): Record<string, VVEdgeTypeDefinition> {
    const edgeTypes: Record<string, VVEdgeTypeDefinition> = {};

    for (const [key, component] of Object.entries(edgeComponents)) {
      edgeTypes[key] = {
        style: component.style,
        color: component.color,
        width: component.width,
        directed: component.directed,
        animation: component.animation,
        labelConfig: component.label,
      };
    }

    return edgeTypes;
  }

  /**
   * Generate a unique ID for a new node
   *
   * @param prefix - Optional prefix (defaults to 'node')
   * @returns Unique ID string
   */
  static generateNodeId(prefix = 'node'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate a unique ID for a new edge
   *
   * @param fromNode - Source node ID
   * @param toNode - Target node ID
   * @returns Unique ID string
   */
  static generateEdgeId(fromNode: string, toNode: string): string {
    return `edge-${fromNode}-${toNode}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get all node component keys that match the given tags
   *
   * @param library - Component library
   * @param tags - Tags to filter by (matches if component has ANY of these tags)
   * @returns Array of component keys
   */
  static filterNodesByTags(library: ComponentLibrary, tags: string[]): string[] {
    return Object.entries(library.nodeComponents)
      .filter(([, component]) => component.tags?.some((tag) => tags.includes(tag)))
      .map(([key]) => key);
  }

  /**
   * Get all edge component keys that match the given tags
   *
   * @param library - Component library
   * @param tags - Tags to filter by (matches if component has ANY of these tags)
   * @returns Array of component keys
   */
  static filterEdgesByTags(library: ComponentLibrary, tags: string[]): string[] {
    return Object.entries(library.edgeComponents)
      .filter(([, component]) => component.tags?.some((tag) => tags.includes(tag)))
      .map(([key]) => key);
  }

  /**
   * Get allowed edge types between two node types based on connection rules
   *
   * @param library - Component library
   * @param fromNodeType - Source node type key
   * @param toNodeType - Target node type key
   * @returns Array of allowed edge type keys
   */
  static getAllowedEdgeTypes(library: ComponentLibrary, fromNodeType: string, toNodeType: string): string[] {
    if (!library.connectionRules) {
      // If no rules defined, allow any edge type
      return Object.keys(library.edgeComponents);
    }

    return library.connectionRules
      .filter((rule) => rule.from === fromNodeType && rule.to === toNodeType)
      .map((rule) => rule.via);
  }
}
