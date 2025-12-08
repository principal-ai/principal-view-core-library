/**
 * Init command - Initialize a .vgc folder with a template canvas file
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { ExtendedCanvas, ComponentLibrary } from '@principal-ai/visual-validation-core';

const TEMPLATE_LIBRARY: ComponentLibrary = {
  version: '1.0.0',
  name: 'Component Library',
  nodeComponents: {},
  edgeComponents: {},
};

const TEMPLATE_CANVAS: ExtendedCanvas = {
  nodes: [],
  edges: [],
};

export function createInitCommand(): Command {
  const command = new Command('init');

  command
    .description('Initialize a .vgc folder with a template canvas file')
    .option('-f, --force', 'Overwrite existing files')
    .option('-n, --name <name>', 'Name for the canvas file', 'architecture')
    .action(async (options) => {
      try {
        const vgcDir = join(process.cwd(), '.vgc');
        const canvasFile = join(vgcDir, `${options.name}.canvas`);
        const libraryFile = join(vgcDir, 'library.yaml');

        // Check if .vgc directory exists
        if (!existsSync(vgcDir)) {
          mkdirSync(vgcDir, { recursive: true });
          console.log(chalk.green(`Created directory: .vgc/`));
        }

        // Create canvas file
        if (existsSync(canvasFile) && !options.force) {
          console.log(chalk.yellow(`Canvas file already exists: .vgc/${options.name}.canvas`));
        } else {
          writeFileSync(canvasFile, JSON.stringify(TEMPLATE_CANVAS, null, 2));
          console.log(chalk.green(`Created canvas file: .vgc/${options.name}.canvas`));
        }

        // Create library file
        if (existsSync(libraryFile) && !options.force) {
          console.log(chalk.yellow(`Library file already exists: .vgc/library.yaml`));
        } else {
          const libraryYaml = `version: "1.0.0"
name: "Component Library"

nodeComponents: {}

edgeComponents: {}
`;
          writeFileSync(libraryFile, libraryYaml);
          console.log(chalk.green(`Created library file: .vgc/library.yaml`));
        }

        console.log('');
        console.log(chalk.bold('Next steps:'));
        console.log(`  1. Define components in ${chalk.cyan('.vgc/library.yaml')}`);
        console.log(`  2. Build your graph in ${chalk.cyan(`.vgc/${options.name}.canvas`)}`);
        console.log(`  3. Run ${chalk.cyan('vv validate')} to check your configuration`);
        console.log('');
        console.log(chalk.bold('Tips:'));
        console.log(`  • Add ${chalk.cyan('color')} to nodes or edges to customize their appearance`);
        console.log(`  • Use presets (1-6) or hex values: 1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple`);
        console.log(`  • Edge styles: ${chalk.cyan('solid')}, ${chalk.cyan('dashed')}, ${chalk.cyan('dotted')}, ${chalk.cyan('animated')}`);
        console.log(`  • Add ${chalk.cyan('icon')} to nodes using Lucide icon names (e.g., "Database", "Globe")`);
        console.log(`  • Add ${chalk.cyan('label')} to edges to describe connections`);
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
