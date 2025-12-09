/**
 * Init command - Initialize a .vgc folder with template files and linting setup
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
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

const TEMPLATE_VGCRC = `# Visual Graph Configuration Lint Rules
# See: https://github.com/principal-ai/visual-validation

# File patterns to include
include:
  - ".vgc/**/*.yaml"
  - ".vgc/**/*.yml"
  - ".vgc/**/*.json"

# File patterns to exclude
exclude:
  - "**/node_modules/**"
  - ".vgc/library.yaml"

# Path to component library (optional)
library: ".vgc/library.yaml"

# Rule configuration
# Severity: "off" | "warn" | "error" (or 0 | 1 | 2)
rules:
  # Schema rules - validate structure
  no-unknown-fields: error
  required-metadata: error
  valid-node-types: error
  valid-edge-types: error
  valid-color-format: error

  # Reference rules - check cross-references
  connection-type-references: error
  state-transition-references: error

  # Structure rules - ensure completeness
  minimum-node-sources:
    - error
    - minimum: 1
      excludeNodeTypes: []
  orphaned-node-types: error
  orphaned-edge-types: error
  unreachable-states: error
  dead-end-states:
    - error
    - allowTerminalStates: true

  # Pattern rules - validate regex patterns
  valid-action-patterns:
    - error
    - strictMode: false

  # Library rules - check against component library
  library-node-type-match:
    - error
    - requireLibraryMatch: false
`;

const HUSKY_PRE_COMMIT = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run visual validation linting on staged .vgc files
vv lint --quiet
`;

/**
 * Check if a command exists in PATH
 */
function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we're in a git repository
 */
function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the git root directory
 */
function getGitRoot(): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if husky is already installed
 */
function isHuskyInstalled(gitRoot: string): boolean {
  return existsSync(join(gitRoot, '.husky'));
}

/**
 * Detect package manager
 */
function detectPackageManager(): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (existsSync('bun.lockb')) return 'bun';
  if (existsSync('pnpm-lock.yaml')) return 'pnpm';
  if (existsSync('yarn.lock')) return 'yarn';
  return 'npm';
}

export function createInitCommand(): Command {
  const command = new Command('init');

  command
    .description('Initialize a .vgc folder with template files and linting setup')
    .option('-f, --force', 'Overwrite existing files')
    .option('-n, --name <name>', 'Name for the canvas file', 'architecture')
    .option('--no-husky', 'Skip Husky pre-commit hook setup')
    .option('--no-lint-config', 'Skip .vgcrc.yaml creation')
    .action(async (options) => {
      try {
        const cwd = process.cwd();
        const vgcDir = join(cwd, '.vgc');
        const canvasFile = join(vgcDir, `${options.name}.canvas`);
        const libraryFile = join(vgcDir, 'library.yaml');
        const vgcrcFile = join(cwd, '.vgcrc.yaml');

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

        // Create .vgcrc.yaml config file
        if (options.lintConfig !== false) {
          if (existsSync(vgcrcFile) && !options.force) {
            console.log(chalk.yellow(`Config file already exists: .vgcrc.yaml`));
          } else {
            writeFileSync(vgcrcFile, TEMPLATE_VGCRC);
            console.log(chalk.green(`Created lint config: .vgcrc.yaml`));
          }
        }

        // Set up Husky pre-commit hook
        let huskySetup = false;
        if (options.husky !== false) {
          if (!isGitRepo()) {
            console.log(chalk.yellow(`Skipping Husky setup: not a git repository`));
          } else {
            const gitRoot = getGitRoot();
            if (!gitRoot) {
              console.log(chalk.yellow(`Skipping Husky setup: could not find git root`));
            } else {
              const huskyDir = join(gitRoot, '.husky');
              const preCommitFile = join(huskyDir, 'pre-commit');

              if (isHuskyInstalled(gitRoot)) {
                // Husky is already installed, just add/update pre-commit hook
                if (existsSync(preCommitFile)) {
                  // Check if our hook is already in the file
                  const existingContent = readFileSync(preCommitFile, 'utf8');
                  if (existingContent.includes('vv lint')) {
                    console.log(chalk.yellow(`Husky pre-commit hook already includes vv lint`));
                  } else {
                    // Append our lint command to existing pre-commit
                    const updatedContent = existingContent.trimEnd() + '\n\n# Run visual validation linting\nvv lint --quiet\n';
                    writeFileSync(preCommitFile, updatedContent);
                    console.log(chalk.green(`Updated Husky pre-commit hook with vv lint`));
                    huskySetup = true;
                  }
                } else {
                  // Create new pre-commit hook
                  writeFileSync(preCommitFile, HUSKY_PRE_COMMIT);
                  chmodSync(preCommitFile, '755');
                  console.log(chalk.green(`Created Husky pre-commit hook`));
                  huskySetup = true;
                }
              } else {
                // Husky is not installed, try to install it
                const pm = detectPackageManager();
                const packageJsonPath = join(gitRoot, 'package.json');

                if (!existsSync(packageJsonPath)) {
                  console.log(chalk.yellow(`Skipping Husky setup: no package.json found`));
                } else {
                  console.log(chalk.dim(`Installing Husky...`));

                  try {
                    // Install husky as dev dependency
                    const installCmd = {
                      npm: 'npm install --save-dev husky',
                      yarn: 'yarn add --dev husky',
                      pnpm: 'pnpm add --save-dev husky',
                      bun: 'bun add --dev husky',
                    }[pm];

                    execSync(installCmd, { stdio: 'inherit', cwd: gitRoot });

                    // Initialize husky
                    execSync('npx husky init', { stdio: 'inherit', cwd: gitRoot });

                    // Write our pre-commit hook
                    writeFileSync(preCommitFile, HUSKY_PRE_COMMIT);
                    chmodSync(preCommitFile, '755');
                    console.log(chalk.green(`Installed Husky and created pre-commit hook`));
                    huskySetup = true;
                  } catch (installError) {
                    console.log(chalk.yellow(`Could not install Husky automatically: ${(installError as Error).message}`));
                    console.log(chalk.dim(`  You can install it manually: ${pm} add --dev husky && npx husky init`));
                  }
                }
              }
            }
          }
        }

        console.log('');
        console.log(chalk.bold('Setup complete!'));
        console.log('');
        console.log(chalk.bold('Files created:'));
        console.log(`  • ${chalk.cyan('.vgc/library.yaml')} - Component library definitions`);
        console.log(`  • ${chalk.cyan(`.vgc/${options.name}.canvas`)} - Graph canvas file`);
        if (options.lintConfig !== false) {
          console.log(`  • ${chalk.cyan('.vgcrc.yaml')} - Lint configuration`);
        }
        if (huskySetup) {
          console.log(`  • ${chalk.cyan('.husky/pre-commit')} - Pre-commit hook`);
        }

        console.log('');
        console.log(chalk.bold('Next steps:'));
        console.log(`  1. Define components in ${chalk.cyan('.vgc/library.yaml')}`);
        console.log(`  2. Build your graph in ${chalk.cyan(`.vgc/${options.name}.canvas`)}`);
        console.log(`  3. Run ${chalk.cyan('vv lint')} to validate your configuration`);
        if (huskySetup) {
          console.log(`  4. Commits will now automatically lint .vgc files`);
        }

        console.log('');
        console.log(chalk.bold('Commands:'));
        console.log(`  • ${chalk.cyan('vv lint')} - Lint configuration files`);
        console.log(`  • ${chalk.cyan('vv lint --json')} - Output lint results as JSON`);
        console.log(`  • ${chalk.cyan('vv validate')} - Validate canvas files`);
        console.log(`  • ${chalk.cyan('vv doctor')} - Check project setup`);
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
