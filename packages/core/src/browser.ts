/**
 * @principal-ai/principal-view-core/browser
 * Browser-safe exports (no Node.js dependencies)
 * Includes types, canvas utilities, YAML parsing, and narrative rendering
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

// Export types from ConfigurationLoader (interfaces only, no implementation)
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
export { parseTemplate, evaluateExpression } from './narrative/template-parser';
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

// NOTE: The following require Node.js dependencies and are NOT exported in browser bundle:
// - ConfigurationLoader, LibraryLoader (file system)
// - Rules engine (OpenTelemetry dependency)
// - Telemetry coverage, codegen (file system)
// Use the main entry point ('@principal-ai/principal-view-core') in Node.js environments
