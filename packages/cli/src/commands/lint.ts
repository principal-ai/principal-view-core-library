/**
 * Lint command - Lint graph configuration files using the rules engine
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname, basename } from 'node:path';
import chalk from 'chalk';
import { globby } from 'globby';
import yaml from 'js-yaml';
import {
  createDefaultRulesEngine,
  validatePrivuConfig,
  mergeConfigs,
  getDefaultConfig,
  type GraphConfiguration,
  type GraphLintResult,
  type GraphRuleViolation,
  type PrivuConfig,
  type ComponentLibrary,
} from '@principal-ai/principal-view-core';

// ============================================================================
// Config File Loading
// ============================================================================

/**
 * Config file names in resolution order
 */
const CONFIG_FILE_NAMES = [
  '.principal-viewsrc.json',
  '.principal-viewsrc.yaml',
  '.principal-viewsrc.yml',
  'privu.config.json',
  'privu.config.yaml',
  'privu.config.yml',
];

/**
 * Find and load VGC config file
 */
function findConfig(startDir: string): { config: PrivuConfig; path: string } | null {
  let currentDir = resolve(startDir);

  while (true) {
    // Check for config files
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = resolve(currentDir, fileName);
      if (existsSync(configPath)) {
        const config = loadConfigFile(configPath);
        if (config) {
          return { config, path: configPath };
        }
      }
    }

    // Check package.json for "privu" key
    const packageJsonPath = resolve(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.privu && typeof packageJson.privu === 'object') {
          return { config: packageJson.privu as PrivuConfig, path: packageJsonPath };
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Check for root flag or filesystem root
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached filesystem root
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Load a config file (JSON or YAML)
 */
function loadConfigFile(filePath: string): PrivuConfig | null {
  try {
    const content = readFileSync(filePath, 'utf8');
    const ext = filePath.toLowerCase();

    if (ext.endsWith('.json')) {
      return JSON.parse(content) as PrivuConfig;
    } else {
      return yaml.load(content) as PrivuConfig;
    }
  } catch {
    return null;
  }
}

/**
 * Load a component library file
 */
function loadLibrary(libraryPath: string): ComponentLibrary | null {
  if (!existsSync(libraryPath)) {
    return null;
  }

  try {
    const content = readFileSync(libraryPath, 'utf8');
    const ext = libraryPath.toLowerCase();

    if (ext.endsWith('.json')) {
      return JSON.parse(content) as ComponentLibrary;
    } else {
      return yaml.load(content) as ComponentLibrary;
    }
  } catch {
    return null;
  }
}

/**
 * Load a graph configuration file (YAML or JSON)
 */
function loadGraphConfig(filePath: string): { config: GraphConfiguration; raw: string } | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    const ext = filePath.toLowerCase();

    let config: GraphConfiguration;
    if (ext.endsWith('.json')) {
      config = JSON.parse(raw) as GraphConfiguration;
    } else {
      config = yaml.load(raw) as GraphConfiguration;
    }

    return { config, raw };
  } catch {
    return null;
  }
}

// ============================================================================
// Output Formatting
// ============================================================================

/**
 * Format violations for pretty console output
 */
function formatPrettyOutput(
  results: Map<string, GraphLintResult>,
  quiet: boolean
): { output: string; hasErrors: boolean } {
  const lines: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFixable = 0;

  for (const [filePath, result] of results) {
    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
    totalFixable += result.fixableCount;

    if (result.violations.length === 0) {
      if (!quiet) {
        lines.push(chalk.green(`✓ ${filePath}`));
      }
      continue;
    }

    lines.push('');
    lines.push(chalk.cyan(filePath));
    lines.push('');

    for (const violation of result.violations) {
      const severityColor = violation.severity === 'error' ? chalk.red : chalk.yellow;
      const severityLabel = violation.severity === 'error' ? 'error' : 'warn ';

      // Format: "  error  rule-id  message"
      const ruleId = chalk.dim(violation.ruleId.padEnd(30));
      lines.push(`  ${severityColor(severityLabel)}  ${ruleId}  ${violation.message}`);

      if (violation.suggestion) {
        lines.push(chalk.dim(`         ${''.padEnd(30)}  → ${violation.suggestion}`));
      }
    }
  }

  // Summary
  lines.push('');
  if (totalErrors === 0 && totalWarnings === 0) {
    lines.push(chalk.green(`✓ All files passed linting`));
  } else {
    const parts: string[] = [];
    if (totalErrors > 0) {
      parts.push(chalk.red(`${totalErrors} error${totalErrors === 1 ? '' : 's'}`));
    }
    if (totalWarnings > 0) {
      parts.push(chalk.yellow(`${totalWarnings} warning${totalWarnings === 1 ? '' : 's'}`));
    }
    lines.push(`✖ ${parts.join(', ')}`);

    if (totalFixable > 0) {
      lines.push(chalk.dim(`  ${totalFixable} fixable with --fix (coming soon)`));
    }
  }

  return {
    output: lines.join('\n'),
    hasErrors: totalErrors > 0,
  };
}

/**
 * Format violations for JSON output
 */
function formatJsonOutput(results: Map<string, GraphLintResult>): object {
  const files: Array<{
    file: string;
    errorCount: number;
    warningCount: number;
    fixableCount: number;
    violations: GraphRuleViolation[];
  }> = [];

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalFixable = 0;

  for (const [filePath, result] of results) {
    totalErrors += result.errorCount;
    totalWarnings += result.warningCount;
    totalFixable += result.fixableCount;

    files.push({
      file: filePath,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
      fixableCount: result.fixableCount,
      violations: result.violations,
    });
  }

  return {
    files,
    summary: {
      totalFiles: files.length,
      totalErrors,
      totalWarnings,
      totalFixable,
    },
  };
}

// ============================================================================
// Command Implementation
// ============================================================================

export function createLintCommand(): Command {
  const command = new Command('lint');

  command
    .description('Lint graph configuration files')
    .argument('[files...]', 'Files or glob patterns to lint (defaults to .principal-views/**/*.yaml)')
    .option('-c, --config <path>', 'Path to config file')
    .option('--library <path>', 'Path to component library file')
    .option('-q, --quiet', 'Only output errors')
    .option('--json', 'Output results as JSON')
    .option('--rule <rules...>', 'Only run specific rules')
    .option('--ignore-rule <rules...>', 'Skip specific rules')
    .action(async (files: string[], options) => {
      try {
        const cwd = process.cwd();

        // Load VGC config
        let privuConfig: PrivuConfig = getDefaultConfig();
        let configPath: string | undefined;

        if (options.config) {
          // Use specified config file
          const loadedConfig = loadConfigFile(resolve(cwd, options.config));
          if (!loadedConfig) {
            console.error(chalk.red(`Error: Could not load config file: ${options.config}`));
            process.exit(1);
          }

          // Validate config
          const validation = validatePrivuConfig(loadedConfig);
          if (!validation.valid) {
            console.error(chalk.red('Configuration Error:'), options.config);
            for (const error of validation.errors) {
              console.error(chalk.red(`  ${error.path}: ${error.message}`));
              if (error.suggestion) {
                console.error(chalk.dim(`    → ${error.suggestion}`));
              }
            }
            process.exit(1);
          }

          privuConfig = mergeConfigs(privuConfig, loadedConfig);
          configPath = resolve(cwd, options.config);
        } else {
          // Search for config file
          const found = findConfig(cwd);
          if (found) {
            const validation = validatePrivuConfig(found.config);
            if (!validation.valid) {
              console.error(chalk.red('Configuration Error:'), found.path);
              for (const error of validation.errors) {
                console.error(chalk.red(`  ${error.path}: ${error.message}`));
                if (error.suggestion) {
                  console.error(chalk.dim(`    → ${error.suggestion}`));
                }
              }
              process.exit(1);
            }
            privuConfig = mergeConfigs(privuConfig, found.config);
            configPath = found.path;
          }
        }

        // Determine files to lint
        let patterns: string[];
        if (files.length > 0) {
          patterns = files;
        } else if (privuConfig.include && privuConfig.include.length > 0) {
          patterns = privuConfig.include;
        } else {
          patterns = ['.principal-views/**/*.yaml', '.principal-views/**/*.yml', '.principal-views/**/*.json'];
        }

        // Find matching files
        const matchedFiles = await globby(patterns, {
          ignore: privuConfig.exclude || ['**/node_modules/**'],
          expandDirectories: false,
        });

        // Filter out library files and config files
        const configFiles = matchedFiles.filter((f) => {
          const name = basename(f).toLowerCase();
          return !name.startsWith('library.') && !name.startsWith('.principal-viewsrc') && !name.startsWith('privu.config');
        });

        if (configFiles.length === 0) {
          if (options.json) {
            console.log(JSON.stringify({ files: [], summary: { totalFiles: 0, totalErrors: 0, totalWarnings: 0, totalFixable: 0 } }));
          } else {
            console.log(chalk.yellow('No configuration files found matching the specified patterns.'));
            console.log(chalk.dim(`Patterns searched: ${patterns.join(', ')}`));
          }
          return;
        }

        // Load library if specified
        let library: ComponentLibrary | undefined;
        const libraryPath = options.library || privuConfig.library;
        if (libraryPath) {
          const resolvedLibraryPath = resolve(cwd, libraryPath);
          library = loadLibrary(resolvedLibraryPath) ?? undefined;
          if (!library && !options.quiet) {
            console.log(chalk.yellow(`Warning: Could not load library from ${libraryPath}`));
          }
        }

        // Create rules engine
        const engine = createDefaultRulesEngine();

        // Lint each file
        const results = new Map<string, GraphLintResult>();

        for (const filePath of configFiles) {
          const absolutePath = resolve(cwd, filePath);
          const relativePath = relative(cwd, absolutePath);

          const loaded = loadGraphConfig(absolutePath);
          if (!loaded) {
            // File couldn't be loaded - report as error
            results.set(relativePath, {
              violations: [{
                ruleId: 'parse-error',
                severity: 'error',
                file: relativePath,
                message: `Could not parse file: ${filePath}`,
                impact: 'File cannot be validated',
                fixable: false,
              }],
              errorCount: 1,
              warningCount: 0,
              fixableCount: 0,
              byCategory: { schema: 1, reference: 0, structure: 0, pattern: 0, library: 0 },
              byRule: { 'parse-error': 1 },
            });
            continue;
          }

          // Run linting
          const result = await engine.lintWithConfig(loaded.config, privuConfig, {
            library,
            configPath: relativePath,
            rawContent: loaded.raw,
            enabledRules: options.rule,
            disabledRules: options.ignoreRule,
          });

          results.set(relativePath, result);
        }

        // Output results
        if (options.json) {
          console.log(JSON.stringify(formatJsonOutput(results), null, 2));
        } else {
          const { output, hasErrors } = formatPrettyOutput(results, options.quiet);
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
