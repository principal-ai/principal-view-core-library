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

  describe('backwards compatibility (toString)', () => {
    it('should parse simple property substitution', () => {
      expect(parseTemplate('Found {{result.nodes.count}} nodes', context).toString()).toBe('Found 12 nodes');
    });

    it('should parse multiple substitutions', () => {
      expect(parseTemplate('Config has {{config.nodeTypes}} node types and {{config.edgeTypes}} edge types', context).toString()).toBe(
        'Config has 5 node types and 3 edge types'
      );
    });

    it('should parse nested properties', () => {
      expect(parseTemplate('Total violations: {{result.violations.total}}', context).toString()).toBe('Total violations: 3');
    });

    it('should handle realistic workflow templates', () => {
      expect(parseTemplate('✅ Installed {{skills.installed}} skill(s) to {{agents.count}} agent(s)', context).toString()).toBe(
        '✅ Installed 2 skill(s) to 2 agent(s)'
      );
    });

    it('should leave non-expression text unchanged', () => {
      expect(parseTemplate('This is plain text', context).toString()).toBe('This is plain text');
      expect(parseTemplate('No substitutions here!', context).toString()).toBe('No substitutions here!');
    });

    it('should handle missing properties gracefully', () => {
      expect(parseTemplate('Value: {{missing.property}}', context).toString()).toBe('Value: {{missing.property}}');
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

      expect(parseTemplate(template, context).toString()).toBe(expected);
    });

    it('should handle Handlebars conditionals', () => {
      const template = '{{#if result.violations.total}}Has violations{{else}}No violations{{/if}}';
      expect(parseTemplate(template, context).toString()).toBe('Has violations');
    });

    it('should handle Handlebars comparison helpers', () => {
      const contextZero = { ...context, result: { ...context.result, violations: { total: 0 } } };
      const template = '{{#if result.violations.total}}❌ FAILED{{else}}✅ PASSED{{/if}}';
      expect(parseTemplate(template, context).toString()).toBe('❌ FAILED');
      expect(parseTemplate(template, contextZero).toString()).toBe('✅ PASSED');
    });
  });

  describe('structured segments', () => {
    it('should return ParsedTemplate with segments', () => {
      const result = parseTemplate('Found {{result.nodes.count}} nodes', context);
      expect(result.segments).toBeDefined();
      expect(Array.isArray(result.segments)).toBe(true);
    });

    it('should identify text segments', () => {
      const result = parseTemplate('This is plain text', context);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toEqual({
        type: 'text',
        value: 'This is plain text',
      });
    });

    it('should identify resolved variable segments', () => {
      const result = parseTemplate('Found {{result.nodes.count}} nodes', context);
      expect(result.segments).toHaveLength(3);

      expect(result.segments[0]).toEqual({
        type: 'text',
        value: 'Found ',
      });

      expect(result.segments[1]).toEqual({
        type: 'variable',
        value: '12',
        variableName: 'result.nodes.count',
        resolved: true,
      });

      expect(result.segments[2]).toEqual({
        type: 'text',
        value: ' nodes',
      });
    });

    it('should identify unresolved variable segments', () => {
      const result = parseTemplate('Value: {{missing.property}}', context);
      expect(result.segments).toHaveLength(2);

      expect(result.segments[0]).toEqual({
        type: 'text',
        value: 'Value: ',
      });

      expect(result.segments[1]).toEqual({
        type: 'variable',
        value: '{{missing.property}}',
        variableName: 'missing.property',
        resolved: false,
      });
    });

    it('should handle mixed resolved and unresolved variables', () => {
      const result = parseTemplate('Count: {{result.nodes.count}}, Missing: {{missing.value}}', context);

      expect(result.segments).toHaveLength(4);
      expect(result.segments[0]).toMatchObject({
        type: 'text',
        value: 'Count: ',
      });
      expect(result.segments[1]).toMatchObject({
        type: 'variable',
        variableName: 'result.nodes.count',
        resolved: true,
      });
      expect(result.segments[2]).toMatchObject({
        type: 'text',
        value: ', Missing: ',
      });
      expect(result.segments[3]).toMatchObject({
        type: 'variable',
        variableName: 'missing.value',
        resolved: false,
      });
    });

    it('should handle multiple resolved variables', () => {
      const result = parseTemplate('{{config.nodeTypes}} nodes, {{config.edgeTypes}} edges', context);

      expect(result.segments).toHaveLength(4);
      expect(result.segments[0]).toMatchObject({
        type: 'variable',
        value: '5',
        variableName: 'config.nodeTypes',
        resolved: true,
      });
      expect(result.segments[2]).toMatchObject({
        type: 'variable',
        value: '3',
        variableName: 'config.edgeTypes',
        resolved: true,
      });
    });
  });
});
