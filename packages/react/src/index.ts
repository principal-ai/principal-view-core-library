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
  // Library types for loading .principal-views/library.yaml
  ComponentLibrary,
  LibraryNodeComponent,
  LibraryEdgeComponent,
} from '@principal-ai/principal-view-core';

// Export components
export { GraphRenderer } from './components/GraphRenderer';
export type {
  GraphRendererProps,
  GraphRendererHandle,
  NodePositionChange,
  PendingChanges,
} from './components/GraphRenderer';

export { MultiCanvasRenderer, mergeCanvases, parseNodeId } from './components/MultiCanvasRenderer';
export type {
  MultiCanvasRendererProps,
  MultiCanvasLayout,
  CanvasPlacement,
} from './components/MultiCanvasRenderer';

export { ConfigurationSelector } from './components/ConfigurationSelector';
export type { ConfigurationSelectorProps } from './components/ConfigurationSelector';

// Export node/edge renderers
export { GenericNode } from './nodes/GenericNode';
export type { GenericNodeProps } from './nodes/GenericNode';

export { CustomNode } from './nodes/CustomNode';
export type { CustomNodeData } from './nodes/CustomNode';

// Export OTEL node components
export {
  OtelSpanConventionNode,
  OtelEventNode,
  OtelScopeNode,
  OtelResourceNode,
  OtelBoundaryNode,
} from './nodes/otel';
export type {
  OtelSpanConventionNodeData,
  OtelEventNodeData,
  OtelScopeNodeData,
  OtelResourceNodeData,
  OtelBoundaryNodeData,
  WorkflowChip,
} from './nodes/otel';

export { GenericEdge } from './edges/GenericEdge';
export type { GenericEdgeProps } from './edges/GenericEdge';

export { CustomEdge } from './edges/CustomEdge';
export type { CustomEdgeData } from './edges/CustomEdge';

// Export tooltip component
export { NodeTooltip } from './components/NodeTooltip';
export type { NodeTooltipProps, OtelInfo } from './components/NodeTooltip';

// Export utilities
export {
  convertToXYFlowNodes,
  convertToXYFlowEdges,
} from './utils/graphConverter';
export type { EdgeStateWithHandles } from './utils/graphConverter';
export { Icon, resolveIcon } from './utils/iconResolver';
export type { IconProps } from './utils/iconResolver';
export {
  swapGraphOrientation,
  swapNodePositions,
  swapEdgeSides,
} from './utils/orientationUtils';
export { getCanvasBounds, getCanvasDisplaySize, calculateInitialViewport } from './utils/canvasBounds';
export type { CanvasBounds, Viewport } from './utils/canvasBounds';
