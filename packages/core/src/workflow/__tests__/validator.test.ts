/**
 * Tests for workflow template validator
 */

import { WorkflowValidator } from '../validator';
import type { WorkflowTemplate, WorkflowValidationContext } from '../validator';
import type { ExtendedCanvas } from '../../types/canvas';
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
      mode: 'span-tree',
      scenarioSelection: 'first-match',
      scenarios: [
        {
          id: 'test-passed',
          priority: 1,
          description: 'Test passed successfully',
          condition: {
            requires: ['test.complete'],
            assertions: {
              'test.status': { $eq: 'passed' },
            },
          },
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
          id: 'default',
          priority: 100,
          description: 'Default fallback',
          condition: {
            default: true,
          },
          template: {
            introduction: 'Default workflow',
            events: {
              'test.started': 'Test started',
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
      edges: [],
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
            condition: { default: true },
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
            condition: { default: true },
            template: { introduction: 'First' },
          },
          {
            id: 'duplicate',
            priority: 2,
            description: 'Second',
            condition: { requires: ['test'] },
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
            condition: { default: true },
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
            condition: { default: true },
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
            condition: { default: true },
            template: { introduction: 'First' },
          },
          {
            id: 'second',
            priority: 1,
            description: 'Second',
            condition: { requires: ['test'] },
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

    it('should flag missing default scenario', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            condition: { requires: ['test.complete'] },
            template: { introduction: 'Test' },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('No default scenario'),
        })
      );
    });

    it('should flag missing condition', async () => {
      const context = createContext({
        scenarios: [
          {
            id: 'test',
            priority: 1,
            description: 'Test',
            condition: undefined as unknown,
            template: { introduction: 'Test' },
          },
        ],
      });
      const result = await validator.validate(context);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-scenario-valid',
          message: expect.stringContaining('missing required "condition"'),
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
            condition: { default: true },
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
            condition: { default: true },
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
            condition: { default: true },
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
            condition: { default: true },
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
            condition: { default: true },
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
            condition: { default: true },
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
            condition: { default: true },
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
            condition: { default: true },
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
        mode: 'span-tree',
        scenarioSelection: 'first-match',
        scenarios: [
          {
            id: 'error',
            priority: 1,
            description: 'Error scenario',
            condition: {
              requires: ['*.error'],
            },
            template: {
              introduction: '❌ Error Occurred\n{"━".repeat(50)}',
              events: {
                'test.error': 'Error: {error.message}',
              },
              summary: '❌ Failed',
            },
          },
          {
            id: 'success',
            priority: 2,
            description: 'Success scenario',
            condition: {
              requires: ['test.complete'],
              assertions: {
                'test.status': { $eq: 'passed' },
              },
            },
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
          {
            id: 'default',
            priority: 100,
            description: 'Default fallback',
            condition: {
              default: true,
            },
            template: {
              introduction: 'Test execution',
              events: {
                'test.started': 'Test started',
              },
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
            condition: undefined,
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
});
