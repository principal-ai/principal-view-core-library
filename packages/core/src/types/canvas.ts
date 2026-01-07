/**
 * JSON Canvas Extended Types
 *
 * This module defines types that extend the JSON Canvas spec (https://jsoncanvas.org/spec/1.0/)
 * with Principal View Framework extensions.
 *
 * Design principle: All extensions are placed in a `pv` (Principal View) field,
 * which is ignored by standard canvas tools (like Obsidian) but used by our React Flow renderer.
 *
 * This allows:
 * 1. Authoring layouts visually in Obsidian or other canvas tools
 * 2. Rendering with rich animations and states in React Flow
 * 3. Round-trip editing without data loss
 */

import type { CanvasScope, CanvasAuditConfig } from './canvas-scope';
import type { ResourceMatch } from './resource-match';

// ============================================================================
// JSON Canvas Spec Types (1.0)
// https://jsoncanvas.org/spec/1.0/
// ============================================================================

/**
 * Canvas color - either a hex string or preset number (1-6)
 * Presets: 1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple
 */
export type CanvasColor = string | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Side of a node for edge connections
 */
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * Edge endpoint shape
 */
export type CanvasEndpoint = 'none' | 'arrow';

/**
 * Background style for group nodes
 */
export type CanvasBackgroundStyle = 'cover' | 'ratio' | 'repeat';

/**
 * Base node properties (common to all node types)
 */
export interface CanvasNodeBase {
  /** Unique identifier */
  id: string;
  /** X position in pixels */
  x: number;
  /** Y position in pixels */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Optional color */
  color?: CanvasColor;
}

/**
 * Text node - stores plain text or markdown
 */
export interface CanvasTextNode extends CanvasNodeBase {
  type: 'text';
  /** Markdown-formatted text content */
  text: string;
}

/**
 * File node - references an external file
 */
export interface CanvasFileNode extends CanvasNodeBase {
  type: 'file';
  /** Path to the file */
  file: string;
  /** Optional subpath (heading or block link) */
  subpath?: string;
}

/**
 * Link node - references a URL
 */
export interface CanvasLinkNode extends CanvasNodeBase {
  type: 'link';
  /** URL to link to */
  url: string;
}

/**
 * Group node - visual container for other nodes
 */
export interface CanvasGroupNode extends CanvasNodeBase {
  type: 'group';
  /** Optional label for the group */
  label?: string;
  /** Optional background image path */
  background?: string;
  /** Background image style */
  backgroundStyle?: CanvasBackgroundStyle;
}

/**
 * Union of all standard canvas node types
 */
export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode;

/**
 * Canvas edge connecting two nodes
 */
export interface CanvasEdge {
  /** Unique identifier */
  id: string;
  /** Source node ID */
  fromNode: string;
  /** Target node ID */
  toNode: string;
  /** Side of source node */
  fromSide?: CanvasSide;
  /** Side of target node */
  toSide?: CanvasSide;
  /** Endpoint shape at source (default: 'none') */
  fromEnd?: CanvasEndpoint;
  /** Endpoint shape at target (default: 'arrow') */
  toEnd?: CanvasEndpoint;
  /** Edge color */
  color?: CanvasColor;
  /** Edge label */
  label?: string;
}

/**
 * Standard JSON Canvas document
 */
export interface Canvas {
  /** Array of nodes (ordered by z-index ascending) */
  nodes?: CanvasNode[];
  /** Array of edges */
  edges?: CanvasEdge[];
}

// ============================================================================
// Principal View Extensions
// ============================================================================

/**
 * Animation types for edges
 */
export type PVAnimationType = 'flow' | 'pulse' | 'particle' | 'glow';

/**
 * Animation direction
 */
export type PVAnimationDirection = 'forward' | 'backward' | 'bidirectional';

/**
 * Node shape for rendering
 */
export type PVNodeShape = 'circle' | 'rectangle' | 'hexagon' | 'diamond' | 'custom';

/**
 * Edge line style
 */
export type PVEdgeStyle = 'solid' | 'dashed' | 'dotted' | 'animated';

/**
 * Log level for path-based association
 */
export type PVLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Action pattern for extracting events from logs
 */
export interface PVActionPattern {
  /** Regex pattern with named capture groups */
  pattern: string;
  /** Event type to emit */
  event: string;
  /** State to transition to */
  state?: string;
  /** Metadata template using $captureGroup syntax */
  metadata?: Record<string, string>;
  /** Edge IDs to trigger animations on */
  triggerEdges?: string[];
}

/**
 * State definition for a node
 */
export interface PVNodeState {
  /** Color when in this state */
  color?: string;
  /** Icon when in this state */
  icon?: string;
  /** Display label */
  label?: string;
}

/**
 * Edge activation trigger
 */
export interface PVEdgeActivation {
  /** Action that triggers this animation */
  action: string;
  /** Animation type */
  animation: PVAnimationType;
  /** Animation direction */
  direction?: PVAnimationDirection;
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * OTEL node classification
 *
 * Used to categorize nodes in architectural diagrams showing OTEL concepts.
 */
export type PVOtelKind = 'type' | 'service' | 'instance';

/**
 * OTEL category for type nodes
 */
export type PVOtelCategory =
  | 'log'
  | 'resource'
  | 'span'
  | 'scope'
  | 'match'
  | 'audit'
  | 'config'
  | 'router'
  | 'collector';

/**
 * OTEL-specific node extension
 *
 * Used to mark nodes as representing OTEL concepts in architectural diagrams.
 */
export interface PVOtelExtension {
  /**
   * Kind of OTEL node
   * - `type`: Represents a TypeScript type/interface (e.g., OtelLog, ResourceMatch)
   * - `service`: Represents a runtime service (e.g., LogRouter, AuditCollector)
   * - `instance`: Represents an actual runtime instance (e.g., a specific pod)
   */
  kind: PVOtelKind;

  /**
   * Category within OTEL domain
   */
  category?: PVOtelCategory;

  /**
   * Whether this is part of the new OTEL integration (vs legacy path-based)
   */
  isNew?: boolean;
}

/**
 * Event field schema definition
 */
export interface PVEventFieldSchema {
  /** Field data type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Whether this field is required */
  required?: boolean;
  /** Description of what this field represents */
  description?: string;
}

/**
 * Event schema definition for a specific event type
 */
export interface PVEventSchema {
  /** Description of what this event represents */
  description: string;
  /** Expected attributes/fields for this event */
  attributes: Record<string, PVEventFieldSchema>;
}

/**
 * Principal View node extensions
 */
export interface PVNodeExtension {
  /** Custom node type identifier */
  nodeType: string;

  /**
   * Display name for this node
   *
   * Preferred over parsing the `text` field. Use this for the node label.
   */
  name?: string;

  /**
   * Description of what this node represents
   *
   * Shown in tooltips or detail panels.
   */
  description?: string;

  /**
   * OTEL-specific metadata
   *
   * Used when this node represents an OTEL concept (type, service, or instance).
   */
  otel?: PVOtelExtension;

  /** Visual shape */
  shape?: PVNodeShape;
  /** Icon identifier (Lucide icons) */
  icon?: string;
  /** Fill color (hex string) - takes priority over node.color */
  fill?: string;
  /** Stroke/border color (hex string) */
  stroke?: string;
  /** State definitions */
  states?: Record<string, PVNodeState>;
  /** Source file patterns for log association */
  sources?: string[];

  /**
   * Resource-based matching for OTEL logs
   *
   * When specified, logs with matching OTEL resource attributes
   * will be routed to this node. Takes priority over sources.
   *
   * @example
   * ```typescript
   * resourceMatch: {
   *   'service.name': 'checkout-api',
   *   'deployment.environment': 'production'
   * }
   * ```
   */
  resourceMatch?: ResourceMatch;

  /** Action patterns for event extraction */
  actions?: PVActionPattern[];

  /**
   * Event schemas for type-safe telemetry validation
   *
   * Defines the events that this node should emit during execution.
   * Used for compile-time and runtime validation of telemetry events.
   *
   * @example
   * ```typescript
   * events: {
   *   'conversion.started': {
   *     description: 'Graph conversion begins',
   *     attributes: {
   *       'config.nodeTypes': { type: 'number', required: true },
   *       'config.edgeTypes': { type: 'number', required: true }
   *     }
   *   },
   *   'conversion.complete': {
   *     description: 'Graph conversion completes',
   *     attributes: {
   *       'result.nodes.count': { type: 'number', required: true },
   *       'result.edges.count': { type: 'number', required: true }
   *     }
   *   }
   * }
   * ```
   */
  events?: Record<string, PVEventSchema>;

  /** Data schema for typed fields */
  dataSchema?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      displayInLabel?: boolean;
    }
  >;
  /** Layout hints */
  layout?: {
    layer?: number;
    cluster?: string;
  };
}

/**
 * Principal View edge extensions
 */
export interface PVEdgeExtension {
  /** Custom edge type identifier */
  edgeType: string;
  /** Line style */
  style?: PVEdgeStyle;
  /** Line width in pixels */
  width?: number;
  /** Default animation */
  animation?: {
    type: PVAnimationType;
    duration?: number;
    color?: string;
  };
  /** Activation triggers */
  activatedBy?: PVEdgeActivation[];
}

/**
 * Path-based configuration options
 */
export interface PVPathConfig {
  /** Project root for path normalization */
  projectRoot?: string;
  /** Enable source capture from stack traces */
  captureSource?: boolean;
  /** Enable action pattern matching */
  enableActionPatterns?: boolean;
  /** Minimum log level to process */
  logLevel?: PVLogLevel;
  /** Ignore logs without source info */
  ignoreUnsourced?: boolean;
}

/**
 * Display configuration
 */
export interface PVDisplayConfig {
  /** Layout algorithm (manual uses canvas positions) */
  layout?: 'hierarchical' | 'force-directed' | 'circular' | 'manual';
  /** Color theme */
  theme?: {
    primary?: string;
    success?: string;
    warning?: string;
    danger?: string;
    info?: string;
  };
  /** Animation settings */
  animations?: {
    enabled?: boolean;
    speed?: number;
  };
}

/**
 * Node type definition (stored at canvas level in pv.nodeTypes)
 */
export interface PVNodeTypeDefinition {
  /** Display label */
  label?: string;
  /** Description of this node type (required) */
  description: string;
  /** Fill color (hex string) */
  color?: string;
  /** Icon identifier (Lucide icons) */
  icon?: string;
  /** Visual shape */
  shape?: PVNodeShape;
}

/**
 * Edge type definition (stored at canvas level)
 */
export interface PVEdgeTypeDefinition {
  /** Display label */
  label?: string;
  /** Line style */
  style?: PVEdgeStyle;
  /** Line color */
  color?: string;
  /** Line width */
  width?: number;
  /** Whether edge is directed */
  directed?: boolean;
  /** Default animation */
  animation?: {
    type: PVAnimationType;
    duration?: number;
    color?: string;
  };
  /** Label configuration (for dynamic labels) */
  labelConfig?: {
    field?: string;
    position?: 'start' | 'middle' | 'end';
  };
  /** Activation triggers */
  activatedBy?: PVEdgeActivation[];
}

/**
 * Canvas-level Principal View extensions
 */
export interface PVCanvasExtension {
  /** Schema version */
  version: string;
  /** Graph name */
  name: string;
  /** Description */
  description?: string;
  /** Node type definitions (shared across nodes) */
  nodeTypes?: Record<string, PVNodeTypeDefinition>;
  /** Edge type definitions (shared across edges) */
  edgeTypes?: Record<string, PVEdgeTypeDefinition>;
  /** Path-based configuration */
  pathConfig?: PVPathConfig;
  /** Display configuration */
  display?: PVDisplayConfig;

  /**
   * Canvas scope for log filtering
   *
   * Only logs matching this scope will be considered for node routing.
   * If not specified, all logs are in scope.
   *
   * @example
   * ```typescript
   * scope: {
   *   'deployment.environment': 'production',
   *   'service.namespace': 'checkout'
   * }
   * ```
   */
  scope?: CanvasScope;

  /**
   * Audit configuration for log coverage tracking
   *
   * When enabled, tracks which logs are routed vs orphaned,
   * detects silent nodes, and generates coverage reports.
   */
  audit?: CanvasAuditConfig;
}

// ============================================================================
// Extended Canvas Types (Canvas + PV Extensions)
// ============================================================================

/**
 * Extended text node with PV extensions
 */
export interface ExtendedCanvasTextNode extends CanvasTextNode {
  pv?: PVNodeExtension;
}

/**
 * Extended file node with PV extensions
 */
export interface ExtendedCanvasFileNode extends CanvasFileNode {
  pv?: PVNodeExtension;
}

/**
 * Extended link node with PV extensions
 */
export interface ExtendedCanvasLinkNode extends CanvasLinkNode {
  pv?: PVNodeExtension;
}

/**
 * Extended group node with PV extensions
 */
export interface ExtendedCanvasGroupNode extends CanvasGroupNode {
  pv?: PVNodeExtension;
}

/**
 * Union of all extended node types
 */
export type ExtendedCanvasNode =
  | ExtendedCanvasTextNode
  | ExtendedCanvasFileNode
  | ExtendedCanvasLinkNode
  | ExtendedCanvasGroupNode;

/**
 * Extended edge with PV extensions
 */
export interface ExtendedCanvasEdge extends CanvasEdge {
  pv?: PVEdgeExtension;
}

/**
 * Extended Canvas document with Principal View support
 *
 * This is the primary type for .canvas files used with the Principal View Framework.
 * It's fully compatible with standard JSON Canvas tools while supporting rich
 * visualization features when rendered in React Flow.
 */
export interface ExtendedCanvas extends Canvas {
  /** Nodes with optional PV extensions */
  nodes?: ExtendedCanvasNode[];
  /** Edges with optional PV extensions */
  edges?: ExtendedCanvasEdge[];
  /** Canvas-level PV configuration */
  pv?: PVCanvasExtension;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type guard for text nodes
 */
export function isTextNode(
  node: CanvasNode | ExtendedCanvasNode
): node is CanvasTextNode | ExtendedCanvasTextNode {
  return node.type === 'text';
}

/**
 * Type guard for file nodes
 */
export function isFileNode(
  node: CanvasNode | ExtendedCanvasNode
): node is CanvasFileNode | ExtendedCanvasFileNode {
  return node.type === 'file';
}

/**
 * Type guard for link nodes
 */
export function isLinkNode(
  node: CanvasNode | ExtendedCanvasNode
): node is CanvasLinkNode | ExtendedCanvasLinkNode {
  return node.type === 'link';
}

/**
 * Type guard for group nodes
 */
export function isGroupNode(
  node: CanvasNode | ExtendedCanvasNode
): node is CanvasGroupNode | ExtendedCanvasGroupNode {
  return node.type === 'group';
}

/**
 * Type guard for extended nodes (with PV extension)
 */
export function hasPVExtension(node: CanvasNode | ExtendedCanvasNode): node is ExtendedCanvasNode {
  return 'pv' in node && node.pv !== undefined;
}

/**
 * Color preset mapping
 */
export const CANVAS_COLOR_PRESETS: Record<number, string> = {
  1: '#ef4444', // red
  2: '#f97316', // orange
  3: '#eab308', // yellow
  4: '#22c55e', // green
  5: '#06b6d4', // cyan
  6: '#8b5cf6', // purple
};

/**
 * Resolve a canvas color to a hex string
 */
export function resolveCanvasColor(color: CanvasColor | undefined): string | undefined {
  if (color === undefined) return undefined;
  if (typeof color === 'number') {
    return CANVAS_COLOR_PRESETS[color];
  }
  return color;
}
