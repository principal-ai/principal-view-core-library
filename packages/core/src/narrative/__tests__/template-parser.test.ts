/**
 * Tests for template expression parser
 */

import { parseTemplate, evaluateExpression } from '../template-parser';

describe('evaluateExpression', () => {
  const context = {
    config: { nodeTypes: 5, edgeTypes: 3 },
    result: { nodes: { count: 12 }, violations: { total: 3, errors: 2 } },
    duration: { ms: 45 },
    count: 10,
    text: 'hello',
  };

  describe('property access', () => {
    it('should access simple properties', () => {
      expect(evaluateExpression('count', context)).toBe(10);
      expect(evaluateExpression('text', context)).toBe('hello');
    });

    it('should access nested properties', () => {
      expect(evaluateExpression('config.nodeTypes', context)).toBe(5);
      expect(evaluateExpression('result.nodes.count', context)).toBe(12);
      expect(evaluateExpression('result.violations.total', context)).toBe(3);
    });

    it('should return undefined for missing properties', () => {
      expect(evaluateExpression('missing', context)).toBeUndefined();
      expect(evaluateExpression('config.missing', context)).toBeUndefined();
    });
  });

  describe('literals', () => {
    it('should handle string literals', () => {
      expect(evaluateExpression("'hello'", context)).toBe('hello');
      expect(evaluateExpression('"world"', context)).toBe('world');
    });

    it('should handle number literals', () => {
      expect(evaluateExpression('42', context)).toBe(42);
      expect(evaluateExpression('3.14', context)).toBe(3.14);
      expect(evaluateExpression('-5', context)).toBe(-5);
    });

    it('should handle boolean literals', () => {
      expect(evaluateExpression('true', context)).toBe(true);
      expect(evaluateExpression('false', context)).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(evaluateExpression('null', context)).toBe(null);
      expect(evaluateExpression('undefined', context)).toBe(undefined);
    });
  });

  describe('comparisons', () => {
    it('should evaluate greater than', () => {
      expect(evaluateExpression('count > 5', context)).toBe(true);
      expect(evaluateExpression('count > 10', context)).toBe(false);
    });

    it('should evaluate greater than or equal', () => {
      expect(evaluateExpression('count >= 10', context)).toBe(true);
      expect(evaluateExpression('count >= 11', context)).toBe(false);
    });

    it('should evaluate less than', () => {
      expect(evaluateExpression('count < 15', context)).toBe(true);
      expect(evaluateExpression('count < 10', context)).toBe(false);
    });

    it('should evaluate less than or equal', () => {
      expect(evaluateExpression('count <= 10', context)).toBe(true);
      expect(evaluateExpression('count <= 9', context)).toBe(false);
    });

    it('should evaluate equality', () => {
      expect(evaluateExpression('count === 10', context)).toBe(true);
      expect(evaluateExpression('count === 5', context)).toBe(false);
      expect(evaluateExpression("text === 'hello'", context)).toBe(true);
    });

    it('should evaluate inequality', () => {
      expect(evaluateExpression('count !== 5', context)).toBe(true);
      expect(evaluateExpression('count !== 10', context)).toBe(false);
    });
  });

  describe('arithmetic', () => {
    it('should add', () => {
      expect(evaluateExpression('count + 5', context)).toBe(15);
      expect(evaluateExpression('config.nodeTypes + config.edgeTypes', context)).toBe(8);
    });

    it('should subtract', () => {
      expect(evaluateExpression('count - 3', context)).toBe(7);
    });

    it('should multiply', () => {
      expect(evaluateExpression('count * 2', context)).toBe(20);
    });

    it('should divide', () => {
      expect(evaluateExpression('count / 2', context)).toBe(5);
      expect(evaluateExpression('duration.ms / 1000', context)).toBe(0.045);
    });
  });

  describe('ternary operator', () => {
    it('should evaluate ternary with true condition', () => {
      expect(evaluateExpression("count > 5 ? 'yes' : 'no'", context)).toBe('yes');
    });

    it('should evaluate ternary with false condition', () => {
      expect(evaluateExpression("count < 5 ? 'yes' : 'no'", context)).toBe('no');
    });

    it('should handle nested ternaries', () => {
      expect(evaluateExpression("count > 10 ? 'high' : count > 5 ? 'medium' : 'low'", context)).toBe('medium');
    });
  });

  describe('string methods', () => {
    it('should call repeat on string literal', () => {
      expect(evaluateExpression("'━'.repeat(5)", context)).toBe('━━━━━');
      expect(evaluateExpression("'ab'.repeat(3)", context)).toBe('ababab');
    });

    it('should call repeat on property value', () => {
      const ctx = { separator: '=' };
      expect(evaluateExpression("separator.repeat(10)", ctx)).toBe('==========');
    });

    it('should call substring', () => {
      expect(evaluateExpression("'hello world'.substring(0, 5)", context)).toBe('hello');
    });

    it('should call slice', () => {
      expect(evaluateExpression("'hello world'.slice(6)", context)).toBe('world');
    });

    it('should call toUpperCase', () => {
      expect(evaluateExpression("'hello'.toUpperCase()", context)).toBe('HELLO');
    });

    it('should call toLowerCase', () => {
      expect(evaluateExpression("'HELLO'.toLowerCase()", context)).toBe('hello');
    });

    it('should call trim', () => {
      expect(evaluateExpression("'  hello  '.trim()", context)).toBe('hello');
    });

    it('should call replace', () => {
      expect(evaluateExpression("'hello world'.replace('world', 'there')", context)).toBe('hello there');
    });
  });
});

describe('parseTemplate', () => {
  const context = {
    config: { nodeTypes: 5, edgeTypes: 3 },
    result: { nodes: { count: 12 }, violations: { total: 3, errors: 2 } },
    duration: { ms: 45 },
  };

  it('should parse simple property substitution', () => {
    expect(parseTemplate('Found {result.nodes.count} nodes', context)).toBe('Found 12 nodes');
  });

  it('should parse multiple substitutions', () => {
    expect(parseTemplate('Config has {config.nodeTypes} node types and {config.edgeTypes} edge types', context)).toBe(
      'Config has 5 node types and 3 edge types'
    );
  });

  it('should parse nested properties', () => {
    expect(parseTemplate('Total violations: {result.violations.total}', context)).toBe('Total violations: 3');
  });

  it('should parse expressions', () => {
    expect(parseTemplate('Duration: {duration.ms}ms', context)).toBe('Duration: 45ms');
  });

  it('should parse ternary expressions', () => {
    expect(parseTemplate('{result.violations.total > 0 ? "FAILED" : "PASSED"}', context)).toBe('FAILED');
  });

  it('should parse arithmetic', () => {
    expect(parseTemplate('Total types: {config.nodeTypes + config.edgeTypes}', context)).toBe('Total types: 8');
  });

  it('should parse string method calls', () => {
    expect(parseTemplate('{"=".repeat(10)}', context)).toBe('==========');
  });

  it('should handle multiple expressions in one template', () => {
    const template = 'Status: {result.violations.total > 0 ? "❌" : "✅"} - {result.nodes.count} nodes';
    expect(parseTemplate(template, context)).toBe('Status: ❌ - 12 nodes');
  });

  it('should leave non-expression text unchanged', () => {
    expect(parseTemplate('This is plain text', context)).toBe('This is plain text');
    expect(parseTemplate('No substitutions here!', context)).toBe('No substitutions here!');
  });

  it('should handle empty expressions gracefully', () => {
    expect(parseTemplate('Value: {missing.property}', context)).toBe('Value: ');
  });

  it('should handle errors in expressions', () => {
    expect(parseTemplate('{invalid.method.call()}', context)).toContain('ERROR');
  });

  it('should format complex narrative', () => {
    const template = `✅ Conversion Complete
{'━'.repeat(50)}

Processed {config.nodeTypes} node types
Generated {result.nodes.count} nodes in {duration.ms}ms

Status: {result.violations.total === 0 ? "✅ SUCCESS" : "⚠️ {result.violations.total} violations"}`;

    const expected = `✅ Conversion Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Processed 5 node types
Generated 12 nodes in 45ms

Status: ⚠️ 3 violations`;

    expect(parseTemplate(template, context)).toBe(expected);
  });
});
