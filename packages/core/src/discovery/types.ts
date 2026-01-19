/**
 * Type definitions for canvas and execution file discovery
 */

import type { ExtendedCanvas } from '../types/canvas';

/**
 * Canvas file type discriminator
 */
export type CanvasType = 'otel' | 'regular';

/**
 * Execution file type discriminator based on extension
 */
export type ExecutionType = 'spans' | 'execution' | 'events' | 'otel';

/**
 * Discovered canvas file with package metadata
 */
export interface DiscoveredCanvas {
  /** Unique ID with package prefix (e.g., "core/my-flow" or "my-flow") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root */
  path: string;
  /** Canvas basename (without .canvas/.otel.canvas extension) */
  basename: string;
  /** Canvas type */
  type: CanvasType;
  /** Package name if in a package (e.g., "core" from packages/core) */
  packageName?: string;
  /** Package path if in a package (e.g., "packages/core") */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
}

/**
 * Discovered execution file with package metadata
 */
export interface DiscoveredExecution {
  /** Unique ID with package prefix (e.g., "core/api-tests" or "api-tests") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root */
  path: string;
  /** Execution basename (without .spans.json/.execution.json/etc) */
  basename: string;
  /** Execution file type */
  type: ExecutionType;
  /** Canvas basename this execution is linked to */
  canvasBasename: string;
  /** Package name if in a package */
  packageName?: string;
  /** Package path if in a package */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
}

/**
 * Result of canvas discovery operation
 */
export interface CanvasDiscoveryResult {
  /** All discovered canvas files, sorted by package then name */
  canvases: DiscoveredCanvas[];
  /** All discovered execution files, sorted by package then name */
  executions: DiscoveredExecution[];
  /** Any errors encountered during discovery */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Options for file discovery
 */
export interface DiscoveryOptions {
  /**
   * Optional function to read and parse canvas file contents
   * Useful when you want parsed canvas objects, not just metadata
   *
   * @example
   * // In CLI with filesystem access:
   * fileReader: async (path) => fs.promises.readFile(path, 'utf-8')
   *
   * @example
   * // In panels with cache:
   * fileReader: async (path) => context.getSlice('fileCache').read(path)
   */
  fileReader?: (path: string) => Promise<string>;

  /**
   * Whether to include canvas content in results
   * Requires fileReader to be provided
   */
  includeContent?: boolean;
}

/**
 * Discovered canvas with parsed content
 */
export interface DiscoveredCanvasWithContent extends DiscoveredCanvas {
  /** Parsed canvas content (only when includeContent: true) */
  content: ExtendedCanvas;
}

/**
 * Discovered execution with parsed content
 */
export interface DiscoveredExecutionWithContent extends DiscoveredExecution {
  /** Parsed execution artifact (only when includeContent: true) */
  content: any; // ExecutionArtifact type from ExecutionLoader
}

/**
 * Discovery result with content
 */
export interface CanvasDiscoveryResultWithContent {
  canvases: (DiscoveredCanvas | DiscoveredCanvasWithContent)[];
  executions: (DiscoveredExecution | DiscoveredExecutionWithContent)[];
  errors: Array<{ path: string; error: string }>;
}
