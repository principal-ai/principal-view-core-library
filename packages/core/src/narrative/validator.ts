/**
 * Narrative Template Validator
 * Validates .narrative.json files against their corresponding .otel.canvas files
 */

import type { NarrativeTemplate } from './types';
import type { ExtendedCanvas } from '../types/canvas';
import { existsSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// Validation Types
// ============================================================================

export interface NarrativeValidationContext {
  /** The narrative template being validated */
  narrative: NarrativeTemplate;

  /** Path to the narrative file */
  narrativePath: string;

  /** The canvas file (if found) */
  canvas?: ExtendedCanvas;

  /** Path to the canvas file */
  canvasPath?: string;

  /** Base path for resolving relative paths */
  basePath: string;

  /** Raw narrative content for line number lookup */
  rawContent?: string;
}

export interface NarrativeViolation {
  /** Rule ID that detected this violation */
  ruleId: string;

  /** Severity level */
  severity: 'error' | 'warn';

  /** File path */
  file: string;

  /** Line number (1-indexed) */
  line?: number;

  /** JSON path to the problematic field */
  path?: string;

  /** Clear error message */
  message: string;

  /** Explanation of impact */
  impact: string;

  /** Suggestion for fixing */
  suggestion?: string;

  /** Whether this can be auto-fixed */
  fixable: boolean;
}

export interface NarrativeValidationResult {
  /** All violations found */
  violations: NarrativeViolation[];

  /** Count of errors */
  errorCount: number;

  /** Count of warnings */
  warningCount: number;

  /** Count of fixable violations */
  fixableCount: number;
}

// ============================================================================
// Validator Implementation
// ============================================================================

export class NarrativeValidator {
  /**
   * Validate a narrative template
   */
  async validate(
    context: NarrativeValidationContext
  ): Promise<NarrativeValidationResult> {
    const violations: NarrativeViolation[] = [];

    // Run all validation rules
    violations.push(...this.checkSchema(context));
    violations.push(...this.checkCanvasExists(context));

    // Only run canvas-dependent checks if canvas was loaded
    if (context.canvas) {
      violations.push(...this.checkEventReferences(context));
      violations.push(...this.checkAttributeReferences(context));
    }

    violations.push(...this.checkScenarios(context));
    violations.push(...this.checkTemplateSyntax(context));
    violations.push(...this.checkFormattingOptions(context));

    return this.aggregateResults(violations);
  }

  /**
   * Check schema validity (required fields, valid values)
   */
  private checkSchema(context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const { narrative, narrativePath } = context;

    // Check version
    if (!narrative.version) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'version',
        message: 'Missing required field "version"',
        impact: 'Cannot determine template version for compatibility',
        suggestion: 'Add a version field (e.g., "1.0.0")',
        fixable: false,
      });
    } else if (!this.isValidSemver(narrative.version)) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'version',
        message: `Invalid version format: "${narrative.version}"`,
        impact: 'Version must follow semver format',
        suggestion: 'Use semver format like "1.0.0"',
        fixable: false,
      });
    }

    // Check canvas reference
    if (!narrative.canvas) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'canvas',
        message: 'Missing required field "canvas"',
        impact: 'Cannot determine which canvas this narrative belongs to',
        suggestion: 'Add a canvas field pointing to an .otel.canvas file',
        fixable: false,
      });
    }

    // Check name
    if (!narrative.name) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'name',
        message: 'Missing required field "name"',
        impact: 'Cannot identify this narrative template',
        suggestion: 'Add a human-readable name',
        fixable: false,
      });
    }

    // Check description
    if (!narrative.description) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'description',
        message: 'Missing required field "description"',
        impact: 'Cannot understand the purpose of this narrative',
        suggestion: 'Add a description explaining what this narrative shows',
        fixable: false,
      });
    }

    // Check mode
    const validModes = ['span-tree', 'timeline', 'summary-only'];
    if (!narrative.mode) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'mode',
        message: 'Missing required field "mode"',
        impact: 'Cannot determine how to structure the narrative',
        suggestion: `Set mode to one of: ${validModes.join(', ')}`,
        fixable: false,
      });
    } else if (!validModes.includes(narrative.mode)) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'mode',
        message: `Invalid mode: "${narrative.mode}"`,
        impact: 'Mode must be one of the supported types',
        suggestion: `Use one of: ${validModes.join(', ')}`,
        fixable: false,
      });
    }

    // Check scenarioSelection
    const validSelections = ['first-match', 'manual'];
    if (narrative.scenarioSelection && !validSelections.includes(narrative.scenarioSelection)) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'scenarioSelection',
        message: `Invalid scenarioSelection: "${narrative.scenarioSelection}"`,
        impact: 'Scenario selection must be a valid type',
        suggestion: `Use one of: ${validSelections.join(', ')}`,
        fixable: false,
      });
    }

    // Check scenarios array
    if (!narrative.scenarios || !Array.isArray(narrative.scenarios)) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'scenarios',
        message: 'Missing or invalid "scenarios" field',
        impact: 'Cannot generate narratives without scenarios',
        suggestion: 'Add a scenarios array with at least one scenario',
        fixable: false,
      });
    } else if (narrative.scenarios.length === 0) {
      violations.push({
        ruleId: 'narrative-schema-valid',
        severity: 'error',
        file: narrativePath,
        path: 'scenarios',
        message: 'Scenarios array is empty',
        impact: 'Cannot generate narratives without scenarios',
        suggestion: 'Add at least one scenario definition',
        fixable: false,
      });
    }

    return violations;
  }

  /**
   * Check that the referenced canvas file exists
   */
  private checkCanvasExists(context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const { narrative, narrativePath, basePath, canvasPath } = context;

    if (!narrative.canvas) {
      // Already flagged by checkSchema
      return violations;
    }

    // Resolve canvas path
    const resolvedPath = canvasPath || resolve(basePath, narrative.canvas);

    if (!existsSync(resolvedPath)) {
      violations.push({
        ruleId: 'narrative-canvas-exists',
        severity: 'error',
        file: narrativePath,
        path: 'canvas',
        message: `Referenced canvas file does not exist: ${narrative.canvas}`,
        impact: 'Cannot validate event references without the canvas',
        suggestion: 'Ensure the canvas field points to a valid .otel.canvas file',
        fixable: false,
      });
    }

    return violations;
  }

  /**
   * Check that events referenced in templates exist in the canvas
   *
   * Note: This is currently a placeholder as canvas files don't yet define event schemas.
   * In the future, when canvas files include OTEL event schema definitions,
   * this will validate event references.
   */
  private checkEventReferences(_context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    // const { narrative, narrativePath, canvas } = context;

    // TODO: Add event schema to canvas types and validate here
    // For now, we skip this validation since canvas doesn't define events
    // Event validation will happen at runtime when rendering narratives

    return violations;
  }

  /**
   * Check that scenarios are well-formed
   */
  private checkScenarios(context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const { narrative, narrativePath } = context;

    if (!narrative.scenarios || narrative.scenarios.length === 0) {
      return violations; // Already flagged by checkSchema
    }

    const scenarioIds = new Set<string>();
    const priorities = new Set<number>();
    let hasDefault = false;

    narrative.scenarios.forEach((scenario, idx) => {
      // Check for required fields
      if (!scenario.id) {
        violations.push({
          ruleId: 'narrative-scenario-valid',
          severity: 'error',
          file: narrativePath,
          path: `scenarios[${idx}].id`,
          message: 'Scenario is missing required "id" field',
          impact: 'Cannot identify this scenario',
          suggestion: 'Add a unique ID for this scenario',
          fixable: false,
        });
      } else {
        // Check for duplicate IDs
        if (scenarioIds.has(scenario.id)) {
          violations.push({
            ruleId: 'narrative-scenario-valid',
            severity: 'error',
            file: narrativePath,
            path: `scenarios[${idx}].id`,
            message: `Duplicate scenario ID: "${scenario.id}"`,
            impact: 'Scenario IDs must be unique',
            suggestion: 'Use a unique identifier for each scenario',
            fixable: false,
          });
        }
        scenarioIds.add(scenario.id);
      }

      // Check priority
      if (scenario.priority === undefined || scenario.priority === null) {
        violations.push({
          ruleId: 'narrative-scenario-valid',
          severity: 'error',
          file: narrativePath,
          path: `scenarios[${idx}].priority`,
          message: 'Scenario is missing required "priority" field',
          impact: 'Cannot determine scenario selection order',
          suggestion: 'Add a priority (lower number = higher priority)',
          fixable: false,
        });
      } else {
        if (scenario.priority < 0) {
          violations.push({
            ruleId: 'narrative-scenario-valid',
            severity: 'error',
            file: narrativePath,
            path: `scenarios[${idx}].priority`,
            message: 'Priority must be a non-negative number',
            impact: 'Invalid priority value',
            suggestion: 'Use a positive integer (1 = highest priority)',
            fixable: false,
          });
        }

        // Check for duplicate priorities
        if (priorities.has(scenario.priority)) {
          violations.push({
            ruleId: 'narrative-scenario-valid',
            severity: 'error',
            file: narrativePath,
            path: `scenarios[${idx}].priority`,
            message: `Duplicate priority: ${scenario.priority}`,
            impact: 'Priorities must be unique to determine selection order',
            suggestion: 'Assign unique priority values to each scenario',
            fixable: false,
          });
        }
        priorities.add(scenario.priority);
      }

      // Check for default scenario
      if (scenario.condition?.default === true) {
        hasDefault = true;
      }

      // Check condition
      if (!scenario.condition) {
        violations.push({
          ruleId: 'narrative-scenario-valid',
          severity: 'error',
          file: narrativePath,
          path: `scenarios[${idx}].condition`,
          message: 'Scenario is missing required "condition" field',
          impact: 'Cannot determine when to use this scenario',
          suggestion: 'Add a condition or set default: true',
          fixable: false,
        });
      }

      // Check template
      if (!scenario.template) {
        violations.push({
          ruleId: 'narrative-scenario-valid',
          severity: 'error',
          file: narrativePath,
          path: `scenarios[${idx}].template`,
          message: 'Scenario is missing required "template" field',
          impact: 'Cannot render narrative without a template',
          suggestion: 'Add a template with introduction, events, or flow',
          fixable: false,
        });
      }
    });

    // Ensure at least one default scenario exists
    if (!hasDefault) {
      violations.push({
        ruleId: 'narrative-scenario-valid',
        severity: 'error',
        file: narrativePath,
        path: 'scenarios',
        message: 'No default scenario defined',
        impact: 'Narrative rendering may fail if no scenario matches',
        suggestion: 'Add a scenario with "condition.default: true" as a fallback',
        fixable: false,
      });
    }

    return violations;
  }

  /**
   * Check template syntax (balanced braces, valid expressions)
   */
  private checkTemplateSyntax(context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const { narrative, narrativePath } = context;

    narrative.scenarios.forEach((scenario, scenarioIdx) => {
      if (!scenario.template) {
        return;
      }

      const template = scenario.template;

      // Check introduction
      if (template.introduction) {
        violations.push(...this.validateTemplateString(
          template.introduction,
          narrativePath,
          `scenarios[${scenarioIdx}].template.introduction`
        ));
      }

      // Check summary
      if (template.summary) {
        violations.push(...this.validateTemplateString(
          template.summary,
          narrativePath,
          `scenarios[${scenarioIdx}].template.summary`
        ));
      }

      // Check event templates
      if (template.events) {
        Object.entries(template.events).forEach(([eventName, templateStr]) => {
          violations.push(...this.validateTemplateString(
            templateStr,
            narrativePath,
            `scenarios[${scenarioIdx}].template.events.${eventName}`
          ));
        });
      }

      // Check log templates
      if (template.logs) {
        Object.entries(template.logs).forEach(([severity, templateStr]) => {
          if (typeof templateStr === 'string') {
            violations.push(...this.validateTemplateString(
              templateStr,
              narrativePath,
              `scenarios[${scenarioIdx}].template.logs.${severity}`
            ));
          }
        });
      }

      // Check flow templates
      if (template.flow && Array.isArray(template.flow)) {
        template.flow.forEach((item, flowIdx) => {
          if (typeof item === 'string') {
            violations.push(...this.validateTemplateString(
              item,
              narrativePath,
              `scenarios[${scenarioIdx}].template.flow[${flowIdx}]`
            ));
          } else if (typeof item === 'object' && item.template) {
            violations.push(...this.validateTemplateString(
              item.template,
              narrativePath,
              `scenarios[${scenarioIdx}].template.flow[${flowIdx}].template`
            ));
          }
        });
      }
    });

    return violations;
  }

  /**
   * Validate a single template string
   */
  private validateTemplateString(
    templateStr: string,
    file: string,
    path: string
  ): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];

    // Check for balanced braces
    let braceDepth = 0;
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < templateStr.length; i++) {
      const char = templateStr[i];
      const prevChar = i > 0 ? templateStr[i - 1] : '';

      // Track quotes
      if ((char === "'" || char === '"') && prevChar !== '\\') {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
          quoteChar = '';
        }
      }

      // Track braces (only outside of quotes)
      if (!inQuote) {
        if (char === '{') {
          braceDepth++;
        } else if (char === '}') {
          braceDepth--;
          if (braceDepth < 0) {
            violations.push({
              ruleId: 'narrative-template-syntax',
              severity: 'error',
              file,
              path,
              message: 'Unbalanced braces: closing } without opening {',
              impact: 'Template will fail to render',
              suggestion: 'Ensure all {expressions} have matching braces',
              fixable: false,
            });
            break;
          }
        }
      }
    }

    if (braceDepth > 0) {
      violations.push({
        ruleId: 'narrative-template-syntax',
        severity: 'error',
        file,
        path,
        message: 'Unbalanced braces: missing closing }',
        impact: 'Template will fail to render',
        suggestion: 'Ensure all {expressions} have matching braces',
        fixable: false,
      });
    }

    // Check for incomplete conditional expressions (? without :)
    const conditionalPattern = /\{[^}]*\?[^}]*\}/g;
    const conditionals = templateStr.match(conditionalPattern) || [];

    conditionals.forEach((expr) => {
      // Simple check: if has ? but no :, it's incomplete
      const questionCount = (expr.match(/\?/g) || []).length;
      const colonCount = (expr.match(/:/g) || []).length;

      if (questionCount > colonCount) {
        violations.push({
          ruleId: 'narrative-template-syntax',
          severity: 'error',
          file,
          path,
          message: `Incomplete conditional expression: ${expr}`,
          impact: 'Template will fail to render',
          suggestion: 'Conditional format: {condition ? "true" : "false"}',
          fixable: false,
        });
      }
    });

    return violations;
  }

  /**
   * Check attribute references (warning level)
   */
  private checkAttributeReferences(_context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    // This would require parsing template expressions and checking against canvas schemas
    // Implementing as a warning-level check for future enhancement
    return violations;
  }

  /**
   * Check formatting options
   */
  private checkFormattingOptions(context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const { narrative, narrativePath } = context;

    if (!narrative.formatting) {
      return violations;
    }

    // Check showAttributes
    if (narrative.formatting.showAttributes) {
      const validValues = ['none', 'matched', 'all'];
      if (!validValues.includes(narrative.formatting.showAttributes)) {
        violations.push({
          ruleId: 'narrative-formatting-options',
          severity: 'warn',
          file: narrativePath,
          path: 'formatting.showAttributes',
          message: `Invalid showAttributes value: "${narrative.formatting.showAttributes}"`,
          impact: 'May not display attributes correctly',
          suggestion: `Use one of: ${validValues.join(', ')}`,
          fixable: false,
        });
      }
    }

    return violations;
  }

  /**
   * Aggregate violations into result
   */
  private aggregateResults(violations: NarrativeViolation[]): NarrativeValidationResult {
    let errorCount = 0;
    let warningCount = 0;
    let fixableCount = 0;

    violations.forEach((v) => {
      if (v.severity === 'error') {
        errorCount++;
      } else {
        warningCount++;
      }
      if (v.fixable) {
        fixableCount++;
      }
    });

    return {
      violations,
      errorCount,
      warningCount,
      fixableCount,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Check if a version string is valid semver
   */
  private isValidSemver(version: string): boolean {
    const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    return semverPattern.test(version);
  }

  /**
   * Check if an event name matches any available event (supports globs)
   */
  private matchesEventPattern(eventName: string, availableEvents: string[]): boolean {
    // Exact match
    if (availableEvents.includes(eventName)) {
      return true;
    }

    // Glob pattern matching (simple implementation)
    // Supports: *.error, rule.*, *.*
    const pattern = eventName.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);

    return availableEvents.some((e) => regex.test(e));
  }
}

/**
 * Create a validator instance
 */
export function createNarrativeValidator(): NarrativeValidator {
  return new NarrativeValidator();
}
