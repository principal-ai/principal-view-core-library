/**
 * Template Renderer
 *
 * Renders workflow templates into human-readable text using
 * OTEL events, selected scenarios, and template expressions.
 */

import type {
  WorkflowTemplate,
  WorkflowScenario,
  OtelEvent,
  WorkflowResult,
  WorkflowContext,
  SpanTreeNode,
  FlowDirective,
  FormattingOptions,
} from './types';
import { parseTemplate, type TemplateContext } from './template-parser';
import { selectScenario, computeAggregates } from './scenario-matcher';

/**
 * Render a workflow from a template and events
 *
 * Main entry point for workflow generation.
 *
 * @param template - Workflow template
 * @param events - Collected OTEL events
 * @returns Rendered workflow
 */
export function renderWorkflow(template: WorkflowTemplate, events: OtelEvent[]): WorkflowResult {
  // Compute aggregates for scenario matching and templates
  const aggregates = computeAggregates(events);

  // Select scenario
  const matchResult = selectScenario(template, events);

  // Build context
  const context: WorkflowContext = {
    template,
    scenario: matchResult.scenario,
    events,
    aggregates,
    formatting: {
      indentPerLevel: '  ',
      timestampFormat: 'HH:mm:ss.SSS',
      showTimestamps: false,
      showDuration: true,
      showSpanIds: false,
      showAttributes: 'matched',
      ...template.formatting,
    },
  };

  // Build span tree if needed
  if (template.mode === 'span-tree') {
    context.spanTree = buildSpanTree(events, template.showLogsPerSpan);
  }

  // Render workflow
  const text = renderScenario(context);

  // Build metadata
  const spans = events.filter((e) => e.type === 'span');
  const logs = events.filter((e) => e.type === 'log');
  const timestamps = events.map((e) => normalizeTimestamp(e.timestamp)).filter((t) => !isNaN(t));

  return {
    text,
    scenarioId: matchResult.scenario.id,
    metadata: {
      eventCount: events.length,
      spanCount: spans.length,
      logCount: logs.length,
      timeRange:
        timestamps.length > 0
          ? {
              start: Math.min(...timestamps),
              end: Math.max(...timestamps),
            }
          : undefined,
    },
  };
}

/**
 * Render a scenario template
 *
 * @param context - Workflow context
 * @returns Rendered text
 */
function renderScenario(context: WorkflowContext): string {
  const { scenario, template, events, aggregates, formatting } = context;
  const parts: string[] = [];

  // Create template evaluation context (merge aggregates and events)
  const evalContext: Record<string, unknown> = {
    ...aggregates,
    events,
    totalEvents: events.length,
  };

  // Introduction
  if (scenario.template.introduction) {
    parts.push(parseTemplate(scenario.template.introduction, evalContext as TemplateContext).toString());
    parts.push(''); // Blank line
  }

  // Main content based on mode
  switch (template.mode) {
    case 'span-tree':
      if (context.spanTree) {
        parts.push(renderSpanTree(context.spanTree, scenario, evalContext, formatting));
      }
      break;

    case 'timeline':
      parts.push(renderTimeline(events, scenario, evalContext, formatting));
      break;
  }

  // Flow directives
  if (scenario.template.flow) {
    parts.push(renderFlow(scenario.template.flow, evalContext));
  }

  // Summary
  if (scenario.template.summary) {
    if (parts.length > 0) {
      parts.push(''); // Blank line before summary
    }
    parts.push(parseTemplate(scenario.template.summary, evalContext as TemplateContext).toString());
  }

  return parts.join('\n');
}

/**
 * Render span tree (hierarchical view)
 *
 * @param tree - Span tree nodes
 * @param scenario - Scenario being rendered
 * @param context - Evaluation context
 * @param formatting - Formatting options
 * @returns Rendered tree text
 */
function renderSpanTree(
  tree: SpanTreeNode[],
  scenario: WorkflowScenario,
  context: Record<string, unknown>,
  formatting: FormattingOptions
): string {
  const parts: string[] = [];

  for (const node of tree) {
    const indent = (formatting.indentPerLevel || '  ').repeat(node.depth);

    // Build context with span attributes as nested objects for Handlebars
    const eventContext = { ...context };

    // Convert flat dot-notation keys to nested objects
    if (node.span.attributes) {
      for (const [key, value] of Object.entries(node.span.attributes)) {
        if (key.includes('.')) {
          // Nested key: convert "skill.name" -> { skill: { name: value } }
          const parts = key.split('.');
          let current: Record<string, unknown> = eventContext;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
              current[parts[i]] = {};
            }
            current = current[parts[i]] as Record<string, unknown>;
          }
          current[parts[parts.length - 1]] = value;
        } else {
          // Simple key
          eventContext[key] = value;
        }
      }
    }

    eventContext.span = node.span;

    // Render span
    if (scenario.template.span) {
      const spanText = parseTemplate(scenario.template.span, eventContext as TemplateContext).toString();
      parts.push(indent + spanText);
    } else if (scenario.template.events?.[node.span.name]) {
      const eventTemplate = scenario.template.events[node.span.name];
      const eventText = parseTemplate(eventTemplate, eventContext as TemplateContext).toString();
      parts.push(indent + eventText);
    } else {
      // Default span rendering
      parts.push(indent + `→ ${node.span.name}`);
    }

    // Render associated logs
    if (node.logs && node.logs.length > 0) {
      for (const log of node.logs) {
        const logContext = { ...context, log };
        const logText = renderLog(log, scenario, logContext, formatting);
        if (logText) {
          parts.push(indent + (formatting.indentPerLevel || '  ') + logText);
        }
      }
    }

    // Render children
    if (node.children.length > 0 && scenario.template.children !== 'ignore') {
      parts.push(renderSpanTree(node.children, scenario, context, formatting));
    }
  }

  return parts.join('\n');
}

/**
 * Render timeline (chronological view)
 *
 * @param events - Events in chronological order
 * @param scenario - Scenario being rendered
 * @param context - Evaluation context
 * @param formatting - Formatting options
 * @returns Rendered timeline text
 */
function renderTimeline(
  events: OtelEvent[],
  scenario: WorkflowScenario,
  context: Record<string, unknown>,
  formatting: FormattingOptions
): string {
  const parts: string[] = [];

  // Sort events by timestamp
  const sorted = [...events].sort((a, b) => {
    const aTime = normalizeTimestamp(a.timestamp);
    const bTime = normalizeTimestamp(b.timestamp);
    return aTime - bTime;
  });

  for (const event of sorted) {
    // Build context with event attributes as nested objects for Handlebars
    const eventContext = { ...context };

    // Convert flat dot-notation keys to nested objects
    if (event.attributes) {
      for (const [key, value] of Object.entries(event.attributes)) {
        if (key.includes('.')) {
          // Nested key: convert "skill.name" -> { skill: { name: value } }
          const parts = key.split('.');
          let current: Record<string, unknown> = eventContext;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
              current[parts[i]] = {};
            }
            current = current[parts[i]] as Record<string, unknown>;
          }
          current[parts[parts.length - 1]] = value;
        } else {
          // Simple key
          eventContext[key] = value;
        }
      }
    }

    let eventText: string | undefined;

    if (event.type === 'log') {
      eventText = renderLog(event, scenario, { ...eventContext, log: event }, formatting);
    } else if (scenario.template.events?.[event.name]) {
      eventText = parseTemplate(scenario.template.events[event.name], eventContext as TemplateContext).toString();
    }

    if (eventText) {
      if (formatting.showTimestamps) {
        const timestamp = formatTimestamp(event.timestamp, formatting.timestampFormat || 'HH:mm:ss.SSS');
        parts.push(`[${timestamp}] ${eventText}`);
      } else {
        parts.push(eventText);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Render a log event
 *
 * @param log - Log event
 * @param scenario - Scenario being rendered
 * @param context - Evaluation context
 * @param formatting - Formatting options
 * @returns Rendered log text
 */
function renderLog(
  log: OtelEvent,
  scenario: WorkflowScenario,
  context: Record<string, unknown>,
  _formatting: FormattingOptions
): string | undefined {
  // Check for severity-specific template
  if (scenario.template.logs) {
    const severity = getSeverityLevel(log.severityNumber);
    const logTemplate = scenario.template.logs[severity] || scenario.template.logs.default;
    if (logTemplate) {
      return parseTemplate(logTemplate, context as TemplateContext).toString();
    }
  }

  // Check for event-specific template
  if (scenario.template.events?.[`log.${log.severityText?.toLowerCase()}`]) {
    return parseTemplate(scenario.template.events[`log.${log.severityText?.toLowerCase()}`], context as TemplateContext).toString();
  }

  // Default log rendering
  return `[${log.severityText || 'LOG'}] ${log.body}`;
}

/**
 * Get severity level name from severity number
 *
 * @param severityNumber - OTEL severity number (1-24)
 * @returns Severity level name
 */
function getSeverityLevel(severityNumber?: number): keyof NonNullable<WorkflowScenario['template']['logs']> {
  if (!severityNumber) return 'info';
  if (severityNumber >= 21) return 'fatal';
  if (severityNumber >= 17) return 'error';
  if (severityNumber >= 13) return 'warn';
  if (severityNumber >= 9) return 'info';
  if (severityNumber >= 5) return 'debug';
  return 'trace';
}

/**
 * Render flow directives
 *
 * @param flow - Flow directives
 * @param context - Evaluation context
 * @returns Rendered flow text
 */
function renderFlow(flow: Array<string | FlowDirective>, context: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const item of flow) {
    if (typeof item === 'string') {
      // Simple string template
      parts.push(parseTemplate(item, context as TemplateContext).toString());
    } else {
      // Flow directive
      if (item.forEach && item.template) {
        // Iteration
        const collection = context[item.forEach] as unknown[];
        if (Array.isArray(collection)) {
          for (let i = 0; i < collection.length; i++) {
            const collectionItem = collection[i];
            const itemContext = {
              ...context,
              ...(typeof collectionItem === 'object' && collectionItem !== null ? (collectionItem as Record<string, unknown>) : {}),
              index: i,
            };
            parts.push(parseTemplate(item.template, itemContext as TemplateContext).toString());
          }
        }
      } else if (item.if) {
        // Conditional
        const condition = parseTemplate(item.if, context as TemplateContext).toString();
        if (condition === 'true' || condition === '1') {
          if (item.then) {
            parts.push(parseTemplate(item.then, context as TemplateContext).toString());
          }
        } else {
          if (item.else) {
            parts.push(parseTemplate(item.else, context as TemplateContext).toString());
          }
        }
      }
    }
  }

  return parts.join('\n');
}

/**
 * Build span tree from events
 *
 * @param events - All events
 * @param includeLogsPerSpan - Whether to attach logs to spans
 * @returns Span tree
 */
function buildSpanTree(events: OtelEvent[], includeLogsPerSpan = false): SpanTreeNode[] {
  const spans = events.filter((e) => e.type === 'span');
  const logs = includeLogsPerSpan ? events.filter((e) => e.type === 'log') : [];

  // Build map of spans by ID
  const spanMap = new Map<string, SpanTreeNode>();
  for (const span of spans) {
    if (span.spanId) {
      spanMap.set(span.spanId, {
        span,
        children: [],
        logs: [],
        depth: 0,
      });
    }
  }

  // Attach logs to spans
  if (includeLogsPerSpan) {
    for (const log of logs) {
      if (log.spanId && spanMap.has(log.spanId)) {
        spanMap.get(log.spanId)!.logs!.push(log);
      }
    }
  }

  // Build tree structure
  const roots: SpanTreeNode[] = [];
  for (const node of spanMap.values()) {
    if (node.span.parentSpanId && spanMap.has(node.span.parentSpanId)) {
      const parent = spanMap.get(node.span.parentSpanId)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Normalize timestamp to milliseconds
 *
 * @param timestamp - Timestamp (number or ISO string)
 * @returns Milliseconds since epoch
 */
function normalizeTimestamp(timestamp: string | number): number {
  if (typeof timestamp === 'number') {
    // Assume milliseconds if < 10^12, otherwise nanoseconds
    return timestamp < 1e12 ? timestamp : timestamp / 1e6;
  }
  return new Date(timestamp).getTime();
}

/**
 * Format timestamp
 *
 * @param timestamp - Timestamp to format
 * @param format - Format string (simplified, only supports HH:mm:ss.SSS)
 * @returns Formatted timestamp
 */
function formatTimestamp(timestamp: string | number, format: string): string {
  const ms = normalizeTimestamp(timestamp);
  const date = new Date(ms);

  if (format === 'HH:mm:ss.SSS') {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  // Fallback to ISO string
  return date.toISOString();
}
