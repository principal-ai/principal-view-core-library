/**
 * List command - List all .canvas files in a project
 */

import { Command } from 'commander';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import chalk from 'chalk';
import { globby } from 'globby';

interface CanvasInfo {
  file: string;
  name: string;
  version?: string;
  nodeCount: number;
  edgeCount: number;
  modified: Date;
}

function getCanvasInfo(filePath: string): CanvasInfo | null {
  try {
    const absolutePath = resolve(filePath);
    const content = readFileSync(absolutePath, 'utf8');
    const canvas = JSON.parse(content);
    const stats = statSync(absolutePath);

    return {
      file: relative(process.cwd(), absolutePath),
      name: canvas.vv?.name || 'Untitled',
      version: canvas.vv?.version,
      nodeCount: Array.isArray(canvas.nodes) ? canvas.nodes.length : 0,
      edgeCount: Array.isArray(canvas.edges) ? canvas.edges.length : 0,
      modified: stats.mtime,
    };
  } catch {
    return null;
  }
}

export function createListCommand(): Command {
  const command = new Command('list');

  command
    .alias('ls')
    .description('List all .canvas files in the project')
    .option('-a, --all', 'Search all directories (not just .vgc)')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const patterns = options.all
          ? ['**/*.canvas', '!node_modules/**']
          : ['.vgc/*.canvas'];

        const files = await globby(patterns, {
          expandDirectories: false,
        });

        if (files.length === 0) {
          if (options.json) {
            console.log(JSON.stringify({ files: [] }));
          } else {
            console.log(chalk.yellow('No .canvas files found.'));
            if (!options.all) {
              console.log(chalk.dim('Run with --all to search all directories'));
            }
            console.log(chalk.dim('\nTo create a new canvas, run: vv init'));
          }
          return;
        }

        const canvasInfos = files
          .map(getCanvasInfo)
          .filter((info): info is CanvasInfo => info !== null)
          .sort((a, b) => b.modified.getTime() - a.modified.getTime());

        if (options.json) {
          console.log(JSON.stringify({ files: canvasInfos }, null, 2));
        } else {
          console.log(chalk.bold(`\nFound ${canvasInfos.length} canvas file(s):\n`));

          for (const info of canvasInfos) {
            const version = info.version ? chalk.dim(` v${info.version}`) : '';
            console.log(`  ${chalk.cyan(info.file)}`);
            console.log(`    ${chalk.bold(info.name)}${version}`);
            console.log(chalk.dim(`    ${info.nodeCount} nodes, ${info.edgeCount} edges`));
            console.log('');
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
