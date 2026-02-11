/**
 * Telemetry Coverage Analysis
 *
 * Measures observability coverage by analyzing which implementation files
 * contain the OpenTelemetry events documented in canvas nodes.
 *
 * Uses codebase-composition's ImplementationFileLayerModule for accurate,
 * framework-aware detection of implementation files.
 */

import type { FileTree } from '@principal-ai/repository-abstraction';
import { CanvasDiscovery } from '../discovery/CanvasDiscovery';
import type { DiscoveredCanvasWithContent } from '../discovery/types';
import type { ExtendedCanvasNode } from '../types/canvas';
import {
  ImplementationFileLayerModule,
  PackageLayerModule,
  type ImplementationFileLayer,
} from '@principal-ai/codebase-composition';

/**
 * Per-file instrumentation details
 */
export interface FileInstrumentation {
  filePath: string;
  expectedEvents: string[];      // Events that should be in this file (from canvas)
  foundEvents: string[];         // Events actually found in the file
  instrumentationCount: number;  // foundEvents.length (for heat map)
  hasInstrumentation: boolean;   // instrumentationCount > 0
  missingEvents: string[];       // expectedEvents - foundEvents
  isImplementationFile: boolean; // Whether this file matches implementation patterns
}

/**
 * Overall coverage metrics (file-based)
 */
export interface CoverageMetrics {
  // File-based coverage
  totalImplementationFiles: number;
  filesWithInstrumentation: number;
  coveragePercentage: number;

  // Per-file details (for heat map and debugging)
  fileCoverage: FileInstrumentation[];

  // Canvas metadata
  canvasFiles: string[];

  // Summary stats
  totalExpectedEvents: number;
  totalFoundEvents: number;

  // Per-package breakdown
  packageCoverage: PackageCoverageMetrics[];
}

/**
 * Per-package coverage metrics
 */
export interface PackageCoverageMetrics {
  packageName: string;
  packagePath: string;
  totalFiles: number;
  filesWithInstrumentation: number;
  coveragePercentage: number;
  filesByExtension: Record<string, number>;
}

/**
 * Extract event name from a canvas node
 */
function getEventName(node: ExtendedCanvasNode): string | null {
  return node.pv?.event?.name || null;
}

/**
 * Extract instrumentation file paths from a canvas node (pv.otel.files only)
 */
function getInstrumentationFiles(node: ExtendedCanvasNode): string[] {
  // Only check pv.otel.files - explicit instrumentation locations
  return node.pv?.otel?.files || [];
}

/**
 * Check if a file contains a specific event name (simple string match)
 */
async function fileContainsEvent(
  filePath: string,
  eventName: string,
  fileReader: (path: string) => Promise<string>
): Promise<boolean> {
  try {
    const content = await fileReader(filePath);
    return content.includes(eventName);
  } catch {
    return false;
  }
}

/**
 * Build a map of file -> expected events from canvas nodes
 */
async function buildFileEventMap(
  otelCanvases: DiscoveredCanvasWithContent[]
): Promise<Map<string, Set<string>>> {
  const fileEventMap = new Map<string, Set<string>>();

  for (const canvas of otelCanvases) {
    if (!canvas.content?.nodes || canvas.content.nodes.length === 0) {
      continue;
    }

    for (const node of canvas.content.nodes) {
      const eventName = getEventName(node);
      if (!eventName) continue;

      const files = getInstrumentationFiles(node);
      for (const file of files) {
        if (!fileEventMap.has(file)) {
          fileEventMap.set(file, new Set());
        }
        fileEventMap.get(file)!.add(eventName);
      }
    }
  }

  return fileEventMap;
}

/**
 * Analyze instrumentation for a single file
 */
async function analyzeFileInstrumentation(
  filePath: string,
  expectedEvents: string[],
  fileReader: (path: string) => Promise<string>,
  isImplFile: boolean
): Promise<FileInstrumentation> {
  const foundEvents: string[] = [];

  for (const eventName of expectedEvents) {
    const found = await fileContainsEvent(filePath, eventName, fileReader);
    if (found) {
      foundEvents.push(eventName);
    }
  }

  const missingEvents = expectedEvents.filter(e => !foundEvents.includes(e));

  return {
    filePath,
    expectedEvents,
    foundEvents,
    instrumentationCount: foundEvents.length,
    hasInstrumentation: foundEvents.length > 0,
    missingEvents,
    isImplementationFile: isImplFile,
  };
}

/**
 * Get implementation files using codebase-composition's ImplementationFileLayerModule
 * This provides accurate detection with framework-awareness and package boundaries
 */
async function getImplementationFilesFromLayer(
  fileTree: FileTree
): Promise<{ files: Set<string>; layers: ImplementationFileLayer[] }> {
  // Detect packages
  const packageModule = new PackageLayerModule();
  const packageLayers = await packageModule.discoverPackages(fileTree);

  // Get implementation files per package
  const implModule = new ImplementationFileLayerModule();
  const implLayers = implModule.createImplementationFileLayers(packageLayers, fileTree);

  // Flatten to set of file paths
  const files = new Set<string>();
  for (const layer of implLayers) {
    for (const file of layer.implementationData.implementationFiles) {
      files.add(file);
    }
  }

  return { files, layers: implLayers };
}

/**
 * Generate telemetry coverage report from canvas files
 *
 * Uses codebase-composition's ImplementationFileLayerModule for accurate,
 * framework-aware detection of implementation files.
 *
 * @param fileTree - FileTree representation of the codebase
 * @param fileReader - Function to read file contents
 * @returns Coverage metrics based on file instrumentation
 *
 * @example
 * ```typescript
 * import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';
 * import { readFile } from 'fs/promises';
 * import { resolve } from 'path';
 *
 * const service = new FilesystemService(new NodeFileSystemAdapter());
 * const fileTree = await service.buildFileSystemTreeFromPath('/path/to/project');
 * const fileReader = async (path: string) => readFile(resolve('/path/to/project', path), 'utf-8');
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
  const otelCanvases = result.canvases.filter(c => c.type === 'otel') as DiscoveredCanvasWithContent[];

  // Build map of file -> expected events from canvas
  const fileEventMap = await buildFileEventMap(otelCanvases);

  // Get all implementation files from the codebase using implementation layer
  const { files: implementationFiles, layers: implLayers } = await getImplementationFilesFromLayer(fileTree);

  // Get all files referenced in canvas (for coverage denominator)
  const referencedFiles = new Set(fileEventMap.keys());

  // Combine: we want to check all files referenced in canvas that are also implementation files
  const filesToCheck = new Set(
    [...referencedFiles].filter(f => implementationFiles.has(f))
  );

  // Analyze each file
  const fileCoverage: FileInstrumentation[] = [];

  for (const filePath of filesToCheck) {
    const expectedEvents = Array.from(fileEventMap.get(filePath) || []);
    const coverage = await analyzeFileInstrumentation(
      filePath,
      expectedEvents,
      fileReader,
      implementationFiles.has(filePath)
    );
    fileCoverage.push(coverage);
  }

  // Calculate metrics
  const filesWithInstrumentation = fileCoverage.filter(f => f.hasInstrumentation).length;
  const totalImplementationFiles = filesToCheck.size;
  const coveragePercentage = totalImplementationFiles > 0
    ? (filesWithInstrumentation / totalImplementationFiles) * 100
    : 0;

  const totalExpectedEvents = fileCoverage.reduce((sum, f) => sum + f.expectedEvents.length, 0);
  const totalFoundEvents = fileCoverage.reduce((sum, f) => sum + f.foundEvents.length, 0);

  // Calculate per-package metrics
  const packageCoverage: PackageCoverageMetrics[] = implLayers.map(layer => {
    const packageFiles = new Set(layer.implementationData.implementationFiles);
    const packageInstrumented = fileCoverage.filter(f =>
      packageFiles.has(f.filePath) && f.hasInstrumentation
    );

    return {
      packageName: layer.implementationData.packageName,
      packagePath: layer.implementationData.packagePath,
      totalFiles: layer.implementationData.fileCount,
      filesWithInstrumentation: packageInstrumented.length,
      coveragePercentage:
        layer.implementationData.fileCount > 0
          ? (packageInstrumented.length / layer.implementationData.fileCount) * 100
          : 0,
      filesByExtension: layer.implementationData.filesByExtension || {},
    };
  });

  return {
    totalImplementationFiles,
    filesWithInstrumentation,
    coveragePercentage,
    fileCoverage,
    canvasFiles: otelCanvases.map(c => c.path),
    totalExpectedEvents,
    totalFoundEvents,
    packageCoverage,
  };
}
