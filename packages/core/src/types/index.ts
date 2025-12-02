/**
 * Core type definitions for the Visual Validation Framework
 * Based on GENERIC_GRAPH_PANEL_DESIGN.md
 */

// ============================================================================
// Graph Configuration Types
// ============================================================================

export interface GraphConfiguration {
  /** Metadata about the system being visualized */
  metadata: {
    name: string;
    version: string;
    description?: string;
  };

  /** Node type definitions */
  nodeTypes: Record<string, NodeTypeDefinition>;

  /** Edge type definitions */
  edgeTypes: Record<string, EdgeTypeDefinition>;

  /** Allowed connections between node types */
  allowedConnections: ConnectionRule[];

  /** Optional validation rules */
  validation?: ValidationRules;

  /** Display preferences */
  display?: DisplayConfiguration;
}

export interface NodeTypeDefinition {
  /** Visual representation */
  shape: 'circle' | 'rectangle' | 'hexagon' | 'diamond' | 'custom';
  icon?: string;
  color?: string;
  size?: { width: number; height: number };

  /** Data schema for this node type */
  dataSchema: {
    [field: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      required?: boolean;
      displayInLabel?: boolean;
    };
  };

  /** State definitions */
  states?: Record<
    string,
    {
      color?: string;
      icon?: string;
      label?: string;
    }
  >;

  /** Layout hints */
  layout?: {
    layer?: number;
    cluster?: string;
  };
}

export interface EdgeTypeDefinition {
  /** Visual style */
  style: 'solid' | 'dashed' | 'dotted' | 'animated';
  color?: string;
  width?: number;
  directed?: boolean;
  animated?: boolean;

  /** Edge label configuration */
  label?: {
    field?: string;
    position?: 'start' | 'middle' | 'end';
  };

  /** Animation configuration */
  animation?: {
    type: 'flow' | 'pulse' | 'particle' | 'glow';
    duration?: number;
    color?: string;
  };

  /** Data schema for edge metadata - fields to display when edge is clicked */
  dataSchema?: {
    [field: string]: {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      label?: string;
      displayInInfo?: boolean;
    };
  };
}

export interface ConnectionRule {
  from: string; // Node type
  to: string; // Node type
  via: string; // Edge type

  /** Optional constraints */
  constraints?: {
    maxInstances?: number;
    bidirectional?: boolean;
    exclusive?: boolean;
  };
}

export interface ValidationRules {
  /** State transition rules per node type */
  stateTransitions?: Record<
    string,
    Array<{
      from: string;
      to: string[];
    }>
  >;

  /** Global constraints */
  constraints?: Array<{
    id: string;
    description: string;
    check: string;
    severity: 'info' | 'warning' | 'error';
  }>;

  /** Cardinality rules */
  cardinality?: Record<
    string,
    {
      min?: number;
      max?: number;
    }
  >;
}

export interface DisplayConfiguration {
  /** Default layout algorithm */
  layout: 'hierarchical' | 'force-directed' | 'circular' | 'manual';

  /** Color scheme */
  theme?: {
    primary?: string;
    success?: string;
    warning?: string;
    danger?: string;
    info?: string;
  };

  /** Animation preferences */
  animations?: {
    enabled?: boolean;
    speed?: number;
  };
}

// ============================================================================
// Event System Types
// ============================================================================

export interface GraphEvent {
  /** Unique event ID */
  id: string;

  /** Event type (user-defined) */
  type: string;

  /** When this event occurred */
  timestamp: number;

  /** Event category */
  category: 'node' | 'edge' | 'state' | 'data' | 'system';

  /** Event operation */
  operation: 'create' | 'update' | 'delete' | 'animate';

  /** Event payload */
  payload: NodeEvent | EdgeEvent | StateEvent | DataEvent | SystemEvent;

  /** Whether this event was expected */
  expected?: boolean;

  /** Optional metadata */
  metadata?: {
    source?: string;
    tags?: string[];
    description?: string;
  };
}

export interface NodeEvent {
  operation: 'create' | 'update' | 'delete';
  nodeId: string;
  nodeType: string;
  data?: Record<string, any>;
  position?: { x: number; y: number };
}

export interface EdgeEvent {
  operation: 'create' | 'update' | 'delete' | 'animate';
  edgeId: string;
  edgeType: string;
  from: string;
  to: string;
  data?: Record<string, any>;
  animation?: {
    duration?: number;
    direction?: 'forward' | 'backward' | 'bidirectional';
  };
}

export interface StateEvent {
  nodeId: string;
  previousState?: string;
  newState: string;
  data?: Record<string, any>;
}

export interface DataEvent {
  targetId: string;
  targetType: 'node' | 'edge';
  updates: Record<string, any>;
}

export interface SystemEvent {
  action: 'reset' | 'pause' | 'resume' | 'snapshot';
  data?: any;
}

// ============================================================================
// Event Stream Protocol
// ============================================================================

export interface EventStream {
  /** Configuration (emitted once at start) */
  configuration: GraphConfiguration;

  /** Initial graph state (optional) */
  initialState?: {
    nodes: Array<{ id: string; type: string; data: any }>;
    edges: Array<{ id: string; type: string; from: string; to: string; data?: any }>;
  };

  /** Stream of events */
  events: GraphEvent[];

  /** Optional expected events for validation */
  expectedEvents?: Array<{
    type: string;
    constraints: Record<string, any>;
    timing?: { minTime: number; maxTime: number };
  }>;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
  warnings: Warning[];
  metrics: ValidationMetrics;
}

export interface Violation {
  id: string;
  severity: 'warning' | 'error';
  type: 'connection' | 'state' | 'cardinality' | 'constraint' | 'unexpected_event';
  description: string;
  event?: GraphEvent;
  context?: {
    nodeId?: string;
    edgeId?: string;
    rule?: string;
  };
}

export interface Warning {
  id: string;
  type: string;
  message: string;
  event?: GraphEvent;
}

export interface ValidationMetrics {
  totalEvents: number;
  validEvents: number;
  violations: number;
  warnings: number;
  unexpectedEvents: number;
  expectedEventsMissing: number;
}

// ============================================================================
// Graph State Types
// ============================================================================

export interface GraphState {
  nodes: Map<string, NodeState>;
  edges: Map<string, EdgeState>;
  configuration: GraphConfiguration;
}

export interface NodeState {
  id: string;
  type: string;
  data: Record<string, any>;
  state?: string;
  position?: { x: number; y: number };
  createdAt: number;
  updatedAt: number;
}

export interface EdgeState {
  id: string;
  type: string;
  from: string;
  to: string;
  data?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Metrics Types
// ============================================================================

export interface GraphMetrics {
  /** Node metrics */
  nodes: {
    total: number;
    byType: Record<string, number>;
    byState: Record<string, number>;
  };

  /** Edge metrics */
  edges: {
    total: number;
    byType: Record<string, number>;
  };

  /** Event metrics */
  events: {
    total: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
    rate: number;
  };

  /** Validation metrics */
  validation: {
    violations: number;
    warnings: number;
    unexpectedEvents: number;
    healthScore: number;
  };

  /** Performance metrics */
  performance: {
    renderTime: number;
    eventProcessingTime: number;
    layoutTime: number;
  };
}

// ============================================================================
// Path-Based Configuration Types (Milestone 1 & 2)
// ============================================================================

export * from './path-based-config';
