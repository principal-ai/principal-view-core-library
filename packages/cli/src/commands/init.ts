/**
 * Init command - Initialize a .vgc folder with a template canvas file
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { ExtendedCanvas } from '@principal-ai/visual-validation-core';

const TEMPLATE_CANVAS: ExtendedCanvas = {
  nodes: [
    {
      id: 'component-1',
      type: 'text',
      x: 100,
      y: 100,
      width: 140,
      height: 80,
      text: 'Component 1',
      color: '#3b82f6',
      vv: {
        nodeType: 'service',
        shape: 'rectangle',
        icon: 'Server',
        sources: ['src/**/*.ts'],
      },
    },
    {
      id: 'component-2',
      type: 'text',
      x: 350,
      y: 100,
      width: 140,
      height: 80,
      text: 'Component 2',
      color: '#8b5cf6',
      vv: {
        nodeType: 'database',
        shape: 'hexagon',
        icon: 'Database',
        sources: ['src/db/**/*.ts'],
      },
    },
  ],
  edges: [
    {
      id: 'edge-1-2',
      fromNode: 'component-1',
      toNode: 'component-2',
      vv: {
        edgeType: 'data-flow',
      },
    },
  ],
  vv: {
    name: 'My Architecture',
    version: '1.0.0',
    description: 'Architecture diagram for my project',
    edgeTypes: {
      'data-flow': {
        style: 'solid',
        color: '#64748b',
        width: 2,
        directed: true,
      },
    },
  },
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

        // Check if .vgc directory exists
        if (existsSync(vgcDir)) {
          if (existsSync(canvasFile) && !options.force) {
            console.log(chalk.yellow(`Canvas file already exists: ${canvasFile}`));
            console.log(chalk.dim('Use --force to overwrite'));
            return;
          }
        } else {
          mkdirSync(vgcDir, { recursive: true });
          console.log(chalk.green(`Created directory: .vgc/`));
        }

        // Create the template canvas with the provided name
        const canvas = {
          ...TEMPLATE_CANVAS,
          vv: {
            ...TEMPLATE_CANVAS.vv,
            name: options.name.charAt(0).toUpperCase() + options.name.slice(1).replace(/-/g, ' '),
          },
        };

        // Write the canvas file
        writeFileSync(canvasFile, JSON.stringify(canvas, null, 2));
        console.log(chalk.green(`Created canvas file: .vgc/${options.name}.canvas`));

        // Add .vgc to .gitignore suggestion
        console.log('');
        console.log(chalk.bold('Next steps:'));
        console.log(`  1. Edit ${chalk.cyan(`.vgc/${options.name}.canvas`)} to define your architecture`);
        console.log(`  2. Run ${chalk.cyan('vv validate')} to check your configuration`);
        console.log('');
        console.log(chalk.dim('Tip: You can open .canvas files in Obsidian or any JSON editor'));
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
