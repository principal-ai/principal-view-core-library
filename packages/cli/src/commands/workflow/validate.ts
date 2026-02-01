import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, dirname } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
// Node.js-specific imports (validator)
import {
  WorkflowValidator,
  CanvasDiscovery,
  buildFileTreeFromDirectory,
  createNodeFileReader,
  EventRegistry,
} from '@principal-ai/principal-view-core/node';
import yaml from 'js-yaml';
// Browser-safe imports
import { computeAggregates } from '@principal-ai/principal-view-core';
import type { ExtendedCanvas, ComponentLibrary } from '@principal-ai/principal-view-core';
import { loadWorkflow, resolvePath, loadExecution, executionToEvents } from './utils.js';

interface ValidateOptions {
  canvas?: string;
  execution?: string;
  json?: boolean;
  quiet?: boolean;
  dir?: string;
}

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate workflow template syntax, schema, and references')
    .argument('<file>', 'Path to .workflow.json file')
    .option('--canvas <path>', 'Override canvas file path for validation')
    .option('--execution <path>', 'Execution file (.otel.json) for validating attribute references')
    .option('--json', 'Output violations as JSON')
    .option('-q, --quiet', 'Only show errors, suppress warnings')
    .option('-d, --dir <path>', 'Project directory (default: cwd)')
    .action(async (file: string, options: ValidateOptions) => {
      try {
        const baseDir = options.dir || process.cwd();
        const workflowPath = resolvePath(file, baseDir);

        // Load workflow
        const workflow = await loadWorkflow(workflowPath);

        // Resolve canvas path
        // Canvas paths are always relative to repository root
        let canvasPath: string | undefined;
        let canvas: ExtendedCanvas | undefined;
        if (options.canvas) {
          canvasPath = resolvePath(options.canvas, baseDir);
        } else if (workflow.canvas) {
          canvasPath = resolve(baseDir, workflow.canvas);
        }

        // Load canvas if path exists
        if (canvasPath) {
          try {
            const canvasContent = readFileSync(canvasPath, 'utf-8');
            canvas = JSON.parse(canvasContent) as ExtendedCanvas;
          } catch (error) {
            // Canvas not found or invalid - will be flagged by validator
            canvas = undefined;
          }
        }

        // Load execution data if provided
        let executionData: {
          aggregates: Record<string, unknown>;
          eventAttributes: Map<string, Record<string, unknown>>;
        } | undefined;

        if (options.execution) {
          try {
            const executionPath = resolvePath(options.execution, baseDir);
            const execution = await loadExecution(executionPath);
            const events = executionToEvents(execution);
            const aggregates = computeAggregates(events);

            // Build event-specific attribute map
            const eventAttributes = new Map<string, Record<string, unknown>>();
            for (const event of events) {
              if (!eventAttributes.has(event.name)) {
                eventAttributes.set(event.name, {});
              }
              const attrs = eventAttributes.get(event.name)!;
              // Merge attributes from this event occurrence
              if (event.attributes) {
                Object.assign(attrs, event.attributes);
              }
            }

            executionData = { aggregates, eventAttributes };
          } catch (error) {
            console.error(
              chalk.yellow('Warning:'),
              `Failed to load execution file: ${(error as Error).message}`
            );
            console.error(chalk.gray('  Attribute validation will be skipped'));
          }
        }

        // Discover co-located execution files for template completeness validation
        const workflowDir = dirname(workflowPath);
        const executionFiles: string[] = [];
        try {
          const filesInDir = readdirSync(workflowDir);
          for (const file of filesInDir) {
            if (file.endsWith('.otel.json')) {
              executionFiles.push(resolve(workflowDir, file));
            }
          }
        } catch (error) {
          // Directory not readable, skip co-located file discovery
        }

        // Build EventRegistry for cross-canvas event lookup
        let eventRegistry: EventRegistry | undefined;
        try {
          // Load library
          let library: ComponentLibrary | undefined;
          const libraryPath = resolve(baseDir, '.principal-views/library.yaml');
          if (existsSync(libraryPath)) {
            try {
              const libraryContent = readFileSync(libraryPath, 'utf-8');
              library = yaml.load(libraryContent) as ComponentLibrary;
            } catch {
              // Library failed to parse, continue without it
            }
          }

          // Discover all canvases in the project
          const fileTree = await buildFileTreeFromDirectory(baseDir);
          const discovery = new CanvasDiscovery();
          const discoveryResult = await discovery.discover(fileTree, {
            fileReader: createNodeFileReader(baseDir),
            includeContent: true,
          });

          // Parse all canvases
          const parsedCanvases = new Map<string, ExtendedCanvas>();
          for (const discoveredCanvas of discoveryResult.canvases) {
            if (discoveredCanvas.type === 'otel') {
              try {
                const canvasFullPath = resolve(baseDir, discoveredCanvas.path);
                if (existsSync(canvasFullPath)) {
                  const content = readFileSync(canvasFullPath, 'utf-8');
                  const parsed = JSON.parse(content) as ExtendedCanvas;
                  parsedCanvases.set(discoveredCanvas.path, parsed);
                }
              } catch {
                // Skip canvases that fail to parse
              }
            }
          }

          // Build the registry
          eventRegistry = EventRegistry.build(
            library,
            parsedCanvases,
            library ? libraryPath : undefined
          );
        } catch (error) {
          // EventRegistry building failed - continue without it
          // Validation will still work, just without cross-canvas suggestions
        }

        // Create validator
        const validator = new WorkflowValidator();

        // Validate
        const context = {
          workflow,
          workflowPath,
          canvasPath,
          canvas,
          basePath: baseDir,
          executionData,
          executionFiles,
          eventRegistry,
        };

        const result = await validator.validate(context);

        // Filter violations if quiet mode
        const violations = options.quiet
          ? result.violations.filter((v) => v.severity === 'error')
          : result.violations;

        const errors = violations.filter((v) => v.severity === 'error');
        const warnings = violations.filter((v) => v.severity === 'warn');

        // Output
        if (options.json) {
          const output = {
            file: file,
            valid: errors.length === 0,
            violations: violations.map((v) => ({
              severity: v.severity,
              ruleId: v.ruleId,
              file: v.file,
              path: v.path,
              message: v.message,
              impact: v.impact,
              suggestion: v.suggestion,
              fixable: v.fixable,
            })),
            summary: {
              errors: errors.length,
              warnings: warnings.length,
              scenarioCount: workflow.scenarios.length,
              hasDefault: workflow.scenarios.some((s) => s.condition.default),
              attributeValidation: executionData ? 'enabled' : 'skipped',
            },
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          // Text output
          console.log(chalk.bold(`\nValidating: ${file}\n`));

          if (errors.length === 0 && warnings.length === 0) {
            console.log(chalk.green('✓'), 'Schema validation passed');
            console.log(
              chalk.green('✓'),
              `${workflow.scenarios.length} scenarios found`
            );
            const hasDefault = workflow.scenarios.some((s) => s.condition.default);
            console.log(
              chalk.green('✓'),
              hasDefault ? 'Default scenario present' : 'No default scenario'
            );
            const priorities = workflow.scenarios.map((s) => s.priority);
            const allUnique = new Set(priorities).size === priorities.length;
            console.log(
              chalk.green('✓'),
              allUnique ? 'All priorities unique' : 'Duplicate priorities found'
            );

            if (canvasPath) {
              console.log(
                chalk.green('✓'),
                `Canvas: ${workflow.canvas || canvasPath} ✓`
              );
            }
          } else {
            // Show violations
            for (const violation of violations) {
              const icon = violation.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
              const severity =
                violation.severity === 'error'
                  ? chalk.red('Error')
                  : chalk.yellow('Warning');

              console.log(`\n${icon} ${severity}: ${violation.message}`);
              if (violation.path) {
                console.log(chalk.gray(`  Location: ${violation.path}`));
              }
              if (violation.impact) {
                console.log(chalk.gray(`  Impact: ${violation.impact}`));
              }
              if (violation.suggestion) {
                console.log(chalk.cyan(`  Suggestion: ${violation.suggestion}`));
              }
            }
          }

          // Summary
          console.log(chalk.bold('\nSummary:'));
          if (errors.length > 0) {
            console.log(chalk.red(`  • ${errors.length} error(s)`));
          } else {
            console.log(chalk.green('  • 0 errors'));
          }

          if (warnings.length > 0) {
            console.log(chalk.yellow(`  • ${warnings.length} warning(s)`));
          } else if (!options.quiet) {
            console.log(chalk.green('  • 0 warnings'));
          }

          console.log(
            chalk.gray(`  • ${workflow.scenarios.length} scenario(s)`)
          );

          if (canvasPath) {
            console.log(chalk.gray(`  • Canvas: ${workflow.canvas || canvasPath}`));
          }

          if (executionData) {
            console.log(
              chalk.gray('  • Attribute validation:'),
              chalk.green('enabled')
            );
          } else {
            console.log(
              chalk.gray('  • Attribute validation:'),
              chalk.gray('skipped (use --execution to enable)')
            );
          }

          if (executionFiles.length > 0) {
            console.log(
              chalk.gray(`  • Co-located executions: ${executionFiles.length} file(s) checked`)
            );
          }

          console.log();
        }

        // Exit with error code if validation failed
        if (errors.length > 0) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
