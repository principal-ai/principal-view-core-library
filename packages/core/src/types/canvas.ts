/**
 * JSON Canvas Extended Types
 *
 * This module defines types that extend the JSON Canvas spec (https://jsoncanvas.org/spec/1.0/)
 * with Visual Validation Framework extensions.
 *
 * Design principle: All extensions are placed in a `vv` (Visual Validation) field,
 * which is ignored by standard canvas tools (like Obsidian) but used by our React Flow renderer.
 *
 * This allows:
 * 1. Authoring layouts visually in Obsidian or other canvas tools
 * 2. Rendering with rich animations and states in React Flow
 * 3. Round-trip editing without data loss
 */

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
// Visual Validation Extensions
// ============================================================================

/**
 * Animation types for edges
 */
export type VVAnimationType = 'flow' | 'pulse' | 'particle' | 'glow';

/**
 * Animation direction
 */
export type VVAnimationDirection = 'forward' | 'backward' | 'bidirectional';

/**
 * Node shape for rendering
 */
export type VVNodeShape = 'circle' | 'rectangle' | 'hexagon' | 'diamond' | 'custom';

/**
 * Edge line style
 */
export type VVEdgeStyle = 'solid' | 'dashed' | 'dotted' | 'animated';

/**
 * Log level for path-based association
 */
export type VVLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Action pattern for extracting events from logs
 */
export interface VVActionPattern {
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
export interface VVNodeState {
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
export interface VVEdgeActivation {
  /** Action that triggers this animation */
  action: string;
  /** Animation type */
  animation: VVAnimationType;
  /** Animation direction */
  direction?: VVAnimationDirection;
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * Visual Validation node extensions
 */
export interface VVNodeExtension {
  /** Custom node type identifier */
  nodeType: string;
  /** Visual shape */
  shape?: VVNodeShape;
  /** Icon identifier (Lucide icons) */
  icon?: string;
  /** Fill color (hex string) - takes priority over node.color */
  fill?: string;
  /** Stroke/border color (hex string) */
  stroke?: string;
  /** State definitions */
  states?: Record<string, VVNodeState>;
  /** Source file patterns for log association */
  sources?: string[];
  /** Action patterns for event extraction */
  actions?: VVActionPattern[];
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
 * Visual Validation edge extensions
 */
export interface VVEdgeExtension {
  /** Custom edge type identifier */
  edgeType: string;
  /** Line style */
  style?: VVEdgeStyle;
  /** Line width in pixels */
  width?: number;
  /** Default animation */
  animation?: {
    type: VVAnimationType;
    duration?: number;
    color?: string;
  };
  /** Activation triggers */
  activatedBy?: VVEdgeActivation[];
}

/**
 * Path-based configuration options
 */
export interface VVPathConfig {
  /** Project root for path normalization */
  projectRoot?: string;
  /** Enable source capture from stack traces */
  captureSource?: boolean;
  /** Enable action pattern matching */
  enableActionPatterns?: boolean;
  /** Minimum log level to process */
  logLevel?: VVLogLevel;
  /** Ignore logs without source info */
  ignoreUnsourced?: boolean;
}

/**
 * Display configuration
 */
export interface VVDisplayConfig {
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
 * Edge type definition (stored at canvas level)
 */
export interface VVEdgeTypeDefinition {
  /** Line style */
  style?: VVEdgeStyle;
  /** Line color */
  color?: string;
  /** Line width */
  width?: number;
  /** Whether edge is directed */
  directed?: boolean;
  /** Default animation */
  animation?: {
    type: VVAnimationType;
    duration?: number;
    color?: string;
  };
  /** Label configuration */
  label?: {
    field?: string;
    position?: 'start' | 'middle' | 'end';
  };
  /** Activation triggers */
  activatedBy?: VVEdgeActivation[];
}

/**
 * Canvas-level Visual Validation extensions
 */
export interface VVCanvasExtension {
  /** Schema version */
  version: string;
  /** Graph name */
  name: string;
  /** Description */
  description?: string;
  /** Edge type definitions (shared across edges) */
  edgeTypes?: Record<string, VVEdgeTypeDefinition>;
  /** Path-based configuration */
  pathConfig?: VVPathConfig;
  /** Display configuration */
  display?: VVDisplayConfig;
}

// ============================================================================
// Extended Canvas Types (Canvas + VV Extensions)
// ============================================================================

/**
 * Extended text node with VV extensions
 */
export interface ExtendedCanvasTextNode extends CanvasTextNode {
  vv?: VVNodeExtension;
}

/**
 * Extended file node with VV extensions
 */
export interface ExtendedCanvasFileNode extends CanvasFileNode {
  vv?: VVNodeExtension;
}

/**
 * Extended link node with VV extensions
 */
export interface ExtendedCanvasLinkNode extends CanvasLinkNode {
  vv?: VVNodeExtension;
}

/**
 * Extended group node with VV extensions
 */
export interface ExtendedCanvasGroupNode extends CanvasGroupNode {
  vv?: VVNodeExtension;
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
 * Extended edge with VV extensions
 */
export interface ExtendedCanvasEdge extends CanvasEdge {
  vv?: VVEdgeExtension;
}

/**
 * Extended Canvas document with Visual Validation support
 *
 * This is the primary type for .canvas files used with the Visual Validation Framework.
 * It's fully compatible with standard JSON Canvas tools while supporting rich
 * visualization features when rendered in React Flow.
 */
export interface ExtendedCanvas extends Canvas {
  /** Nodes with optional VV extensions */
  nodes?: ExtendedCanvasNode[];
  /** Edges with optional VV extensions */
  edges?: ExtendedCanvasEdge[];
  /** Canvas-level VV configuration */
  vv?: VVCanvasExtension;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type guard for text nodes
 */
export function isTextNode(node: CanvasNode | ExtendedCanvasNode): node is CanvasTextNode | ExtendedCanvasTextNode {
  return node.type === 'text';
}

/**
 * Type guard for file nodes
 */
export function isFileNode(node: CanvasNode | ExtendedCanvasNode): node is CanvasFileNode | ExtendedCanvasFileNode {
  return node.type === 'file';
}

/**
 * Type guard for link nodes
 */
export function isLinkNode(node: CanvasNode | ExtendedCanvasNode): node is CanvasLinkNode | ExtendedCanvasLinkNode {
  return node.type === 'link';
}

/**
 * Type guard for group nodes
 */
export function isGroupNode(node: CanvasNode | ExtendedCanvasNode): node is CanvasGroupNode | ExtendedCanvasGroupNode {
  return node.type === 'group';
}

/**
 * Type guard for extended nodes (with VV extension)
 */
export function hasVVExtension(node: CanvasNode | ExtendedCanvasNode): node is ExtendedCanvasNode {
  return 'vv' in node && node.vv !== undefined;
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
