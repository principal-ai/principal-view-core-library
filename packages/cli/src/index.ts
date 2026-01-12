/**
 * Principal View CLI - Main entry point
 *
 * This CLI provides tools to validate and manage .canvas configuration files
 * for the Principal View Framework.
 */

import { Command } from 'commander';
import { createValidateCommand } from './commands/validate.js';
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';
import { createSchemaCommand } from './commands/schema.js';
import { createDoctorCommand } from './commands/doctor.js';
import { createHooksCommand } from './commands/hooks.js';
import { createCreateCommand } from './commands/create.js';
import { createLintCommand } from './commands/lint.js';
import { createCoverageCommand } from './commands/coverage.js';

// Version is injected at build time via package.json
const VERSION = '0.1.28';

const program = new Command();

program
  .name('privu')
  .description('Principal View CLI - Validate and manage .canvas configuration files')
  .version(VERSION);

// Add commands
program.addCommand(createInitCommand());
program.addCommand(createCreateCommand());
program.addCommand(createValidateCommand());
program.addCommand(createLintCommand());
program.addCommand(createListCommand());
program.addCommand(createSchemaCommand());
program.addCommand(createDoctorCommand());
program.addCommand(createHooksCommand());
program.addCommand(createCoverageCommand());

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
