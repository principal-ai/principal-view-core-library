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

export { SequenceDiagramRenderer } from './components/SequenceDiagramRenderer';
export type { SequenceDiagramRendererProps } from './components/SequenceDiagramRenderer';

export { useSequenceLayout } from './hooks/useSequenceLayout';
export type {
  SequenceEvent,
  SequenceEdge,
  Swimlane,
  NamespaceStrategy,
  UseSequenceLayoutOptions,
  UseSequenceLayoutResult,
} from './hooks/useSequenceLayout';

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

// ELK layout utilities for circuit-board style edge routing
export { computeElkLayout, createElkLayouter } from './utils/elkLayout';
export type { ElkLayoutOptions, ElkLayoutResult, ElkRoutingStyle } from './utils/elkLayout';
export { useElkLayout, applyElkPathsToEdges } from './hooks/useElkLayout';
export type { UseElkLayoutOptions, UseElkLayoutResult } from './hooks/useElkLayout';

// Dashboard components for rendering metrics from dashboard definition files
export {
  DashboardRenderer,
  MetricPanel,
  MetricCard,
  LineChart,
  BarChart,
  SourceLink,
  TimeRangeSelector,
  MockDataProvider,
  createMockDataProvider,
} from './components/dashboard';
export type {
  // Dashboard definition types
  DashboardDefinition,
  MetricDefinition,
  MetricType,
  MetricSource,
  MetricQuery,
  Derivation,
  TimeGroup,
  AlertDefinition,
  MetricDisplay,
  DisplayComponent,
  DashboardLayout,
  DashboardRow,
  PanelPlacement,
  // Time range types
  TimeRangePreset,
  TimeRange,
  RefreshInterval,
  TimeRangeConfig,
  // Mock data types
  MockMetricData,
  TimeSeriesPoint,
  HistogramData,
  // Runtime types
  MetricData,
  DataProvider,
  // Component props
  DashboardRendererProps,
  MetricPanelProps,
  MetricCardProps,
  LineChartProps,
  BarChartProps,
  SourceLinkProps,
  TimeRangeSelectorProps,
} from './components/dashboard';

// State View components for event-driven state visualization
export { PipelineView, useStateView } from './components/state-view';
export type {
  // Core types
  StateEvent,
  EventSource,
  StateReducer,
  StateDiff,
  TransitionDefinition,
  ActiveAnimation,
  AnimationType,
  ReplayControls,
  StateViewDefinition,
  // Pipeline view types
  PipelineState,
  PipelineStage,
  PipelineRepoState,
  PipelineEvent,
  PipelineEventType,
  // Activity view types
  ActivityState,
  RoomState,
  ActivityEvent,
  ActivityEventType,
  // Quota view types
  QuotaDistributionState,
  UserQuotaState,
  QuotaEvent,
  QuotaEventType,
  // Hook types
  UseStateViewOptions,
  UseStateViewResult,
  // Component props
  PipelineViewProps,
} from './components/state-view';
