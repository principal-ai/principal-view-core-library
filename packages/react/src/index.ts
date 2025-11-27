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
  ConfigurationFile,
  ConfigurationLoadResult,
} from '@principal-ai/visual-validation-core';

// Export components
export { GraphRenderer } from './components/GraphRenderer';
export type { GraphRendererProps, GraphRendererHandle, NodePositionChange, PendingChanges } from './components/GraphRenderer';

export { EventLog } from './components/EventLog';
export type { EventLogProps } from './components/EventLog';

export { MetricsDashboard } from './components/MetricsDashboard';
export type { MetricsDashboardProps } from './components/MetricsDashboard';

export { EdgeInfoPanel } from './components/EdgeInfoPanel';
export type { EdgeInfoPanelProps } from './components/EdgeInfoPanel';

export { NodeInfoPanel } from './components/NodeInfoPanel';
export type { NodeInfoPanelProps } from './components/NodeInfoPanel';

export { ConfigurationSelector } from './components/ConfigurationSelector';
export type { ConfigurationSelectorProps } from './components/ConfigurationSelector';

// Export node/edge renderers
export { GenericNode } from './nodes/GenericNode';
export type { GenericNodeProps } from './nodes/GenericNode';

export { CustomNode } from './nodes/CustomNode';
export type { CustomNodeData } from './nodes/CustomNode';

export { GenericEdge } from './edges/GenericEdge';
export type { GenericEdgeProps } from './edges/GenericEdge';

export { CustomEdge } from './edges/CustomEdge';
export type { CustomEdgeData } from './edges/CustomEdge';

// Export utilities
export { convertToXYFlowNodes, convertToXYFlowEdges, autoLayoutNodes } from './utils/graphConverter';
export type { EdgeStateWithHandles } from './utils/graphConverter';
export { Icon, resolveIcon } from './utils/iconResolver';
export type { IconProps } from './utils/iconResolver';
