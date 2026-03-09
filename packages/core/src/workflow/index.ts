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
  ScenarioOutcomeType,
  WorkflowMode,
  ScenarioTemplate,
  FlowDirective,
  LogTemplates,
  FormattingOptions,
  OtelEvent,
  OtelSignal,
  WorkflowContext,
  WorkflowResult,
  ScenarioMatchResult,
  ScenarioMatchDetail,
  EnhancedScenarioMatchResult,
  WorkflowMatch,
  SpanTreeNode,
} from './types';

// Scenario Matching
export { selectScenario, getRequiredEvents, hasEventMatching, computeAggregates, getNestedValue, setNestedValue } from './scenario-matcher';

// Template Parsing
export { parseTemplate, ParsedTemplate } from './template-parser';
export type { TemplateSegment, TemplateContext, TemplateValue, TemplateData } from './template-parser';

// Template Rendering
export { renderWorkflow, renderEventTemplate } from './template-renderer';

// Validation
export type {
  WorkflowValidationContext,
  WorkflowViolation,
  WorkflowValidationResult,
} from './validator';
export { WorkflowValidator, createWorkflowValidator } from './validator';
