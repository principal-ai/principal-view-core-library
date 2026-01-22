/**
 * Execution loader for managing execution artifact files
 *
 * Supports loading execution files (.otel.json) from __executions__/ folders
 * using the adapter pattern for environment-agnostic file operations.
 *
 * Automatically handles both OTLP standard format and legacy formats
 * through ExecutionValidator conversion.
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import { ExecutionValidator, type ExecutionData } from './ExecutionValidator';

/**
 * Represents a single execution file
 */
export interface ExecutionFile {
  /** Execution name (filename without .otel.json extension) */
  name: string;
  /** Full path to the execution file */
  path: string;
  /** Parsed and validated execution data */
  data: ExecutionData;
}

/**
 * Result of loading all executions
 */
export interface ExecutionLoadResult {
  /** Successfully loaded executions */
  executions: ExecutionFile[];
  /** Errors encountered during loading */
  errors: Array<{ file: string; error: string }>;
}

/**
 * Loader for managing execution artifact files from __executions__/ folders
 *
 * @example
 * ```typescript
 * const loader = new ExecutionLoader(fsAdapter);
 *
 * // Check if __executions__/ exists
 * if (loader.hasExecutionDirectory('/path/to/project')) {
 *   // Load all execution files
 *   const result = loader.loadAll('/path/to/project');
 *   console.log(`Loaded ${result.executions.length} executions`);
 *
 *   // Load specific execution
 *   const execution = loader.loadByName('test-run', '/path/to/project');
 * }
 * ```
 */
export class ExecutionLoader {
  private static readonly EXECUTION_DIR = '__executions__';
  private static readonly EXECUTION_EXTENSION = '.otel.json';
  private validator: ExecutionValidator;

  constructor(private fsAdapter: FileSystemAdapter) {
    this.validator = new ExecutionValidator();
  }

  /**
   * Check if __executions__/ directory exists
   *
   * @param baseDir - Base directory to search from
   * @returns True if __executions__/ directory exists
   */
  hasExecutionDirectory(baseDir: string): boolean {
    const executionPath = this.fsAdapter.join(
      baseDir,
      ExecutionLoader.EXECUTION_DIR
    );
    return (
      this.fsAdapter.exists(executionPath) &&
      this.fsAdapter.isDirectory(executionPath)
    );
  }

  /**
   * List all available execution names in __executions__/ folder
   *
   * @param baseDir - Base directory containing __executions__/ folder
   * @returns Array of execution names (without .otel.json extensions)
   */
  listExecutions(baseDir: string): string[] {
    if (!this.hasExecutionDirectory(baseDir)) {
      return [];
    }

    const executionPath = this.fsAdapter.join(
      baseDir,
      ExecutionLoader.EXECUTION_DIR
    );
    const files = this.fsAdapter.readDir(executionPath);

    return files
      .filter((f) => this.isExecutionFile(f))
      .map((f) => this.getExecutionNameFromFilename(f))
      .sort();
  }

  /**
   * Load a specific execution by name
   *
   * Automatically handles OTLP format conversion through ExecutionValidator.
   *
   * @param name - Execution name (without .otel.json extension)
   * @param baseDir - Base directory containing __executions__/ folder
   * @returns Execution file or null if not found/invalid
   */
  loadByName(name: string, baseDir: string): ExecutionFile | null {
    if (!this.hasExecutionDirectory(baseDir)) {
      return null;
    }

    const executionPath = this.fsAdapter.join(
      baseDir,
      ExecutionLoader.EXECUTION_DIR
    );
    const filename = `${name}${ExecutionLoader.EXECUTION_EXTENSION}`;
    const fullPath = this.fsAdapter.join(executionPath, filename);

    if (!this.fsAdapter.exists(fullPath)) {
      return null;
    }

    try {
      const content = this.fsAdapter.readFile(fullPath);
      const parsed = JSON.parse(content);

      // Use validateOrThrow to both validate and get converted ExecutionData
      const data = this.validator.validateOrThrow(parsed, fullPath);

      return {
        name,
        path: fullPath,
        data,
      };
    } catch (error) {
      // File exists but couldn't be read, parsed, or validated
      return null;
    }
  }

  /**
   * Load all executions from __executions__/ folder
   *
   * Automatically handles OTLP format conversion for all files.
   *
   * @param baseDir - Base directory containing __executions__/ folder
   * @returns Result containing all loaded executions and any errors
   */
  loadAll(baseDir: string): ExecutionLoadResult {
    const result: ExecutionLoadResult = {
      executions: [],
      errors: [],
    };

    if (!this.hasExecutionDirectory(baseDir)) {
      result.errors.push({
        file: '__executions__',
        error: 'Execution directory __executions__/ not found',
      });
      return result;
    }

    const executionPath = this.fsAdapter.join(
      baseDir,
      ExecutionLoader.EXECUTION_DIR
    );
    const files = this.fsAdapter.readDir(executionPath);

    for (const filename of files) {
      if (!this.isExecutionFile(filename)) {
        continue; // Skip non-.otel.json files
      }

      const fullPath = this.fsAdapter.join(executionPath, filename);
      const name = this.getExecutionNameFromFilename(filename);

      try {
        const content = this.fsAdapter.readFile(fullPath);
        const parsed = JSON.parse(content);

        // Validate and convert OTLP format if needed
        const validationResult = this.validator.validate(parsed, fullPath);

        if (validationResult.valid) {
          // Use validateOrThrow to get converted ExecutionData
          const data = this.validator.validateOrThrow(parsed, fullPath);

          result.executions.push({
            name,
            path: fullPath,
            data,
          });
        } else {
          // Collect validation errors
          const errorMessages = validationResult.errors
            .map((e) => `${e.path}: ${e.message}`)
            .join('; ');
          result.errors.push({
            file: filename,
            error: `Validation failed: ${errorMessages}`,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push({
          file: filename,
          error: `Failed to read/parse file: ${errorMessage}`,
        });
      }
    }

    // Sort executions by name for consistent ordering
    result.executions.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }

  /**
   * Get the execution directory path
   *
   * @param baseDir - Base directory
   * @returns Full path to __executions__/ directory
   */
  getExecutionDirectoryPath(baseDir: string): string {
    return this.fsAdapter.join(baseDir, ExecutionLoader.EXECUTION_DIR);
  }

  /**
   * Search for __executions__/ directories recursively in a project
   *
   * Useful for monorepos where executions might be in multiple packages.
   *
   * @param baseDir - Base directory to search from
   * @param maxDepth - Maximum directory depth to search (default: 3)
   * @returns Array of paths to __executions__/ directories
   */
  findExecutionDirectories(baseDir: string, maxDepth: number = 3): string[] {
    const found: string[] = [];

    const search = (dir: string, depth: number) => {
      if (depth > maxDepth) return;

      try {
        const items = this.fsAdapter.readDir(dir);

        for (const item of items) {
          const fullPath = this.fsAdapter.join(dir, item);

          if (!this.fsAdapter.isDirectory(fullPath)) continue;

          // Skip node_modules and hidden directories
          if (item === 'node_modules' || item.startsWith('.')) continue;

          if (item === ExecutionLoader.EXECUTION_DIR) {
            found.push(fullPath);
          } else {
            search(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    search(baseDir, 0);
    return found;
  }

  /**
   * Load all executions from multiple __executions__/ directories
   *
   * Useful for monorepos where executions are spread across packages.
   *
   * @param baseDir - Base directory to search from
   * @param maxDepth - Maximum directory depth to search (default: 3)
   * @returns Result containing all loaded executions and any errors
   */
  loadAllRecursive(baseDir: string, maxDepth: number = 3): ExecutionLoadResult {
    const result: ExecutionLoadResult = {
      executions: [],
      errors: [],
    };

    const directories = this.findExecutionDirectories(baseDir, maxDepth);

    for (const execDir of directories) {
      // Get parent directory for loadAll
      const parentDir = this.fsAdapter.dirname(execDir);
      const dirResult = this.loadAll(parentDir);

      result.executions.push(...dirResult.executions);
      result.errors.push(...dirResult.errors);
    }

    // Sort by name
    result.executions.sort((a, b) => a.name.localeCompare(b.name));

    return result;
  }

  /**
   * Check if a filename is an execution file
   */
  private isExecutionFile(filename: string): boolean {
    return filename.endsWith(ExecutionLoader.EXECUTION_EXTENSION);
  }

  /**
   * Extract execution name from filename
   */
  private getExecutionNameFromFilename(filename: string): string {
    return filename.replace(ExecutionLoader.EXECUTION_EXTENSION, '');
  }
}

/**
 * Create a new execution loader instance
 *
 * @param fsAdapter - File system adapter for environment-agnostic operations
 * @returns ExecutionLoader instance
 */
export function createExecutionLoader(
  fsAdapter: FileSystemAdapter
): ExecutionLoader {
  return new ExecutionLoader(fsAdapter);
}
