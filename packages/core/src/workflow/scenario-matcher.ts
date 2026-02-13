/**
 * Scenario Matching Logic
 *
 * Selects the appropriate workflow scenario based on which events occurred
 * during execution. Uses priority-based, first-match-wins algorithm.
 */

import type {
  WorkflowScenario,
  WorkflowTemplate,
  OtelEvent,
  ScenarioMatchResult,
} from './types';

/**
 * Get required events for a scenario (derived from template.events)
 *
 * @param scenario - Scenario to extract events from
 * @returns Array of event names required for this scenario to match
 */
export function getRequiredEvents(scenario: WorkflowScenario): string[] {
  return Object.keys(scenario.template?.events || {});
}

/**
 * Select the first matching scenario from a workflow template
 *
 * Scenarios are evaluated in priority order (lowest priority number first).
 * Returns the first scenario whose events are all present.
 *
 * @param template - Workflow template with scenarios
 * @param events - Collected OTEL events
 * @param attributes - Aggregated attributes (computed from events) - DEPRECATED, no longer used
 * @returns Matched scenario and metadata
 * @throws Error if no scenario matches
 */
export function selectScenario(
  template: WorkflowTemplate,
  events: OtelEvent[],
  attributes: Record<string, unknown> = {}
): ScenarioMatchResult {
  // Sort scenarios by priority (should already be sorted in template)
  const sorted = [...template.scenarios].sort((a, b) => a.priority - b.priority);

  const applicableScenarios: WorkflowScenario[] = [];
  const matchReasons: Record<string, string> = {};

  // Find first matching scenario
  for (const scenario of sorted) {
    const requiredEvents = getRequiredEvents(scenario);

    // Check if ALL required events are present
    const hasAllEvents = requiredEvents.every((eventName) =>
      hasEventMatching(events, eventName)
    );

    if (hasAllEvents) {
      // Check if there are other applicable scenarios (for UI)
      for (const other of sorted) {
        if (other.id !== scenario.id) {
          const otherRequired = getRequiredEvents(other);
          const otherMatches = otherRequired.every((eventName) =>
            hasEventMatching(events, eventName)
          );
          if (otherMatches) {
            applicableScenarios.push(other);
          }
        }
      }

      return {
        scenario,
        isDefault: false, // No longer have default scenarios
        applicableScenarios: [scenario, ...applicableScenarios],
        matchReasons,
      };
    }

    const missingEvents = requiredEvents.filter((eventName) => !hasEventMatching(events, eventName));
    matchReasons[scenario.id] = `Missing required event(s): ${missingEvents.join(', ')}`;
  }

  throw new Error(
    `No scenario matched for template "${template.name}". ` +
      `Events in trace: ${events.map((e) => e.name).join(', ')}`
  );
}


/**
 * Check if any event matches the given pattern (supports glob-style wildcards)
 *
 * Patterns:
 * - Exact: "conversion.started" matches only that event
 * - Wildcard suffix: "conversion.*" matches "conversion.started", "conversion.complete", etc.
 * - Wildcard prefix: "*.error" matches "conversion.error", "rule.error", etc.
 * - Wildcard middle: "log.*" matches any event starting with "log."
 *
 * @param events - Events to search
 * @param pattern - Pattern to match (supports * wildcard)
 * @returns True if any event matches the pattern
 */
export function hasEventMatching(events: OtelEvent[], pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\*/g, '.*'); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`);

  return events.some((event) => regex.test(event.name));
}


/**
 * Get nested value from object using dot notation
 *
 * Supports both nested objects and flat keys with dots in them.
 * First tries the path as a flat key, then tries nested lookup.
 *
 * @param obj - Object to search
 * @param path - Dot-separated path (e.g., "result.violations.total")
 * @returns Value at path, or undefined if not found
 */
export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  // First try as a flat key (handles attributes like 'result.violations.total')
  if (path in obj) {
    return obj[path];
  }

  // Then try as nested path
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Set nested value in object using dot notation
 *
 * @param obj - Object to modify
 * @param path - Dot-separated path (e.g., "result.violations.total")
 * @param value - Value to set
 */
export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

/**
 * Compute aggregate values from events
 *
 * Provides common aggregations like counts, totals, averages, etc.
 * that can be used in scenario conditions and templates.
 *
 * @param events - Collected OTEL events
 * @returns Aggregate values
 */
export function computeAggregates(events: OtelEvent[]): Record<string, unknown> {
  const aggregates: Record<string, unknown> = {
    // Event counts
    'events.length': events.length,
    'events.count': events.length,

    // Spans
    'spans.count': events.filter((e) => e.type === 'span').length,

    // Logs
    'logs.count': events.filter((e) => e.type === 'log').length,
    'errorLogs.count': events.filter((e) => e.type === 'log' && (e.severityNumber ?? 0) >= 17).length,
    'warnLogs.count': events.filter(
      (e) => e.type === 'log' && (e.severityNumber ?? 0) >= 13 && (e.severityNumber ?? 0) <= 16
    ).length,
    'debugLogs.count': events.filter(
      (e) => e.type === 'log' && (e.severityNumber ?? 0) >= 5 && (e.severityNumber ?? 0) <= 8
    ).length,
  };

  // Extract attributes from summary/completion events for scenario matching
  // These events contain execution-level data (not per-event varying data)
  // Store ONLY as flat keys to avoid conflicts with event-specific attributes
  const summaryEventPatterns = ['.complete', '.summary', '.error', '.started'];
  const summaryEvents = events.filter((e) =>
    summaryEventPatterns.some((pattern) => e.name.endsWith(pattern))
  );

  for (const event of summaryEvents) {
    if (event.attributes) {
      for (const [key, value] of Object.entries(event.attributes)) {
        // Store only in flat structure to match event attribute keys
        // This prevents nested structures from shadowing event-specific attributes
        aggregates[key] = value;
      }
    }
  }

  return aggregates;
}
