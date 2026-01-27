/**
 * Tests for Handlebars template parser
 */

import { parseTemplate } from '../template-parser';

describe('parseTemplate', () => {
  const context = {
    config: { nodeTypes: 5, edgeTypes: 3 },
    result: { nodes: { count: 12 }, violations: { total: 3, errors: 2 } },
    duration: { ms: 45 },
    skills: { installed: 2, found: 3, selected: 2 },
    agents: { count: 2 },
  };

  it('should parse simple property substitution', () => {
    expect(parseTemplate('Found {{result.nodes.count}} nodes', context)).toBe('Found 12 nodes');
  });

  it('should parse multiple substitutions', () => {
    expect(parseTemplate('Config has {{config.nodeTypes}} node types and {{config.edgeTypes}} edge types', context)).toBe(
      'Config has 5 node types and 3 edge types'
    );
  });

  it('should parse nested properties', () => {
    expect(parseTemplate('Total violations: {{result.violations.total}}', context)).toBe('Total violations: 3');
  });

  it('should handle realistic workflow templates', () => {
    expect(parseTemplate('✅ Installed {{skills.installed}} skill(s) to {{agents.count}} agent(s)', context)).toBe(
      '✅ Installed 2 skill(s) to 2 agent(s)'
    );
  });

  it('should leave non-expression text unchanged', () => {
    expect(parseTemplate('This is plain text', context)).toBe('This is plain text');
    expect(parseTemplate('No substitutions here!', context)).toBe('No substitutions here!');
  });

  it('should handle missing properties gracefully', () => {
    expect(parseTemplate('Value: {{missing.property}}', context)).toBe('Value: ');
  });

  it('should format multiline workflow', () => {
    const template = `✅ Conversion Complete

Processed {{config.nodeTypes}} node types
Generated {{result.nodes.count}} nodes in {{duration.ms}}ms

Found {{result.violations.total}} violations`;

    const expected = `✅ Conversion Complete

Processed 5 node types
Generated 12 nodes in 45ms

Found 3 violations`;

    expect(parseTemplate(template, context)).toBe(expected);
  });

  it('should handle Handlebars conditionals', () => {
    const template = '{{#if result.violations.total}}Has violations{{else}}No violations{{/if}}';
    expect(parseTemplate(template, context)).toBe('Has violations');
  });

  it('should handle Handlebars comparison helpers', () => {
    const contextZero = { ...context, result: { ...context.result, violations: { total: 0 } } };
    const template = '{{#if result.violations.total}}❌ FAILED{{else}}✅ PASSED{{/if}}';
    expect(parseTemplate(template, context)).toBe('❌ FAILED');
    expect(parseTemplate(template, contextZero)).toBe('✅ PASSED');
  });
});
