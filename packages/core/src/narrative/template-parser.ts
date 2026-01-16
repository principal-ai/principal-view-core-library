/**
 * Template Expression Parser
 *
 * Parses and evaluates template expressions like:
 * - Simple: "{config.nodeTypes}"
 * - Conditional: "{result.violations.total > 0 ? '❌ FAILED' : '✅ PASSED'}"
 * - Function calls: "{'━'.repeat(50)}"
 */

import { getNestedValue } from './scenario-matcher';

/**
 * Parse and evaluate a template string with embedded expressions
 *
 * Expressions are enclosed in curly braces: {expression}
 *
 * Supported syntax:
 * - Property access: {config.nodeTypes}
 * - Ternary: {count > 0 ? 'yes' : 'no'}
 * - String methods: {'━'.repeat(50)}
 * - Arithmetic: {duration.ms / 1000}
 *
 * @param template - Template string with {expressions}
 * @param context - Data context for variable lookup
 * @returns Evaluated string
 */
export function parseTemplate(template: string, context: Record<string, unknown>): string {
  // Find all {expression} patterns, handling nested braces
  let result = '';
  let i = 0;

  while (i < template.length) {
    const start = template.indexOf('{', i);
    if (start === -1) {
      // No more expressions
      result += template.substring(i);
      break;
    }

    // Add text before the expression
    result += template.substring(i, start);

    // Find matching closing brace
    let depth = 1;
    let end = start + 1;
    while (end < template.length && depth > 0) {
      if (template[end] === '{') depth++;
      if (template[end] === '}') depth--;
      end++;
    }

    if (depth === 0) {
      // Found matching brace
      const expression = template.substring(start + 1, end - 1);
      try {
        const value = evaluateExpression(expression.trim(), context);
        // Check if evaluation failed (returned undefined when it shouldn't)
        if (value === undefined && !expression.trim().includes('undefined')) {
          // If the expression doesn't contain 'undefined' but returned undefined,
          // it likely failed to parse/evaluate
          const isValidExpression =
            expression.trim() in context || // Simple variable
            /^[\w.]+$/.test(expression.trim()) || // Property path
            expression.includes('?') || // Ternary
            /[+\-*/<>=!]/.test(expression); // Operations

          if (!isValidExpression && expression.includes('(')) {
            result += `{ERROR: Unable to evaluate '${expression}'}`;
          } else {
            result += formatValue(value);
          }
        } else {
          result += formatValue(value);
        }
      } catch (error) {
        // Return error placeholder instead of throwing
        result += `{ERROR: ${error instanceof Error ? error.message : 'unknown'}}`;
      }
      i = end;
    } else {
      // Unmatched brace
      result += '{';
      i = start + 1;
    }
  }

  return result;
}

/**
 * Evaluate a single expression in the given context
 *
 * @param expression - Expression to evaluate
 * @param context - Data context
 * @returns Evaluated value
 */
export function evaluateExpression(expression: string, context: Record<string, unknown>): unknown {
  // Handle literals FIRST (before operators to avoid false matches)

  // Handle string literals
  if ((expression.startsWith("'") && expression.endsWith("'")) || (expression.startsWith('"') && expression.endsWith('"'))) {
    return expression.slice(1, -1);
  }

  // Handle number literals (including negative numbers)
  if (/^-?\d+(\.\d+)?$/.test(expression)) {
    return Number(expression);
  }

  // Handle boolean literals
  if (expression === 'true') return true;
  if (expression === 'false') return false;
  if (expression === 'null') return null;
  if (expression === 'undefined') return undefined;

  // Handle ternary operator: condition ? true : false
  const ternaryMatch = expression.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    const [, condition, trueValue, falseValue] = ternaryMatch;
    const conditionResult = evaluateExpression(condition, context);
    const result = isTruthy(conditionResult)
      ? evaluateExpression(trueValue, context)
      : evaluateExpression(falseValue, context);

    // If the result is a string containing {expressions}, recursively parse it
    if (typeof result === 'string' && result.includes('{') && result.includes('}')) {
      return parseTemplate(result, context);
    }
    return result;
  }

  // Handle comparison operators
  if (expression.includes('>=')) {
    const [left, right] = expression.split('>=').map((s) => s.trim());
    return Number(evaluateExpression(left, context)) >= Number(evaluateExpression(right, context));
  }
  if (expression.includes('<=')) {
    const [left, right] = expression.split('<=').map((s) => s.trim());
    return Number(evaluateExpression(left, context)) <= Number(evaluateExpression(right, context));
  }
  if (expression.includes('>')) {
    const [left, right] = expression.split('>').map((s) => s.trim());
    return Number(evaluateExpression(left, context)) > Number(evaluateExpression(right, context));
  }
  if (expression.includes('<')) {
    const [left, right] = expression.split('<').map((s) => s.trim());
    return Number(evaluateExpression(left, context)) < Number(evaluateExpression(right, context));
  }
  if (expression.includes('===')) {
    const [left, right] = expression.split('===').map((s) => s.trim());
    return evaluateExpression(left, context) === evaluateExpression(right, context);
  }
  if (expression.includes('!==')) {
    const [left, right] = expression.split('!==').map((s) => s.trim());
    return evaluateExpression(left, context) !== evaluateExpression(right, context);
  }
  if (expression.includes('==')) {
    const [left, right] = expression.split('==').map((s) => s.trim());
    // eslint-disable-next-line eqeqeq
    return evaluateExpression(left, context) == evaluateExpression(right, context);
  }
  if (expression.includes('!=')) {
    const [left, right] = expression.split('!=').map((s) => s.trim());
    // eslint-disable-next-line eqeqeq
    return evaluateExpression(left, context) != evaluateExpression(right, context);
  }

  // Handle arithmetic operators (check for operators not at start to avoid matching negative numbers)
  if (expression.includes('+') && !expression.includes("'") && !expression.includes('"')) {
    const parts = expression.split('+');
    if (parts.length > 1) {
      const [left, right] = parts.map((s) => s.trim());
      return Number(evaluateExpression(left, context)) + Number(evaluateExpression(right, context));
    }
  }
  if (expression.includes('-') && !expression.includes("'") && !expression.includes('"')) {
    // Only treat as subtraction if there's content before the minus (to avoid matching negative numbers)
    const minusIndex = expression.indexOf('-');
    if (minusIndex > 0) {
      const beforeMinus = expression.substring(0, minusIndex).trim();
      if (beforeMinus.length > 0) {
        const [left, right] = expression.split('-').map((s) => s.trim());
        return Number(evaluateExpression(left, context)) - Number(evaluateExpression(right, context));
      }
    }
  }
  if (expression.includes('*') && !expression.includes("'") && !expression.includes('"')) {
    const [left, right] = expression.split('*').map((s) => s.trim());
    return Number(evaluateExpression(left, context)) * Number(evaluateExpression(right, context));
  }
  if (expression.includes('/') && !expression.includes("'") && !expression.includes('"')) {
    const [left, right] = expression.split('/').map((s) => s.trim());
    return Number(evaluateExpression(left, context)) / Number(evaluateExpression(right, context));
  }

  // Handle method calls (limited to safe string methods)
  if (expression.includes('.')) {
    // Support both single and double quotes
    const methodMatch = expression.match(/^(['"])(.+)\1\.(\w+)\(([^)]*)\)$/);
    if (methodMatch) {
      const [, , str, method, argsStr] = methodMatch;
      return callStringMethod(str, method, argsStr);
    }

    // Property access with method call
    const propMethodMatch = expression.match(/^([\w.[\]']+)\.(\w+)\(([^)]*)\)$/);
    if (propMethodMatch) {
      const [, propPath, method, argsStr] = propMethodMatch;
      const value = evaluateExpression(propPath, context);
      if (typeof value === 'string') {
        return callStringMethod(value, method, argsStr);
      }
    }

    // Simple property access
    return getNestedValue(context, expression);
  }

  // Simple variable lookup
  return context[expression];
}

/**
 * Call a safe string method
 *
 * Only allows specific string methods to prevent code injection.
 *
 * @param str - String to operate on
 * @param method - Method name
 * @param argsStr - Arguments string
 * @returns Result of method call
 */
function callStringMethod(str: string, method: string, argsStr: string): unknown {
  const args = argsStr.split(',').map((s) => s.trim());

  switch (method) {
    case 'repeat': {
      const count = Number(args[0]);
      return str.repeat(count);
    }
    case 'substring': {
      const start = Number(args[0]);
      const end = args[1] !== undefined ? Number(args[1]) : undefined;
      return str.substring(start, end);
    }
    case 'slice': {
      const start = Number(args[0]);
      const end = args[1] !== undefined ? Number(args[1]) : undefined;
      return str.slice(start, end);
    }
    case 'toUpperCase':
      return str.toUpperCase();
    case 'toLowerCase':
      return str.toLowerCase();
    case 'trim':
      return str.trim();
    case 'replace': {
      const search = args[0].replace(/^['"]|['"]$/g, '');
      const replace = args[1].replace(/^['"]|['"]$/g, '');
      return str.replace(search, replace);
    }
    default:
      throw new Error(`Method ${method} is not allowed in templates`);
  }
}

/**
 * Check if a value is truthy
 *
 * @param value - Value to check
 * @returns True if value is truthy
 */
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

/**
 * Format a value for output
 *
 * @param value - Value to format
 * @returns Formatted string
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
