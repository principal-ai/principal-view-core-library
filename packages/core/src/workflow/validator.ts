/**
 * Workflow Template Validator
 * Validates .workflow.json files against their corresponding .otel.canvas files
 */

import type { WorkflowTemplate } from './types';
import type { ExtendedCanvas } from '../types/canvas';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import type { EventRegistry } from '../registry/EventRegistry';
import type { IExportTraceServiceRequest } from '@opentelemetry/otlp-transformer/build/src/trace/internal-types';

// ============================================================================
// Validation Types
// ============================================================================

export interface WorkflowValidationContext {
  /** The workflow template being validated */
  workflow: WorkflowTemplate;

  /** Path to the workflow file */
  workflowPath: string;

  /** The canvas file (if found) */
  canvas?: ExtendedCanvas;

  /** Path to the canvas file */
  canvasPath?: string;

  /** Base path for resolving relative paths */
  basePath: string;

  /** Raw workflow content for line number lookup */
  rawContent?: string;

  /** Execution data for validating attribute references (optional) */
  executionData?: {
    /** Aggregated attributes available in templates */
    aggregates: Record<string, unknown>;
    /** Attributes grouped by event name */
    eventAttributes: Map<string, Record<string, unknown>>;
  };

  /**
   * Co-located execution files for validating template completeness.
   * Array of paths to .otel.json files in the same directory as the workflow.
   */
  executionFiles?: string[];

  /**
   * Optional: Events used across all workflows that reference this canvas.
   * When provided, coverage warnings are only emitted for canvas events
   * that are NOT in this set (i.e., truly unused across all workflows).
   * This enables multi-workflow canvas patterns where different workflows
   * cover different subsets of canvas events.
   */
  allWorkflowEvents?: Set<string>;

  /**
   * Optional: Registry of all events across the project.
   * When provided, enables enhanced error messages that show where
   * missing events are defined (in library or other canvases).
   */
  eventRegistry?: EventRegistry;
}

export interface WorkflowViolation {
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

export interface WorkflowValidationResult {
  /** All violations found */
  violations: WorkflowViolation[];

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

export class WorkflowValidator {
  /**
   * Validate a workflow template
   */
  async validate(
    context: WorkflowValidationContext
  ): Promise<WorkflowValidationResult> {
    const violations: WorkflowViolation[] = [];

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

    // Check execution data completeness if execution files are provided
    if (context.executionFiles && context.executionFiles.length > 0) {
      violations.push(...this.checkExecutionDataCompleteness(context));
    }

    return this.aggregateResults(violations);
  }

  /**
   * Check schema validity (required fields, valid values)
   */
  private checkSchema(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    // Check version
    if (!workflow.version) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'version',
        message: 'Missing required field "version"',
        impact: 'Cannot determine template version for compatibility',
        suggestion: 'Add a version field (e.g., "1.0.0")',
        fixable: false,
      });
    } else if (!this.isValidSemver(workflow.version)) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'version',
        message: `Invalid version format: "${workflow.version}"`,
        impact: 'Version must follow semver format',
        suggestion: 'Use semver format like "1.0.0"',
        fixable: false,
      });
    }

    // Check canvas reference
    if (!workflow.canvas) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'canvas',
        message: 'Missing required field "canvas"',
        impact: 'Cannot determine which canvas this workflow belongs to',
        suggestion: 'Add a canvas field pointing to an .otel.canvas file',
        fixable: false,
      });
    }

    // Check name
    if (!workflow.name) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'name',
        message: 'Missing required field "name"',
        impact: 'Cannot identify this workflow template',
        suggestion: 'Add a human-readable name',
        fixable: false,
      });
    }

    // Check description
    if (!workflow.description) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'description',
        message: 'Missing required field "description"',
        impact: 'Cannot understand the purpose of this workflow',
        suggestion: 'Add a description explaining what this workflow shows',
        fixable: false,
      });
    }

    // Check mode
    const validModes = ['span-tree', 'timeline'];
    if (!workflow.mode) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'mode',
        message: 'Missing required field "mode"',
        impact: 'Cannot determine how to structure the workflow',
        suggestion: `Set mode to one of: ${validModes.join(', ')}`,
        fixable: false,
      });
    } else if (!validModes.includes(workflow.mode)) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'mode',
        message: `Invalid mode: "${workflow.mode}"`,
        impact: 'Mode must be one of the supported types',
        suggestion: `Use one of: ${validModes.join(', ')}`,
        fixable: false,
      });
    }

    // Check scenarioSelection
    const validSelections = ['first-match', 'manual'];
    if (workflow.scenarioSelection && !validSelections.includes(workflow.scenarioSelection)) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'scenarioSelection',
        message: `Invalid scenarioSelection: "${workflow.scenarioSelection}"`,
        impact: 'Scenario selection must be a valid type',
        suggestion: `Use one of: ${validSelections.join(', ')}`,
        fixable: false,
      });
    }

    // Check scenarios array
    if (!workflow.scenarios || !Array.isArray(workflow.scenarios)) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'scenarios',
        message: 'Missing or invalid "scenarios" field',
        impact: 'Cannot generate workflows without scenarios',
        suggestion: 'Add a scenarios array with at least one scenario',
        fixable: false,
      });
    } else if (workflow.scenarios.length === 0) {
      violations.push({
        ruleId: 'workflow-schema-valid',
        severity: 'error',
        file: workflowPath,
        path: 'scenarios',
        message: 'Scenarios array is empty',
        impact: 'Cannot generate workflows without scenarios',
        suggestion: 'Add at least one scenario definition',
        fixable: false,
      });
    }

    return violations;
  }

  /**
   * Check that the referenced canvas file exists
   */
  private checkCanvasExists(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, basePath, canvasPath } = context;

    if (!workflow.canvas) {
      // Already flagged by checkSchema
      return violations;
    }

    // Resolve canvas path
    const resolvedPath = canvasPath || resolve(basePath, workflow.canvas);

    if (!existsSync(resolvedPath)) {
      violations.push({
        ruleId: 'workflow-canvas-exists',
        severity: 'error',
        file: workflowPath,
        path: 'canvas',
        message: `Referenced canvas file does not exist: ${workflow.canvas}`,
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
  private checkEventReferences(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, canvas } = context;

    if (!canvas || !canvas.nodes) {
      return violations;
    }

    // Extract all event names from canvas nodes
    const canvasEvents = new Set<string>();
    for (const node of canvas.nodes) {
      if (node.pv?.event) {
        if (typeof node.pv.event === 'string') {
          // Legacy string format detected - provide migration guidance
          violations.push({
            ruleId: 'canvas-event-format-deprecated',
            severity: 'error',
            file: workflow.canvas || 'canvas',
            path: `nodes[${node.id}].pv.event`,
            message: `Canvas node "${node.id}" uses deprecated string format for event: "${node.pv.event}"`,
            impact: 'Event will not be recognized by workflow validator and workflows will fail to match',
            suggestion: `Use "eventRef": "${node.pv.event}" to reference a library event, or use "event": { "name": "${node.pv.event}", "attributes": {} } for inline definition. If using eventRef, define the event schema in library.yaml under eventSchemas.`,
            fixable: false,
          });
        } else if (typeof node.pv.event === 'object' && node.pv.event.name) {
          // event is a PVEventSchema object with a 'name' property
          canvasEvents.add(node.pv.event.name);
        }
      }
      // Also check for eventRef (library reference)
      if (node.pv?.eventRef && typeof node.pv.eventRef === 'string') {
        canvasEvents.add(node.pv.eventRef);
      }
    }

    // Extract all event names from workflow scenarios
    const workflowEvents = new Set<string>();
    for (const scenario of workflow.scenarios) {
      // From condition.requires
      if (scenario.condition?.requires) {
        for (const eventPattern of scenario.condition.requires) {
          // Skip wildcard patterns for now
          if (!eventPattern.includes('*')) {
            workflowEvents.add(eventPattern);
          }
        }
      }
      // From template.events
      if (scenario.template?.events) {
        for (const eventName of Object.keys(scenario.template.events)) {
          // Skip wildcard patterns
          if (!eventName.includes('*')) {
            workflowEvents.add(eventName);
          }
        }
      }
    }

    // Check for workflow events not in canvas
    for (const eventName of Array.from(workflowEvents)) {
      if (!canvasEvents.has(eventName)) {
        // Try to find this event elsewhere using the registry
        const eventSources = context.eventRegistry?.findEvent(eventName) ?? [];

        let message = `Workflow references event "${eventName}" which is not defined in canvas`;
        let suggestion = `Add event "${eventName}" to a node in ${workflow.canvas} or remove it from the workflow`;

        if (eventSources.length > 0) {
          // Event found elsewhere - provide helpful guidance
          const librarySources = eventSources.filter(s => s.type === 'library');
          const canvasSources = eventSources.filter(s => s.type === 'canvas');

          if (librarySources.length > 0) {
            // Event is in library - suggest using eventRef
            message = `Event "${eventName}" not found in canvas but is available in library`;
            suggestion = `Add a node with eventRef: "${eventName}" to ${workflow.canvas}`;
          } else if (canvasSources.length > 0) {
            // Event is in another canvas - suggest adding to library
            const canvasNames = canvasSources.map(s => basename(s.path)).join(', ');
            message = `Event "${eventName}" not found in canvas. Found in: ${canvasNames}`;
            suggestion = `Add "${eventName}" to library.yaml eventSchemas and use eventRef in ${workflow.canvas}`;
          }
        }

        violations.push({
          ruleId: 'workflow-event-sync',
          severity: 'error',
          file: workflowPath,
          path: 'events',
          message,
          impact: 'This event will never highlight a canvas node and may never match',
          suggestion,
          fixable: false,
        });
      }
    }

    // Check for canvas events not in workflow (warning only)
    // If allWorkflowEvents is provided, check against the combined set of all workflows
    // for this canvas. Otherwise, check against just this workflow's events.
    const eventsToCheckAgainst = context.allWorkflowEvents ?? workflowEvents;

    for (const eventName of Array.from(canvasEvents)) {
      if (!eventsToCheckAgainst.has(eventName)) {
        violations.push({
          ruleId: 'workflow-event-coverage',
          severity: 'warn',
          file: workflowPath,
          path: 'events',
          message: context.allWorkflowEvents
            ? `Canvas defines event "${eventName}" which is not used in any workflow for this canvas`
            : `Canvas defines event "${eventName}" which is not used in this workflow scenario`,
          impact: 'This canvas node may never be highlighted during workflow playback',
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
  private checkScenarios(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    if (!workflow.scenarios || workflow.scenarios.length === 0) {
      return violations; // Already flagged by checkSchema
    }

    const scenarioIds = new Set<string>();
    const priorities = new Set<number>();
    let hasDefault = false;

    workflow.scenarios.forEach((scenario, idx) => {
      // Check for required fields
      if (!scenario.id) {
        violations.push({
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
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
            ruleId: 'workflow-scenario-valid',
            severity: 'error',
            file: workflowPath,
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
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].priority`,
          message: 'Scenario is missing required "priority" field',
          impact: 'Cannot determine scenario selection order',
          suggestion: 'Add a priority (lower number = higher priority)',
          fixable: false,
        });
      } else {
        if (scenario.priority < 0) {
          violations.push({
            ruleId: 'workflow-scenario-valid',
            severity: 'error',
            file: workflowPath,
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
            ruleId: 'workflow-scenario-valid',
            severity: 'error',
            file: workflowPath,
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
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].condition`,
          message: 'Scenario is missing required "condition" field',
          impact: 'Cannot determine when to use this scenario',
          suggestion: 'Add a condition or set default: true',
          fixable: false,
        });
      } else {
        // Validate condition structure
        violations.push(...this.checkConditionStructure(scenario.condition, workflowPath, idx));
      }

      // Check template
      if (!scenario.template) {
        violations.push({
          ruleId: 'workflow-scenario-valid',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${idx}].template`,
          message: 'Scenario is missing required "template" field',
          impact: 'Cannot render workflow without a template',
          suggestion: 'Add a template with introduction, events, or flow',
          fixable: false,
        });
      } else {
        // Validate template structure
        violations.push(...this.checkTemplateStructure(scenario.template, workflowPath, idx));
      }
    });

    // Ensure at least one default scenario exists
    if (!hasDefault) {
      violations.push({
        ruleId: 'workflow-scenario-valid',
        severity: 'error',
        file: workflowPath,
        path: 'scenarios',
        message: 'No default scenario defined',
        impact: 'Workflow rendering may fail if no scenario matches',
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
    condition: unknown,
    file: string,
    scenarioIdx: number
  ): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const validFields = ['requires', 'excludes', 'assertions', 'default', 'any'];

    // Type guard: ensure condition is an object
    if (typeof condition !== 'object' || condition === null) {
      return violations;
    }

    const conditionKeys = Object.keys(condition);

    // Check for invalid/legacy fields
    for (const key of conditionKeys) {
      if (!validFields.includes(key)) {
        // Check for common legacy format fields
        if (key === 'event') {
          violations.push({
            ruleId: 'workflow-condition-structure',
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
            ruleId: 'workflow-condition-structure',
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
            ruleId: 'workflow-condition-structure',
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
    template: unknown,
    file: string,
    scenarioIdx: number
  ): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const validFields = ['introduction', 'events', 'logs', 'flow', 'summary', 'span', 'children'];

    // Type guard: ensure template is an object
    if (typeof template !== 'object' || template === null) {
      return violations;
    }

    const templateRecord = template as Record<string, unknown>;
    const templateKeys = Object.keys(templateRecord);

    // Check that events field is present and is an object
    if (!templateRecord.events) {
      violations.push({
        ruleId: 'workflow-template-structure',
        severity: 'error',
        file,
        path: `scenarios[${scenarioIdx}].template`,
        message: 'Template is missing required "events" field',
        impact: 'Template must specify how to render each event type',
        suggestion: 'Add "events: { eventName: template }" to map event names to templates',
        fixable: false,
      });
    } else if (typeof templateRecord.events !== 'object' || Array.isArray(templateRecord.events)) {
      violations.push({
        ruleId: 'workflow-template-structure',
        severity: 'error',
        file,
        path: `scenarios[${scenarioIdx}].template.events`,
        message: 'Template "events" field must be an object',
        impact: 'Events will not render correctly',
        suggestion: 'Use object format: { "event.name": "template string" }',
        fixable: false,
      });
    } else if (typeof templateRecord.events === 'object' && templateRecord.events !== null && Object.keys(templateRecord.events).length === 0) {
      violations.push({
        ruleId: 'workflow-template-structure',
        severity: 'error',
        file,
        path: `scenarios[${scenarioIdx}].template.events`,
        message: 'Template "events" field must not be empty',
        impact: 'No events will be rendered in this scenario',
        suggestion: 'Add at least one event template: { "event.name": "template string" }',
        fixable: false,
      });
    }

    // Check for invalid/legacy fields
    for (const key of templateKeys) {
      if (!validFields.includes(key)) {
        // Check for common legacy format fields
        if (key === 'steps') {
          violations.push({
            ruleId: 'workflow-template-structure',
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
            ruleId: 'workflow-template-structure',
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
            ruleId: 'workflow-template-structure',
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
  private checkEventNameSyntax(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    workflow.scenarios.forEach((scenario, scenarioIdx) => {
      // Check condition.requires
      if (scenario.condition?.requires) {
        scenario.condition.requires.forEach((eventPattern, idx) => {
          if (eventPattern.includes('[') && eventPattern.includes(']')) {
            violations.push({
              ruleId: 'workflow-event-name-syntax',
              severity: 'error',
              file: workflowPath,
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
              ruleId: 'workflow-event-name-syntax',
              severity: 'error',
              file: workflowPath,
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
              ruleId: 'workflow-event-name-syntax',
              severity: 'error',
              file: workflowPath,
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
  private checkTemplateSyntax(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    workflow.scenarios.forEach((scenario, scenarioIdx) => {
      if (!scenario.template) {
        return;
      }

      const template = scenario.template;

      // Check introduction
      if (template.introduction) {
        violations.push(...this.validateTemplateString(
          template.introduction,
          workflowPath,
          `scenarios[${scenarioIdx}].template.introduction`
        ));
      }

      // Check summary
      if (template.summary) {
        violations.push(...this.validateTemplateString(
          template.summary,
          workflowPath,
          `scenarios[${scenarioIdx}].template.summary`
        ));
      }

      // Check event templates
      if (template.events) {
        Object.entries(template.events).forEach(([eventName, templateStr]) => {
          violations.push(...this.validateTemplateString(
            templateStr,
            workflowPath,
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
              workflowPath,
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
              workflowPath,
              `scenarios[${scenarioIdx}].template.flow[${flowIdx}]`
            ));
          } else if (typeof item === 'object' && item.template) {
            violations.push(...this.validateTemplateString(
              item.template,
              workflowPath,
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
  ): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];

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
              ruleId: 'workflow-template-syntax',
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
        ruleId: 'workflow-template-syntax',
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
          ruleId: 'workflow-template-syntax',
          severity: 'error',
          file,
          path,
          message: `Incomplete conditional expression: ${expr}`,
          impact: 'Template will fail to render',
          suggestion: 'Use Handlebars syntax: {{#if condition}}true{{else}}false{{/if}}',
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
  private checkAttributeReferences(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, executionData } = context;

    // Skip if no execution data provided
    if (!executionData) {
      return violations;
    }

    const { aggregates, eventAttributes } = executionData;

    // Check each scenario's template
    for (const scenario of workflow.scenarios) {
      const scenarioPath = `scenarios[${scenario.id}]`;

      // Check introduction template
      if (scenario.template.introduction) {
        const attrs = this.extractAttributeReferences(scenario.template.introduction);
        violations.push(
          ...this.validateAttributes(
            attrs,
            aggregates,
            null, // introduction doesn't have specific event context
            workflowPath,
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
              workflowPath,
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
            workflowPath,
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
  ): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];

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
          ruleId: 'workflow-attribute-undefined',
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
          ruleId: 'workflow-attribute-object',
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
  private checkFormattingOptions(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath } = context;

    if (!workflow.formatting) {
      return violations;
    }

    // Check showAttributes
    if (workflow.formatting.showAttributes) {
      const validValues = ['none', 'matched', 'all'];
      if (!validValues.includes(workflow.formatting.showAttributes)) {
        violations.push({
          ruleId: 'workflow-formatting-options',
          severity: 'warn',
          file: workflowPath,
          path: 'formatting.showAttributes',
          message: `Invalid showAttributes value: "${workflow.formatting.showAttributes}"`,
          impact: 'May not display attributes correctly',
          suggestion: `Use one of: ${validValues.join(', ')}`,
          fixable: false,
        });
      }
    }

    return violations;
  }

  /**
   * Check execution data completeness
   *
   * Validates that co-located execution files contain the events and attributes
   * that workflow templates reference.
   */
  private checkExecutionDataCompleteness(context: WorkflowValidationContext): WorkflowViolation[] {
    const violations: WorkflowViolation[] = [];
    const { workflow, workflowPath, executionFiles } = context;

    if (!executionFiles || executionFiles.length === 0) {
      return violations;
    }

    // Load and parse all execution files
    const executions: Array<{path: string; data: IExportTraceServiceRequest}> = [];
    for (const execPath of executionFiles) {
      try {
        const content = readFileSync(execPath, 'utf-8');
        const data = JSON.parse(content) as IExportTraceServiceRequest;
        executions.push({ path: execPath, data });
      } catch (error) {
        // Skip files that can't be loaded/parsed
        continue;
      }
    }

    if (executions.length === 0) {
      return violations;
    }

    // Check for multiple traces in single files (anti-pattern)
    for (const { path, data } of executions) {
      const traceIds = new Set<string>();

      data.resourceSpans?.forEach((rs) => {
        rs.scopeSpans?.forEach((ss) => {
          ss.spans?.forEach((span) => {
            if (span.traceId) {
              traceIds.add(typeof span.traceId === 'string' ? span.traceId : Buffer.from(span.traceId).toString('hex'));
            }
          });
        });
      });

      if (traceIds.size > 1) {
        const fileName = path.split('/').pop() || path;
        violations.push({
          ruleId: 'workflow-execution-multiple-traces',
          severity: 'warn',
          file: path,
          message: `Execution file contains ${traceIds.size} traces - should contain only one trace per file`,
          impact: 'Cannot establish clear trace-to-scenario association, makes debugging harder',
          suggestion: `Split ${fileName} into ${traceIds.size} separate files, one per test case (e.g., success.otel.json, error.otel.json)`,
          fixable: false,
        });
      }
    }

    // For each scenario, check if execution data can satisfy the template
    workflow.scenarios.forEach((scenario, scenarioIdx) => {
      if (!scenario.template) return;

      // Extract all template variables from this scenario
      const templateVars = new Set<string>();
      const eventTemplates = new Map<string, Set<string>>();

      // Extract variables from summary
      if (scenario.template.summary) {
        this.extractTemplateVariables(scenario.template.summary).forEach(v => templateVars.add(v));
      }

      // Extract variables from introduction
      if (scenario.template.introduction) {
        this.extractTemplateVariables(scenario.template.introduction).forEach(v => templateVars.add(v));
      }

      // Extract variables from event templates
      if (scenario.template.events) {
        Object.entries(scenario.template.events).forEach(([eventName, template]) => {
          const vars = this.extractTemplateVariables(template);
          if (!eventTemplates.has(eventName)) {
            eventTemplates.set(eventName, new Set());
          }
          vars.forEach(v => {
            templateVars.add(v);
            eventTemplates.get(eventName)!.add(v);
          });
        });
      }

      // Check if ANY execution file has the data needed
      const hasCompleteData = executions.some(({ data }) => {
        return this.executionHasTemplateData(data, scenario.template, templateVars, eventTemplates);
      });

      if (!hasCompleteData && templateVars.size > 0) {
        const missingInfo = this.findMissingTemplateData(executions, scenario.template, eventTemplates);

        violations.push({
          ruleId: 'workflow-execution-data-incomplete',
          severity: 'warn',
          file: workflowPath,
          path: `scenarios[${scenarioIdx}].template`,
          message: `Template references data not found in co-located execution files`,
          impact: 'Template variables will not resolve when viewing executions',
          suggestion: missingInfo.length > 0
            ? `Missing: ${missingInfo.slice(0, 3).join(', ')}${missingInfo.length > 3 ? ` and ${missingInfo.length - 3} more` : ''}`
            : 'Ensure execution files contain the events and attributes referenced in templates',
          fixable: false,
        });
      }
    });

    return violations;
  }

  /**
   * Extract template variable references from a template string
   * Matches {{variableName}} patterns
   */
  private extractTemplateVariables(template: string): string[] {
    const vars: string[] = [];
    // Match {{variableName}} or {{object.property}} but not {{#if}} {{/if}} {{else}}
    const pattern = /\{\{(?!\s*[#/])\s*([a-zA-Z_][a-zA-Z0-9._]*)\s*\}\}/g;
    let match;

    while ((match = pattern.exec(template)) !== null) {
      const varName = match[1];
      // Skip Handlebars helpers and keywords
      if (!['this', 'else', 'each', 'if', 'unless', 'with'].includes(varName)) {
        vars.push(varName);
      }
    }

    return vars;
  }

  /**
   * Check if execution data contains the template data needed
   */
  private executionHasTemplateData(
    execution: IExportTraceServiceRequest,
    template: any,
    templateVars: Set<string>,
    eventTemplates: Map<string, Set<string>>
  ): boolean {
    // Collect all events and their attributes from the execution
    const executionEvents = new Map<string, Set<string>>();

    execution.resourceSpans?.forEach((rs) => {
      rs.scopeSpans?.forEach((ss) => {
        ss.spans?.forEach((span) => {
          // Add span events
          span.events?.forEach((event) => {
            const eventName = event.name;
            if (!executionEvents.has(eventName)) {
              executionEvents.set(eventName, new Set());
            }
            // Add event attributes
            event.attributes?.forEach((attr) => {
              executionEvents.get(eventName)!.add(attr.key);
            });
          });

          // Also check span-level attributes (available as aggregates)
          if (span.name) {
            if (!executionEvents.has(span.name)) {
              executionEvents.set(span.name, new Set());
            }
            span.attributes?.forEach((attr) => {
              executionEvents.get(span.name)!.add(attr.key);
            });
          }
        });
      });
    });

    // Check if the execution has the events referenced in templates
    let hasAllData = true;

    for (const [eventName, requiredVars] of eventTemplates.entries()) {
      // Check if this event exists in execution
      const eventData = executionEvents.get(eventName);
      if (!eventData) {
        // Event doesn't exist - this is incomplete
        hasAllData = false;
        break;
      }

      // Check if event has all required attributes
      for (const varName of requiredVars) {
        const baseVar = varName.split('.')[0]; // Handle nested properties
        if (!eventData.has(baseVar)) {
          hasAllData = false;
          break;
        }
      }

      if (!hasAllData) break;
    }

    return hasAllData;
  }

  /**
   * Find what specific data is missing from executions
   */
  private findMissingTemplateData(
    executions: Array<{path: string; data: IExportTraceServiceRequest}>,
    template: any,
    eventTemplates: Map<string, Set<string>>
  ): string[] {
    const missing: string[] = [];
    const allEvents = new Set<string>();

    // Collect all events from all executions
    executions.forEach(({ data }) => {
      data.resourceSpans?.forEach((rs) => {
        rs.scopeSpans?.forEach((ss) => {
          ss.spans?.forEach((span) => {
            span.events?.forEach((event) => {
              allEvents.add(event.name);
            });
            if (span.name) {
              allEvents.add(span.name);
            }
          });
        });
      });
    });

    // Check what's missing
    for (const [eventName, requiredVars] of eventTemplates.entries()) {
      if (!allEvents.has(eventName)) {
        missing.push(`event "${eventName}"`);
      } else {
        // Event exists, check attributes
        requiredVars.forEach(varName => {
          missing.push(`attribute "${varName}" in event "${eventName}"`);
        });
      }
    }

    return missing;
  }

  /**
   * Aggregate violations into result
   */
  private aggregateResults(violations: WorkflowViolation[]): WorkflowValidationResult {
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
export function createWorkflowValidator(): WorkflowValidator {
  return new WorkflowValidator();
}
