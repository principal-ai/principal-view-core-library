import { Command } from 'commander';
import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { evaluateExpression } from '@principal-ai/principal-view-core';
import { resolvePath, formatValue } from './utils.js';

interface EvalOptions {
  context?: string;
  json?: boolean;
}

export function createEvalCommand(): Command {
  const command = new Command('eval');

  command
    .description('Evaluate template expression with context')
    .argument('<expression>', 'Template expression to evaluate (e.g., {count > 5 ? \'many\' : \'few\'})')
    .argument('[context]', 'Optional path to JSON context file')
    .option('--context <json>', 'Inline JSON context as string')
    .option('--json', 'Output result as JSON')
    .action(async (expression: string, contextPath: string | undefined, options: EvalOptions) => {
      try {
        let context: Record<string, unknown> = {};

        // Load context from file or inline option
        if (contextPath) {
          const content = await readFile(resolvePath(contextPath), 'utf-8');
          context = JSON.parse(content);
        } else if (options.context) {
          context = JSON.parse(options.context);
        }

        // Remove curly braces if user included them
        let cleanExpression = expression.trim();
        if (cleanExpression.startsWith('{') && cleanExpression.endsWith('}')) {
          cleanExpression = cleanExpression.slice(1, -1).trim();
        }

        // Evaluate expression
        const result = evaluateExpression(cleanExpression, context);

        if (options.json) {
          const output = {
            expression: cleanExpression,
            context,
            result,
            type: typeof result,
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log(chalk.bold('\nExpression:'), chalk.cyan(`{${cleanExpression}}`));

          if (Object.keys(context).length > 0) {
            console.log(chalk.bold('\nContext:'));
            for (const [key, value] of Object.entries(context)) {
              console.log(chalk.gray('  •'), `${key} = ${formatValue(value)}`);
            }
          } else {
            console.log(chalk.yellow('\nNo context provided'));
          }

          console.log(chalk.bold('\nResult:'), formatValue(result));
          console.log(chalk.gray('Type:'), typeof result);
          console.log();
        }
      } catch (error) {
        const errorMessage = (error as Error).message;

        if (options.json) {
          const output = {
            error: true,
            message: errorMessage,
            expression: expression,
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.error(chalk.red('\nEvaluation Error:'), errorMessage);
          console.error(chalk.gray('\nExpression:'), expression);
          console.log();
        }

        process.exit(1);
      }
    });

  return command;
}
