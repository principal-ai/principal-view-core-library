#!/usr/bin/env bun

/**
 * Telemetry Coverage Measurement Script
 *
 * Measures observability coverage by:
 * 1. Parsing .otel.canvas files to find all nodes
 * 2. Mapping nodes to source files (via anchors/text)
 * 3. Checking which source files have OTEL instrumentation
 * 4. Calculating coverage: (instrumented canvas files / total canvas files) * 100
 */

import { readFile, access } from 'fs/promises';
import { relative, resolve } from 'path';
import { glob } from 'glob';

interface CanvasNode {
  id: string;
  text?: string;
  anchors?: Array<{ path?: string }>;
  [key: string]: any;
}

interface Canvas {
  nodes?: CanvasNode[];
  [key: string]: any;
}

interface NodeCoverage {
  nodeId: string;
  filePaths: string[];
  hasInstrumentation: boolean;
  instrumentedFiles: string[];
  missingFiles: string[];
}

interface CoverageMetrics {
  totalNodes: number;
  nodesWithFiles: number;
  nodesWithInstrumentation: number;
  coveragePercentage: number;
  nodeCoverage: NodeCoverage[];
  canvasFiles: string[];
}

/**
 * Extract file paths from a canvas node
 * REQUIRED: Nodes must have anchors with path property
 */
function extractFilePaths(node: CanvasNode, _rootDir: string): string[] {
  const paths = new Set<string>();

  // ONLY extract from anchors (required)
  if (node.anchors) {
    for (const anchor of node.anchors) {
      if (anchor.path) {
        paths.add(anchor.path);
      }
    }
  }

  return Array.from(paths);
}

/**
 * Check if a file has OpenTelemetry instrumentation
 */
async function hasInstrumentation(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');

    // Check for telemetry patterns
    const hasOtelImport = content.includes('@opentelemetry/api');
    const hasTracer = /getTracer|startSpan|addEvent/.test(content);
    const hasTestOtel = /['"]\.\.?\/.*test\/otel-setup['"]/.test(content);

    return hasOtelImport || hasTracer || hasTestOtel;
  } catch (error) {
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
  const filePaths = extractFilePaths(node, rootDir);
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
 * Generate coverage report from canvas files
 */
async function generateCoverageReport(rootDir: string): Promise<CoverageMetrics> {
  console.log('🔍 Finding .otel.canvas files...');
  const canvasFiles = await glob('**/*.otel.canvas', {
    cwd: rootDir,
    absolute: true,
    dot: true,  // Include hidden directories like .principal-views
    ignore: ['**/node_modules/**']
  });

  console.log(`📋 Found ${canvasFiles.length} canvas file(s)`);

  const allNodeCoverage: NodeCoverage[] = [];

  for (const canvasFile of canvasFiles) {
    console.log(`\n📊 Analyzing ${relative(rootDir, canvasFile)}...`);

    const content = await readFile(canvasFile, 'utf-8');
    const canvas: Canvas = JSON.parse(content);

    if (!canvas.nodes || canvas.nodes.length === 0) {
      console.log('   ⚠️  No nodes found in canvas');
      continue;
    }

    console.log(`   Found ${canvas.nodes.length} nodes`);

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
    canvasFiles: canvasFiles.map(f => relative(rootDir, f))
  };
}

/**
 * Print detailed coverage report
 */
function printReport(metrics: CoverageMetrics, _rootDir: string): void {
  console.log('\n' + '='.repeat(70));
  console.log('📈 TELEMETRY COVERAGE REPORT (Canvas-Based)');
  console.log('='.repeat(70));

  console.log(`\n📋 Canvas Files Analyzed: ${metrics.canvasFiles.length}`);
  metrics.canvasFiles.forEach(f => console.log(`   - ${f}`));

  console.log(`\n🎯 Node Summary:`);
  console.log(`   Total nodes: ${metrics.totalNodes}`);
  console.log(`   Nodes with anchors: ${metrics.nodesWithFiles}`);
  console.log(`   Nodes without anchors: ${metrics.totalNodes - metrics.nodesWithFiles}`);
  console.log(`   Nodes with instrumentation: ${metrics.nodesWithInstrumentation}`);
  console.log(`   Coverage: ${metrics.coveragePercentage.toFixed(1)}%`);

  // Nodes WITHOUT anchors (must be fixed first)
  const noAnchors = metrics.nodeCoverage.filter(n => n.filePaths.length === 0);
  if (noAnchors.length > 0) {
    console.log(`\n⚠️  Nodes Without Anchors (${noAnchors.length}) - MUST ADD ANCHORS:`);
    noAnchors.slice(0, 15).forEach(node => {
      console.log(`   - ${node.nodeId}`);
    });
    if (noAnchors.length > 15) {
      console.log(`   ... and ${noAnchors.length - 15} more`);
    }
  }

  // Nodes WITHOUT instrumentation (the gap)
  const uninstrumented = metrics.nodeCoverage.filter(
    n => n.filePaths.length > 0 && !n.hasInstrumentation
  );

  if (uninstrumented.length > 0) {
    console.log(`\n❌ Nodes Missing Instrumentation (${uninstrumented.length}):`);
    uninstrumented.slice(0, 10).forEach(node => {
      console.log(`\n   Node: ${node.nodeId}`);
      console.log(`   Files: ${node.filePaths.join(', ')}`);
    });
    if (uninstrumented.length > 10) {
      console.log(`\n   ... and ${uninstrumented.length - 10} more nodes`);
    }
  }

  // Nodes WITH instrumentation (success)
  const instrumented = metrics.nodeCoverage.filter(n => n.hasInstrumentation);
  if (instrumented.length > 0) {
    console.log(`\n✅ Nodes With Instrumentation (${instrumented.length}):`);
    instrumented.slice(0, 5).forEach(node => {
      console.log(`   - ${node.nodeId}: ${node.instrumentedFiles.join(', ')}`);
    });
    if (instrumented.length > 5) {
      console.log(`   ... and ${instrumented.length - 5} more`);
    }
  }

  // Nodes with missing files (warning)
  const withMissingFiles = metrics.nodeCoverage.filter(n => n.missingFiles.length > 0);
  if (withMissingFiles.length > 0) {
    console.log(`\n⚠️  Nodes Referencing Missing Files (${withMissingFiles.length}):`);
    withMissingFiles.slice(0, 5).forEach(node => {
      console.log(`   - ${node.nodeId}: ${node.missingFiles.join(', ')}`);
    });
  }

  console.log(`\n💡 Recommendations:`);
  if (noAnchors.length > 0) {
    console.log('   🔴 REQUIRED: Add anchors to canvas nodes before measuring coverage');
  } else if (metrics.coveragePercentage < 30) {
    console.log('   🔴 Low coverage - add OTEL instrumentation to files referenced in canvas');
  } else if (metrics.coveragePercentage < 60) {
    console.log('   🟡 Moderate coverage - continue instrumenting remaining nodes');
  } else {
    console.log('   🟢 Good coverage - maintain instrumentation quality');
  }

  console.log(`\n📝 Next Steps:`);
  if (noAnchors.length > 0) {
    console.log(`   1. Add anchors to ${noAnchors.length} node(s) without file references`);
    console.log(`   2. Example: { "id": "node-id", "anchors": [{ "path": "packages/core/src/File.ts" }] }`);
    console.log(`   3. Re-run: bun run coverage:telemetry`);
  } else if (uninstrumented.length > 0) {
    console.log(`   1. Review the ${uninstrumented.length} uninstrumented node(s) above`);
    console.log(`   2. Add OpenTelemetry spans to their source files`);
    console.log(`   3. Follow patterns from packages/core/src/rules/engine.ts`);
    console.log(`   4. Re-run: bun run coverage:telemetry`);
  } else {
    console.log(`   ✅ All canvas nodes have instrumentation!`);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

// Main execution
const rootDir = process.cwd();
const metrics = await generateCoverageReport(rootDir);
printReport(metrics, rootDir);

// Exit with code based on coverage threshold
const coverageThreshold = parseFloat(process.env.COVERAGE_THRESHOLD || '0');
if (metrics.coveragePercentage < coverageThreshold) {
  console.error(`❌ Coverage ${metrics.coveragePercentage.toFixed(1)}% below threshold ${coverageThreshold}%`);
  process.exit(1);
}
