/**
 * @principal-ai/principal-view-core
 * Browser-safe exports (no Node.js dependencies)
 *
 * This is the main entry point for the package and only includes browser-compatible code.
 * Includes types, canvas utilities, YAML parsing, and workflow rendering.
 *
 * For Node.js-specific functionality (file system utilities, etc.), use:
 * import { ... } from '@principal-ai/principal-view-core/node'
 */

// Export essential types only
export type {
  GraphConfiguration,
  NodeState,
  EdgeState,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  Violation,
  GraphEvent,
  NodeEvent,
  EdgeEvent,
  StateEvent,
  ComponentLibrary,
  LogLevel,
  GraphMetrics,
  Warning,
  ValidationResult,
  EventStream,
  ConnectionRule,
  LibraryNodeComponent,
  LibraryEdgeComponent,
  ComponentActivityEvent,
  ComponentActionEvent,
  EdgeAnimationEvent,
  PathBasedEvent,
  JsonValue,
  JsonObject,
} from './types';

// Export path-based configuration types (browser-safe)
export type { PathBasedGraphConfiguration } from './types/path-based-config';

// Export configuration loading (browser-safe - uses FileSystemAdapter abstraction)
export { ConfigurationLoader } from './ConfigurationLoader';
export type { ConfigurationFile, ConfigurationLoadResult } from './ConfigurationLoader';

// Export Canvas types and converter
export * from './types/canvas';
export { CanvasConverter } from './utils/CanvasConverter';
export type { ReactFlowNode, ReactFlowEdge } from './utils/CanvasConverter';

// Export YAML parsing (browser-compatible)
export { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';
export type { YamlParseResult } from './utils/YamlParser';

// Export workflow template system (browser-safe)
// Import directly from files to avoid pulling in Node.js validator
export { renderWorkflow } from './workflow/template-renderer';
export { parseTemplate, ParsedTemplate } from './workflow/template-parser';
export type { TemplateSegment } from './workflow/template-parser';
export {
  selectScenario,
  matchesCondition,
  hasEventMatching,
  computeAggregates,
  evaluateAssertion,
  getNestedValue,
  setNestedValue,
} from './workflow/scenario-matcher';
export type {
  WorkflowTemplate,
  WorkflowScenario,
  WorkflowMode,
  ScenarioCondition,
  ScenarioTemplate,
  Assertion,
  FlowDirective,
  LogTemplates,
  FormattingOptions,
  OtelEvent,
  OtelSignal,
  WorkflowContext,
  WorkflowResult,
  ScenarioMatchResult,
  SpanTreeNode,
} from './workflow/types';

// Export OTEL types (OTLP data structures and helpers)
export type {
  // OTLP data structures (JSON format)
  OtelExportTraceServiceRequest,
  OtelResourceSpansData,
  OtelScopeSpans,
  OtelSpanData,
  OtelResourceData,
  OtelKeyValue,
  OtelAnyValue,
  OtelSpanEvent,
  OtelLink,
  OtelSpanStatus,
  OtelInstrumentationScope,
  // Application-level types
  TraceInfo,
  WorkflowMatchInfo,
  // Simplified types (backward compatible)
  OtelAttributes,
  OtelAttributeValue,
  OtelLog,
  OtelSpan,
  OtelResource,
  OtelSeverity,
  OtelSeverityText,
  OtelSeverityNumber,
} from './types/otel';

// Export OTEL helper functions
export {
  getAttributeStringValue,
  findAttribute,
  getAttributeValue,
  flattenResourceAttributes,
  parseNanoTime,
  getSpanDuration,
  isErrorSeverity,
  isWarnSeverity,
} from './types/otel';

// Export trace aggregation utilities
export { groupSpansByTrace } from './utils/traceAggregation';

// Export span matcher
export { SpanMatcher } from './matchers/SpanMatcher';
export type { SpanMatchResult } from './matchers/SpanMatcher';

// Export canvas, workflow, and test trace discovery (browser-safe)
export { CanvasDiscovery } from './discovery/CanvasDiscovery';
export type {
  DiscoveredCanvas,
  DiscoveredTestTrace,
  DiscoveredWorkflow,
  DiscoveredStoryboard,
  CanvasDiscoveryResult,
  DiscoveryOptions,
  CanvasType,
  TestTraceType,
  DiscoveredCanvasWithContent,
  DiscoveredTestTraceWithContent,
  DiscoveredWorkflowWithContent,
  DiscoveredStoryboardWithContent,
  CanvasDiscoveryResultWithContent,
} from './discovery/types';

// Export execution validation (browser-safe - no Node.js dependencies)
export { ExecutionValidator, createExecutionValidator } from './execution/ExecutionValidator';
export type {
  ExecutionData,
  ValidationError,
  ExecutionValidationResult,
} from './execution/ExecutionValidator';

// Export telemetry coverage analysis (browser-safe - uses FileTree abstraction)
export { analyzeCoverage } from './telemetry/coverage';
export type { CoverageMetrics, NodeCoverage } from './telemetry/coverage';

// Export path-based processing (browser-safe - Milestone 1 & 2)
export { PathBasedEventProcessor } from './PathBasedEventProcessor';
export type { LogEntry } from './PathBasedEventProcessor';

// Export session management (browser-safe - Event Recording System)
export { SessionManager } from './SessionManager';
export type {
  SessionStatus,
  SessionResult,
  SessionMetadata,
  EventSession,
  CreateSessionOptions,
  EndSessionOptions,
  SessionChangeCallback,
  SessionManagerConfig,
} from './SessionManager';

// Export event recorder service (browser-safe)
export { EventRecorderService } from './EventRecorderService';
export type {
  ProtocolMessageType,
  ProtocolMessage,
  SessionStartMessage,
  SessionEndMessage,
  LogMessage,
  LogBatchMessage,
  PingMessage,
  PongMessage,
  ErrorMessage,
  AckMessage,
  IncomingMessage,
  OutgoingMessage,
  RecordingMode,
  EventCallback,
  EventBatchCallback,
  ConnectionState,
  EventRecorderServiceConfig,
} from './EventRecorderService';

// Export component library support (browser-safe - uses FileSystemAdapter abstraction)
export { LibraryLoader } from './LibraryLoader';
export { LibraryConverter } from './utils/LibraryConverter';
export type { CreateNodeOptions, CreateEdgeOptions } from './utils/LibraryConverter';

// Export storyboard context types and builder (browser-safe)
export type {
  StoryboardReference,
  WorkflowReference,
  ScenarioReference,
  StoryboardContextSliceData,
  EventNodeMap,
  BuildStoryboardContextOptions,
} from './storyboard';
export {
  buildStoryboardContext,
  buildNodeSourcesMap,
  buildEventNodeMap,
  getNodeEventName,
  resolveScenarioNodeIds,
  resolveWorkflowNodeIds,
  findNodesMatchingEventPattern,
  getAllNodeIds,
} from './storyboard';

// Re-export FileSystemAdapter type from repository-abstraction (for custom adapter implementations)
export type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
export { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';

// NOTE: The following require Node.js dependencies and are NOT exported in the main bundle.
// Use '@principal-ai/principal-view-core/node' for Node.js-specific functionality:
//
// - EventProcessor, ValidationEngine, ConfigurationValidator (Node.js processing)
// - GraphInstrumentationHelper (Node.js utilities)
// - PathMatcher, GraphConverter (Node.js utilities)
// - EventValidator, createValidatedEmitter (Node.js telemetry)
// - generateTypes, TypeScriptGenerator, generatorRegistry (code generation - file system)
// - traceToCanvas, traceToCanvasJson (trace utilities)
// - Rules engine (OpenTelemetry dependencies)
// - NarrativeValidator, createNarrativeValidator (Node.js validator)
// - ExecutionLoader, createExecutionLoader (file system loader)
//
// For building FileTree from filesystem, use FilesystemService from @principal-ai/codebase-composition:
// import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';
// const service = new FilesystemService(new NodeFileSystemAdapter());
// const fileTree = await service.buildFileSystemTreeFromPath(rootDir);
