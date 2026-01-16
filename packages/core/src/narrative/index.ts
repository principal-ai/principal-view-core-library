/**
 * Narrative Template System
 *
 * Transform OpenTelemetry event streams into human-readable execution narratives.
 *
 * @module narrative
 */

// Types
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
} from './types';

// Scenario Matching
export { selectScenario, matchesCondition, hasEventMatching, computeAggregates, evaluateAssertion, getNestedValue, setNestedValue } from './scenario-matcher';

// Template Parsing
export { parseTemplate, evaluateExpression } from './template-parser';

// Template Rendering
export { renderNarrative } from './template-renderer';

// Validation
export type {
  NarrativeValidationContext,
  NarrativeViolation,
  NarrativeValidationResult,
} from './validator';
export { NarrativeValidator, createNarrativeValidator } from './validator';
