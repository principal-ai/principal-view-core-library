/**
 * Template Parser using Handlebars
 *
 * Parses and evaluates template expressions using Handlebars syntax:
 * - Variables: {{variable}}
 * - Nested properties: {{result.violations.total}}
 * - Conditionals: {{#if condition}}...{{/if}}
 * - Loops: {{#each items}}...{{/each}}
 * - Comparison helpers: {{#if (eq a b)}}...{{/if}}
 */

import Handlebars from 'handlebars';

// Register common comparison helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('ne', (a, b) => a !== b);
Handlebars.registerHelper('lt', (a, b) => a < b);
Handlebars.registerHelper('gt', (a, b) => a > b);
Handlebars.registerHelper('lte', (a, b) => a <= b);
Handlebars.registerHelper('gte', (a, b) => a >= b);
Handlebars.registerHelper('and', (...args) => {
  // Last argument is Handlebars options object
  const values = args.slice(0, -1);
  return values.every(Boolean);
});
Handlebars.registerHelper('or', (...args) => {
  // Last argument is Handlebars options object
  const values = args.slice(0, -1);
  return values.some(Boolean);
});
Handlebars.registerHelper('not', (a) => !a);

/**
 * Parse and evaluate a template string using Handlebars
 *
 * @param template - Template string with {{variables}}
 * @param context - Data context for variable lookup
 * @returns Evaluated string
 */
export function parseTemplate(template: string, context: Record<string, unknown>): string {
  try {
    const handlebarTemplate = Handlebars.compile(template, { noEscape: true });
    return handlebarTemplate(context);
  } catch (error) {
    return `{ERROR: Template parsing failed - ${error instanceof Error ? error.message : 'unknown'}}`;
  }
}

