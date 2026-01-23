import { Command } from 'commander';
import { createValidateCommand } from './validate.js';
import { createInspectCommand } from './inspect.js';
import { createRenderCommand } from './render.js';
import { createTestCommand } from './test.js';
import { createListCommand } from './list.js';

export function createNarrativeCommand(): Command {
  const command = new Command('narrative');

  command
    .description('Validate, test, and debug narrative templates')
    .addCommand(createValidateCommand())
    .addCommand(createInspectCommand())
    .addCommand(createRenderCommand())
    .addCommand(createTestCommand())
    .addCommand(createListCommand());

  return command;
}
