/**
 * Workflow Template System Types
 *
 * Types for transforming OpenTelemetry event streams into human-readable
 * execution workflows based on OTEL canvas definitions.
 *
 * @see docs/NARRATIVE_TEMPLATES_DESIGN.md
 */

import type { OtelLog, OtelSpan, OtelAttributes } from '../types/otel';

/**
 * Combined OTEL signal type for workflow processing
 */
export type OtelSignal = OtelSpan | OtelLog | OtelEvent;

/**
 * Generic OTEL event (spans can also be treated as events)
 */
export interface OtelEvent {
  /** Event name (e.g., "conversion.started", "log.error") */
  name: string;

  /** Event timestamp */
  timestamp: string | number;

  /** Event type (span, log, metric) */
  type?: 'span' | 'log' | 'metric';

  /** Event attributes */
  attributes?: OtelAttributes;

  /** Trace correlation */
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;

  /** For logs: severity information */
  severityText?: string;
  severityNumber?: number;

  /** For logs: message body */
  body?: string | Record<string, unknown>;

  /** For spans: duration */
  duration?: number;
}

/**
 * Workflow template definition
 *
 * References an .otel.canvas file and defines how to render
 * execution events into human-readable workflows.
 */
export interface WorkflowTemplate {
  // Metadata
  /** Schema version (e.g., "1.0.0") */
  version: string;

  /** Reference to .otel.canvas file */
  canvas: string;

  /** Human-readable template name */
  name: string;

  /** Purpose of this workflow view */
  description: string;

  // Rendering configuration
  /** How to structure the workflow */
  mode: WorkflowMode;

  /** Scenario selection strategy */
  scenarioSelection: 'first-match' | 'manual';

  // OTEL signal integration
  /** Show logs associated with each span (span-tree mode) */
  showLogsPerSpan?: boolean;

  /** Mix spans/logs by timestamp (timeline mode) */
  interleaveSignals?: boolean;

  // Scenario definitions
  /** Mutually exclusive workflow scenarios */
  scenarios: WorkflowScenario[];

  // Formatting options
  /** Display formatting preferences */
  formatting?: FormattingOptions;
}

/**
 * Workflow rendering mode
 */
export type WorkflowMode =
  | 'span-tree' // Follow OTEL span hierarchy (uses parent-child relationships)
  | 'timeline'; // Chronological order (sorts all signals by timestamp)

/**
 * Workflow scenario definition
 *
 * Scenarios are mutually exclusive workflow templates selected
 * based on which events occurred during execution.
 */
export interface WorkflowScenario {
  // Identification
  /** Unique scenario identifier (kebab-case) */
  id: string;

  /** Selection priority (lower = higher priority, 1 = highest) */
  priority: number;

  /** What this scenario represents */
  description: string;

  // Matching logic
  /** Conditions that must be met for this scenario to match */
  condition: ScenarioCondition;

  // Template content
  /** Workflow template content */
  template: ScenarioTemplate;
}

/**
 * Scenario matching conditions
 */
export interface ScenarioCondition {
  // Event requirements
  /** Must have these events (supports glob patterns like "*.error") */
  requires?: string[];

  /** Must NOT have these events (supports glob patterns) */
  excludes?: string[];

  // Attribute assertions
  /** Assertions on event attributes */
  assertions?: Record<string, Assertion>;

  // Special conditions
  /** Always matches (use as fallback) */
  default?: boolean;

  /** Match if ANY requires condition met (instead of ALL) */
  any?: boolean;
}

/**
 * Attribute assertion operators
 */
export interface Assertion {
  /** Greater than */
  $gt?: number;

  /** Greater than or equal */
  $gte?: number;

  /** Less than */
  $lt?: number;

  /** Less than or equal */
  $lte?: number;

  /** Equal to */
  $eq?: string | number | boolean;

  /** Not equal to */
  $ne?: string | number | boolean;

  /** Attribute exists/doesn't exist */
  $exists?: boolean;

  /** Value in array */
  $in?: (string | number | boolean)[];

  /** Value not in array */
  $nin?: (string | number | boolean)[];
}

/**
 * Scenario template content
 */
export interface ScenarioTemplate {
  /** Opening text */
  introduction?: string;

  /** Event/log name -> template mapping */
  events?: Record<string, string>;

  /** Optional: separate log templates by severity */
  logs?: LogTemplates;

  /** Workflow flow steps */
  flow?: Array<string | FlowDirective>;

  /** Closing text */
  summary?: string;

  /** For span-tree mode: span rendering template */
  span?: string;

  /** For span-tree mode: how to recurse into children */
  children?: 'recurse' | 'ignore';
}

/**
 * Log templates by severity level
 */
export interface LogTemplates {
  /** Template for TRACE logs (severity 1-4) */
  trace?: string;

  /** Template for DEBUG logs (severity 5-8) */
  debug?: string;

  /** Template for INFO logs (severity 9-12) */
  info?: string;

  /** Template for WARN logs (severity 13-16) */
  warn?: string;

  /** Template for ERROR logs (severity 17-20) */
  error?: string;

  /** Template for FATAL logs (severity 21-24) */
  fatal?: string;

  /** Fallback for any log */
  default?: string;
}

/**
 * Flow directive for workflow generation
 */
export interface FlowDirective {
  /** Iterate over collection (e.g., "violations", "logs.filter(l => l.severityNumber >= 17)") */
  forEach?: string;

  /** Template for each item in iteration */
  template?: string;

  /** Conditional expression */
  if?: string;

  /** Template if condition true */
  then?: string;

  /** Template if condition false */
  else?: string;
}

/**
 * Formatting options for workflow rendering
 */
export interface FormattingOptions {
  /** Indentation per hierarchy level (default: "  ") */
  indentPerLevel?: string;

  /** Timestamp format (default: "HH:mm:ss.SSS") */
  timestampFormat?: string;

  /** Show timestamps in output (default: false) */
  showTimestamps?: boolean;

  /** Show duration information (default: true) */
  showDuration?: boolean;

  /** Show span IDs (useful for debugging) (default: false) */
  showSpanIds?: boolean;

  /** Which attributes to show: none, matched (from template), or all (default: 'matched') */
  showAttributes?: 'none' | 'matched' | 'all';
}

/**
 * Workflow rendering context
 *
 * Contains all data needed to render a workflow from events.
 */
export interface WorkflowContext {
  /** The workflow template being used */
  template: WorkflowTemplate;

  /** Selected scenario */
  scenario: WorkflowScenario;

  /** All collected events */
  events: OtelEvent[];

  /** Span tree (for span-tree mode) */
  spanTree?: SpanTreeNode[];

  /** Computed aggregate values */
  aggregates?: Record<string, unknown>;

  /** Formatting options */
  formatting: FormattingOptions;
}

/**
 * Span tree node for hierarchical rendering
 */
export interface SpanTreeNode {
  /** The span event */
  span: OtelEvent;

  /** Child spans */
  children: SpanTreeNode[];

  /** Associated logs (if showLogsPerSpan is true) */
  logs?: OtelEvent[];

  /** Depth in tree (for indentation) */
  depth: number;
}

/**
 * Workflow rendering result
 */
export interface WorkflowResult {
  /** Rendered workflow text */
  text: string;

  /** Scenario that was selected */
  scenarioId: string;

  /** Metadata about the rendering */
  metadata: {
    /** Number of events processed */
    eventCount: number;

    /** Number of spans */
    spanCount: number;

    /** Number of logs */
    logCount: number;

    /** Time range of events */
    timeRange?: {
      start: string | number;
      end: string | number;
    };

    /** Any errors encountered during rendering */
    errors?: string[];

    /** Any warnings encountered during rendering */
    warnings?: string[];
  };
}

/**
 * Scenario matching result
 */
export interface ScenarioMatchResult {
  /** The matched scenario */
  scenario: WorkflowScenario;

  /** Whether this was the default/fallback scenario */
  isDefault: boolean;

  /** All applicable scenarios (for manual selection UI) */
  applicableScenarios: WorkflowScenario[];

  /** Reasons why other scenarios didn't match */
  matchReasons?: Record<string, string>;
}
