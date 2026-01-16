/**
 * Scenario Matching Logic
 *
 * Selects the appropriate narrative scenario based on which events occurred
 * during execution. Uses priority-based, first-match-wins algorithm.
 */

import type {
  NarrativeScenario,
  NarrativeTemplate,
  ScenarioCondition,
  Assertion,
  OtelEvent,
  ScenarioMatchResult,
} from './types';

/**
 * Select the first matching scenario from a narrative template
 *
 * Scenarios are evaluated in priority order (lowest priority number first).
 * Returns the first scenario whose conditions are met.
 *
 * @param template - Narrative template with scenarios
 * @param events - Collected OTEL events
 * @param attributes - Aggregated attributes (computed from events)
 * @returns Matched scenario and metadata
 * @throws Error if no scenario matches (template should have default fallback)
 */
export function selectScenario(
  template: NarrativeTemplate,
  events: OtelEvent[],
  attributes: Record<string, unknown> = {}
): ScenarioMatchResult {
  // Sort scenarios by priority (should already be sorted in template)
  const sorted = [...template.scenarios].sort((a, b) => a.priority - b.priority);

  const applicableScenarios: NarrativeScenario[] = [];
  const matchReasons: Record<string, string> = {};

  // Find first matching scenario
  for (const scenario of sorted) {
    const matchResult = matchesCondition(scenario.condition, events, attributes);

    if (matchResult.matches) {
      // Check if there are other applicable scenarios (for UI)
      for (const other of sorted) {
        if (other.id !== scenario.id && matchesCondition(other.condition, events, attributes).matches) {
          applicableScenarios.push(other);
        }
      }

      return {
        scenario,
        isDefault: Boolean(scenario.condition.default),
        applicableScenarios: [scenario, ...applicableScenarios],
        matchReasons,
      };
    }

    matchReasons[scenario.id] = matchResult.reason || 'Unknown';
  }

  throw new Error(
    `No scenario matched for template "${template.name}". ` +
      `Ensure there is a default scenario with { default: true } condition. ` +
      `Events: ${events.map((e) => e.name).join(', ')}`
  );
}

/**
 * Check if a scenario condition matches the given events and attributes
 *
 * @param condition - Scenario condition to evaluate
 * @param events - Collected OTEL events
 * @param attributes - Aggregated attributes
 * @returns Match result with reason if not matched
 */
export function matchesCondition(
  condition: ScenarioCondition,
  events: OtelEvent[],
  attributes: Record<string, unknown>
): { matches: boolean; reason?: string } {
  // 1. Check default condition (always matches)
  if (condition.default) {
    return { matches: true };
  }

  // 2. Check required events
  if (condition.requires) {
    const matchMode = condition.any ? 'some' : 'every';
    const hasRequired = condition.requires[matchMode as 'some' | 'every']((pattern) =>
      hasEventMatching(events, pattern)
    );

    if (!hasRequired) {
      const missing = condition.requires.filter((pattern) => !hasEventMatching(events, pattern));
      return {
        matches: false,
        reason: `Missing required event(s): ${missing.join(', ')}`,
      };
    }
  }

  // 3. Check excluded events
  if (condition.excludes) {
    const excluded = condition.excludes.find((pattern) => hasEventMatching(events, pattern));
    if (excluded) {
      return {
        matches: false,
        reason: `Found excluded event: ${excluded}`,
      };
    }
  }

  // 4. Check attribute assertions
  if (condition.assertions) {
    for (const [key, assertion] of Object.entries(condition.assertions)) {
      const value = getNestedValue(attributes, key);
      const assertionResult = evaluateAssertion(value, assertion);

      if (!assertionResult.matches) {
        return {
          matches: false,
          reason: `Assertion failed for "${key}": ${assertionResult.reason}`,
        };
      }
    }
  }

  // All checks passed
  return { matches: true };
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
 * Evaluate an assertion against a value
 *
 * @param value - Value to test
 * @param assertion - Assertion operators
 * @returns Match result with reason if not matched
 */
export function evaluateAssertion(
  value: unknown,
  assertion: Assertion
): { matches: boolean; reason?: string } {
  // $exists check
  if (assertion.$exists !== undefined) {
    const exists = value !== undefined && value !== null;
    if (exists !== assertion.$exists) {
      return {
        matches: false,
        reason: assertion.$exists ? 'Value does not exist' : 'Value exists but should not',
      };
    }
    // If only checking existence, we're done
    if (Object.keys(assertion).length === 1) {
      return { matches: true };
    }
  }

  // If value doesn't exist and we're checking other operators, fail
  if (value === undefined || value === null) {
    return { matches: false, reason: 'Value is undefined or null' };
  }

  // Numeric comparisons
  if (typeof value === 'number') {
    if (assertion.$gt !== undefined && !(value > assertion.$gt)) {
      return { matches: false, reason: `${value} is not > ${assertion.$gt}` };
    }
    if (assertion.$gte !== undefined && !(value >= assertion.$gte)) {
      return { matches: false, reason: `${value} is not >= ${assertion.$gte}` };
    }
    if (assertion.$lt !== undefined && !(value < assertion.$lt)) {
      return { matches: false, reason: `${value} is not < ${assertion.$lt}` };
    }
    if (assertion.$lte !== undefined && !(value <= assertion.$lte)) {
      return { matches: false, reason: `${value} is not <= ${assertion.$lte}` };
    }
  }

  // Equality checks
  if (assertion.$eq !== undefined && value !== assertion.$eq) {
    return { matches: false, reason: `${value} !== ${assertion.$eq}` };
  }
  if (assertion.$ne !== undefined && value === assertion.$ne) {
    return { matches: false, reason: `${value} === ${assertion.$ne} (should not equal)` };
  }

  // Array membership
  if (assertion.$in !== undefined) {
    if (!assertion.$in.includes(value as string | number | boolean)) {
      return { matches: false, reason: `${value} not in [${assertion.$in.join(', ')}]` };
    }
  }
  if (assertion.$nin !== undefined) {
    if (assertion.$nin.includes(value as string | number | boolean)) {
      return { matches: false, reason: `${value} found in excluded list [${assertion.$nin.join(', ')}]` };
    }
  }

  return { matches: true };
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

  // Extract common attributes from events (for easy access in conditions)
  for (const event of events) {
    if (event.attributes) {
      for (const [key, value] of Object.entries(event.attributes)) {
        // Store first occurrence using nested value setter
        // This handles both flat keys and dot-notation keys (e.g., "result.violations.total")
        if (getNestedValue(aggregates, key) === undefined) {
          // Store both as nested structure (for getNestedValue) and flat key (for direct access)
          setNestedValue(aggregates, key, value);
          if (key.includes('.')) {
            aggregates[key] = value; // Also store flat version
          }
        }
      }
    }
  }

  return aggregates;
}
