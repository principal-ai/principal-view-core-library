/**
 * Coverage command - Measure telemetry coverage for canvas nodes
 *
 * This command analyzes .otel.canvas files and checks which nodes have
 * OpenTelemetry instrumentation in their linked source files.
 */

import { Command } from 'commander';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { analyzeCoverage, type CoverageMetrics } from '@principal-ai/principal-view-core';

interface CoverageOptions {
  dir?: string;
  json?: boolean;
  threshold?: string;
  verbose?: boolean;
}

/**
 * Print coverage report in human-readable format
 */
function printCoverageReport(metrics: CoverageMetrics, rootDir: string, options: CoverageOptions): void {
  const { verbose } = options;

  console.log(chalk.bold('\n' + '─'.repeat(70)));
  console.log(chalk.bold('📈 TELEMETRY COVERAGE REPORT'));
  console.log(chalk.bold('─'.repeat(70)));

  // Canvas files
  console.log(chalk.bold(`\n📋 Canvas Files Analyzed: ${metrics.canvasFiles.length}`));
  if (verbose) {
    metrics.canvasFiles.forEach(f => console.log(chalk.dim(`   - ${f}`)));
  }

  // Node summary
  console.log(chalk.bold('\n🎯 Node Summary:'));
  console.log(`   Total nodes: ${metrics.totalNodes}`);
  console.log(`   Nodes with anchors: ${chalk.cyan(metrics.nodesWithFiles.toString())}`);
  console.log(`   Nodes without anchors: ${chalk.dim(metrics.totalNodes - metrics.nodesWithFiles)}`);
  console.log(`   Nodes with instrumentation: ${chalk.green(metrics.nodesWithInstrumentation.toString())}`);

  const coverageColor = metrics.coveragePercentage >= 80
    ? chalk.green
    : metrics.coveragePercentage >= 50
    ? chalk.yellow
    : chalk.red;
  console.log(`   Coverage: ${coverageColor(metrics.coveragePercentage.toFixed(1) + '%')}`);

  // Nodes WITHOUT anchors
  const noAnchors = metrics.nodeCoverage.filter(n => n.filePaths.length === 0);
  if (noAnchors.length > 0 && verbose) {
    console.log(chalk.yellow(`\n⚠️  Nodes Without Anchors (${noAnchors.length}):`));
    const display = verbose ? noAnchors : noAnchors.slice(0, 10);
    display.forEach(node => {
      console.log(chalk.dim(`   - ${node.nodeId}`));
    });
    if (!verbose && noAnchors.length > 10) {
      console.log(chalk.dim(`   ... and ${noAnchors.length - 10} more (use --verbose to see all)`));
    }
  }

  // Nodes WITHOUT instrumentation
  const uninstrumented = metrics.nodeCoverage.filter(
    n => n.filePaths.length > 0 && !n.hasInstrumentation
  );

  if (uninstrumented.length > 0) {
    console.log(chalk.red(`\n❌ Nodes Missing Instrumentation (${uninstrumented.length}):`));
    const display = verbose ? uninstrumented : uninstrumented.slice(0, 5);
    display.forEach(node => {
      console.log(chalk.yellow(`\n   Node: ${node.nodeId}`));
      console.log(chalk.dim(`   Files: ${node.filePaths.join(', ')}`));
    });
    if (!verbose && uninstrumented.length > 5) {
      console.log(chalk.dim(`\n   ... and ${uninstrumented.length - 5} more (use --verbose to see all)`));
    }
  }

  // Nodes WITH instrumentation
  const instrumented = metrics.nodeCoverage.filter(n => n.hasInstrumentation);
  if (instrumented.length > 0) {
    console.log(chalk.green(`\n✅ Nodes With Instrumentation (${instrumented.length}):`));
    const display = verbose ? instrumented : instrumented.slice(0, 5);
    display.forEach(node => {
      console.log(chalk.dim(`   - ${node.nodeId}: ${node.instrumentedFiles.join(', ')}`));
    });
    if (!verbose && instrumented.length > 5) {
      console.log(chalk.dim(`   ... and ${instrumented.length - 5} more (use --verbose to see all)`));
    }
  }

  // Nodes with missing files
  const withMissingFiles = metrics.nodeCoverage.filter(n => n.missingFiles.length > 0);
  if (withMissingFiles.length > 0) {
    console.log(chalk.yellow(`\n⚠️  Nodes Referencing Missing Files (${withMissingFiles.length}):`));
    const display = verbose ? withMissingFiles : withMissingFiles.slice(0, 5);
    display.forEach(node => {
      console.log(chalk.dim(`   - ${node.nodeId}: ${node.missingFiles.join(', ')}`));
    });
    if (!verbose && withMissingFiles.length > 5) {
      console.log(chalk.dim(`   ... and ${withMissingFiles.length - 5} more (use --verbose to see all)`));
    }
  }

  // Recommendations
  console.log(chalk.bold('\n💡 Recommendations:'));
  if (noAnchors.length > 0) {
    console.log(chalk.red('   🔴 Add anchors to canvas nodes before measuring coverage'));
  } else if (metrics.coveragePercentage < 30) {
    console.log(chalk.red('   🔴 Low coverage - add OTEL instrumentation to files referenced in canvas'));
  } else if (metrics.coveragePercentage < 60) {
    console.log(chalk.yellow('   🟡 Moderate coverage - continue instrumenting remaining nodes'));
  } else {
    console.log(chalk.green('   🟢 Good coverage - maintain instrumentation quality'));
  }

  // Next steps
  console.log(chalk.bold('\n📝 Next Steps:'));
  if (noAnchors.length > 0) {
    console.log(chalk.dim(`   1. Add anchors to ${noAnchors.length} node(s) without file references`));
    console.log(chalk.dim(`   2. Example: { "id": "node-id", "anchors": [{ "path": "packages/core/src/File.ts" }] }`));
    console.log(chalk.dim(`   3. Re-run: privu coverage`));
  } else if (uninstrumented.length > 0) {
    console.log(chalk.dim(`   1. Review the ${uninstrumented.length} uninstrumented node(s) above`));
    console.log(chalk.dim(`   2. Add OpenTelemetry spans to their source files`));
    console.log(chalk.dim(`   3. Follow patterns from packages/core/src/rules/engine.ts`));
    console.log(chalk.dim(`   4. Re-run: privu coverage`));
  } else {
    console.log(chalk.green(`   ✅ All canvas nodes have instrumentation!`));
  }

  console.log(chalk.bold('\n' + '─'.repeat(70) + '\n'));
}

export function createCoverageCommand(): Command {
  const command = new Command('coverage');

  command
    .description('Measure telemetry coverage for canvas nodes')
    .option('-d, --dir <path>', 'Project directory (defaults to current directory)')
    .option('--json', 'Output results as JSON')
    .option('-t, --threshold <percentage>', 'Minimum coverage percentage (exit with error if below)')
    .option('-v, --verbose', 'Show all nodes in output')
    .action(async (options: CoverageOptions) => {
      try {
        const rootDir = resolve(options.dir || process.cwd());

        // Analyze coverage
        const metrics = await analyzeCoverage(rootDir);

        // Output results
        if (options.json) {
          console.log(JSON.stringify(metrics, null, 2));
        } else {
          printCoverageReport(metrics, rootDir, options);
        }

        // Check threshold
        if (options.threshold) {
          const threshold = parseFloat(options.threshold);
          if (isNaN(threshold) || threshold < 0 || threshold > 100) {
            console.error(chalk.red('Error: Threshold must be a number between 0 and 100'));
            process.exit(1);
          }

          if (metrics.coveragePercentage < threshold) {
            if (!options.json) {
              console.error(
                chalk.red(
                  `\n✗ Coverage ${metrics.coveragePercentage.toFixed(1)}% is below threshold ${threshold}%`
                )
              );
            }
            process.exit(1);
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
