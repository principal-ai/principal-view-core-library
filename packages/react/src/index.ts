/**
 * @principal-ai/visual-validation-react
 * React components for graph-based visual validation framework
 *
 * This library provides UI building blocks for creating graph visualization panels.
 * The actual "panel" application should be built separately using these components.
 */

// Re-export types from core
export type {
  GraphConfiguration,
  GraphEvent,
  GraphMetrics,
  Violation,
  Warning,
  ValidationResult,
  EventStream,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  ConnectionRule,
  NodeState,
  EdgeState,
} from '@principal-ai/visual-validation-core';

// Export components
export { GraphRenderer } from './components/GraphRenderer';
export type { GraphRendererProps } from './components/GraphRenderer';

export { EventLog } from './components/EventLog';
export type { EventLogProps } from './components/EventLog';

export { MetricsDashboard } from './components/MetricsDashboard';
export type { MetricsDashboardProps } from './components/MetricsDashboard';

// Export node/edge renderers
export { GenericNode } from './nodes/GenericNode';
export type { GenericNodeProps } from './nodes/GenericNode';

export { GenericEdge } from './edges/GenericEdge';
export type { GenericEdgeProps } from './edges/GenericEdge';
