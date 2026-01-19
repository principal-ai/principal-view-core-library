import { Command } from 'commander';
import chalk from 'chalk';
import { access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { globby } from 'globby';
import { loadNarrative } from './utils.js';

interface ListOptions {
  json?: boolean;
  showCanvas?: boolean;
}

export function createListCommand(): Command {
  const command = new Command('list');

  command
    .description('List all narrative files in project')
    .argument('[dir]', 'Directory to search (default: .principal-views/)')
    .option('--json', 'Output as JSON')
    .option('--show-canvas', 'Show linked canvas files')
    .action(async (dir: string | undefined, options: ListOptions) => {
      try {
        const searchDir = dir || '.principal-views';
        const searchPath = resolve(process.cwd(), searchDir);

        // Find all .narrative.json files
        const files = await globby('**/*.narrative.json', {
          cwd: searchPath,
          ignore: ['node_modules/**', '.git/**', '__executions__/**'],
        });

        // Load each narrative and check canvas existence
        const narratives = await Promise.all(
          files.map(async (file) => {
            const fullPath = join(searchPath, file);
            const narrative = await loadNarrative(fullPath);

            let canvasExists: boolean | undefined;
            if (options.showCanvas && narrative.canvas) {
              const narrativeDir = dirname(fullPath);
              const canvasPath = resolve(narrativeDir, narrative.canvas);
              try {
                await access(canvasPath);
                canvasExists = true;
              } catch {
                canvasExists = false;
              }
            }

            const defaultCount = narrative.scenarios.filter((s) => s.condition.default).length;

            return {
              file: join(searchDir, file),
              canvas: narrative.canvas,
              canvasExists,
              scenarioCount: narrative.scenarios.length,
              defaultCount,
              mode: narrative.mode,
              name: narrative.name,
            };
          })
        );

        if (options.json) {
          const output = {
            searchDir,
            count: narratives.length,
            narratives: narratives.map((n) => ({
              file: n.file,
              name: n.name,
              canvas: n.canvas,
              canvasExists: n.canvasExists,
              scenarios: n.scenarioCount,
              defaultScenarios: n.defaultCount,
              mode: n.mode,
            })),
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log(chalk.bold('\nNarrative Templates:'));
          console.log('━'.repeat(60));

          if (narratives.length === 0) {
            console.log(chalk.yellow(`\nNo narrative templates found in ${searchDir}`));
            console.log();
            return;
          }

          for (const narrative of narratives) {
            console.log(chalk.bold(`\n${narrative.file}`));
            if (narrative.name) {
              console.log(chalk.gray(`  Name: ${narrative.name}`));
            }
            if (options.showCanvas && narrative.canvas) {
              const status = narrative.canvasExists
                ? chalk.green('✓')
                : chalk.red('✗');
              console.log(chalk.gray(`  Canvas: ${narrative.canvas} ${status}`));
            } else if (narrative.canvas) {
              console.log(chalk.gray(`  Canvas: ${narrative.canvas}`));
            }
            console.log(
              chalk.gray(
                `  Scenarios: ${narrative.scenarioCount} (${narrative.defaultCount} default)`
              )
            );
            console.log(chalk.gray(`  Mode: ${narrative.mode}`));
          }

          console.log(
            chalk.bold(`\nFound ${narratives.length} narrative template(s)`)
          );
          console.log();
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
