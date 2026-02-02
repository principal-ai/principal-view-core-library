/**
 * Component Library Types
 *
 * Defines the structure for component libraries (.yaml/.json files)
 * that contain reusable node and edge type definitions.
 *
 * Libraries are separate from canvas files:
 * - Canvas files (.canvas) = actual graph layouts that get rendered
 * - Library files (.yaml/.json) = collections of reusable type definitions
 *
 * When a user adds a component from the library to a canvas,
 * the type definition gets embedded into the node's `pv` field.
 */

import type {
  PVNodeShape,
  PVEdgeStyle,
  PVAnimationType,
  // PVActionPattern removed - see docs/LEGACY_PATH_BASED_PATTERNS.md
  PVNodeState,
  PVEventSchema,
} from './canvas';

// ============================================================================
// Library Component Types
// ============================================================================

/**
 * A reusable node component definition in the library.
 * Contains all the information needed to create a canvas node.
 */
export interface LibraryNodeComponent {
  /** Human-readable description for the library UI (required) */
  description: string;

  /** Tags for filtering/categorizing in the library UI */
  tags?: string[];

  /** Default label/text for the node when added to canvas */
  defaultLabel?: string;

  /** Visual shape */
  shape: PVNodeShape;

  /** Icon identifier (Lucide icons) */
  icon?: string;

  /** Default color */
  color?: string;

  /** Default size */
  size?: { width: number; height: number };

  /** State definitions */
  states?: Record<string, PVNodeState>;

  /** Source file patterns for log association */
  sources?: string[];

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
 * A reusable edge type definition in the library.
 */
export interface LibraryEdgeComponent {
  /** Human-readable description for the library UI */
  description?: string;

  /** Tags for filtering/categorizing in the library UI */
  tags?: string[];

  /** Line style */
  style: PVEdgeStyle;

  /** Line color */
  color?: string;

  /** Line width in pixels */
  width?: number;

  /** Whether edge is directed (has arrow) */
  directed?: boolean;

  /** Default animation */
  animation?: {
    type: PVAnimationType;
    duration?: number;
    color?: string;
  };

  /** Label configuration */
  label?: {
    field?: string;
    position?: 'start' | 'middle' | 'end';
  };
}

/**
 * Connection rule template for the library.
 * Defines which node types can connect via which edge types.
 */
export interface LibraryConnectionRule {
  /** Source node type (key from nodeComponents) */
  from: string;

  /** Target node type (key from nodeComponents) */
  to: string;

  /** Edge type to use (key from edgeComponents) */
  via: string;

  /** Optional constraints */
  constraints?: {
    maxInstances?: number;
    bidirectional?: boolean;
    exclusive?: boolean;
  };
}

// ============================================================================
// Component Library Root Type
// ============================================================================

/**
 * Root type for a component library file (.yaml or .json).
 *
 * Example library.yaml:
 * ```yaml
 * version: "1.0.0"
 * name: "My Project Components"
 * description: "Reusable components for my microservices project"
 *
 * nodeComponents:
 *   postgres-db:
 *     description: "PostgreSQL database"
 *     tags: ["database", "storage"]
 *     shape: circle
 *     icon: Database
 *     color: "#336791"
 *     states:
 *       connected: { color: "#22c55e", label: "Connected" }
 *       disconnected: { color: "#ef4444", label: "Disconnected" }
 *     sources:
 *       - "src/database/**\/*.ts"
 *
 *   rest-api:
 *     description: "REST API endpoint"
 *     tags: ["api", "http"]
 *     shape: rectangle
 *     icon: Globe
 *     color: "#4A90E2"
 *     sources:
 *       - "src/api/**\/*.ts"
 *
 * edgeComponents:
 *   http-request:
 *     description: "HTTP request between services"
 *     tags: ["http"]
 *     style: solid
 *     color: "#4A90E2"
 *     directed: true
 *     animation:
 *       type: flow
 *       duration: 1000
 *
 * connectionRules:
 *   - from: rest-api
 *     to: postgres-db
 *     via: db-query
 * ```
 */
export interface ComponentLibrary {
  /** Library schema version */
  version: string;

  /** Library name */
  name: string;

  /** Library description */
  description?: string;

  /**
   * Project-level OTEL resource attributes
   *
   * Defines resource attributes that should be attached to all telemetry
   * from this project. These attributes are used for:
   * - Trace routing in dev tools
   * - Service identification
   * - Environment/deployment context
   *
   * Common attributes:
   * - service.name: Service identifier
   * - service.version: Service version
   * - dev.server.url: Development server path (for routing to correct dev workspace)
   * - deployment.environment: Environment (dev/staging/prod)
   *
   * @example
   * ```yaml
   * resources:
   *   service.name: "web-ade"
   *   service.version: "1.0.0"
   *   dev.server.url: "/Users/griever/Developer/web-ade/web-ade"
   *   deployment.environment: "development"
   * ```
   */
  resources?: Record<string, string>;

  /** Reusable node component definitions */
  nodeComponents: Record<string, LibraryNodeComponent>;

  /** Reusable edge type definitions */
  edgeComponents: Record<string, LibraryEdgeComponent>;

  /**
   * Reusable event schema definitions
   *
   * Defines event schemas that can be referenced by canvas nodes via `pv.eventRef`.
   * This promotes reusability and consistency across canvases.
   *
   * @example
   * ```yaml
   * eventSchemas:
   *   auth.callback.started:
   *     description: "Authentication callback initiated"
   *     attributes:
   *       session.id:
   *         type: string
   *         required: true
   *         description: "Session identifier"
   * ```
   */
  eventSchemas?: Record<string, Omit<PVEventSchema, 'name'>>;

  /** Optional connection rules (which nodes can connect via which edges) */
  connectionRules?: LibraryConnectionRule[];
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Result of loading a component library
 */
export interface LibraryLoadResult {
  /** Whether the library was loaded successfully */
  success: boolean;

  /** The loaded library (if successful) */
  library?: ComponentLibrary;

  /** Error message (if failed) */
  error?: string;

  /** Path the library was loaded from */
  path: string;
}

/**
 * Options for the library loader
 */
export interface LibraryLoaderOptions {
  /** Base directory to search for library files */
  baseDir?: string;

  /** Custom library file name (default: "library.yaml" or "library.json") */
  fileName?: string;
}
