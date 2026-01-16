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
  ComponentLibrary,
  LogLevel,
} from './types';

// Export Canvas types and converter
export * from './types/canvas';
export { CanvasConverter } from './utils/CanvasConverter';
export type { ReactFlowNode, ReactFlowEdge } from './utils/CanvasConverter';

// Export YAML parsing (browser-compatible)
export { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';
export type { YamlParseResult } from './utils/YamlParser';

// Export narrative template system (browser-safe)
export {
  renderNarrative,
  parseTemplate,
  evaluateExpression,
  selectScenario,
  matchesCondition,
  hasEventMatching,
  computeAggregates,
  evaluateAssertion,
  getNestedValue,
  setNestedValue,
} from './narrative';
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
} from './narrative';

// NOTE: The following require Node.js dependencies and are NOT exported in browser bundle:
// - ConfigurationLoader, LibraryLoader (file system)
// - Rules engine (OpenTelemetry dependency)
// - Telemetry coverage, codegen (file system)
// Use the main entry point ('@principal-ai/principal-view-core') in Node.js environments
