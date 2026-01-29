/**
 * Doctor command - Check configuration staleness and source pattern validity
 *
 * This command performs two types of checks:
 * 1. Pattern validation: Ensures source patterns in .principal-views/*.yaml configs match actual files
 * 2. Freshness check: Compares config modification times vs source file changes
 */

import { Command } from 'commander';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import chalk from 'chalk';
import { globby } from 'globby';
import yaml from 'js-yaml';
import { CanvasDiscovery, buildFileTreeFromDirectory } from '@principal-ai/principal-view-core/node';

interface StalenessIssue {
  type: 'error' | 'warning' | 'info';
  configFile: string;
  nodeType?: string;
  message: string;
  details?: string;
}

interface ConfigMetadata {
  name: string;
  version?: string;
}

interface NodeTypeDefinition {
  shape: string;
  sources?: string[];
  [key: string]: unknown;
}

interface VGCConfig {
  metadata?: ConfigMetadata;
  nodeTypes?: Record<string, NodeTypeDefinition>;
  [key: string]: unknown;
}

interface DoctorResult {
  configFile: string;
  configName: string;
  issues: StalenessIssue[];
  stats: {
    nodeTypesChecked: number;
    patternsChecked: number;
    filesMatched: number;
    staleConfigs: number;
  };
}

/**
 * Format a time difference in human-readable form
 */
function formatTimeDiff(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

/**
 * Check a single .principal-views config file for staleness issues
 */
async function checkConfig(configPath: string, projectRoot: string): Promise<DoctorResult> {
  const absolutePath = resolve(configPath);
  const relativePath = relative(projectRoot, absolutePath);
  const issues: StalenessIssue[] = [];
  const stats = {
    nodeTypesChecked: 0,
    patternsChecked: 0,
    filesMatched: 0,
    staleConfigs: 0,
  };

  let configName = 'Unknown';

  try {
    const content = readFileSync(absolutePath, 'utf8');
    const config = yaml.load(content) as VGCConfig;
    const configStats = statSync(absolutePath);
    const configMtime = configStats.mtime.getTime();

    configName = config.metadata?.name || relativePath;

    // Check if config has nodeTypes with sources
    if (!config.nodeTypes || Object.keys(config.nodeTypes).length === 0) {
      issues.push({
        type: 'info',
        configFile: relativePath,
        message: 'No node types defined in configuration',
      });
      return { configFile: relativePath, configName, issues, stats };
    }

    // Check each node type's source patterns
    for (const [nodeTypeName, nodeType] of Object.entries(config.nodeTypes)) {
      stats.nodeTypesChecked++;

      if (!nodeType.sources || nodeType.sources.length === 0) {
        issues.push({
          type: 'info',
          configFile: relativePath,
          nodeType: nodeTypeName,
          message: `Node type "${nodeTypeName}" has no source patterns defined`,
        });
        continue;
      }

      for (const pattern of nodeType.sources) {
        stats.patternsChecked++;

        // Find files matching this pattern
        const matchedFiles = await globby(pattern, {
          cwd: projectRoot,
          gitignore: true,
          ignore: ['node_modules/**', 'dist/**', '.git/**'],
        });

        if (matchedFiles.length === 0) {
          // Pattern doesn't match any files - this is a warning
          issues.push({
            type: 'warning',
            configFile: relativePath,
            nodeType: nodeTypeName,
            message: `Source pattern "${pattern}" doesn't match any files`,
            details: 'This pattern may be outdated or the files may have been moved/deleted',
          });
        } else {
          stats.filesMatched += matchedFiles.length;

          // Check if any matched files are newer than the config
          let newestFile: string | null = null;
          let newestMtime = 0;

          for (const file of matchedFiles) {
            const filePath = resolve(projectRoot, file);
            try {
              const fileStats = statSync(filePath);
              const fileMtime = fileStats.mtime.getTime();

              if (fileMtime > newestMtime) {
                newestMtime = fileMtime;
                newestFile = file;
              }
            } catch {
              // File may have been deleted between glob and stat
            }
          }

          // Check staleness (with 5-second buffer for build tools)
          const STALE_THRESHOLD_MS = 5000;
          if (newestFile && newestMtime > configMtime + STALE_THRESHOLD_MS) {
            const timeDiff = newestMtime - configMtime;
            stats.staleConfigs++;
            issues.push({
              type: 'warning',
              configFile: relativePath,
              nodeType: nodeTypeName,
              message: `Config may be stale: "${newestFile}" was modified ${formatTimeDiff(
                timeDiff
              )} after the config`,
              details: `Pattern: ${pattern} (matched ${matchedFiles.length} file${
                matchedFiles.length > 1 ? 's' : ''
              })`,
            });
          }
        }
      }
    }
  } catch (error) {
    issues.push({
      type: 'error',
      configFile: relativePath,
      message: `Failed to parse config: ${(error as Error).message}`,
    });
  }

  return { configFile: relativePath, configName, issues, stats };
}

export function createDoctorCommand(): Command {
  const command = new Command('doctor');

  command
    .description('Check configuration staleness and source pattern validity')
    .option('-q, --quiet', 'Only show errors and warnings')
    .option('--errors-only', 'Only show errors (for pre-commit hooks)')
    .option('--json', 'Output results as JSON')
    .option('-d, --dir <path>', 'Project directory (defaults to current directory)')
    .action(async (options) => {
      try {
        const projectRoot = resolve(options.dir || process.cwd());
        const vgcDir = resolve(projectRoot, '.principal-views');

        if (!existsSync(vgcDir)) {
          if (options.json) {
            console.log(
              JSON.stringify({ error: 'No .principal-views directory found', results: [] })
            );
          } else {
            console.log(chalk.yellow('No .principal-views directory found.'));
            console.log(chalk.dim('Run "npx @principal-ai/principal-view-cli init" to create a configuration.'));
          }
          return;
        }

        // Find all .yaml config files
        const configFiles = await globby(['*.yaml', '*.yml'], {
          cwd: vgcDir,
          absolute: true,
          ignore: ['README.md'],
        });

        // Check each config (if any)
        const results: DoctorResult[] = [];
        if (configFiles.length > 0) {
          for (const configFile of configFiles) {
            const result = await checkConfig(configFile, projectRoot);
            results.push(result);
          }
        }

        // Aggregate stats
        const totalStats = results.reduce(
          (acc, r) => ({
            nodeTypesChecked: acc.nodeTypesChecked + r.stats.nodeTypesChecked,
            patternsChecked: acc.patternsChecked + r.stats.patternsChecked,
            filesMatched: acc.filesMatched + r.stats.filesMatched,
            staleConfigs: acc.staleConfigs + r.stats.staleConfigs,
          }),
          { nodeTypesChecked: 0, patternsChecked: 0, filesMatched: 0, staleConfigs: 0 }
        );

        // Filter issues based on options
        const filterIssues = (issues: StalenessIssue[]) => {
          if (options.errorsOnly) {
            return issues.filter((i) => i.type === 'error');
          }
          if (options.quiet) {
            return issues.filter((i) => i.type === 'error' || i.type === 'warning');
          }
          return issues;
        };

        // Count issues
        const allIssues = results.flatMap((r) => filterIssues(r.issues));
        const errorCount = allIssues.filter((i) => i.type === 'error').length;
        const warningCount = allIssues.filter((i) => i.type === 'warning').length;

        // Output results
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                results: results.map((r) => ({
                  ...r,
                  issues: filterIssues(r.issues),
                })),
                summary: {
                  configs: results.length,
                  errors: errorCount,
                  warnings: warningCount,
                  ...totalStats,
                },
              },
              null,
              2
            )
          );
        } else {
          if (!options.quiet && !options.errorsOnly && results.length > 0) {
            console.log(chalk.bold(`\nChecking ${results.length} configuration file(s)...\n`));
          }

          if (results.length === 0 && !options.quiet && !options.errorsOnly) {
            console.log(chalk.yellow('No YAML configuration files found in .principal-views/'));
            console.log(chalk.dim('Checking file structure...\n'));
          }

          for (const result of results) {
            const issues = filterIssues(result.issues);

            if (issues.length === 0 && !options.quiet && !options.errorsOnly) {
              console.log(
                chalk.green(`✓ ${result.configFile}`) + chalk.dim(` (${result.configName})`)
              );
              continue;
            }

            if (issues.length > 0) {
              const hasErrors = issues.some((i) => i.type === 'error');
              const icon = hasErrors ? chalk.red('✗') : chalk.yellow('⚠');
              console.log(`${icon} ${result.configFile}` + chalk.dim(` (${result.configName})`));

              for (const issue of issues) {
                const prefix = issue.nodeType ? `[${issue.nodeType}] ` : '';
                if (issue.type === 'error') {
                  console.log(chalk.red(`  ✗ ${prefix}${issue.message}`));
                } else if (issue.type === 'warning') {
                  console.log(chalk.yellow(`  ⚠ ${prefix}${issue.message}`));
                } else {
                  console.log(chalk.dim(`  ℹ ${prefix}${issue.message}`));
                }
                if (issue.details) {
                  console.log(chalk.dim(`    → ${issue.details}`));
                }
              }
              console.log('');
            }
          }

          // Check for deprecated file structure
          let deprecationWarningCount = 0;
          if (!options.errorsOnly) {
            try {
              const fileTree = await buildFileTreeFromDirectory(projectRoot);
              const discovery = new CanvasDiscovery();
              const discoveryResult = await discovery.discover(fileTree);

              if (discoveryResult.warnings.length > 0) {
                console.log(chalk.yellow('\n⚠ File Structure Warnings:\n'));
                for (const warning of discoveryResult.warnings) {
                  console.log(chalk.yellow(`  ⚠ ${warning.path}`));
                  console.log(chalk.dim(`    ${warning.message}`));
                }
                deprecationWarningCount = discoveryResult.warnings.length;
              }
            } catch (error) {
              // Silently ignore discovery errors in doctor command
            }
          }

          // Summary
          if (!options.errorsOnly && results.length > 0) {
            console.log(chalk.dim('\n' + '─'.repeat(50)));
            console.log(
              chalk.dim(
                `Checked ${totalStats.nodeTypesChecked} node types, ` +
                  `${totalStats.patternsChecked} patterns, ` +
                  `matched ${totalStats.filesMatched} files`
              )
            );
          }

          const totalWarnings = warningCount + deprecationWarningCount;

          if (errorCount > 0) {
            console.log(chalk.red(`\n✗ ${errorCount} error(s) found`));
            process.exit(1);
          } else if (totalWarnings > 0 && options.errorsOnly) {
            // In errors-only mode, don't fail on warnings
            process.exit(0);
          } else if (totalWarnings > 0) {
            console.log(chalk.yellow(`\n⚠ ${totalWarnings} warning(s) found`));
            if (deprecationWarningCount > 0) {
              console.log(chalk.dim(`  (including ${deprecationWarningCount} file structure deprecation(s))`));
              console.log(chalk.dim(`  Run ${chalk.cyan('privu migration')} to see the migration guide`));
            }
          } else if (!options.quiet && !options.errorsOnly) {
            console.log(chalk.green(`\n✓ All configurations are up to date`));
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
