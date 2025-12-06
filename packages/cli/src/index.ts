/**
 * Visual Validation CLI - Main entry point
 *
 * This CLI provides tools to validate and manage .canvas configuration files
 * for the Visual Validation Framework.
 */

import { Command } from 'commander';
import { createValidateCommand } from './commands/validate.js';
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';
import { createSchemaCommand } from './commands/schema.js';

// Version is injected at build time via package.json
const VERSION = '0.1.7';

const program = new Command();

program
  .name('vv')
  .description('Visual Validation CLI - Validate and manage .canvas configuration files')
  .version(VERSION);

// Add commands
program.addCommand(createInitCommand());
program.addCommand(createValidateCommand());
program.addCommand(createListCommand());
program.addCommand(createSchemaCommand());

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
