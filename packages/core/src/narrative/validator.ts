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

  /** Execution data for validating attribute references (optional) */
  executionData?: {
    /** Aggregated attributes available in templates */
    aggregates: Record<string, unknown>;
    /** Attributes grouped by event name */
    eventAttributes: Map<string, Record<string, unknown>>;
  };
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
    violations.push(...this.checkScenarios(context));

    // Check event name syntax BEFORE checking event references
    // This ensures we catch unsupported syntax before trying to match events
    violations.push(...this.checkEventNameSyntax(context));

    // Only run canvas-dependent checks if canvas was loaded
    if (context.canvas) {
      violations.push(...this.checkEventReferences(context));
      violations.push(...this.checkAttributeReferences(context));
    }

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
    const validModes = ['span-tree', 'timeline'];
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
  private checkEventReferences(context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const { narrative, narrativePath, canvas } = context;

    if (!canvas || !canvas.nodes) {
      return violations;
    }

    // Extract all event names from canvas nodes
    const canvasEvents = new Set<string>();
    for (const node of canvas.nodes) {
      if (node.pv?.event?.name) {
        canvasEvents.add(node.pv.event.name);
      }
    }

    // Extract all event names from narrative scenarios
    const narrativeEvents = new Set<string>();
    for (const scenario of narrative.scenarios) {
      // From condition.requires
      if (scenario.condition?.requires) {
        for (const eventPattern of scenario.condition.requires) {
          // Skip wildcard patterns for now
          if (!eventPattern.includes('*')) {
            narrativeEvents.add(eventPattern);
          }
        }
      }
      // From template.events
      if (scenario.template?.events) {
        for (const eventName of Object.keys(scenario.template.events)) {
          narrativeEvents.add(eventName);
        }
      }
    }

    // Check for narrative events not in canvas
    for (const eventName of narrativeEvents) {
      if (!canvasEvents.has(eventName)) {
        violations.push({
          ruleId: 'narrative-event-sync',
          severity: 'error',
          file: narrativePath,
          path: 'events',
          message: `Narrative references event "${eventName}" which is not defined in canvas`,
          impact: 'This event will never highlight a canvas node and may never match',
          suggestion: `Add event "${eventName}" to a node in ${narrative.canvas} or remove it from the narrative`,
          fixable: false,
        });
      }
    }

    // Check for canvas events not in narrative (warning only)
    for (const eventName of canvasEvents) {
      if (!narrativeEvents.has(eventName)) {
        violations.push({
          ruleId: 'narrative-event-coverage',
          severity: 'warn',
          file: narrativePath,
          path: 'events',
          message: `Canvas defines event "${eventName}" which is not used in any narrative scenario`,
          impact: 'This canvas node may never be highlighted during narrative playback',
          suggestion: `Add event "${eventName}" to a scenario's template.events or condition.requires`,
          fixable: false,
        });
      }
    }

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
      } else {
        // Validate condition structure
        violations.push(...this.checkConditionStructure(scenario.condition, narrativePath, idx));
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
      } else {
        // Validate template structure
        violations.push(...this.checkTemplateStructure(scenario.template, narrativePath, idx));
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
   * Check that condition uses valid fields (not legacy format)
   */
  private checkConditionStructure(
    condition: any,
    file: string,
    scenarioIdx: number
  ): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const validFields = ['requires', 'excludes', 'assertions', 'default', 'any'];
    const conditionKeys = Object.keys(condition);

    // Check for invalid/legacy fields
    for (const key of conditionKeys) {
      if (!validFields.includes(key)) {
        // Check for common legacy format fields
        if (key === 'event') {
          violations.push({
            ruleId: 'narrative-condition-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].condition.${key}`,
            message: `Invalid condition field "${key}" (legacy format detected)`,
            impact: 'Condition will not work - "event" field is not supported',
            suggestion: 'Use "requires: [...]" array instead of "event: ..." field',
            fixable: false,
          });
        } else if (key === 'attributes') {
          violations.push({
            ruleId: 'narrative-condition-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].condition.${key}`,
            message: `Invalid condition field "${key}" (legacy format detected)`,
            impact: 'Condition will not work - "attributes" field is not supported',
            suggestion: 'Use "assertions: { ... }" instead of "attributes: { ... }" field',
            fixable: false,
          });
        } else {
          violations.push({
            ruleId: 'narrative-condition-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].condition.${key}`,
            message: `Unknown condition field "${key}"`,
            impact: 'This field will be ignored and may cause unexpected behavior',
            suggestion: `Valid fields are: ${validFields.join(', ')}`,
            fixable: false,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check that template uses valid fields (not legacy format)
   */
  private checkTemplateStructure(
    template: any,
    file: string,
    scenarioIdx: number
  ): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const validFields = ['introduction', 'events', 'logs', 'flow', 'summary', 'span', 'children'];
    const templateKeys = Object.keys(template);

    // Check for invalid/legacy fields
    for (const key of templateKeys) {
      if (!validFields.includes(key)) {
        // Check for common legacy format fields
        if (key === 'steps') {
          violations.push({
            ruleId: 'narrative-template-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].template.${key}`,
            message: `Invalid template field "${key}" (legacy format detected)`,
            impact: 'Template will not render - "steps" field is not supported',
            suggestion: 'Use "events: { eventName: template }" to map event names to templates',
            fixable: false,
          });
        } else if (key === 'details') {
          violations.push({
            ruleId: 'narrative-template-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].template.${key}`,
            message: `Invalid template field "${key}" (legacy format detected)`,
            impact: 'Template will not render - "details" field is not supported',
            suggestion: 'Remove "details" field - use template variables in "events" or "summary" instead',
            fixable: false,
          });
        } else {
          violations.push({
            ruleId: 'narrative-template-structure',
            severity: 'error',
            file,
            path: `scenarios[${scenarioIdx}].template.${key}`,
            message: `Unknown template field "${key}"`,
            impact: 'This field will be ignored and may cause unexpected behavior',
            suggestion: `Valid fields are: ${validFields.join(', ')}`,
            fixable: false,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check that event names don't use attribute filter syntax
   */
  private checkEventNameSyntax(context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const { narrative, narrativePath } = context;

    narrative.scenarios.forEach((scenario, scenarioIdx) => {
      // Check condition.requires
      if (scenario.condition?.requires) {
        scenario.condition.requires.forEach((eventPattern, idx) => {
          if (eventPattern.includes('[') && eventPattern.includes(']')) {
            violations.push({
              ruleId: 'narrative-event-name-syntax',
              severity: 'error',
              file: narrativePath,
              path: `scenarios[${scenarioIdx}].condition.requires[${idx}]`,
              message: `Event name uses unsupported [attribute=value] syntax: "${eventPattern}"`,
              impact: 'Attribute filter syntax is not supported - event will not match',
              suggestion: `Use a distinct event name instead (e.g., "${this.extractBaseEventName(eventPattern)}.${this.extractAttributeValue(eventPattern)}")`,
              fixable: false,
            });
          }
        });
      }

      // Check condition.excludes
      if (scenario.condition?.excludes) {
        scenario.condition.excludes.forEach((eventPattern, idx) => {
          if (eventPattern.includes('[') && eventPattern.includes(']')) {
            violations.push({
              ruleId: 'narrative-event-name-syntax',
              severity: 'error',
              file: narrativePath,
              path: `scenarios[${scenarioIdx}].condition.excludes[${idx}]`,
              message: `Event name uses unsupported [attribute=value] syntax: "${eventPattern}"`,
              impact: 'Attribute filter syntax is not supported - event will not match',
              suggestion: `Use a distinct event name instead (e.g., "${this.extractBaseEventName(eventPattern)}.${this.extractAttributeValue(eventPattern)}")`,
              fixable: false,
            });
          }
        });
      }

      // Check template.events
      if (scenario.template?.events) {
        Object.keys(scenario.template.events).forEach((eventName) => {
          if (eventName.includes('[') && eventName.includes(']')) {
            violations.push({
              ruleId: 'narrative-event-name-syntax',
              severity: 'error',
              file: narrativePath,
              path: `scenarios[${scenarioIdx}].template.events["${eventName}"]`,
              message: `Event name uses unsupported [attribute=value] syntax: "${eventName}"`,
              impact: 'Attribute filter syntax is not supported - template will never render',
              suggestion: `Use a distinct event name instead (e.g., "${this.extractBaseEventName(eventName)}.${this.extractAttributeValue(eventName)}")`,
              fixable: false,
            });
          }
        });
      }
    });

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
              suggestion: 'Ensure all {{variables}} and {expressions} have matching braces',
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
        suggestion: 'Ensure all {{variables}} and {expressions} have matching braces',
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
   * Check attribute references against execution data
   *
   * Validates that:
   * - Attributes referenced in templates exist in execution data
   * - Object attributes are accessed via properties (not used directly)
   * - Attribute names are correct (catches typos)
   */
  private checkAttributeReferences(context: NarrativeValidationContext): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];
    const { narrative, narrativePath, executionData } = context;

    // Skip if no execution data provided
    if (!executionData) {
      return violations;
    }

    const { aggregates, eventAttributes } = executionData;

    // Check each scenario's template
    for (const scenario of narrative.scenarios) {
      const scenarioPath = `scenarios[${scenario.id}]`;

      // Check introduction template
      if (scenario.template.introduction) {
        const attrs = this.extractAttributeReferences(scenario.template.introduction);
        violations.push(
          ...this.validateAttributes(
            attrs,
            aggregates,
            null, // introduction doesn't have specific event context
            narrativePath,
            `${scenarioPath}.template.introduction`
          )
        );
      }

      // Check event templates
      if (scenario.template.events) {
        for (const [eventName, eventTemplate] of Object.entries(scenario.template.events)) {
          const attrs = this.extractAttributeReferences(eventTemplate);
          const eventAttrs = eventAttributes.get(eventName);

          violations.push(
            ...this.validateAttributes(
              attrs,
              aggregates,
              eventAttrs || null,
              narrativePath,
              `${scenarioPath}.template.events.${eventName}`,
              eventName
            )
          );
        }
      }

      // Check summary template
      if (scenario.template.summary) {
        const attrs = this.extractAttributeReferences(scenario.template.summary);
        violations.push(
          ...this.validateAttributes(
            attrs,
            aggregates,
            null, // summary uses global aggregates
            narrativePath,
            `${scenarioPath}.template.summary`
          )
        );
      }
    }

    return violations;
  }

  /**
   * Validate a list of attribute references against available data
   *
   * @param attributes - Attribute paths to validate
   * @param aggregates - Global aggregate attributes
   * @param eventAttributes - Event-specific attributes (if validating event template)
   * @param file - File path for violation reporting
   * @param path - JSON path for violation reporting
   * @param eventName - Event name (if validating event template)
   * @returns Array of violations found
   */
  private validateAttributes(
    attributes: string[],
    aggregates: Record<string, unknown>,
    eventAttributes: Record<string, unknown> | null,
    file: string,
    path: string,
    eventName?: string
  ): NarrativeViolation[] {
    const violations: NarrativeViolation[] = [];

    for (const attr of attributes) {
      // Check if attribute exists in global aggregates
      const globalValue = aggregates[attr];
      const eventValue = eventAttributes?.[attr];

      // Attribute doesn't exist anywhere
      if (globalValue === undefined && eventValue === undefined) {
        // Try to find similar attributes for helpful suggestions
        const allKeys = [
          ...Object.keys(aggregates),
          ...(eventAttributes ? Object.keys(eventAttributes) : []),
        ];
        const similar = this.findSimilarAttributes(attr, allKeys);

        violations.push({
          ruleId: 'narrative-attribute-undefined',
          severity: 'warn',
          file,
          path,
          message: eventName
            ? `Attribute "{{${attr}}}" not found in event "${eventName}" or global aggregates`
            : `Attribute "{{${attr}}}" not found in execution data`,
          impact: 'Template will render as empty or "undefined"',
          suggestion: similar.length > 0 ? `Did you mean: ${similar.join(', ')}?` : undefined,
          fixable: false,
        });
        continue;
      }

      // Check if object is used directly (should use property access)
      const value = eventValue !== undefined ? eventValue : globalValue;
      if (this.isObjectType(value)) {
        const objectKeys = Object.keys(value as Record<string, unknown>);
        const suggestions = objectKeys.slice(0, 3).map((k) => `{{${attr}.${k}}}`);

        violations.push({
          ruleId: 'narrative-attribute-object',
          severity: 'warn',
          file,
          path,
          message: `Attribute "{{${attr}}}" is an object and will render as "[object Object]"`,
          impact: 'Template will show "[object Object]" instead of useful data',
          suggestion: `Access a property instead: ${suggestions.join(', ')}`,
          fixable: false,
        });
      }
    }

    return violations;
  }

  /**
   * Find similar attribute names for helpful suggestions
   *
   * Uses simple string similarity (Levenshtein-like) to find typos
   *
   * @param target - The attribute being searched for
   * @param available - Available attribute names
   * @returns Array of similar attribute names (max 3)
   */
  private findSimilarAttributes(target: string, available: string[]): string[] {
    const similar: Array<{ attr: string; score: number }> = [];

    for (const attr of available) {
      // Check for prefix match
      if (attr.startsWith(target) || target.startsWith(attr)) {
        similar.push({ attr, score: 10 });
        continue;
      }

      // Check for substring match
      if (attr.includes(target) || target.includes(attr)) {
        similar.push({ attr, score: 5 });
        continue;
      }

      // Check for similar structure (same number of dots)
      const targetParts = target.split('.');
      const attrParts = attr.split('.');
      if (targetParts.length === attrParts.length) {
        // Check if any parts match
        const matchingParts = targetParts.filter((p, i) => p === attrParts[i]).length;
        if (matchingParts > 0) {
          similar.push({ attr, score: matchingParts });
        }
      }
    }

    // Sort by score and return top 3
    return similar
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.attr);
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

  /**
   * Extract base event name from event pattern
   *
   * Examples:
   * - "installation.started" -> "installation.started"
   * - "installation.progress[stage=skills_discovered]" -> "installation.progress"
   * - "error.*[severity=high]" -> "error.*"
   */
  private extractBaseEventName(eventPattern: string): string {
    const bracketIndex = eventPattern.indexOf('[');
    if (bracketIndex === -1) {
      return eventPattern;
    }
    return eventPattern.substring(0, bracketIndex);
  }

  /**
   * Extract attribute value from event pattern for suggestion
   *
   * Examples:
   * - "installation.progress[stage=skills_discovered]" -> "skills_discovered"
   * - "error.*[severity=high]" -> "high"
   * - "installation.started" -> ""
   */
  private extractAttributeValue(eventPattern: string): string {
    const match = eventPattern.match(/\[.*?=(.*?)\]/);
    if (!match) {
      return '';
    }
    return match[1];
  }

  /**
   * Extract attribute references from Handlebars template
   *
   * Parses template strings like:
   * - "{{source}}" -> ["source"]
   * - "{{source.url}}" -> ["source.url"]
   * - "{{#if options.global}}" -> ["options.global"]
   * - "{{#if (eq install.mode 'symlink')}}" -> ["install.mode"]
   *
   * @param template - Handlebars template string
   * @returns Array of attribute paths referenced in the template
   */
  private extractAttributeReferences(template: string): string[] {
    const attributes = new Set<string>();

    // Match all Handlebars expressions: {{...}}
    const expressionPattern = /\{\{([^}]+)\}\}/g;
    let match;

    while ((match = expressionPattern.exec(template)) !== null) {
      const expression = match[1].trim();

      // Skip block helpers closing tags
      if (expression.startsWith('/')) {
        continue;
      }

      // Handle block helpers: #if, #each, #unless, etc.
      if (expression.startsWith('#')) {
        // Extract the condition/expression after the helper
        const helperMatch = expression.match(/^#\w+\s+(.+)$/);
        if (helperMatch) {
          this.extractAttributesFromExpression(helperMatch[1], attributes);
        }
        continue;
      }

      // Handle regular expressions
      this.extractAttributesFromExpression(expression, attributes);
    }

    return Array.from(attributes);
  }

  /**
   * Extract attribute references from a single Handlebars expression
   *
   * Handles:
   * - Simple references: source.url
   * - Helper calls: (eq install.mode 'symlink')
   * - Nested expressions
   *
   * @param expression - The expression to parse
   * @param attributes - Set to add found attributes to
   */
  private extractAttributesFromExpression(expression: string, attributes: Set<string>): void {
    // Remove helper parentheses: (eq install.mode 'symlink') -> eq install.mode 'symlink'
    const cleaned = expression.replace(/^\(|\)$/g, '').trim();

    // Split on spaces to handle helper arguments
    const parts = cleaned.split(/\s+/);

    for (const part of parts) {
      // Skip helper names, string literals, numbers, and boolean literals
      if (
        part.match(/^(if|unless|each|with|eq|ne|lt|gt|lte|gte|and|or|not)$/) ||
        part.match(/^['"].*['"]$/) ||
        part.match(/^\d+$/) ||
        part.match(/^(true|false|null|undefined)$/)
      ) {
        continue;
      }

      // Remove any remaining quotes or parentheses
      const cleanPart = part.replace(/['"()]/g, '');

      // If it looks like an attribute path (contains letters/dots/underscores)
      if (cleanPart && cleanPart.match(/^[a-zA-Z_][a-zA-Z0-9_.]*$/)) {
        attributes.add(cleanPart);
      }
    }
  }

  /**
   * Check if an attribute is an object type
   *
   * @param value - The attribute value to check
   * @returns true if value is a plain object (not array, not null)
   */
  private isObjectType(value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    );
  }
}

/**
 * Create a validator instance
 */
export function createNarrativeValidator(): NarrativeValidator {
  return new NarrativeValidator();
}
