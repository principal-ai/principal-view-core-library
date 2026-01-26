/**
 * Telemetry Coverage Analysis
 *
 * Measures observability coverage by analyzing which canvas nodes have
 * OpenTelemetry instrumentation in their source files.
 *
 * Uses FileTree abstraction for environment-agnostic file operations.
 */

import type { FileTree } from '@principal-ai/repository-abstraction';
import { CanvasDiscovery } from '../discovery/CanvasDiscovery';
import type { DiscoveredCanvasWithContent } from '../discovery/types';
import type { ExtendedCanvasNode } from '../types/canvas';

export interface NodeCoverage {
  nodeId: string;
  filePaths: string[];
  hasInstrumentation: boolean;
  instrumentedFiles: string[];
  missingFiles: string[];
}

export interface CoverageMetrics {
  totalNodes: number;
  nodesWithFiles: number;
  nodesWithInstrumentation: number;
  coveragePercentage: number;
  nodeCoverage: NodeCoverage[];
  canvasFiles: string[];
}

/**
 * Extract file paths from a canvas node's pv.sources (REQUIRED)
 */
function extractFilePaths(node: ExtendedCanvasNode): string[] {
  const paths: string[] = [];

  if (node.pv?.sources) {
    paths.push(...node.pv.sources);
  }

  return paths;
}

/**
 * Check if a file has OpenTelemetry instrumentation
 *
 * @param filePath - Path to the file to check
 * @param fileReader - Function to read file contents
 * @returns True if file has OTEL instrumentation
 */
async function hasInstrumentation(
  filePath: string,
  fileReader: (path: string) => Promise<string>
): Promise<boolean> {
  try {
    const content = await fileReader(filePath);

    const hasOtelImport = content.includes('@opentelemetry/api');
    const hasTracer = /getTracer|startSpan|addEvent/.test(content);
    const hasTestOtel = /['"]\.\.?\/.*test\/otel-setup['"]/.test(content);

    return hasOtelImport || hasTracer || hasTestOtel;
  } catch {
    return false;
  }
}

/**
 * Analyze coverage for a single canvas node
 *
 * @param node - Canvas node to analyze
 * @param fileReader - Function to read file contents
 * @returns Coverage information for the node
 */
async function analyzeNodeCoverage(
  node: ExtendedCanvasNode,
  fileReader: (path: string) => Promise<string>
): Promise<NodeCoverage> {
  const filePaths = extractFilePaths(node);
  const instrumentedFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const path of filePaths) {
    try {
      const instrumented = await hasInstrumentation(path, fileReader);
      if (instrumented) {
        instrumentedFiles.push(path);
      }
    } catch {
      // File doesn't exist or can't be read
      missingFiles.push(path);
    }
  }

  return {
    nodeId: node.id,
    filePaths,
    hasInstrumentation: instrumentedFiles.length > 0,
    instrumentedFiles,
    missingFiles
  };
}

/**
 * Generate telemetry coverage report from canvas files
 *
 * @param fileTree - FileTree representation of the codebase
 * @param fileReader - Function to read file contents
 * @returns Coverage metrics for all canvas nodes
 *
 * @example
 * ```typescript
 * import { buildFileTreeFromDirectory, createNodeFileReader } from '@principal-ai/principal-view-core/node';
 *
 * const fileTree = await buildFileTreeFromDirectory('/path/to/project');
 * const fileReader = createNodeFileReader('/path/to/project');
 * const metrics = await analyzeCoverage(fileTree, fileReader);
 * ```
 */
export async function analyzeCoverage(
  fileTree: FileTree,
  fileReader: (path: string) => Promise<string>
): Promise<CoverageMetrics> {
  // Use CanvasDiscovery to find all canvas files
  const discovery = new CanvasDiscovery();
  const result = await discovery.discover(fileTree, {
    fileReader,
    includeContent: true, // Need content to parse nodes
  });

  // Filter for .otel.canvas files only
  const otelCanvases = result.canvases.filter(c => c.type === 'otel');

  const allNodeCoverage: NodeCoverage[] = [];

  for (const canvas of otelCanvases) {
    // Cast to DiscoveredCanvasWithContent since we used includeContent: true
    const canvasWithContent = canvas as DiscoveredCanvasWithContent;

    if (!canvasWithContent.content?.nodes || canvasWithContent.content.nodes.length === 0) {
      continue;
    }

    for (const node of canvasWithContent.content.nodes) {
      const coverage = await analyzeNodeCoverage(node, fileReader);
      allNodeCoverage.push(coverage);
    }
  }

  const nodesWithFiles = allNodeCoverage.filter(n => n.filePaths.length > 0);
  const nodesWithInstrumentation = allNodeCoverage.filter(n => n.hasInstrumentation);

  return {
    totalNodes: allNodeCoverage.length,
    nodesWithFiles: nodesWithFiles.length,
    nodesWithInstrumentation: nodesWithInstrumentation.length,
    coveragePercentage: nodesWithFiles.length > 0
      ? (nodesWithInstrumentation.length / nodesWithFiles.length) * 100
      : 0,
    nodeCoverage: allNodeCoverage,
    canvasFiles: otelCanvases.map(c => c.path),
  };
}
