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
import { createFormatsCommand } from './commands/formats.js';
import { createSetupCommand } from './commands/setup.js';
import { createHooksCommand } from './commands/hooks.js';
import { createCreateCommand } from './commands/create.js';
import { createLintCommand } from './commands/lint.js';
import { createCoverageCommand } from './commands/coverage.js';
import { createWorkflowCommand } from './commands/workflow/index.js';
import { createMigrationCommand } from './commands/migration.js';
import { createMigrateNodesCommand } from './commands/migrate-nodes.js';
import { createMigrateScopesCommand } from './commands/migrate-scopes-to-canvas.js';
import { createScopesCommand } from './commands/scopes/index.js';
import { createAuxiliaryCommand } from './commands/auxiliary/index.js';
import { createEventsCommand } from './commands/events/index.js';
import { createCollectorCommand } from './commands/collector/index.js';
import { createTraceCommand } from './commands/trace/index.js';

// Version is injected at build time via package.json
const VERSION = '0.16.8';

const program = new Command();

program
  .name('principal-ai')
  .description('Principal AI CLI - Validate and manage .canvas configuration files')
  .version(VERSION);

// Add commands in logical order
program.addCommand(createInitCommand());
program.addCommand(createCreateCommand());
program.addCommand(createValidateCommand()); // Comprehensive structural validation
program.addCommand(createLintCommand()); // Style and conventions
program.addCommand(createListCommand());
program.addCommand(createSchemaCommand());
program.addCommand(createFormatsCommand());
program.addCommand(createSetupCommand());
program.addCommand(createMigrationCommand()); // Migration guide
program.addCommand(createMigrateNodesCommand()); // Node type migration
program.addCommand(createMigrateScopesCommand()); // Scope migration to canvas
program.addCommand(createHooksCommand());
program.addCommand(createCoverageCommand());
program.addCommand(createWorkflowCommand());
program.addCommand(createScopesCommand());
program.addCommand(createAuxiliaryCommand());
program.addCommand(createEventsCommand());
program.addCommand(createCollectorCommand());
program.addCommand(createTraceCommand());

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
