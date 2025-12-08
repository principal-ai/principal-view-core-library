/**
 * Create command - Create a new canvas file in the .vgc folder
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { ExtendedCanvas } from '@principal-ai/visual-validation-core';

const TEMPLATE_CANVAS: ExtendedCanvas = {
  nodes: [],
  edges: [],
};

export function createCreateCommand(): Command {
  const command = new Command('create');

  command
    .description('Create a new canvas file in the .vgc folder')
    .requiredOption('-n, --name <name>', 'Name for the canvas file (e.g., "cache-sync-architecture")')
    .option('-f, --force', 'Overwrite existing file')
    .action(async (options) => {
      try {
        const vgcDir = join(process.cwd(), '.vgc');
        const canvasFile = join(vgcDir, `${options.name}.canvas`);

        // Check if .vgc directory exists
        if (!existsSync(vgcDir)) {
          mkdirSync(vgcDir, { recursive: true });
          console.log(chalk.green(`Created directory: .vgc/`));
        }

        // Check if canvas file already exists
        if (existsSync(canvasFile) && !options.force) {
          console.error(chalk.red(`Error: Canvas file already exists: .vgc/${options.name}.canvas`));
          console.log(chalk.yellow(`Use ${chalk.cyan('--force')} to overwrite`));
          process.exit(1);
        }

        // Create the canvas file
        writeFileSync(canvasFile, JSON.stringify(TEMPLATE_CANVAS, null, 2));
        console.log(chalk.green(`✓ Created canvas file: .vgc/${options.name}.canvas`));

        // Show next steps
        console.log('');
        console.log(chalk.bold('Next steps:'));
        console.log(`  1. Open ${chalk.cyan(`.vgc/${options.name}.canvas`)} in your editor`);
        console.log(`  2. Add nodes and edges to define your architecture`);
        console.log(`  3. Run ${chalk.cyan('vv validate')} to check your configuration`);
        console.log(`  4. Run ${chalk.cyan('vv doctor')} to verify source mappings`);
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
