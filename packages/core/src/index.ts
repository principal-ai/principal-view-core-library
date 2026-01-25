/**
 * @principal-ai/principal-view-core
 * Browser-safe exports (no Node.js dependencies)
 *
 * This is the main entry point for the package and only includes browser-compatible code.
 * Includes types, canvas utilities, YAML parsing, and narrative rendering.
 *
 * BREAKING CHANGE (v0.12.0):
 * The main export now only includes browser-safe functionality.
 *
 * For Node.js-specific functionality (file system, code generation, rules engine, etc.), use:
 * import { ... } from '@principal-ai/principal-view-core/node'
 *
 * For explicit browser usage (same as main export):
 * import { ... } from '@principal-ai/principal-view-core/browser'
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

// Export narrative template system (browser-safe)
// Import directly from files to avoid pulling in Node.js validator
export { renderNarrative } from './narrative/template-renderer';
export { parseTemplate } from './narrative/template-parser';
export {
  selectScenario,
  matchesCondition,
  hasEventMatching,
  computeAggregates,
  evaluateAssertion,
  getNestedValue,
  setNestedValue,
} from './narrative/scenario-matcher';
export type {
  NarrativeTemplate,
  NarrativeScenario,
  NarrativeMode,
  ScenarioCondition,
  ScenarioTemplate,
  Assertion,
  FlowDirective,
  LogTemplates,
  FormattingOptions,
  OtelEvent,
  OtelSignal,
  NarrativeContext,
  NarrativeResult,
  ScenarioMatchResult,
  SpanTreeNode,
} from './narrative/types';

// Export OTEL types
export type {
  OtelAttributes,
  OtelAttributeValue,
  OtelLog,
  OtelSpan,
  OtelResource,
  OtelSeverity,
  OtelSeverityText,
  OtelSeverityNumber,
  OtelSpanKind,
  OtelSpanStatus,
} from './types/otel';

// Export canvas and execution discovery (browser-safe)
export { CanvasDiscovery } from './discovery/CanvasDiscovery';
export type {
  DiscoveredCanvas,
  DiscoveredExecution,
  CanvasDiscoveryResult,
  DiscoveryOptions,
  CanvasType,
  ExecutionType,
  DiscoveredCanvasWithContent,
  DiscoveredExecutionWithContent,
  CanvasDiscoveryResultWithContent,
} from './discovery/types';

// Export execution validation (browser-safe - no Node.js dependencies)
export { ExecutionValidator, createExecutionValidator } from './execution/ExecutionValidator';
export type {
  ExecutionData,
  ValidationError,
  ExecutionValidationResult,
} from './execution/ExecutionValidator';

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
// - analyzeCoverage (file system - uses fs/promises, path, glob)
// - generateTypes, TypeScriptGenerator, generatorRegistry (code generation - file system)
// - traceToCanvas, traceToCanvasJson (trace utilities)
// - Rules engine (OpenTelemetry dependencies)
// - NarrativeValidator, createNarrativeValidator (Node.js validator)
// - ExecutionLoader, createExecutionLoader (file system loader)
//
// Example:
// import { analyzeCoverage, NarrativeValidator } from '@principal-ai/principal-view-core/node';
