/**
 * FileTree Builder Utilities
 *
 * Node.js-specific utilities for building FileTree from filesystem.
 * These utilities centralize filesystem interaction for CLI commands and scripts.
 */

import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { PathsFileTreeBuilder, type FileTree } from '@principal-ai/repository-abstraction';

/**
 * Build FileTree from a directory using glob to find all files
 *
 * @param rootDir - Root directory to scan
 * @param options - Optional configuration for glob
 * @returns FileTree representation of the directory
 *
 * @example
 * const fileTree = await buildFileTreeFromDirectory('/path/to/project');
 * const discovery = new CanvasDiscovery();
 * const result = await discovery.discover(fileTree);
 */
export async function buildFileTreeFromDirectory(
  rootDir: string,
  options?: {
    ignore?: string[];
    dot?: boolean;
  }
): Promise<FileTree> {
  const files = await glob('**/*', {
    cwd: rootDir,
    absolute: false,
    dot: options?.dot ?? true,
    ignore: options?.ignore ?? ['**/node_modules/**'],
    nodir: true,
  });

  const builder = new PathsFileTreeBuilder();
  return builder.build({
    files,
    rootPath: rootDir,
  });
}

/**
 * Create fileReader function for Node.js filesystem
 *
 * Returns a function that reads files from the filesystem relative to rootDir.
 * Used with FileTree-based APIs that accept a fileReader parameter.
 *
 * @param rootDir - Root directory for resolving relative paths
 * @returns fileReader function for reading files
 *
 * @example
 * const fileReader = createNodeFileReader('/path/to/project');
 * const content = await fileReader('src/index.ts');
 */
export function createNodeFileReader(rootDir: string): (path: string) => Promise<string> {
  return async (path: string) => {
    const fullPath = resolve(rootDir, path);
    return readFile(fullPath, 'utf-8');
  };
}
