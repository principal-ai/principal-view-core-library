/**
 * Workflow Template System
 *
 * Transform OpenTelemetry event streams into human-readable execution workflows.
 *
 * @module workflow
 */

// Types
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
} from './types';

// Scenario Matching
export { selectScenario, matchesCondition, hasEventMatching, computeAggregates, evaluateAssertion, getNestedValue, setNestedValue } from './scenario-matcher';

// Template Parsing
export { parseTemplate } from './template-parser';

// Template Rendering
export { renderWorkflow } from './template-renderer';

// Validation
export type {
  WorkflowValidationContext,
  WorkflowViolation,
  WorkflowValidationResult,
} from './validator';
export { WorkflowValidator, createWorkflowValidator } from './validator';
