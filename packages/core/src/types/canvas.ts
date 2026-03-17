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
import type { JsonValue } from './index';

// ============================================================================
// JSON Canvas Spec Types (1.0)
// https://jsoncanvas.org/spec/1.0/
// ============================================================================

/**
 * Canvas color - either a hex string or preset number (1-6)
 * Presets: 1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple
 *
 * Note: Obsidian Canvas saves numeric presets as strings ("1"-"6"),
 * so we accept both number and string formats.
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

// PVActionPattern removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
// Superseded by OTEL event schemas (pv.events)

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

// PVEdgeActivation removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
// Edge animations now triggered by OTEL events, not action patterns

/**
 * OTEL node classification
 *
 * @deprecated Use `pv.nodeType` instead. Will be removed in a future version.
 * For example, use `nodeType: "scope"` instead of `otel.kind: "type"`.
 */
export type PVOtelKind = 'type' | 'service' | 'instance';

/**
 * OTEL category for type nodes
 *
 * @deprecated Use `pv.nodeType` instead. Will be removed in a future version.
 * For example, use `nodeType: "span-convention"` instead of `otel.category: "span"`.
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
 * OTel SpanKind values for span conventions
 *
 * Describes the relationship between a span and its remote parent/children.
 * Standard OTel concept - these values are fixed by the OTel spec.
 *
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/#spankind
 */
export type PVOtelSpanKind = 'UNSPECIFIED' | 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';

import type { OtelSpanKind } from './otel';

/**
 * OTEL span matching criteria
 *
 * Defines rules for matching incoming OTEL spans to this canvas node.
 * Multiple criteria are combined with AND logic (all must match).
 */
export interface PVOtelSpanMatch {
  /**
   * Match span name
   *
   * Supports:
   * - Exact string: "validateUser"
   * - Array of options: ["GET /api/users", "POST /api/users"]
   * - Glob patterns: "GET /api/*", "*.checkout"
   *
   * @example "validateUser"
   * @example ["GET /api/users", "POST /api/users"]
   * @example "*.checkout"
   */
  name?: string | string[];

  /**
   * Match span kind
   *
   * @example "SPAN_KIND_SERVER"
   * @example "SPAN_KIND_CLIENT"
   */
  kind?: OtelSpanKind | OtelSpanKind[];

  /**
   * Match span attributes
   *
   * All specified attributes must match (AND logic).
   * Supports exact values and wildcards.
   *
   * @example
   * {
   *   "http.route": "/api/checkout",
   *   "http.method": "POST"
   * }
   *
   * @example
   * {
   *   "db.system": "postgresql",
   *   "db.operation": "*"  // Any operation
   * }
   */
  attributes?: Record<string, string | string[]>;

  /**
   * Match span events
   *
   * If specified, span must contain at least one event matching these criteria.
   *
   * @example
   * {
   *   name: "exception",
   *   attributes: { "exception.type": "ValidationError" }
   * }
   */
  event?: {
    name?: string | string[];
    attributes?: Record<string, string | string[]>;
  };
}

/**
 * OTEL resource matching criteria
 *
 * Matches against OTEL resource attributes (service.name, deployment.environment, etc.).
 * Multiple attributes are combined with AND logic.
 */
export interface PVOtelResourceMatch {
  /**
   * Resource attribute patterns to match
   *
   * Supports:
   * - Exact match: { "service.name": "checkout-api" }
   * - Wildcard: { "service.name": "*-api" }
   * - Array of options: { "service.name": ["api-1", "api-2"] }
   *
   * @example
   * {
   *   "service.name": "checkout-service",
   *   "deployment.environment": "production"
   * }
   */
  [attributeKey: string]: string | string[];
}

/**
 * OTEL-specific node extension
 *
 * Used to mark nodes as representing OTEL concepts in architectural diagrams
 * and to define runtime span matching criteria.
 */
export interface PVOtelExtension {
  /**
   * Kind of OTEL node
   * - `type`: Represents a TypeScript type/interface (e.g., OtelLog, ResourceMatch)
   * - `service`: Represents a runtime service (e.g., LogRouter, AuditCollector)
   * - `instance`: Represents an actual runtime instance (e.g., a specific pod)
   *
   * @deprecated Use `pv.nodeType` instead. Will be removed in a future version.
   */
  kind?: PVOtelKind;

  /**
   * Category within OTEL domain
   *
   * @deprecated Use `pv.nodeType` instead. Will be removed in a future version.
   */
  category?: PVOtelCategory;

  /**
   * Span pattern for span convention nodes
   *
   * Defines the naming pattern for spans that match this convention.
   * Supports wildcards (e.g., "validate.*", "task.create").
   *
   * Used in architecture.spans.canvas to define the vocabulary of operations.
   *
   * @example "validate.*"
   * @example "task.create"
   * @example "http.request"
   */
  spanPattern?: string;

  /**
   * OTel SpanKind for span convention nodes
   *
   * Specifies what kind of span this convention represents.
   * Implementers should use this when creating spans.
   *
   * @example "SERVER" - for entry points handling incoming requests
   * @example "INTERNAL" - for internal operations
   * @example "CLIENT" - for outgoing calls to external services
   */
  spanKind?: PVOtelSpanKind;

  /**
   * Resource matching criteria
   *
   * When specified, this node will highlight when spans are received
   * from resources with matching attributes.
   */
  resourceMatch?: PVOtelResourceMatch;

  /**
   * Span matching criteria
   *
   * When specified, this node will highlight when spans matching
   * these criteria are received.
   */
  spanMatch?: PVOtelSpanMatch;

  /**
   * Files where this event is instrumented
   *
   * Specifies the exact file paths where this OTEL event should be emitted.
   * Used by coverage tools to validate that events are properly instrumented.
   *
   * @example ["src/app/api/auth/callback/route.ts"]
   */
  files?: string[];

  /**
   * Instrumentation scope that emits this event
   *
   * Identifies which tracer/instrumentation library creates this span or event.
   * Maps to `getTracer('scope-name')` in the instrumented code.
   *
   * Required when the parent node's status is 'approved' or 'implemented'.
   * Should match an entry in the library.yaml `owned-scopes` list.
   *
   * @example "terminal-activity"
   * @example "auth"
   * @example "quality-panel"
   */
  scope?: string;

  /** Allow additional properties */
  [key: string]: JsonValue | PVOtelResourceMatch | PVOtelSpanMatch | string[] | undefined;
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
  /**
   * Whether this attribute is intended for template display.
   * Set to false for telemetry/analytics-only attributes.
   * Defaults to true.
   */
  display?: boolean;
}

/**
 * Event schema definition for a specific event type
 */
export interface PVEventSchema {
  /** Event name (e.g., 'conversion.started', 'user.login') */
  name: string;
  /** Description of what this event represents */
  description: string;
  /** Expected attributes/fields for this event */
  attributes: Record<string, PVEventFieldSchema>;
}

/**
 * Node implementation status
 *
 * Tracks the lifecycle of a node from design to implementation.
 */
export type PVNodeStatus = 'draft' | 'approved' | 'implemented';

/**
 * Direction of boundary interaction
 */
export type PVBoundaryDirection = 'outbound' | 'inbound';

/**
 * Node query criteria for boundary resolution
 *
 * Defines what the corresponding node looks like in the external system's traces.
 * Used for cross-repo resolution and live trace correlation.
 */
export interface PVBoundaryNodeQuery {
  /** Event name to match in external system */
  'pv.event.name'?: string;
  /** Event namespace to match */
  'pv.event.namespace'?: string;
  /** Additional attribute matches */
  [key: string]: string | undefined;
}

/**
 * Boundary extension for nodes representing external system interfaces
 *
 * Boundaries define interaction points where control crosses system edges.
 * The `node` field specifies what the corresponding node looks like in the
 * external system, enabling cross-repo resolution and trace correlation.
 *
 * @example Outbound host callback
 * ```typescript
 * boundary: {
 *   direction: 'outbound',
 *   node: {
 *     'pv.event.name': 'host.batch-layout-initialized',
 *     'pv.event.namespace': 'collection-host'
 *   }
 * }
 * ```
 *
 * @example Inbound webhook
 * ```typescript
 * boundary: {
 *   direction: 'inbound',
 *   node: {
 *     'pv.event.name': 'webhook.repository-created',
 *     'pv.event.namespace': 'github'
 *   }
 * }
 * ```
 */
export interface PVBoundaryExtension {
  /**
   * Direction of the boundary interaction
   *
   * - `outbound`: This system calls out to external system
   * - `inbound`: External system calls into this system
   */
  direction: PVBoundaryDirection;

  /**
   * Node query for resolving the corresponding node in external system
   *
   * Specifies the expected shape of the matching node for registry lookup
   * and live trace correlation.
   */
  node: PVBoundaryNodeQuery;
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
   * Implementation status of this node
   *
   * - `draft`: Design/proposal phase (requires pv.otel.files if known, otherwise pv.references)
   * - `approved`: Design finalized, ready for implementation (requires pv.otel.files)
   * - `implemented`: Code exists with instrumentation (requires pv.otel.files and events in code)
   *
   * Used by coverage tools to determine validation requirements and coverage tracking.
   */
  status?: PVNodeStatus;

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

  /**
   * Origin of the code this node represents
   *
   * - `internal` (default): Code exists in this repository, file paths in `pv.otel.files` will be validated
   * - `external`: Code exists in external packages/libraries, file existence validation is skipped
   *
   * Use `external` for:
   * - npm dependencies (e.g., `@logfire/pydantic-ai`)
   * - Auto-instrumented events from observability libraries
   * - Third-party APIs or services
   * - Cross-repository references
   *
   * When `origin: "external"`, the `references` field is required to document
   * what external package or service this node represents.
   *
   * @example "external"
   */
  origin?: 'internal' | 'external';

  /**
   * Auxiliary references and related documentation
   *
   * Use for documenting related packages, external dependencies, or supplementary notes.
   * Required when `origin: "external"` to document what external package/service this represents.
   *
   * @example ["@logfire/pydantic-ai"] // external package reference
   * @example ["https://docs.pydantic.dev/logfire/"] // documentation link
   */
  references?: string[];

  /**
   * @deprecated Use `references` instead. Will be removed in a future version.
   */
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

  // actions removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
  // Use pv.event for structured event schema instead

  /**
   * Event schema for type-safe telemetry validation (inline definition)
   *
   * Defines the single event that this node emits during execution.
   * Used for compile-time and runtime validation of telemetry events.
   * Each node should emit exactly one event type.
   *
   * Use this for one-off events specific to this node.
   * For reusable events, use `eventRef` to reference library event schemas.
   *
   * @example
   * ```typescript
   * event: {
   *   name: 'conversion.started',
   *   description: 'Graph conversion begins',
   *   attributes: {
   *     'config.nodeTypes': { type: 'number', required: true },
   *     'config.edgeTypes': { type: 'number', required: true }
   *   }
   * }
   * ```
   */
  event?: PVEventSchema;

  /**
   * Reference to a library event schema
   *
   * References an event schema defined in library.yaml's `eventSchemas` section.
   * This promotes reusability and consistency across canvases.
   *
   * NOTE: A node cannot have both `event` and `eventRef` - choose one.
   * Validators will flag nodes that have both as an error.
   *
   * @example
   * ```typescript
   * eventRef: 'auth.callback.started'
   * ```
   */
  eventRef?: string;

  /** Data schema for typed fields */
  dataSchema?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      displayInLabel?: boolean;
      /**
       * Human-readable description of what this field represents.
       * Required in .otel.canvas files (enforced by validator).
       */
      description?: string;
      /**
       * Example value for UI previews, mock traces, and testing.
       * Required in .otel.canvas files (enforced by validator).
       */
      placeholder?: unknown;
    }
  >;
  /** Layout hints */
  layout?: {
    layer?: number;
    cluster?: string;
  };

  /**
   * Boundary extension for nodes representing external system interfaces
   *
   * When `nodeType` is `"boundary"`, this field defines the boundary details.
   * Boundary nodes represent interface points where control crosses system edges.
   * The `node` field specifies what the corresponding node looks like in the
   * external system, enabling cross-repo resolution and trace correlation.
   *
   * When a node has `nodeType: "boundary"`, it does NOT require `event` or `eventRef`
   * fields since the boundary is external and doesn't emit telemetry from our code.
   *
   * @example
   * ```typescript
   * {
   *   nodeType: "boundary",
   *   boundary: {
   *     direction: "outbound",
   *     node: {
   *       "pv.event.name": "host.batch-layout-initialized",
   *       "pv.event.namespace": "collection-host"
   *     }
   *   }
   * }
   * ```
   */
  boundary?: PVBoundaryExtension;
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
  // activatedBy removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
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
  // activatedBy removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
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

  /**
   * Associated markdown documentation file
   *
   * For .otel.canvas files, this field is required and must point to a markdown file
   * that documents the canvas. The path must be relative to the git repository root.
   *
   * @example ".principal-views/graph-converter-execution.md"
   * @example "docs/architecture/execution-flow.md"
   */
  markdown?: string;

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
 *
 * Supports:
 * - Hex strings: "#22c55e" or "#3f6"
 * - Numeric presets: 1-6
 * - Numeric string presets: "1"-"6" (Obsidian Canvas format)
 */
export function resolveCanvasColor(color: CanvasColor | undefined): string | undefined {
  if (color === undefined) return undefined;

  // Handle numeric presets
  if (typeof color === 'number') {
    return CANVAS_COLOR_PRESETS[color];
  }

  // Handle numeric string presets (from Obsidian Canvas)
  const numericValue = parseInt(color, 10);
  if (!isNaN(numericValue) && numericValue >= 1 && numericValue <= 6) {
    return CANVAS_COLOR_PRESETS[numericValue];
  }

  // Return hex strings as-is
  return color;
}
