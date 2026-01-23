/**
 * Template Parser using Handlebars
 *
 * Parses and evaluates template expressions using Handlebars syntax:
 * - Variables: {{variable}}
 * - Nested properties: {{result.violations.total}}
 * - Conditionals: {{#if condition}}...{{/if}}
 * - Loops: {{#each items}}...{{/each}}
 */

import Handlebars from 'handlebars';

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

