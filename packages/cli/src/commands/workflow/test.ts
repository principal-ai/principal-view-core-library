import { Command } from 'commander';
import chalk from 'chalk';
import {
  selectScenario,
  computeAggregates,
  hasEventMatching,
  getRequiredEvents,
} from '@principal-ai/principal-view-core';
import {
  loadWorkflow,
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
    .argument('<workflow>', 'Path to .workflow.json file')
    .argument('<execution>', 'Path to .otel.json execution file')
    .option('--show-all', 'Show all scenarios (not just matches)')
    .option('--show-aggregates', 'Display computed aggregates')
    .option('--json', 'Output as JSON')
    .action(async (workflowPath: string, executionPath: string, options: TestOptions) => {
      try {
        const workflow = await loadWorkflow(resolvePath(workflowPath));
        const executionData = await loadExecution(resolvePath(executionPath));
        const events = executionToEvents(executionData);

        // Compute aggregates
        const aggregates = computeAggregates(events);

        // Test each scenario
        const scenarioResults = workflow.scenarios.map((scenario) => {
          // Get required events from template.events
          const requiredEvents = getRequiredEvents(scenario);
          const eventResults: Array<{ eventName: string; matched: boolean; count: number }> = [];
          let matched = true;
          let reason: string | undefined;

          // Check each required event
          for (const eventName of requiredEvents) {
            const hasMatch = hasEventMatching(events, eventName);
            const count = events.filter((e) => hasEventMatching([e], eventName)).length;
            eventResults.push({ eventName, matched: hasMatch, count });

            if (!hasMatch) {
              matched = false;
              if (!reason) {
                reason = `Missing required event '${eventName}'`;
              }
            }
          }

          // If all events matched
          if (matched && requiredEvents.length > 0) {
            reason = `All ${requiredEvents.length} required event(s) present`;
          } else if (requiredEvents.length === 0) {
            reason = 'No events required (empty template.events)';
            matched = false;
          }

          return {
            scenario,
            matched,
            reason,
            eventResults,
          };
        });

        // Select the winning scenario
        const matchResult = selectScenario(workflow, events);
        const selectedScenario = matchResult.scenario;

        if (options.json) {
          const output = {
            workflow: workflowPath,
            execution: executionPath,
            scenarios: scenarioResults.map((r) => ({
              id: r.scenario.id,
              priority: r.scenario.priority,
              matched: r.matched,
              reason: r.reason,
              requiredEvents: r.eventResults,
            })),
            selectedScenario: selectedScenario?.id,
            aggregates: options.showAggregates ? aggregates : undefined,
          };

          console.log(JSON.stringify(output, null, 2));
        } else {
          // Text output
          console.log(chalk.bold(`\nTesting: ${workflowPath}`));
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

            // Show required events
            if (result.eventResults.length > 0) {
              console.log(chalk.gray('  Required Events:'));
              for (const evt of result.eventResults) {
                const evtIcon = evt.matched ? chalk.green('✓') : chalk.red('✗');
                const countMsg = evt.matched ? `Found ${evt.count} event(s)` : 'No matching events';
                console.log(`    ${evtIcon} ${evt.eventName} - ${countMsg}`);
              }
            }

            if (result.reason) {
              console.log(chalk.gray(`  ${result.reason}`));
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
