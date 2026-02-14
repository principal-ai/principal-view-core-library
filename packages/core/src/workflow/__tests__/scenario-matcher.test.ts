/**
 * Tests for scenario matching logic
 */

import { selectScenario, matchesCondition, hasEventMatching, evaluateAssertion, computeAggregates, getNestedValue } from '../scenario-matcher';
import type { WorkflowTemplate, OtelEvent, ScenarioCondition } from '../types';

describe('hasEventMatching', () => {
  const events: OtelEvent[] = [
    { name: 'conversion.started', timestamp: 0 },
    { name: 'conversion.complete', timestamp: 100 },
    { name: 'rule.completed', timestamp: 50 },
    { name: 'rule.error', timestamp: 75 },
    { name: 'log.info', timestamp: 25, type: 'log', severityText: 'INFO' },
  ];

  it('should match exact event names', () => {
    expect(hasEventMatching(events, 'conversion.started')).toBe(true);
    expect(hasEventMatching(events, 'conversion.complete')).toBe(true);
    expect(hasEventMatching(events, 'nonexistent')).toBe(false);
  });

  it('should match wildcard suffix patterns', () => {
    expect(hasEventMatching(events, 'conversion.*')).toBe(true);
    expect(hasEventMatching(events, 'rule.*')).toBe(true);
    expect(hasEventMatching(events, 'test.*')).toBe(false);
  });

  it('should match wildcard prefix patterns', () => {
    expect(hasEventMatching(events, '*.error')).toBe(true);
    expect(hasEventMatching(events, '*.completed')).toBe(true);
    expect(hasEventMatching(events, '*.failed')).toBe(false);
  });

  it('should match full wildcard', () => {
    expect(hasEventMatching(events, '*')).toBe(true);
    expect(hasEventMatching([], '*')).toBe(false);
  });
});

describe('evaluateAssertion', () => {
  it('should evaluate $gt (greater than)', () => {
    expect(evaluateAssertion(10, { $gt: 5 }).matches).toBe(true);
    expect(evaluateAssertion(5, { $gt: 5 }).matches).toBe(false);
    expect(evaluateAssertion(3, { $gt: 5 }).matches).toBe(false);
  });

  it('should evaluate $gte (greater than or equal)', () => {
    expect(evaluateAssertion(10, { $gte: 5 }).matches).toBe(true);
    expect(evaluateAssertion(5, { $gte: 5 }).matches).toBe(true);
    expect(evaluateAssertion(3, { $gte: 5 }).matches).toBe(false);
  });

  it('should evaluate $lt (less than)', () => {
    expect(evaluateAssertion(3, { $lt: 5 }).matches).toBe(true);
    expect(evaluateAssertion(5, { $lt: 5 }).matches).toBe(false);
    expect(evaluateAssertion(10, { $lt: 5 }).matches).toBe(false);
  });

  it('should evaluate $lte (less than or equal)', () => {
    expect(evaluateAssertion(3, { $lte: 5 }).matches).toBe(true);
    expect(evaluateAssertion(5, { $lte: 5 }).matches).toBe(true);
    expect(evaluateAssertion(10, { $lte: 5 }).matches).toBe(false);
  });

  it('should evaluate $eq (equality)', () => {
    expect(evaluateAssertion(5, { $eq: 5 }).matches).toBe(true);
    expect(evaluateAssertion('test', { $eq: 'test' }).matches).toBe(true);
    expect(evaluateAssertion(true, { $eq: true }).matches).toBe(true);
    expect(evaluateAssertion(5, { $eq: 10 }).matches).toBe(false);
  });

  it('should evaluate $ne (not equal)', () => {
    expect(evaluateAssertion(5, { $ne: 10 }).matches).toBe(true);
    expect(evaluateAssertion(5, { $ne: 5 }).matches).toBe(false);
  });

  it('should evaluate $exists', () => {
    expect(evaluateAssertion('value', { $exists: true }).matches).toBe(true);
    expect(evaluateAssertion(undefined, { $exists: true }).matches).toBe(false);
    expect(evaluateAssertion(null, { $exists: true }).matches).toBe(false);
    expect(evaluateAssertion(undefined, { $exists: false }).matches).toBe(true);
  });

  it('should evaluate $in (array membership)', () => {
    expect(evaluateAssertion('a', { $in: ['a', 'b', 'c'] }).matches).toBe(true);
    expect(evaluateAssertion(5, { $in: [1, 5, 10] }).matches).toBe(true);
    expect(evaluateAssertion('d', { $in: ['a', 'b', 'c'] }).matches).toBe(false);
  });

  it('should evaluate $nin (not in array)', () => {
    expect(evaluateAssertion('d', { $nin: ['a', 'b', 'c'] }).matches).toBe(true);
    expect(evaluateAssertion('a', { $nin: ['a', 'b', 'c'] }).matches).toBe(false);
  });

  it('should handle undefined/null values for numeric comparisons', () => {
    expect(evaluateAssertion(undefined, { $gt: 5 }).matches).toBe(false);
    expect(evaluateAssertion(null, { $lt: 5 }).matches).toBe(false);
  });
});

describe('getNestedValue', () => {
  const obj = {
    result: {
      violations: {
        total: 10,
        errors: 5,
      },
    },
    simple: 'value',
  };

  it('should get simple property', () => {
    expect(getNestedValue(obj, 'simple')).toBe('value');
  });

  it('should get nested property', () => {
    expect(getNestedValue(obj, 'result.violations.total')).toBe(10);
    expect(getNestedValue(obj, 'result.violations.errors')).toBe(5);
  });

  it('should return undefined for missing property', () => {
    expect(getNestedValue(obj, 'nonexistent')).toBeUndefined();
    expect(getNestedValue(obj, 'result.missing.path')).toBeUndefined();
  });
});

describe('matchesCondition', () => {
  const events: OtelEvent[] = [
    { name: 'conversion.started', timestamp: 0 },
    { name: 'conversion.complete', timestamp: 100 },
    { name: 'rule.completed', timestamp: 50 },
  ];

  const attributes = {
    'result.violations.total': 5,
    'result.violations.errors': 2,
  };

  it('should match default condition', () => {
    const condition: ScenarioCondition = { default: true };
    expect(matchesCondition(condition, events, attributes).matches).toBe(true);
  });

  it('should match when all required events are present', () => {
    const condition: ScenarioCondition = {
      requires: ['conversion.started', 'conversion.complete'],
    };
    expect(matchesCondition(condition, events, attributes).matches).toBe(true);
  });

  it('should not match when required events are missing', () => {
    const condition: ScenarioCondition = {
      requires: ['conversion.started', 'missing.event'],
    };
    const result = matchesCondition(condition, events, attributes);
    expect(result.matches).toBe(false);
    expect(result.reason).toContain('missing.event');
  });

  it('should match with wildcard requires', () => {
    const condition: ScenarioCondition = {
      requires: ['conversion.*'],
    };
    expect(matchesCondition(condition, events, attributes).matches).toBe(true);
  });

  it('should not match when excluded events are present', () => {
    const condition: ScenarioCondition = {
      requires: ['conversion.*'],
      excludes: ['rule.completed'],
    };
    const result = matchesCondition(condition, events, attributes);
    expect(result.matches).toBe(false);
    expect(result.reason).toContain('rule.completed');
  });

  it('should match when excluded events are not present', () => {
    const condition: ScenarioCondition = {
      requires: ['conversion.*'],
      excludes: ['error.*'],
    };
    expect(matchesCondition(condition, events, attributes).matches).toBe(true);
  });

  it('should match with assertions', () => {
    const condition: ScenarioCondition = {
      requires: ['conversion.complete'],
      assertions: {
        'result.violations.total': { $gt: 0 },
      },
    };
    expect(matchesCondition(condition, events, attributes).matches).toBe(true);
  });

  it('should not match when assertions fail', () => {
    const condition: ScenarioCondition = {
      requires: ['conversion.complete'],
      assertions: {
        'result.violations.total': { $eq: 0 },
      },
    };
    const result = matchesCondition(condition, events, attributes);
    expect(result.matches).toBe(false);
    expect(result.reason).toContain('result.violations.total');
  });

  it('should match ANY when any=true', () => {
    const condition: ScenarioCondition = {
      requires: ['conversion.started', 'missing.event'],
      any: true,
    };
    expect(matchesCondition(condition, events, attributes).matches).toBe(true);
  });

  it('should not match ANY when no requirements met', () => {
    const condition: ScenarioCondition = {
      requires: ['missing.one', 'missing.two'],
      any: true,
    };
    const result = matchesCondition(condition, events, attributes);
    expect(result.matches).toBe(false);
  });
});

describe('selectScenario', () => {
  const template: WorkflowTemplate = {
    version: '1.0.0',
    canvas: 'test.otel.canvas',
    name: 'Test Template',
    description: 'Test template for scenario selection',
    mode: 'span-tree',
    scenarioSelection: 'first-match',
    scenarios: [
      {
        id: 'error',
        priority: 1,
        description: 'Error occurred',
        condition: { requires: ['*.error'] },
        template: { introduction: 'Error scenario' },
      },
      {
        id: 'violations',
        priority: 2,
        description: 'Violations found',
        condition: {
          requires: ['conversion.complete'],
          assertions: { 'result.violations.total': { $gt: 0 } },
        },
        template: { introduction: 'Violations scenario' },
      },
      {
        id: 'happy',
        priority: 3,
        description: 'All good',
        condition: {
          requires: ['conversion.complete'],
          assertions: { 'result.violations.total': { $eq: 0 } },
        },
        template: { introduction: 'Happy path' },
      },
      {
        id: 'fallback',
        priority: 99,
        description: 'Fallback',
        condition: { default: true },
        template: { introduction: 'Fallback scenario' },
      },
    ],
  };

  it('should select first matching scenario (error)', () => {
    const events: OtelEvent[] = [
      { name: 'conversion.started', timestamp: 0 },
      { name: 'conversion.error', timestamp: 50 },
    ];
    const result = selectScenario(template, events);
    expect(result.scenario.id).toBe('error');
    expect(result.isDefault).toBe(false);
  });

  it('should select violations scenario', () => {
    const events: OtelEvent[] = [
      { name: 'conversion.started', timestamp: 0 },
      { name: 'conversion.complete', timestamp: 100 },
    ];
    const result = selectScenario(template, events);
    expect(result.scenario.id).toBe('violations');
  });

  it('should select happy path scenario', () => {
    const events: OtelEvent[] = [
      { name: 'conversion.started', timestamp: 0 },
      { name: 'conversion.complete', timestamp: 100 },
    ];
    const result = selectScenario(template, events);
    expect(result.scenario.id).toBe('happy');
  });

  it('should select fallback when no other matches', () => {
    const events: OtelEvent[] = [{ name: 'unknown.event', timestamp: 0 }];
    const result = selectScenario(template, events);
    expect(result.scenario.id).toBe('fallback');
    expect(result.isDefault).toBe(true);
  });

  it('should throw error if no scenario matches (missing fallback)', () => {
    const badTemplate: WorkflowTemplate = {
      ...template,
      scenarios: [template.scenarios[0]], // Only error scenario, no fallback
    };
    const events: OtelEvent[] = [{ name: 'conversion.complete', timestamp: 0 }];
    expect(() => selectScenario(badTemplate, events)).toThrow('No scenario matched');
  });

  it('should return applicable scenarios for UI', () => {
    const events: OtelEvent[] = [
      { name: 'conversion.complete', timestamp: 100 },
    ];
    const result = selectScenario(template, events);
    expect(result.applicableScenarios.length).toBeGreaterThan(1);
    expect(result.applicableScenarios[0].id).toBe('violations');
    expect(result.applicableScenarios).toContainEqual(expect.objectContaining({ id: 'fallback' }));
  });
});

describe('computeAggregates', () => {
  const events: OtelEvent[] = [
    { name: 'conversion.started', timestamp: 0, type: 'span' },
    { name: 'conversion.complete', timestamp: 100, type: 'span', attributes: { 'result.nodes.count': 12 } },
    { name: 'log.info', timestamp: 25, type: 'log', severityNumber: 9 },
    { name: 'log.error', timestamp: 75, type: 'log', severityNumber: 17 },
    { name: 'log.debug', timestamp: 50, type: 'log', severityNumber: 5 },
  ];

  it('should count total events', () => {
    const aggregates = computeAggregates(events);
    expect(aggregates['events.count']).toBe(5);
    expect(aggregates['events.length']).toBe(5);
  });

  it('should count spans', () => {
    const aggregates = computeAggregates(events);
    expect(aggregates['spans.count']).toBe(2);
  });

  it('should count logs by severity', () => {
    const aggregates = computeAggregates(events);
    expect(aggregates['logs.count']).toBe(3);
    expect(aggregates['errorLogs.count']).toBe(1);
    expect(aggregates['debugLogs.count']).toBe(1);
  });

  it('should extract common attributes', () => {
    const aggregates = computeAggregates(events);
    expect(aggregates['result.nodes.count']).toBe(12);
  });

  it('should handle empty events', () => {
    const aggregates = computeAggregates([]);
    expect(aggregates['events.count']).toBe(0);
    expect(aggregates['spans.count']).toBe(0);
    expect(aggregates['logs.count']).toBe(0);
  });
});
