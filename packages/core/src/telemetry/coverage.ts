/**
 * Telemetry Coverage Analysis
 *
 * Measures observability coverage by analyzing which canvas nodes have
 * OpenTelemetry instrumentation in their source files.
 */

import { readFile, access } from 'fs/promises';
import { resolve } from 'path';
import { glob } from 'glob';

export interface CanvasNode {
  id: string;
  text?: string;
  anchors?: Array<{ path?: string }>;
  [key: string]: any;
}

export interface Canvas {
  nodes?: CanvasNode[];
  [key: string]: any;
}

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
 * Extract file paths from a canvas node anchors (REQUIRED)
 */
function extractFilePaths(node: CanvasNode): string[] {
  const paths: string[] = [];

  if (node.anchors) {
    for (const anchor of node.anchors) {
      if (anchor.path) {
        paths.push(anchor.path);
      }
    }
  }

  return paths;
}

/**
 * Check if a file has OpenTelemetry instrumentation
 */
async function hasInstrumentation(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');

    const hasOtelImport = content.includes('@opentelemetry/api');
    const hasTracer = /getTracer|startSpan|addEvent/.test(content);
    const hasTestOtel = /['"]\.\.?\/.*test\/otel-setup['"]/.test(content);

    return hasOtelImport || hasTracer || hasTestOtel;
  } catch {
    return false;
  }
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Analyze coverage for a single canvas node
 */
async function analyzeNodeCoverage(
  node: CanvasNode,
  rootDir: string
): Promise<NodeCoverage> {
  const filePaths = extractFilePaths(node);
  const instrumentedFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const path of filePaths) {
    const fullPath = resolve(rootDir, path);
    const exists = await fileExists(fullPath);

    if (!exists) {
      missingFiles.push(path);
      continue;
    }

    const instrumented = await hasInstrumentation(fullPath);
    if (instrumented) {
      instrumentedFiles.push(path);
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
 */
export async function analyzeCoverage(rootDir: string): Promise<CoverageMetrics> {
  const canvasFiles = await glob('**/*.otel.canvas', {
    cwd: rootDir,
    absolute: true,
    dot: true,
    ignore: ['**/node_modules/**']
  });

  const allNodeCoverage: NodeCoverage[] = [];

  for (const canvasFile of canvasFiles) {
    const content = await readFile(canvasFile, 'utf-8');
    const canvas: Canvas = JSON.parse(content);

    if (!canvas.nodes || canvas.nodes.length === 0) {
      continue;
    }

    for (const node of canvas.nodes) {
      const coverage = await analyzeNodeCoverage(node, rootDir);
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
    canvasFiles: canvasFiles.map(f => f.replace(rootDir + '/', ''))
  };
}
