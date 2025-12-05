/**
 * Visual Validation CLI - Main entry point
 *
 * This CLI provides tools to validate and manage .canvas configuration files
 * for the Visual Validation Framework.
 */

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createValidateCommand } from './commands/validate.js';
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('vv')
  .description('Visual Validation CLI - Validate and manage .canvas configuration files')
  .version(packageJson.version);

// Add commands
program.addCommand(createInitCommand());
program.addCommand(createValidateCommand());
program.addCommand(createListCommand());

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
