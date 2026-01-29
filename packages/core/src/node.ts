/**
 * @principal-ai/principal-view-core/node
 * Node.js-specific exports (require Node.js runtime)
 *
 * This entry point includes all functionality that depends on Node.js modules
 * such as fs, path, glob, and other Node.js-only dependencies.
 *
 * The main entry point ('@principal-ai/principal-view-core') exports browser-safe
 * functionality that works in any environment. Use this /node entry point when you
 * need Node.js-specific utilities like buildFileTreeFromDirectory.
 */

// Export all types (safe in all environments)
export * from './types';

// Export core classes (Node.js processing)
export { EventProcessor } from './EventProcessor';
export type { ProcessingResult } from './EventProcessor';

export { ValidationEngine } from './ValidationEngine';

export { ConfigurationValidator } from './ConfigurationValidator';
export type {
  ConfigurationValidationError,
  ConfigurationValidationResult,
} from './ConfigurationValidator';

// Export helpers
export { GraphInstrumentationHelper } from './helpers/GraphInstrumentationHelper';

// Export path-based processing (Milestone 1 & 2)
export { PathBasedEventProcessor } from './PathBasedEventProcessor';
export type { LogEntry } from './PathBasedEventProcessor';

// Export path utilities
export { PathMatcher } from './utils/PathMatcher';
export { GraphConverter } from './utils/GraphConverter';

// Export Canvas types and converter
export * from './types/canvas';
export { CanvasConverter } from './utils/CanvasConverter';
export type { ReactFlowNode, ReactFlowEdge } from './utils/CanvasConverter';

// Export telemetry event validation
export { EventValidator, createValidatedEmitter, EventValidationError } from './telemetry/event-validator';
export type { ValidationResult } from './telemetry/event-validator';

// Export telemetry coverage analysis (re-exported from main for convenience)
export { analyzeCoverage } from './telemetry/coverage';
export type { CoverageMetrics, NodeCoverage } from './telemetry/coverage';

// Export FileTree builder utilities (Node.js only - file system operations)
export { buildFileTreeFromDirectory, createNodeFileReader } from './utils/FileTreeBuilder';

// Export code generation (Node.js only - file system operations)
export { generateTypes, TypeScriptGenerator, generatorRegistry } from './codegen/type-generator';
export type { CodegenOptions, CodegenResult, CodeGenerator } from './codegen/type-generator';

// Export trace-to-canvas conversion
export { traceToCanvas, traceToCanvasJson } from './utils/TraceToCanvas';
export type {
  TraceSpan,
  TraceExport,
  TraceToCanvasOptions,
  TraceCanvasResult,
} from './utils/TraceToCanvas';

// Export session management (Event Recording System)
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

// Export event recorder service
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

// Export configuration loading (Node.js only - file system)
export { ConfigurationLoader } from './ConfigurationLoader';
export type { ConfigurationFile, ConfigurationLoadResult } from './ConfigurationLoader';
export { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';
export type { YamlParseResult } from './utils/YamlParser';

// Export component library support (Node.js only - file system)
export { LibraryLoader } from './LibraryLoader';
export { LibraryConverter } from './utils/LibraryConverter';
export type { CreateNodeOptions, CreateEdgeOptions } from './utils/LibraryConverter';

// Re-export FileSystemAdapter from repository-abstraction
export type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
export { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';

// Export rules engine (Node.js only - OpenTelemetry dependencies)
export * from './rules';

// Export workflow template system (full system including Node.js validator)
export {
  renderWorkflow,
  parseTemplate,
  selectScenario,
  matchesCondition,
  hasEventMatching,
  computeAggregates,
  evaluateAssertion,
  getNestedValue,
  setNestedValue,
  createWorkflowValidator,
  WorkflowValidator,
} from './workflow';
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
  WorkflowValidationContext,
  WorkflowViolation,
  WorkflowValidationResult,
} from './workflow';

// Export canvas, workflow, and test trace discovery
export { CanvasDiscovery } from './discovery/CanvasDiscovery';
export type {
  DiscoveredCanvas,
  DiscoveredTestTrace,
  CanvasDiscoveryResult,
  DiscoveryOptions,
  CanvasType,
  TestTraceType,
  DiscoveredCanvasWithContent,
  DiscoveredTestTraceWithContent,
  CanvasDiscoveryResultWithContent,
} from './discovery/types';

// Export execution validation
export { ExecutionValidator, createExecutionValidator } from './execution/ExecutionValidator';
export type {
  ExecutionData,
  ValidationError,
  ExecutionValidationResult,
} from './execution/ExecutionValidator';

// Export execution loading (Node.js only - file system)
export { ExecutionLoader, createExecutionLoader } from './execution/ExecutionLoader';
export type {
  ExecutionFile,
  ExecutionLoadResult,
} from './execution/ExecutionLoader';
