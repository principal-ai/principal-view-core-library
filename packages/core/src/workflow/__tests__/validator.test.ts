/**
 * Tests for workflow template validator
 */

import { WorkflowValidator } from '../validator';
import type { WorkflowTemplate, WorkflowValidationContext } from '../validator';
import type { ExtendedCanvas } from '../../types/canvas';
import type { ComponentLibrary } from '../../types/library';
import { EventRegistry } from '../../registry/EventRegistry';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('WorkflowValidator', () => {
  let validator: WorkflowValidator;
  let tempDir: string;

  beforeEach(() => {
    validator = new WorkflowValidator();
    // Create a temporary directory for test files
    tempDir = mkdtempSync(join(tmpdir(), 'workflow-validator-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function createValidWorkflow(): WorkflowTemplate {
    return {
      version: '1.0.0',
      canvas: 'test.otel.canvas',
      name: 'Test Workflow',
      description: 'A test workflow template',
      spanPattern: 'test.execution',
      mode: 'span-tree',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'test-passed',
          priority: 1,
          description: 'Test passed successfully',
          template: {
            introduction: 'Test passed',
            events: {
              'test.started': 'Started test',
              'test.complete': 'Test completed',
            },
            summary: 'Success',
          },
        },
        {
          id: 'test-failed',
          priority: 2,
          description: 'Test failed',
          template: {
            introduction: 'Test failed',
            events: {
              'test.started': 'Test started',
              'test.failed': 'Test failed',
            },
          },
        },
      ],
    };
  }

  function createValidCanvas(): ExtendedCanvas {
    return {
      nodes: [
        {
          id: 'test-started',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          pv: {
            eventRef: 'test.started',
          },
        },
        {
          id: 'test-complete',
          type: 'text',
          x: 250,
          y: 0,
          width: 200,
          height: 100,
          pv: {
            eventRef: 'test.complete',
          },
        },
        {
          id: 'test-error',
          type: 'text',
          x: 500,
          y: 0,
          width: 200,
          height: 100,
          pv: {
            eventRef: 'test.error',
          },
        },
      ],
      edges: [
        {
          id: 'edge1',
          fromNode: 'test-started',
          toNode: 'test-complete',
          fromSide: 'right',
          toSide: 'left',
        },
        {
          id: 'edge2',
          fromNode: 'test-started',
          toNode: 'test-error',
          fromSide: 'right',
          toSide: 'left',
        },
      ],
      pv: {
        version: '1.0.0',
        name: 'Test Canvas',
        markdown: 'test.md',
      },
    };
  }

  function createContext(
    workflow: Partial<WorkflowTemplate>,
    options: {
      canvas?: ExtendedCanvas;
      canvasPath?: string;
    } = {}
  ): WorkflowValidationContext {
    const fullWorkflow = {
      ...createValidWorkflow(),
      ...workflow,
    } as WorkflowTemplate;

    return {
      workflow: fullWorkflow,
      workflowPath: 'test.workflow.json',
      canvas: options.canvas,
      canvasPath: options.canvasPath,
      basePath: tempDir,
    };
  }

  // ============================================================================
  // Schema Validation Tests
  // ============================================================================

  describe('checkSchema', () => {
    it('should pass for valid workflow template', async () => {
      // Create canvas file so canvas-exists check passes
      const canvasPath = join(tempDir, 'test.otel.canvas');
      const markdownPath = join(tempDir, 'test.md');
      writeFileSync(canvasPath, JSON.stringify(createValidCanvas()));
      writeFileSync(markdownPath, '# Test Documentation');

      const context = createContext({}, { canvasPath });
      const result = await validator.validate(context);

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });

    it('should flag missing version', async () => {
      const context = createContext({ version: undefined as unknown });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'version',
          message: expect.stringContaining('Missing required field "version"'),
        })
      );
    });

    it('should flag invalid semver version', async () => {
      const context = createContext({ version: 'not-a-version' });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'version',
          message: expect.stringContaining('Invalid version format'),
        })
      );
    });

    it('should flag missing canvas reference', async () => {
      const context = createContext({ canvas: undefined as unknown });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'canvas',
          message: expect.stringContaining('Missing required field "canvas"'),
        })
      );
    });

    it('should flag missing name', async () => {
      const context = createContext({ name: undefined as unknown });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'name',
          message: expect.stringContaining('Missing required field "name"'),
        })
      );
    });

    it('should flag missing description', async () => {
      const context = createContext({ description: undefined as unknown });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'description',
        })
      );
    });

    it('should flag missing mode', async () => {
      const context = createContext({ mode: undefined as unknown });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'mode',
          message: expect.stringContaining('Missing required field "mode"'),
        })
      );
    });

    it('should flag invalid mode', async () => {
      const context = createContext({ mode: 'invalid-mode' as unknown });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'mode',
          message: expect.stringContaining('Invalid mode'),
        })
      );
    });

    it('should accept valid modes', async () => {
      const modes = ['span-tree', 'timeline'];

      for (const mode of modes) {
        const context = createContext({ mode: mode as unknown });
        const result = await validator.validate(context);

        const modeViolations = result.violations.filter((v) => v.path === 'mode');
        expect(modeViolations).toHaveLength(0);
      }
    });

    it('should flag invalid scenarioSelection', async () => {
      const context = createContext({ scenarioSelection: 'invalid' as unknown });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'scenarioSelection',
        })
      );
    });

    it('should flag empty scenarios array', async () => {
      const context = createContext({ scenarios: [] });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'scenarios',
          message: expect.stringContaining('empty'),
        })
      );
    });
  });

  // ============================================================================
  // Canvas Existence Tests
  // ============================================================================

  describe('checkCanvasExists', () => {
    it('should pass when canvas file exists', async () => {
      // Create a canvas file in temp directory
      const canvasPath = join(tempDir, 'test.otel.canvas');
      const markdownPath = join(tempDir, 'test.md');
      writeFileSync(canvasPath, JSON.stringify(createValidCanvas()));
      writeFileSync(markdownPath, '# Test Documentation');

      const context = createContext(
        { canvas: 'test.otel.canvas' },
        { canvasPath }
      );
      const result = await validator.validate(context);

      const canvasViolations = result.violations.filter(
        (v) => v.ruleId === 'workflow-canvas-exists'
      );
      expect(canvasViolations).toHaveLength(0);
    });

    it('should flag when canvas file does not exist', async () => {
      const context = createContext(
        { canvas: 'nonexistent.otel.canvas' },
        { canvasPath: join(tempDir, 'nonexistent.otel.canvas') }
      );
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-canvas-exists',
          message: expect.stringContaining('does not exist'),
        })
      );
    });
  });

  // ============================================================================
  // Scenario Validation Tests
  // ============================================================================

  describe('checkScenarios', () => {
    it('should pass for valid scenarios', async () => {
      const context = createContext({});
      const result = await validator.validate(context);

      const scenarioViolations = result.violations.filter(
        (v) => v.ruleId === 'workflow-scenario-valid'
      );
      expect(scenarioViolations).toHaveLength(0);
    });

    it('should flag missing scenario ID', async () => {
      const context = createContext({
        scenarios: [
          {
            id: undefined as unknown,
            priority: 1,
            description: 'Test',
            template: { introduction: 'Test' },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('missing required "id"'),
        })
      );
    });

    it('should flag duplicate scenario IDs', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'duplicate',
            priority: 1,
            description: 'First',
            template: { introduction: 'First' },
          },
          {
            id: 'duplicate',
            priority: 2,
            description: 'Second',
            template: { introduction: 'Second' },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('Duplicate scenario ID'),
        })
      );
    });

    it('should flag missing priority', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: undefined as unknown,
            description: 'Test',
            template: { introduction: 'Test' },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('missing required "priority"'),
        })
      );
    });

    it('should flag negative priority', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: -1,
            description: 'Test',
            template: { introduction: 'Test' },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('non-negative'),
        })
      );
    });

    it('should flag duplicate priorities', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'first',
            priority: 1,
            description: 'First',
            template: { introduction: 'First' },
          },
          {
            id: 'second',
            priority: 1,
            description: 'Second',
            template: { introduction: 'Second' },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('Duplicate priority'),
        })
      );
    });

    it('should flag missing description', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: undefined as unknown,
            template: { introduction: 'Test' },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('missing required "description"'),
        })
      );
    });

    it('should flag missing template', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: undefined as unknown,
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('missing required "template"'),
        })
      );
    });
  });

  // ============================================================================
  // Template Syntax Tests
  // ============================================================================

  describe('checkTemplateSyntax', () => {
    it('should pass for valid template strings', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              introduction: 'Started {test.name}',
              events: {
                'test.started': 'Test {test.id} started',
                'test.complete': '{result.status === "passed" ? "✅ Passed" : "❌ Failed"}',
              },
              summary: 'Completed in {duration}ms',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      const syntaxViolations = result.violations.filter(
        (v) => v.ruleId === 'workflow-template-syntax'
      );
      expect(syntaxViolations).toHaveLength(0);
    });

    it('should flag unbalanced braces (missing closing)', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              introduction: 'Test {test.name',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-template-syntax',
          message: expect.stringContaining('Unbalanced braces'),
        })
      );
    });

    it('should flag unbalanced braces (extra closing)', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              introduction: 'Test {test.name}}',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-template-syntax',
          message: expect.stringContaining('Unbalanced braces'),
        })
      );
    });

    it('should flag incomplete conditional expression', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              introduction: '{result.passed ? "Success"}',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-template-syntax',
          message: expect.stringContaining('Incomplete conditional'),
        })
      );
    });

    it('should handle quotes in template strings', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              introduction: '{test.status === "passed" ? "Success" : "Failed"}',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      const syntaxViolations = result.violations.filter(
        (v) => v.ruleId === 'workflow-template-syntax'
      );
      expect(syntaxViolations).toHaveLength(0);
    });

    it('should validate event templates', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              events: {
                'test.started': 'Started {test.name',
                'test.complete': 'Completed',
              },
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-template-syntax',
          path: expect.stringContaining('events.test.started'),
        })
      );
    });

    it('should validate flow templates', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              flow: [
                'Valid string',
                'Invalid {expression',
                {
                  forEach: 'items',
                  template: 'Valid {item}',
                },
              ],
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      const flowViolations = result.violations.filter(
        (v) => v.path && v.path.includes('flow')
      );
      expect(flowViolations.length).toBeGreaterThan(0);
    });

    it('should flag Handlebars {{#if}} conditionals', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              introduction: '{{#if hasError}}Error occurred{{/if}}',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-template-conditional',
          message: expect.stringContaining('Conditional syntax detected'),
          suggestion: expect.stringContaining('Split into separate scenarios'),
        })
      );
    });

    it('should flag Handlebars {{#unless}} conditionals', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              summary: '{{#unless success}}Failed{{/unless}}',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-template-conditional',
          message: expect.stringContaining('{{#unless'),
        })
      );
    });

    it('should flag Handlebars {{#each}} iteration', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              introduction: '{{#each items}}{{name}}{{/each}}',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-template-conditional',
          message: expect.stringContaining('{{#each'),
        })
      );
    });

    it('should flag Handlebars {{else}} clause', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              events: {
                'test.started': '{{#if fast}}Quick{{else}}Slow{{/if}}',
              },
            },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-template-conditional',
        })
      );
    });

    it('should allow simple variable interpolation without conditionals', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            template: {
              introduction: 'Test {{name}} completed in {{duration}}ms',
              events: {
                'test.started': 'Started {{testName}}',
              },
              summary: 'Result: {{status}}',
            },
          },
        ],
      });
      const result = await validator.validate(context);

      const conditionalViolations = result.violations.filter(
        (v) => v.ruleId === 'workflow-template-conditional'
      );
      expect(conditionalViolations).toHaveLength(0);
    });
  });

  // ============================================================================
  // Formatting Options Tests
  // ============================================================================

  describe('checkFormattingOptions', () => {
    it('should pass for valid formatting options', async () => {
      const context = createContext({
        formatting: {
          indentPerLevel: '  ',
          timestampFormat: 'HH:mm:ss.SSS',
          showTimestamps: true,
          showDuration: true,
          showSpanIds: false,
          showAttributes: 'matched',
        },
      });
      const result = await validator.validate(context);

      const formattingViolations = result.violations.filter(
        (v) => v.ruleId === 'workflow-formatting-options'
      );
      expect(formattingViolations).toHaveLength(0);
    });

    it('should flag invalid showAttributes value', async () => {
      const context = createContext({
        formatting: {
          showAttributes: 'invalid' as unknown,
        },
      });
      const result = await validator.validate(context);

      expect(result.warningCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-formatting-options',
          severity: 'warn',
          message: expect.stringContaining('Invalid showAttributes'),
        })
      );
    });

    it('should accept valid showAttributes values', async () => {
      const values = ['none', 'matched', 'all'];

      for (const value of values) {
        const context = createContext({
          formatting: {
            showAttributes: value as unknown,
          },
        });
        const result = await validator.validate(context);

        const formattingViolations = result.violations.filter(
          (v) => v.ruleId === 'workflow-formatting-options' && v.path === 'formatting.showAttributes'
        );
        expect(formattingViolations).toHaveLength(0);
      }
    });
  });

  // ============================================================================
  // Aggregate Results Tests
  // ============================================================================

  describe('aggregateResults', () => {
    it('should correctly count errors and warnings', async () => {
      const context = createContext({
        version: undefined as unknown,
        name: undefined as unknown,
        formatting: {
          showAttributes: 'invalid' as unknown,
        },
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.warningCount).toBeGreaterThan(0);
      expect(result.violations.length).toBe(result.errorCount + result.warningCount);
    });

    it('should count fixable violations', async () => {
      // Currently no violations are fixable, but test the infrastructure
      const context = createContext({});
      const result = await validator.validate(context);

      const fixable = result.violations.filter((v) => v.fixable);
      expect(result.fixableCount).toBe(fixable.length);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration tests', () => {
    it('should validate a complete valid workflow template', async () => {
      const canvasPath = join(tempDir, 'test.otel.canvas');
      const markdownPath = join(tempDir, 'test.md');
      writeFileSync(canvasPath, JSON.stringify(createValidCanvas()));
      writeFileSync(markdownPath, '# Test Documentation');

      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Complete Test Workflow',
        description: 'A complete workflow template for testing',
        spanPattern: 'test.integration',
        mode: 'span-tree',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'error',
            priority: 1,
            description: 'Error scenario',
            template: {
              introduction: '❌ Error Occurred\n{"━".repeat(50)}',
              events: {
                'test.started': 'Started: {test.name}',
                'test.error': 'Error: {error.message}',
              },
              summary: '❌ Failed',
            },
          },
          {
            id: 'success',
            priority: 2,
            description: 'Success scenario',
            template: {
              introduction: '✅ Test Passed',
              events: {
                'test.started': 'Started: {test.name}',
                'test.complete': 'Completed in {duration}ms',
              },
              flow: [
                'Test execution summary:',
                '  • Status: {test.status}',
                '  • Duration: {duration}ms',
              ],
              summary: '✅ Success',
            },
          },
        ],
        formatting: {
          indentPerLevel: '  ',
          showTimestamps: false,
          showDuration: true,
          showAttributes: 'matched',
        },
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas: createValidCanvas(),
        canvasPath,
        basePath: tempDir,
      };

      const result = await validator.validate(context);

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.violations).toHaveLength(0);
    });

    it('should collect multiple violations from different rules', async () => {
      const workflow = {
        version: 'invalid-version',
        canvas: 'nonexistent.canvas',
        name: '',
        mode: 'invalid-mode',
        scenarios: [
          {
            id: 'test',
            priority: -1,
            template: {
              introduction: '{unclosed',
            },
          },
        ],
        formatting: {
          showAttributes: 'invalid',
        },
      } as unknown as WorkflowTemplate;

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir,
      };

      const result = await validator.validate(context);

      expect(result.violations.length).toBeGreaterThan(5);

      const ruleIds = new Set(result.violations.map((v) => v.ruleId));
      expect(ruleIds.size).toBeGreaterThan(3); // Multiple different rules triggered
    });
  });

  // ============================================================================
  // EventRegistry Enhanced Error Messages Tests
  // ============================================================================

  describe('checkEventReferences with EventRegistry', () => {
    function createLibrary(eventSchemas: Record<string, { description: string; attributes: Record<string, unknown> }>): ComponentLibrary {
      return {
        version: '1.0.0',
        name: 'Test Library',
        nodeComponents: {},
        edgeComponents: {},
        eventSchemas,
      };
    }

    function createCanvasWithEvents(events: string[]): ExtendedCanvas {
      return {
        nodes: events.map((eventName, i) => ({
          id: `node-${i}`,
          type: 'text' as const,
          x: i * 100,
          y: 0,
          width: 100,
          height: 50,
          pv: {
            eventRef: eventName,
          },
        })),
        edges: [],
        pv: {
          version: '1.0.0',
          name: 'Test Canvas',
          markdown: 'test.md',
        },
      };
    }

    it('should show library suggestion when event exists in library but not canvas', async () => {
      // Create library with the event
      const library = createLibrary({
        'cleanup.started': { description: 'Cleanup started', attributes: {} },
      });

      // Create a canvas WITHOUT the event
      const canvas = createCanvasWithEvents(['other.event']);

      // Create another canvas that HAS the event (for the registry)
      const otherCanvas = createCanvasWithEvents(['cleanup.started']);

      // Build registry with library
      const canvases = new Map<string, ExtendedCanvas>();
      canvases.set('other.otel.canvas', otherCanvas);
      const eventRegistry = EventRegistry.build(library, canvases, 'library.yaml');

      // Workflow references an event not in its canvas
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Test Workflow',
        description: 'Test',
        mode: 'span-tree',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'default',
            priority: 1,
            description: 'Default',
            template: {
              events: {
                'cleanup.started': 'Cleanup started', // Not in canvas
              },
            },
          },
        ],
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        canvasPath: join(tempDir, 'test.otel.canvas'),
        basePath: tempDir,
        eventRegistry,
      };

      const result = await validator.validate(context);

      // Should have an error about the missing event
      const eventViolation = result.violations.find(
        v => v.ruleId === 'workflow-event-sync' && v.message.includes('cleanup.started')
      );

      expect(eventViolation).toBeDefined();
      // Should suggest using eventRef since it's in the library
      expect(eventViolation!.message).toContain('available in library');
      expect(eventViolation!.suggestion).toContain('eventRef');
    });

    it('should show canvas location when event exists in another canvas but not library', async () => {
      // No library events
      const canvases = new Map<string, ExtendedCanvas>();

      // Create another canvas that has the event we're looking for
      const cleanupCanvas = createCanvasWithEvents(['cleanup.started']);
      canvases.set('cleanup-operations.otel.canvas', cleanupCanvas);

      // Build registry without library
      const eventRegistry = EventRegistry.build(undefined, canvases);

      // Create a canvas WITHOUT the event
      const canvas = createCanvasWithEvents(['other.event']);

      // Workflow references an event not in its canvas
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Test Workflow',
        description: 'Test',
        mode: 'span-tree',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'default',
            priority: 1,
            description: 'Default',
            template: {
              events: {
                'cleanup.started': 'Cleanup started', // Not in canvas but in another canvas
              },
            },
          },
        ],
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        canvasPath: join(tempDir, 'test.otel.canvas'),
        basePath: tempDir,
        eventRegistry,
      };

      const result = await validator.validate(context);

      // Should have an error about the missing event
      const eventViolation = result.violations.find(
        v => v.ruleId === 'workflow-event-sync' && v.message.includes('cleanup.started')
      );

      expect(eventViolation).toBeDefined();
      // Should mention where the event was found
      expect(eventViolation!.message).toContain('cleanup-operations.otel.canvas');
      // Should suggest adding to library
      expect(eventViolation!.suggestion).toContain('library.yaml');
    });

    it('should show generic error when event not found anywhere', async () => {
      // Empty registry
      const eventRegistry = EventRegistry.build(undefined, new Map());

      // Create a canvas without the event
      const canvas = createCanvasWithEvents(['other.event']);

      // Workflow references an event that doesn't exist anywhere
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Test Workflow',
        description: 'Test',
        mode: 'span-tree',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'default',
            priority: 1,
            description: 'Default',
            template: {
              events: {
                'nonexistent.event': 'Does not exist anywhere',
              },
            },
          },
        ],
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        canvasPath: join(tempDir, 'test.otel.canvas'),
        basePath: tempDir,
        eventRegistry,
      };

      const result = await validator.validate(context);

      // Should have an error about the missing event
      const eventViolation = result.violations.find(
        v => v.ruleId === 'workflow-event-sync' && v.message.includes('nonexistent.event')
      );

      expect(eventViolation).toBeDefined();
      // Should show the standard error message
      expect(eventViolation!.message).toContain('not defined in canvas');
    });

    it('should work without eventRegistry (backward compatible)', async () => {
      // Create a canvas without the event
      const canvas = createCanvasWithEvents(['other.event']);

      // Workflow references an event not in canvas
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        canvas: 'test.otel.canvas',
        name: 'Test Workflow',
        description: 'Test',
        mode: 'span-tree',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'default',
            priority: 1,
            description: 'Default',
            template: {
              events: {
                'missing.event': 'Not in canvas',
              },
            },
          },
        ],
      };

      // No eventRegistry provided
      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        canvasPath: join(tempDir, 'test.otel.canvas'),
        basePath: tempDir,
        // eventRegistry: undefined
      };

      const result = await validator.validate(context);

      // Should still report the error, just without enhanced suggestions
      const eventViolation = result.violations.find(
        v => v.ruleId === 'workflow-event-sync' && v.message.includes('missing.event')
      );

      expect(eventViolation).toBeDefined();
      expect(eventViolation!.message).toContain('not defined in canvas');
    });
  });

  // ============================================================================
  // Event Connectivity Validation Tests
  // ============================================================================

  describe('checkEventConnectivity', () => {
    it('should pass when all events are connected', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarios: [{
          id: 'test',
          priority: 1,
          description: 'Test scenario',
          template: {
            events: {
              'event.started': 'Started',
              'event.processing': 'Processing',
              'event.complete': 'Complete'
            }
          }
        }]
      };

      const canvas: ExtendedCanvas = {
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, pv: { event: { name: 'event.started', attributes: {} } } },
          { id: 'n2', type: 'text', x: 150, y: 0, width: 100, height: 50, pv: { event: { name: 'event.processing', attributes: {} } } },
          { id: 'n3', type: 'text', x: 300, y: 0, width: 100, height: 50, pv: { event: { name: 'event.complete', attributes: {} } } }
        ],
        edges: [
          { id: 'e1', fromNode: 'n1', toNode: 'n2' },
          { id: 'e2', fromNode: 'n2', toNode: 'n3' }
        ],
        pv: {
          version: '1.0.0',
          name: 'Test Canvas',
          markdown: 'test.md'
        }
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const connectivityViolations = result.violations.filter(v => v.ruleId === 'workflow-event-connectivity');
      expect(connectivityViolations).toHaveLength(0);
    });

    it('should error when events are disconnected', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarios: [{
          id: 'test',
          priority: 1,
          description: 'Test scenario',
          template: {
            events: {
              'event.started': 'Started',
              'event.complete': 'Complete',
              'event.error': 'Error' // Disconnected - no path from started/complete to error
            }
          }
        }]
      };

      const canvas: ExtendedCanvas = {
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, pv: { event: { name: 'event.started', attributes: {} } } },
          { id: 'n2', type: 'text', x: 150, y: 0, width: 100, height: 50, pv: { event: { name: 'event.complete', attributes: {} } } },
          { id: 'n3', type: 'text', x: 0, y: 100, width: 100, height: 50, pv: { event: { name: 'event.error', attributes: {} } } }
        ],
        edges: [
          { id: 'e1', fromNode: 'n1', toNode: 'n2' }
          // n3 is isolated - no edges connecting it to n1 or n2
        ],
        pv: {
          version: '1.0.0',
          name: 'Test Canvas',
          markdown: 'test.md'
        }
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const connectivityViolations = result.violations.filter(v => v.ruleId === 'workflow-event-connectivity');
      expect(connectivityViolations).toHaveLength(1);
      expect(connectivityViolations[0].severity).toBe('error');
      expect(connectivityViolations[0].message).toContain('disconnected');
    });

    it('should error when canvas has no edges but workflow has multi-event scenarios', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarios: [{
          id: 'test',
          priority: 1,
          description: 'Test scenario',
          template: {
            events: {
              'event.started': 'Started',
              'event.complete': 'Complete'
            }
          }
        }]
      };

      const canvas: ExtendedCanvas = {
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, pv: { event: { name: 'event.started', attributes: {} } } },
          { id: 'n2', type: 'text', x: 150, y: 0, width: 100, height: 50, pv: { event: { name: 'event.complete', attributes: {} } } }
        ],
        edges: [], // No edges defined
        pv: {
          version: '1.0.0',
          name: 'Test Canvas',
          markdown: 'test.md'
        }
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        basePath: tempDir
      };

      const result = await validator.validate(context);
      // Should produce connectivity violation when canvas has no edges but scenario has multiple events
      const connectivityViolations = result.violations.filter(v => v.ruleId === 'workflow-event-connectivity');
      expect(connectivityViolations).toHaveLength(1);
      expect(connectivityViolations[0].severity).toBe('error');
      expect(connectivityViolations[0].message).toContain('has no edges');
    });

    it('should skip check when scenario has less than 2 events', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarios: [{
          id: 'test',
          priority: 1,
          description: 'Test scenario',
          template: {
            events: {
              'event.started': 'Started'
            }
          }
        }]
      };

      const canvas: ExtendedCanvas = {
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, pv: { event: { name: 'event.started', attributes: {} } } }
        ],
        edges: [],
        pv: {
          version: '1.0.0',
          name: 'Test Canvas',
          markdown: 'test.md'
        }
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const connectivityViolations = result.violations.filter(v => v.ruleId === 'workflow-event-connectivity');
      expect(connectivityViolations).toHaveLength(0);
    });

    it('should handle events connected through intermediate nodes', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarios: [{
          id: 'test',
          priority: 1,
          description: 'Test scenario',
          template: {
            events: {
              'event.start': 'Start',
              'event.end': 'End'
            }
          }
        }]
      };

      const canvas: ExtendedCanvas = {
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, pv: { event: { name: 'event.start', attributes: {} } } },
          { id: 'n2', type: 'text', x: 150, y: 0, width: 100, height: 50, pv: { event: { name: 'event.middle1', attributes: {} } } },
          { id: 'n3', type: 'text', x: 300, y: 0, width: 100, height: 50, pv: { event: { name: 'event.middle2', attributes: {} } } },
          { id: 'n4', type: 'text', x: 450, y: 0, width: 100, height: 50, pv: { event: { name: 'event.end', attributes: {} } } }
        ],
        edges: [
          { id: 'e1', fromNode: 'n1', toNode: 'n2' },
          { id: 'e2', fromNode: 'n2', toNode: 'n3' },
          { id: 'e3', fromNode: 'n3', toNode: 'n4' }
        ],
        pv: {
          version: '1.0.0',
          name: 'Test Canvas',
          markdown: 'test.md'
        }
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        canvas,
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const connectivityViolations = result.violations.filter(v => v.ruleId === 'workflow-event-connectivity');
      // Should pass because events are connected through intermediate nodes
      expect(connectivityViolations).toHaveLength(0);
    });
  });

  // ============================================================================
  // Subset Validation Tests
  // ============================================================================

  describe('checkScenarioSubsets', () => {
    it('should pass when scenarios have mutually exclusive event sets', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'success',
            priority: 1,
            description: 'Success scenario',
            template: {
              events: {
                'payment.authorized': 'Payment authorized',
                'order.confirmed': 'Order confirmed'
              }
            }
          },
          {
            id: 'failure',
            priority: 2,
            description: 'Failure scenario',
            template: {
              events: {
                'payment.declined': 'Payment declined',
                'error.logged': 'Error logged'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');
      expect(subsetViolations).toHaveLength(0);
    });

    it('should pass when scenarios have overlapping but not subset event sets', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'google-oauth',
            priority: 1,
            description: 'Google OAuth',
            template: {
              events: {
                'oauth.google': 'Google auth',
                'oauth.complete': 'OAuth complete',
                'user.created': 'User created'
              }
            }
          },
          {
            id: 'email-password',
            priority: 2,
            description: 'Email/password signup',
            template: {
              events: {
                'email.verified': 'Email verified',
                'password.set': 'Password set',
                'user.created': 'User created'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');
      expect(subsetViolations).toHaveLength(0);
    });

    it('should error when one scenario is a strict subset of another', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'basic-checkout',
            priority: 1,
            description: 'Basic checkout',
            template: {
              events: {
                'cart.viewed': 'Cart viewed',
                'checkout.started': 'Checkout started'
              }
            }
          },
          {
            id: 'complete-checkout',
            priority: 2,
            description: 'Complete checkout',
            template: {
              events: {
                'cart.viewed': 'Cart viewed',
                'checkout.started': 'Checkout started',
                'payment.complete': 'Payment complete'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');

      expect(subsetViolations).toHaveLength(1);
      expect(subsetViolations[0].severity).toBe('error');
      expect(subsetViolations[0].message).toContain('basic-checkout');
      expect(subsetViolations[0].message).toContain('strict subset');
      expect(subsetViolations[0].message).toContain('complete-checkout');
      expect(subsetViolations[0].impact).toContain('ambiguous');
      expect(subsetViolations[0].suggestion).toContain('Merge into one scenario');
      expect(subsetViolations[0].suggestion).toContain('mutually exclusive');
    });

    it('should detect reverse subset relationship', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'complete-flow',
            priority: 1,
            description: 'Complete flow',
            template: {
              events: {
                'step.one': 'Step 1',
                'step.two': 'Step 2',
                'step.three': 'Step 3'
              }
            }
          },
          {
            id: 'partial-flow',
            priority: 2,
            description: 'Partial flow',
            template: {
              events: {
                'step.one': 'Step 1',
                'step.two': 'Step 2'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');

      expect(subsetViolations).toHaveLength(1);
      expect(subsetViolations[0].message).toContain('partial-flow');
      expect(subsetViolations[0].message).toContain('strict subset');
      expect(subsetViolations[0].message).toContain('complete-flow');
    });

    it('should pass when scenarios have same number of events but different events', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'scenario-a',
            priority: 1,
            description: 'Scenario A',
            template: {
              events: {
                'event.a': 'Event A',
                'event.b': 'Event B'
              }
            }
          },
          {
            id: 'scenario-b',
            priority: 2,
            description: 'Scenario B',
            template: {
              events: {
                'event.c': 'Event C',
                'event.d': 'Event D'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');
      expect(subsetViolations).toHaveLength(0);
    });

    it('should pass when workflow has only one scenario', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'only-scenario',
            priority: 1,
            description: 'Only scenario',
            template: {
              events: {
                'event.one': 'Event 1'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');
      expect(subsetViolations).toHaveLength(0);
    });

    it('should handle scenarios with empty event sets', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'empty-events',
            priority: 1,
            description: 'Empty events',
            template: {
              introduction: 'Test',
              events: {}
            }
          },
          {
            id: 'with-events',
            priority: 2,
            description: 'With events',
            template: {
              events: {
                'event.one': 'Event 1'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');

      // Empty set is a strict subset of any non-empty set
      expect(subsetViolations).toHaveLength(1);
      expect(subsetViolations[0].message).toContain('empty-events');
      expect(subsetViolations[0].message).toContain('strict subset');
    });

    it('should detect multiple subset violations in a workflow', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'minimal',
            priority: 1,
            description: 'Minimal',
            template: {
              events: {
                'event.a': 'A'
              }
            }
          },
          {
            id: 'medium',
            priority: 2,
            description: 'Medium',
            template: {
              events: {
                'event.a': 'A',
                'event.b': 'B'
              }
            }
          },
          {
            id: 'complete',
            priority: 3,
            description: 'Complete',
            template: {
              events: {
                'event.a': 'A',
                'event.b': 'B',
                'event.c': 'C'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');

      // Should detect:
      // 1. minimal ⊂ medium
      // 2. minimal ⊂ complete
      // 3. medium ⊂ complete
      expect(subsetViolations.length).toBeGreaterThanOrEqual(3);
    });

    it('should provide helpful fix suggestions in error messages', async () => {
      const workflow: WorkflowTemplate = {
        version: '1.0.0',
        name: 'Test',
        description: 'Test workflow',
        mode: 'span-tree',
        canvas: 'test.otel.canvas',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'abandoned',
            priority: 1,
            description: 'Abandoned cart',
            template: {
              events: {
                'cart.created': 'Cart created',
                'items.added': 'Items added'
              }
            }
          },
          {
            id: 'completed',
            priority: 2,
            description: 'Completed purchase',
            template: {
              events: {
                'cart.created': 'Cart created',
                'items.added': 'Items added',
                'checkout.complete': 'Checkout complete'
              }
            }
          }
        ]
      };

      const context: WorkflowValidationContext = {
        workflow,
        workflowPath: 'test.workflow.json',
        basePath: tempDir
      };

      const result = await validator.validate(context);
      const subsetViolations = result.violations.filter(v => v.ruleId === 'workflow-scenario-subset');

      expect(subsetViolations).toHaveLength(1);

      const violation = subsetViolations[0];
      expect(violation.suggestion).toContain('cart.created');
      expect(violation.suggestion).toContain('items.added');
      expect(violation.suggestion).toContain('checkout.complete');
      expect(violation.suggestion).toContain('Merge into one scenario');
      expect(violation.suggestion).toContain('template conditionals');
      expect(violation.suggestion).toContain('mutually exclusive');
      expect(violation.suggestion).toContain('distinguishing events');
    });
  });

  // ============================================================================
  // Span Pattern Validation Tests
  // ============================================================================

  describe('validateSpanPatterns (CLI-level validation)', () => {
    it('should pass when all workflows have unique spanPatterns', () => {
      const workflows = [
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Payment Workflow',
            description: 'Payment processing',
            spanPattern: 'payment.authorize',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'workflows/payment.workflow.json',
        },
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Inventory Workflow',
            description: 'Inventory management',
            spanPattern: 'inventory.reserve',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'workflows/inventory.workflow.json',
        },
      ];

      const violations = WorkflowValidator.validateSpanPatterns(workflows);
      expect(violations).toHaveLength(0);
    });

    it('should error when workflows have duplicate spanPatterns', () => {
      const workflows = [
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test1.otel.canvas',
            name: 'Payment Workflow 1',
            description: 'Payment processing',
            spanPattern: 'payment.authorize',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'workflows/payment1.workflow.json',
        },
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test2.otel.canvas',
            name: 'Payment Workflow 2',
            description: 'Payment processing alternative',
            spanPattern: 'payment.authorize',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'workflows/payment2.workflow.json',
        },
      ];

      const violations = WorkflowValidator.validateSpanPatterns(workflows);

      expect(violations).toHaveLength(2); // One for each workflow
      expect(violations[0].ruleId).toBe('workflow-span-pattern-duplicate');
      expect(violations[0].severity).toBe('error');
      expect(violations[0].message).toContain('payment.authorize');
      expect(violations[0].message).toContain('Duplicate spanPattern');
      expect(violations[0].suggestion).toContain('payment2.workflow.json');
    });

    it('should detect multiple duplicates across many workflows', () => {
      const workflows = [
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Workflow A1',
            description: 'Test',
            spanPattern: 'span.a',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'a1.workflow.json',
        },
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Workflow A2',
            description: 'Test',
            spanPattern: 'span.a',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'a2.workflow.json',
        },
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Workflow B',
            description: 'Test',
            spanPattern: 'span.b',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'b.workflow.json',
        },
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Workflow C1',
            description: 'Test',
            spanPattern: 'span.c',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'c1.workflow.json',
        },
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Workflow C2',
            description: 'Test',
            spanPattern: 'span.c',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'c2.workflow.json',
        },
      ];

      const violations = WorkflowValidator.validateSpanPatterns(workflows);

      // Should have violations for: a1, a2, c1, c2 (4 workflows with duplicates)
      expect(violations.length).toBe(4);

      // Check that span.b has no violations
      const spanBViolations = violations.filter(v => v.file === 'b.workflow.json');
      expect(spanBViolations).toHaveLength(0);
    });

    it('should handle workflows without spanPattern gracefully', () => {
      const workflows = [
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Valid Workflow',
            description: 'Test',
            spanPattern: 'payment.authorize',
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          },
          workflowPath: 'valid.workflow.json',
        },
        {
          workflow: {
            version: '1.0.0',
            canvas: 'test.otel.canvas',
            name: 'Invalid Workflow',
            description: 'Test',
            // spanPattern missing - will be caught by individual validation
            mode: 'span-tree' as const,
            scenarioSelection: 'first-match' as const,
            scenarios: [],
          } as Partial<WorkflowTemplate> as WorkflowTemplate,
          workflowPath: 'invalid.workflow.json',
        },
      ];

      const violations = WorkflowValidator.validateSpanPatterns(workflows);

      // Should not error - just skip the workflow without spanPattern
      expect(violations).toHaveLength(0);
    });
  });

  // ============================================================================
  // Span Pattern Schema Validation Tests
  // ============================================================================

  describe('checkSchema - spanPattern', () => {
    it('should error when spanPattern is missing', async () => {
      const context = createContext({ spanPattern: undefined });
      const result = await validator.validate(context);

      const spanPatternViolations = result.violations.filter(
        v => v.ruleId === 'workflow-schema-valid' && v.path === 'spanPattern'
      );

      expect(spanPatternViolations).toHaveLength(1);
      expect(spanPatternViolations[0].message).toContain('Missing required field "spanPattern"');
      expect(spanPatternViolations[0].suggestion).toContain('exact span name');
    });

    it('should error when spanPattern is empty string', async () => {
      const context = createContext({ spanPattern: '' });
      const result = await validator.validate(context);

      const spanPatternViolations = result.violations.filter(
        v => v.ruleId === 'workflow-schema-valid' && v.path === 'spanPattern'
      );

      expect(spanPatternViolations).toHaveLength(1);
      expect(spanPatternViolations[0].message).toContain('Missing required field');
    });

    it('should pass when spanPattern is a valid string', async () => {
      const canvasPath = join(tempDir, 'test.otel.canvas');
      writeFileSync(canvasPath, JSON.stringify(createValidCanvas()));

      const context = createContext({ spanPattern: 'payment.authorize' }, { canvasPath });
      const result = await validator.validate(context);

      const spanPatternViolations = result.violations.filter(
        v => v.ruleId === 'workflow-schema-valid' && v.path === 'spanPattern'
      );

      expect(spanPatternViolations).toHaveLength(0);
    });

    it('should allow parentheses in spanPattern (Next.js style span names)', async () => {
      const canvasPath = join(tempDir, 'test.otel.canvas');
      writeFileSync(canvasPath, JSON.stringify(createValidCanvas()));

      // Next.js creates span names like "executing api route (app) /api/auth/me/route"
      const context = createContext({
        spanPattern: 'executing api route (app) /api/auth/me/route'
      }, { canvasPath });
      const result = await validator.validate(context);

      const spanPatternViolations = result.violations.filter(
        v => v.ruleId === 'workflow-span-pattern-exact' && v.path === 'spanPattern'
      );

      expect(spanPatternViolations).toHaveLength(0);
    });

    it('should error when spanPattern contains wildcard *', async () => {
      const context = createContext({ spanPattern: 'payment.*' });
      const result = await validator.validate(context);

      const spanPatternViolations = result.violations.filter(
        v => v.ruleId === 'workflow-span-pattern-exact' && v.path === 'spanPattern'
      );

      expect(spanPatternViolations).toHaveLength(1);
      expect(spanPatternViolations[0].message).toContain('wildcard');
    });

    it('should error when spanPattern contains regex special characters', async () => {
      const regexPatterns = [
        'payment[type]',      // square brackets
        'payment{1,2}',       // curly braces (quantifier)
        'payment^start',      // caret
        'payment$end',        // dollar
        'payment|refund',     // pipe (alternation)
        'payment\\d+',        // backslash
        'payment+',           // plus
        'payment?',           // question mark
      ];

      for (const pattern of regexPatterns) {
        const context = createContext({ spanPattern: pattern });
        const result = await validator.validate(context);

        const spanPatternViolations = result.violations.filter(
          v => v.ruleId === 'workflow-span-pattern-exact' && v.path === 'spanPattern'
        );

        expect(spanPatternViolations).toHaveLength(1);
        expect(spanPatternViolations[0].message).toContain('regex special characters');
      }
    });
  });
});
