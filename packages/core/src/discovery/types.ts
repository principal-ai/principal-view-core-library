/**
 * Type definitions for canvas and execution file discovery
 */

import type { ExtendedCanvas } from '../types/canvas';
import type { ExecutionData } from '../execution/ExecutionValidator';
import type { WorkflowTemplate } from '../workflow/types';

/**
 * Canvas file type discriminator
 * - 'otel': OpenTelemetry canvas (.otel.canvas) for workflow/tracing visualization
 * - 'scopes': Scopes canvas (.scopes.canvas) for documenting instrumentation scopes
 * - 'resources': Resources canvas (.resources.canvas) for documenting OTel resources
 * - 'spans': Spans canvas (.spans.canvas) for documenting span conventions
 * - 'regular': Regular canvas (.canvas) for documentation/architecture diagrams
 */
export type CanvasType = 'otel' | 'scopes' | 'resources' | 'spans' | 'regular';

/**
 * Test trace file type discriminator based on extension
 * Only .otel.json files are supported
 */
export type TestTraceType = 'otel';

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
  /**
   * Associated markdown documentation file path (relative to repo root)
   * Only populated for otel.canvas files when canvas content is loaded
   */
  markdownPath?: string;
}

/**
 * Discovered test trace file with package metadata
 */
export interface DiscoveredTestTrace {
  /** Unique ID with package prefix (e.g., "core/api-tests" or "api-tests") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root */
  path: string;
  /** Test trace basename (without .otel.json extension) */
  basename: string;
  /** Test trace file type */
  type: TestTraceType;
  /** Canvas basename this test trace is linked to */
  canvasBasename: string;
  /** Package name if in a package */
  packageName?: string;
  /** Package path if in a package */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
}

/**
 * Discovered workflow file within a storyboard
 */
export interface DiscoveredWorkflow {
  /** Unique ID with package prefix (e.g., "core/checkout-flow/checkout" or "checkout-flow/checkout") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root to workflow.json file */
  path: string;
  /** Workflow basename (without .workflow.json extension) */
  basename: string;
  /** Parent storyboard ID this workflow belongs to */
  storyboardId: string;
  /** Package name if in a package */
  packageName?: string;
  /** Package path if in a package */
  packagePath?: string;
  /** Whether this is from repo root vs package */
  scope: 'root' | 'package';
  /** Associated test trace files for this workflow */
  testTraces: DiscoveredTestTrace[];
}

/**
 * Discovered storyboard folder containing canvas, workflows, and executions
 */
export interface DiscoveredStoryboard {
  /** Unique ID with package prefix (e.g., "core/checkout-flow" or "checkout-flow") */
  id: string;
  /** Display name (Title Case from basename) */
  name: string;
  /** Full relative path from repo root to storyboard folder */
  path: string;
  /** Storyboard basename (folder name) */
  basename: string;
  /** The main canvas file for this storyboard */
  canvas: DiscoveredCanvas;
  /** Workflows within this storyboard */
  workflows: DiscoveredWorkflow[];
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
  /** All discovered test trace files, sorted by package then name */
  testTraces: DiscoveredTestTrace[];
  /** All discovered storyboards (hierarchical organization of canvas + workflows + test traces) */
  storyboards: DiscoveredStoryboard[];
  /** Any errors encountered during discovery */
  errors: Array<{ path: string; error: string }>;
  /** Deprecation warnings for legacy structures */
  warnings: Array<{ path: string; message: string; type: 'deprecation' }>;
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
 * Discovered test trace with parsed content
 */
export interface DiscoveredTestTraceWithContent extends DiscoveredTestTrace {
  /** Parsed test trace artifact (only when includeContent: true) */
  content: ExecutionData;
}

/**
 * Discovered workflow with parsed content
 */
export interface DiscoveredWorkflowWithContent extends DiscoveredWorkflow {
  /** Parsed workflow template (only when includeContent: true) */
  content: WorkflowTemplate;
  /** Test traces with parsed content */
  testTraces: (DiscoveredTestTrace | DiscoveredTestTraceWithContent)[];
}

/**
 * Discovered storyboard with parsed content
 */
export interface DiscoveredStoryboardWithContent extends DiscoveredStoryboard {
  /** Canvas with parsed content */
  canvas: DiscoveredCanvas | DiscoveredCanvasWithContent;
  /** Workflows with parsed content */
  workflows: (DiscoveredWorkflow | DiscoveredWorkflowWithContent)[];
}

/**
 * Discovery result with content
 */
export interface CanvasDiscoveryResultWithContent {
  canvases: (DiscoveredCanvas | DiscoveredCanvasWithContent)[];
  testTraces: (DiscoveredTestTrace | DiscoveredTestTraceWithContent)[];
  storyboards: (DiscoveredStoryboard | DiscoveredStoryboardWithContent)[];
  errors: Array<{ path: string; error: string }>;
  warnings: Array<{ path: string; message: string; type: 'deprecation' }>;
}
