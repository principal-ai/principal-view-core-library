/**
 * Validate execution files command
 *
 * Validates .otel.json files to ensure they conform to the expected ExecutionData structure.
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, dirname, join, basename } from 'node:path';
import chalk from 'chalk';
import { globby } from 'globby';
import { createExecutionValidator } from '@principal-ai/principal-view-core';
import type {
  ExecutionValidationResult,
  ValidationError,
} from '@principal-ai/principal-view-core';

interface ValidateExecutionOptions {
  json?: boolean;
  quiet?: boolean;
}

interface FileValidationResult {
  file: string;
  result: ExecutionValidationResult;
}

/**
 * Load and parse an execution file
 */
function loadExecutionFile(filePath: string): unknown {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse JSON: ${(error as Error).message}`
    );
  }
}

/**
 * Check if a matching canvas file exists for an execution file
 * Returns the path to the matching canvas, or null if not found
 */
function findMatchingCanvas(executionPath: string, cwd: string): string | null {
  const fileName = basename(executionPath);
  const dir = dirname(executionPath);

  // Extract basename by removing .otel.json extension
  const canvasBasename = fileName.replace(/\.otel\.json$/, '');

  // Determine canvas directory (go up from __executions__ to .principal-views)
  // Support both .principal-views/__executions__/ and __executions__/ patterns
  let canvasDir: string;
  if (dir.includes('.principal-views/__executions__')) {
    canvasDir = dir.replace('/__executions__', '');
  } else if (dir.endsWith('__executions__')) {
    canvasDir = join(dirname(dir), '.principal-views');
  } else {
    // Fallback: look in .principal-views relative to cwd
    canvasDir = join(cwd, '.principal-views');
  }

  // Check for .otel.canvas first (preferred)
  const otelCanvasPath = join(canvasDir, `${canvasBasename}.otel.canvas`);
  if (existsSync(otelCanvasPath)) {
    return otelCanvasPath;
  }

  // Check for regular .canvas as fallback
  const regularCanvasPath = join(canvasDir, `${canvasBasename}.canvas`);
  if (existsSync(regularCanvasPath)) {
    return regularCanvasPath;
  }

  return null;
}

/**
 * Format validation results for console output
 */
function formatConsoleOutput(
  results: FileValidationResult[],
  options: ValidateExecutionOptions
): { output: string; hasErrors: boolean } {
  const lines: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const { file, result } of results) {
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;

    // If quiet mode, only show files with issues
    if (options.quiet && result.valid && result.warnings.length === 0) {
      continue;
    }

    // Show file status
    if (result.valid && result.warnings.length === 0) {
      lines.push(chalk.green(`✓ ${file}`));
    } else if (result.valid && result.warnings.length > 0) {
      lines.push(chalk.yellow(`⚠ ${file}`));
    } else {
      lines.push(chalk.red(`✗ ${file}`));
    }

    // Show errors
    if (result.errors.length > 0) {
      lines.push('');
      result.errors.forEach((error: ValidationError) => {
        lines.push(chalk.red(`  ERROR: ${error.path}`));
        lines.push(`    ${error.message}`);
        if (error.suggestion) {
          lines.push(chalk.dim(`    → ${error.suggestion}`));
        }
      });
      lines.push('');
    }

    // Show warnings
    if (result.warnings.length > 0) {
      lines.push('');
      result.warnings.forEach((warning: ValidationError) => {
        lines.push(chalk.yellow(`  WARN: ${warning.path}`));
        lines.push(`    ${warning.message}`);
        if (warning.suggestion) {
          lines.push(chalk.dim(`    → ${warning.suggestion}`));
        }
      });
      lines.push('');
    }
  }

  // Summary
  lines.push('');
  if (totalErrors === 0 && totalWarnings === 0) {
    lines.push(
      chalk.green(`✓ All ${results.length} file${results.length === 1 ? '' : 's'} passed validation`)
    );
  } else {
    const parts: string[] = [];
    if (totalErrors > 0) {
      parts.push(chalk.red(`${totalErrors} error${totalErrors === 1 ? '' : 's'}`));
    }
    if (totalWarnings > 0) {
      parts.push(
        chalk.yellow(`${totalWarnings} warning${totalWarnings === 1 ? '' : 's'}`)
      );
    }
    lines.push(`✖ ${parts.join(', ')} found in ${results.length} file${results.length === 1 ? '' : 's'}`);
  }

  return {
    output: lines.join('\n'),
    hasErrors: totalErrors > 0,
  };
}

/**
 * Format validation results as JSON
 */
function formatJsonOutput(results: FileValidationResult[]): object {
  let totalErrors = 0;
  let totalWarnings = 0;

  const files = results.map(({ file, result }) => {
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;

    return {
      file,
      valid: result.valid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errors: result.errors,
      warnings: result.warnings,
    };
  });

  return {
    files,
    summary: {
      totalFiles: files.length,
      totalErrors,
      totalWarnings,
      validFiles: files.filter((f) => f.valid).length,
      invalidFiles: files.filter((f) => !f.valid).length,
    },
  };
}

/**
 * Create the validate-execution command
 */
export function createValidateExecutionCommand(): Command {
  const command = new Command('validate-execution');

  command
    .description('Validate execution files (.otel.json)')
    .argument('[files...]', 'Files or glob patterns to validate (defaults to **/__executions__/**/*.otel.json)')
    .option('--json', 'Output results as JSON')
    .option('-q, --quiet', 'Only show files with errors or warnings')
    .action(async (files: string[], options: ValidateExecutionOptions) => {
      try {
        const cwd = process.cwd();
        const validator = createExecutionValidator();

        // Determine files to validate
        let patterns: string[];
        if (files.length > 0) {
          patterns = files;
        } else {
          // Default: find all .otel.json files in __executions__ directories
          patterns = [
            '**/__executions__/*.otel.json',
            '.principal-views/__executions__/*.otel.json',
          ];
        }

        // Find matching files
        const matchedFiles = await globby(patterns, {
          ignore: ['**/node_modules/**'],
          absolute: false,
        });

        if (matchedFiles.length === 0) {
          if (options.json) {
            console.log(
              JSON.stringify({
                files: [],
                summary: {
                  totalFiles: 0,
                  totalErrors: 0,
                  totalWarnings: 0,
                  validFiles: 0,
                  invalidFiles: 0,
                },
              })
            );
          } else {
            console.log(chalk.yellow('No execution files found matching the specified patterns.'));
            console.log(chalk.dim(`Patterns searched: ${patterns.join(', ')}`));
          }
          return;
        }

        // Validate each file
        const results: FileValidationResult[] = [];

        for (const filePath of matchedFiles) {
          const absolutePath = resolve(cwd, filePath);
          const relativePath = relative(cwd, absolutePath);

          try {
            const data = loadExecutionFile(absolutePath);
            const result = validator.validate(data, relativePath);

            // Check if a matching canvas file exists
            const matchingCanvas = findMatchingCanvas(absolutePath, cwd);
            if (!matchingCanvas) {
              const fileName = basename(absolutePath);
              const canvasBasename = fileName.replace(/\.otel\.json$/, '');

              result.errors.push({
                path: relativePath,
                message: `No matching canvas file found for execution file`,
                severity: 'error',
                suggestion: `Create a canvas file named '${canvasBasename}.otel.canvas' in .principal-views/ directory`,
              });
              result.valid = false;
            }

            results.push({ file: relativePath, result });
          } catch (error) {
            // Parse error
            results.push({
              file: relativePath,
              result: {
                valid: false,
                errors: [
                  {
                    path: relativePath,
                    message: (error as Error).message,
                    severity: 'error',
                  },
                ],
                warnings: [],
              },
            });
          }
        }

        // Output results
        if (options.json) {
          console.log(JSON.stringify(formatJsonOutput(results), null, 2));
        } else {
          const { output, hasErrors } = formatConsoleOutput(results, options);
          console.log(output);

          if (hasErrors) {
            process.exit(1);
          }
        }
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: (error as Error).message }));
        } else {
          console.error(chalk.red('Error:'), (error as Error).message);
        }
        process.exit(1);
      }
    });

  return command;
}
