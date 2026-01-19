import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, dirname } from 'node:path';
import { NarrativeValidator } from '@principal-ai/principal-view-core';
import { loadNarrative, resolvePath } from './utils.js';

interface ValidateOptions {
  canvas?: string;
  json?: boolean;
  quiet?: boolean;
  dir?: string;
}

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate narrative template syntax, schema, and references')
    .argument('<file>', 'Path to .narrative.json file')
    .option('--canvas <path>', 'Override canvas file path for validation')
    .option('--json', 'Output violations as JSON')
    .option('-q, --quiet', 'Only show errors, suppress warnings')
    .option('-d, --dir <path>', 'Project directory (default: cwd)')
    .action(async (file: string, options: ValidateOptions) => {
      try {
        const baseDir = options.dir || process.cwd();
        const narrativePath = resolvePath(file, baseDir);

        // Load narrative
        const narrative = await loadNarrative(narrativePath);

        // Resolve canvas path
        let canvasPath: string | undefined;
        if (options.canvas) {
          canvasPath = resolvePath(options.canvas, baseDir);
        } else if (narrative.canvas) {
          const narrativeDir = dirname(narrativePath);
          canvasPath = resolve(narrativeDir, narrative.canvas);
        }

        // Create validator
        const validator = new NarrativeValidator();

        // Validate
        const context = {
          narrative,
          narrativePath,
          canvasPath,
          basePath: baseDir,
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
              scenarioCount: narrative.scenarios.length,
              hasDefault: narrative.scenarios.some((s) => s.condition.default),
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
              `${narrative.scenarios.length} scenarios found`
            );
            const hasDefault = narrative.scenarios.some((s) => s.condition.default);
            console.log(
              chalk.green('✓'),
              hasDefault ? 'Default scenario present' : 'No default scenario'
            );
            const priorities = narrative.scenarios.map((s) => s.priority);
            const allUnique = new Set(priorities).size === priorities.length;
            console.log(
              chalk.green('✓'),
              allUnique ? 'All priorities unique' : 'Duplicate priorities found'
            );

            if (canvasPath) {
              console.log(
                chalk.green('✓'),
                `Canvas: ${narrative.canvas || canvasPath} ✓`
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
            chalk.gray(`  • ${narrative.scenarios.length} scenario(s)`)
          );

          if (canvasPath) {
            console.log(chalk.gray(`  • Canvas: ${narrative.canvas || canvasPath}`));
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
