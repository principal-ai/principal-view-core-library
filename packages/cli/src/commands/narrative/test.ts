import { Command } from 'commander';
import chalk from 'chalk';
import {
  selectScenario,
  matchesCondition,
  computeAggregates,
  hasEventMatching,
} from '@principal-ai/principal-view-core';
import {
  loadNarrative,
  loadExecution,
  executionToEvents,
  resolvePath,
  formatValue,
} from './utils.js';

interface TestOptions {
  showAll?: boolean;
  showAggregates?: boolean;
  json?: boolean;
}

export function createTestCommand(): Command {
  const command = new Command('test');

  command
    .description('Test scenario matching and show why scenarios match or don\'t match')
    .argument('<narrative>', 'Path to .narrative.json file')
    .argument('<execution>', 'Path to .otel.json execution file')
    .option('--show-all', 'Show all scenarios (not just matches)')
    .option('--show-aggregates', 'Display computed aggregates')
    .option('--json', 'Output as JSON')
    .action(async (narrativePath: string, executionPath: string, options: TestOptions) => {
      try {
        const narrative = await loadNarrative(resolvePath(narrativePath));
        const executionData = await loadExecution(resolvePath(executionPath));
        const events = executionToEvents(executionData);

        // Compute aggregates
        const aggregates = computeAggregates(events);

        // Test each scenario
        const scenarioResults = narrative.scenarios.map((scenario) => {
          const condition = scenario.condition;
          const matched = matchesCondition(condition, events, aggregates);

          let reason: string | undefined;
          const requiresResults: Array<{ pattern: string; matched: boolean; count: number }> =
            [];
          const excludesResults: Array<{ pattern: string; matched: boolean; count: number }> =
            [];

          // Check requires
          if (condition.requires) {
            for (const pattern of condition.requires) {
              const hasMatch = hasEventMatching(events, pattern);
              const count = events.filter((e) =>
                hasEventMatching([e], pattern)
              ).length;
              requiresResults.push({ pattern, matched: hasMatch, count });

              if (!hasMatch && !reason) {
                reason = `Missing required event '${pattern}'`;
              }
            }
          }

          // Check excludes
          if (condition.excludes) {
            for (const pattern of condition.excludes) {
              const hasMatch = hasEventMatching(events, pattern);
              const count = events.filter((e) =>
                hasEventMatching([e], pattern)
              ).length;
              excludesResults.push({ pattern, matched: hasMatch, count });

              if (hasMatch && !reason) {
                reason = `Found excluded event '${pattern}'`;
              }
            }
          }

          // Default scenario
          if (condition.default) {
            reason = 'Default scenario (always matches)';
          }

          return {
            scenario,
            matched,
            reason,
            requiresResults,
            excludesResults,
          };
        });

        // Select the winning scenario
        const matchResult = selectScenario(narrative, events, aggregates);
        const selectedScenario = matchResult.scenario;

        if (options.json) {
          const output = {
            narrative: narrativePath,
            execution: executionPath,
            scenarios: scenarioResults.map((r) => ({
              id: r.scenario.id,
              priority: r.scenario.priority,
              matched: r.matched,
              reason: r.reason,
              requires: r.requiresResults,
              excludes: r.excludesResults,
            })),
            selectedScenario: selectedScenario?.id,
            aggregates: options.showAggregates ? aggregates : undefined,
          };

          console.log(JSON.stringify(output, null, 2));
        } else {
          // Text output
          console.log(chalk.bold(`\nTesting: ${narrativePath}`));
          console.log(chalk.gray(`Execution: ${executionPath}\n`));

          console.log(chalk.bold('Scenario Matching Results:'));
          console.log('━'.repeat(60));

          // Sort by priority (lower = higher priority)
          const sorted = [...scenarioResults].sort(
            (a, b) => a.scenario.priority - b.scenario.priority
          );

          for (const result of sorted) {
            if (!options.showAll && !result.matched) {
              continue;
            }

            const icon = result.matched ? chalk.green('✓') : chalk.red('✗');
            const status = result.matched
              ? chalk.green('MATCHED')
              : chalk.gray('NOT MATCHED');

            console.log(
              `\n${icon} ${chalk.bold(result.scenario.id)} (priority: ${result.scenario.priority}) - ${status}`
            );

            // Show requires
            if (result.requiresResults.length > 0) {
              console.log(chalk.gray('  Requires:'));
              for (const req of result.requiresResults) {
                const reqIcon = req.matched ? chalk.green('✓') : chalk.red('✗');
                const countMsg = req.matched ? `Found ${req.count} event(s)` : 'No matching events';
                console.log(`    ${reqIcon} ${req.pattern} - ${countMsg}`);
              }
            }

            // Show excludes
            if (result.excludesResults.length > 0) {
              console.log(chalk.gray('  Excludes:'));
              for (const exc of result.excludesResults) {
                const excIcon = exc.matched ? chalk.red('✗') : chalk.green('✓');
                const countMsg = exc.matched ? `Found ${exc.count} event(s)` : 'No matching events';
                console.log(`    ${excIcon} ${exc.pattern} - ${countMsg}`);
              }
            }

            if (result.reason && !result.matched) {
              console.log(chalk.gray(`  Reason: ${result.reason}`));
            }

            if (result.scenario.condition.default) {
              console.log(chalk.gray('  Default scenario (always matches)'));
            }
          }

          console.log('\n' + '━'.repeat(60));

          if (selectedScenario) {
            console.log(
              chalk.bold('\nSelected Scenario:'),
              chalk.cyan(`${selectedScenario.id} (priority: ${selectedScenario.priority})`)
            );
          } else {
            console.log(chalk.yellow('\nNo scenario selected'));
          }

          if (options.showAggregates) {
            console.log(chalk.bold('\nComputed Aggregates:'));
            for (const [key, value] of Object.entries(aggregates)) {
              console.log(chalk.gray('  •'), `${key}: ${formatValue(value)}`);
            }
          }

          console.log();
        }

        // Exit with error if no scenario matched
        if (!selectedScenario) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
