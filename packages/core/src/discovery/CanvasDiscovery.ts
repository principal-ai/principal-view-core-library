/**
 * Unified discovery system for canvas and execution files in a package-aware way
 */

import type { FileTree } from '@principal-ai/repository-abstraction';
import { PackageLayerModule, type PackageLayer } from '@principal-ai/codebase-composition';
import type {
  DiscoveredCanvas,
  DiscoveredCanvasWithContent,
  DiscoveredExecution,
  DiscoveredExecutionWithContent,
  DiscoveredWorkflow,
  DiscoveredWorkflowWithContent,
  DiscoveredStoryboard,
  DiscoveredStoryboardWithContent,
  CanvasDiscoveryResult,
  DiscoveryOptions,
  CanvasType,
  ExecutionType,
} from './types';

/**
 * Unified discovery system for canvas and execution files in a package-aware way
 *
 * @example
 * // Basic usage without content parsing
 * const discovery = new CanvasDiscovery();
 * const result = await discovery.discover(fileTree);
 *
 * @example
 * // With content parsing (CLI)
 * const result = await discovery.discover(fileTree, {
 *   fileReader: async (path) => fs.promises.readFile(path, 'utf-8'),
 *   includeContent: true
 * });
 *
 * @example
 * // With content parsing (panels)
 * const result = await discovery.discover(fileTree, {
 *   fileReader: async (path) => context.getSlice('fileCache').read(path),
 *   includeContent: true
 * });
 */
export class CanvasDiscovery {
  private static readonly CANVAS_DIR = '.principal-views';
  private static readonly EXECUTIONS_DIR = '__executions__';
  private static readonly WORKFLOW_EXTENSION = '.workflow.json';

  private packageModule: PackageLayerModule;
  private packageCache: Map<string, PackageLayer[]> = new Map();

  constructor() {
    this.packageModule = new PackageLayerModule();
  }

  /**
   * Discover all canvas and execution files in the file tree
   *
   * @param fileTree - FileTree from repository-abstraction
   * @param options - Discovery options (fileReader, includeContent)
   * @returns Discovery result with canvases, executions, storyboards, and errors
   */
  async discover(
    fileTree: FileTree,
    options: DiscoveryOptions = {}
  ): Promise<CanvasDiscoveryResult> {
    const errors: Array<{ path: string; error: string }> = [];
    const warnings: Array<{ path: string; message: string; type: 'deprecation' }> = [];

    // 1. Discover packages (with caching by fileTree.sha)
    const packages = await this.discoverPackagesWithCache(fileTree, options.fileReader);

    // 2. Build package lookup map for efficient path matching
    const packageMap = this.buildPackageMap(packages);

    // 3. Discover canvas files
    const canvases = await this.discoverCanvasFiles(fileTree, packageMap, options, errors);

    // 4. Discover execution files
    const executions = await this.discoverExecutionFiles(fileTree, packageMap, options, errors);

    // 5. Discover storyboards (hierarchical organization)
    const storyboards = await this.discoverStoryboards(fileTree, packageMap, canvases, executions, options, errors);

    // 6. Detect legacy structures and add deprecation errors
    this.detectLegacyStructures(canvases, executions, storyboards, errors);

    // 7. Sort results
    canvases.sort(this.compareByPackageThenName);
    executions.sort(this.compareByPackageThenName);
    storyboards.sort(this.compareByPackageThenName);

    return { canvases, executions, storyboards, errors, warnings };
  }

  /**
   * Find canvas file for a given execution
   *
   * @param execution - Discovered execution
   * @param canvases - Array of discovered canvases (from discover())
   * @returns Matching canvas or null
   */
  findCanvasForExecution(
    execution: DiscoveredExecution,
    canvases: DiscoveredCanvas[]
  ): DiscoveredCanvas | null {
    // Find canvas with matching basename and scope
    return canvases.find(canvas =>
      canvas.basename === execution.canvasBasename &&
      canvas.scope === execution.scope &&
      canvas.packageName === execution.packageName
    ) || null;
  }

  /**
   * Find execution files for a given canvas
   *
   * @param canvas - Discovered canvas
   * @param executions - Array of discovered executions (from discover())
   * @returns Array of matching executions
   */
  findExecutionsForCanvas(
    canvas: DiscoveredCanvas,
    executions: DiscoveredExecution[]
  ): DiscoveredExecution[] {
    // Find all executions with matching basename and scope
    return executions.filter(execution =>
      execution.canvasBasename === canvas.basename &&
      execution.scope === canvas.scope &&
      execution.packageName === canvas.packageName
    );
  }

  /**
   * Clear package cache (useful when file tree changes)
   */
  clearCache(): void {
    this.packageCache.clear();
  }

  /**
   * Discover storyboards (hierarchical organization of canvas + workflows + executions)
   */
  private async discoverStoryboards(
    fileTree: FileTree,
    packageMap: Map<string, PackageLayer>,
    canvases: DiscoveredCanvas[],
    executions: (DiscoveredExecution | DiscoveredExecutionWithContent)[],
    options: DiscoveryOptions,
    errors: Array<{ path: string; error: string }>
  ): Promise<(DiscoveredStoryboard | DiscoveredStoryboardWithContent)[]> {
    const storyboards: (DiscoveredStoryboard | DiscoveredStoryboardWithContent)[] = [];

    // Build a map of directories to check for storyboards
    const storyboardDirs = new Map<string, Set<string>>();

    // Find all directories in .principal-views/ that have subdirectories
    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';
      const parts = path.split('/');

      // Look for paths like: .principal-views/storyboard-name/workflow-name/...
      // Or: packages/core/.principal-views/storyboard-name/workflow-name/...
      const pvIndex = parts.indexOf(CanvasDiscovery.CANVAS_DIR);
      if (pvIndex === -1 || parts.length < pvIndex + 3) continue;

      const storyboardName = parts[pvIndex + 1];
      const storyboardPath = parts.slice(0, pvIndex + 2).join('/');

      if (!storyboardDirs.has(storyboardPath)) {
        storyboardDirs.set(storyboardPath, new Set());
      }
      storyboardDirs.get(storyboardPath)!.add(storyboardName);
    }

    // For each potential storyboard directory, check if it has a canvas
    for (const [storyboardPath, storyboardNames] of storyboardDirs) {
      for (const storyboardName of storyboardNames) {
        // Skip __executions__ directory
        if (storyboardName === CanvasDiscovery.EXECUTIONS_DIR) continue;

        // Find canvas for this storyboard
        const storyboardCanvas = canvases.find(c => {
          const canvasDir = c.path.split('/').slice(0, -1).join('/');
          return canvasDir === storyboardPath && c.basename === storyboardName;
        });

        if (!storyboardCanvas) continue;

        // This is a storyboard! Now discover workflows
        const workflows = await this.discoverWorkflowsInStoryboard(
          fileTree,
          storyboardPath,
          storyboardName,
          packageMap,
          executions,
          options,
          errors
        );

        // Determine package context
        const packageInfo = this.findPackageForPath(storyboardPath, packageMap);

        // Generate unique ID
        const id = packageInfo
          ? `${packageInfo.packageData.name}/${storyboardName}`
          : storyboardName;

        // Create discovered storyboard
        const storyboard: DiscoveredStoryboard | DiscoveredStoryboardWithContent = {
          id,
          name: this.toDisplayName(storyboardName),
          path: storyboardPath,
          basename: storyboardName,
          canvas: storyboardCanvas,
          workflows,
          packageName: packageInfo?.packageData.name,
          packagePath: packageInfo?.packageData.path,
          scope: packageInfo ? 'package' : 'root',
        };

        storyboards.push(storyboard);
      }
    }

    return storyboards;
  }

  /**
   * Discover workflows within a storyboard folder
   */
  private async discoverWorkflowsInStoryboard(
    fileTree: FileTree,
    storyboardPath: string,
    storyboardName: string,
    packageMap: Map<string, PackageLayer>,
    executions: (DiscoveredExecution | DiscoveredExecutionWithContent)[],
    options: DiscoveryOptions,
    errors: Array<{ path: string; error: string }>
  ): Promise<(DiscoveredWorkflow | DiscoveredWorkflowWithContent)[]> {
    const workflows: (DiscoveredWorkflow | DiscoveredWorkflowWithContent)[] = [];

    // Find all workflow files in this storyboard
    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';

      // Check if file is in this storyboard
      if (!path.startsWith(storyboardPath + '/')) continue;

      // Check if it's a workflow file
      if (!path.endsWith(CanvasDiscovery.WORKFLOW_EXTENSION)) continue;

      // Extract workflow info
      const filename = path.split('/').pop();
      if (!filename) continue;

      const basename = filename.replace(CanvasDiscovery.WORKFLOW_EXTENSION, '');
      const workflowDir = path.split('/').slice(0, -1).join('/');

      // Determine package context
      const packageInfo = this.findPackageForPath(path, packageMap);

      // Generate unique ID
      const id = packageInfo
        ? `${packageInfo.packageData.name}/${storyboardName}/${basename}`
        : `${storyboardName}/${basename}`;

      // Find executions for this workflow (in the same directory as workflow.json)
      const workflowExecutions = executions.filter(e => {
        const execDir = e.path.split('/').slice(0, -1).join('/');
        return execDir === workflowDir;
      });

      // Create discovered workflow
      let workflow: DiscoveredWorkflow | DiscoveredWorkflowWithContent = {
        id,
        name: this.toDisplayName(basename),
        path,
        basename,
        storyboardId: packageInfo
          ? `${packageInfo.packageData.name}/${storyboardName}`
          : storyboardName,
        packageName: packageInfo?.packageData.name,
        packagePath: packageInfo?.packageData.path,
        scope: packageInfo ? 'package' : 'root',
        executions: workflowExecutions,
      };

      // Optionally load content
      if (options.includeContent && options.fileReader) {
        try {
          const content = await options.fileReader(path);
          const parsedContent = JSON.parse(content);
          workflow = { ...workflow, content: parsedContent } as DiscoveredWorkflowWithContent;
        } catch (error) {
          errors.push({
            path,
            error: `Failed to parse workflow content: ${(error as Error).message}`,
          });
        }
      }

      workflows.push(workflow);
    }

    return workflows;
  }

  /**
   * Discover packages with caching by fileTree SHA
   */
  private async discoverPackagesWithCache(
    fileTree: FileTree,
    fileReader?: (path: string) => Promise<string>
  ): Promise<PackageLayer[]> {
    const cacheKey = fileTree.sha;

    if (this.packageCache.has(cacheKey)) {
      return this.packageCache.get(cacheKey)!;
    }

    const packages = await this.packageModule.discoverPackages(fileTree, fileReader);
    this.packageCache.set(cacheKey, packages);

    return packages;
  }

  /**
   * Build package lookup map for efficient path matching
   */
  private buildPackageMap(packages: PackageLayer[]): Map<string, PackageLayer> {
    const map = new Map<string, PackageLayer>();

    for (const pkg of packages) {
      // Normalize package path for lookup (replace backslashes with forward slashes)
      const normalizedPath = pkg.packageData.path.replace(/\\/g, '/');
      map.set(normalizedPath, pkg);
    }

    return map;
  }

  /**
   * Discover canvas files in the file tree
   */
  private async discoverCanvasFiles(
    fileTree: FileTree,
    packageMap: Map<string, PackageLayer>,
    options: DiscoveryOptions,
    errors: Array<{ path: string; error: string }>
  ): Promise<DiscoveredCanvas[]> {
    const canvases: DiscoveredCanvas[] = [];

    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';

      // Check if in .principal-views directory
      if (!this.isInCanvasDir(path)) continue;

      // Extract canvas metadata
      const metadata = this.parseCanvasPath(path);
      if (!metadata) continue;

      // Determine package context
      const packageInfo = this.findPackageForPath(path, packageMap);

      // Generate unique ID
      const id = packageInfo
        ? `${packageInfo.packageData.name}/${metadata.basename}`
        : metadata.basename;

      // Create discovered canvas
      const canvas: DiscoveredCanvas = {
        id,
        name: this.toDisplayName(metadata.basename),
        path,
        basename: metadata.basename,
        type: metadata.type,
        packageName: packageInfo?.packageData.name,
        packagePath: packageInfo?.packageData.path,
        scope: packageInfo ? 'package' : 'root',
      };

      // Optionally load content
      if (options.includeContent && options.fileReader) {
        try {
          const content = await options.fileReader(path);
          const parsedContent = JSON.parse(content);

          // Cast to DiscoveredCanvasWithContent when adding content
          const canvasWithContent = canvas as DiscoveredCanvasWithContent;
          canvasWithContent.content = parsedContent;

          // Extract markdown path from canvas pv metadata if it exists
          if (parsedContent.pv?.markdown) {
            canvas.markdownPath = parsedContent.pv.markdown;
          }
        } catch (error) {
          errors.push({
            path,
            error: `Failed to parse canvas content: ${(error as Error).message}`,
          });
        }
      }

      canvases.push(canvas);
    }

    return canvases;
  }

  /**
   * Discover execution files in the file tree
   */
  private async discoverExecutionFiles(
    fileTree: FileTree,
    packageMap: Map<string, PackageLayer>,
    options: DiscoveryOptions,
    errors: Array<{ path: string; error: string }>
  ): Promise<(DiscoveredExecution | DiscoveredExecutionWithContent)[]> {
    const executions: (DiscoveredExecution | DiscoveredExecutionWithContent)[] = [];

    for (const file of fileTree.allFiles) {
      const path = file.relativePath || file.path || '';

      // Check if in __executions__ directory
      if (!this.isInExecutionsDir(path)) continue;

      // Extract execution metadata
      const metadata = this.parseExecutionPath(path);
      if (!metadata) continue;

      // Determine package context
      const packageInfo = this.findPackageForPath(path, packageMap);

      // Generate unique ID
      const id = packageInfo
        ? `${packageInfo.packageData.name}/${metadata.basename}`
        : metadata.basename;

      // Create discovered execution
      let execution: DiscoveredExecution | DiscoveredExecutionWithContent = {
        id,
        name: this.toDisplayName(metadata.basename),
        path,
        basename: metadata.basename,
        type: metadata.type,
        canvasBasename: metadata.canvasBasename,
        packageName: packageInfo?.packageData.name,
        packagePath: packageInfo?.packageData.path,
        scope: packageInfo ? 'package' : 'root',
      };

      // Optionally load content
      if (options.includeContent && options.fileReader) {
        try {
          const content = await options.fileReader(path);
          execution = { ...execution, content: JSON.parse(content) } as DiscoveredExecutionWithContent;
        } catch (error) {
          errors.push({
            path,
            error: `Failed to parse execution content: ${(error as Error).message}`,
          });
        }
      }

      executions.push(execution);
    }

    return executions;
  }

  /**
   * Check if path is in .principal-views directory
   */
  private isInCanvasDir(path: string): boolean {
    const parts = path.split('/');

    // Root: .principal-views/file.canvas
    if (parts[0] === CanvasDiscovery.CANVAS_DIR && parts.length === 2) {
      return true;
    }

    // Package: packages/core/.principal-views/file.canvas
    if (parts.includes(CanvasDiscovery.CANVAS_DIR)) {
      const idx = parts.indexOf(CanvasDiscovery.CANVAS_DIR);
      // Ensure it's not in __executions__ subdirectory
      return !parts.includes(CanvasDiscovery.EXECUTIONS_DIR, idx);
    }

    return false;
  }

  /**
   * Parse canvas file path to extract metadata
   */
  private parseCanvasPath(path: string): { basename: string; type: CanvasType } | null {
    const filename = path.split('/').pop();
    if (!filename) return null;

    // Check for .otel.canvas first (must come before .canvas check)
    if (filename.endsWith('.otel.canvas')) {
      return {
        basename: filename.replace(/\.otel\.canvas$/, ''),
        type: 'otel',
      };
    }

    // Check for .canvas (but not .otel.canvas)
    if (filename.endsWith('.canvas')) {
      return {
        basename: filename.replace(/\.canvas$/, ''),
        type: 'regular',
      };
    }

    return null;
  }

  /**
   * Check if path is in __executions__ directory
   */
  private isInExecutionsDir(path: string): boolean {
    const parts = path.split('/');

    // Must contain __executions__ directory
    if (!parts.includes(CanvasDiscovery.EXECUTIONS_DIR)) return false;

    // Valid patterns:
    // 1. .principal-views/__executions__/file.otel.json
    // 2. packages/core/.principal-views/__executions__/file.otel.json
    // 3. __executions__/file.otel.json (root level)

    return true;
  }

  /**
   * Parse execution file path to extract metadata
   * Only .otel.json files are supported
   */
  private parseExecutionPath(path: string): {
    basename: string;
    type: ExecutionType;
    canvasBasename: string;
  } | null {
    const filename = path.split('/').pop();
    if (!filename) return null;

    // Pattern: name.otel.json
    const match = filename.match(/^(.+)\.otel\.json$/);
    if (match) {
      const basename = match[1];
      return {
        basename,
        type: 'otel',
        canvasBasename: basename, // Same as basename for linking
      };
    }

    return null;
  }

  /**
   * Find package for a given path using longest-path matching
   */
  private findPackageForPath(
    path: string,
    packageMap: Map<string, PackageLayer>
  ): PackageLayer | null {
    // Find the longest matching package path
    let bestMatch: PackageLayer | null = null;
    let bestMatchLength = 0;

    for (const [pkgPath, pkg] of packageMap) {
      if (path.startsWith(pkgPath + '/')) {
        if (pkgPath.length > bestMatchLength) {
          bestMatch = pkg;
          bestMatchLength = pkgPath.length;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Convert basename to display name (Title Case)
   */
  private toDisplayName(basename: string): string {
    return basename
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Sort by package then name
   */
  private compareByPackageThenName(
    a: DiscoveredCanvas | DiscoveredExecution | DiscoveredStoryboard,
    b: DiscoveredCanvas | DiscoveredExecution | DiscoveredStoryboard
  ): number {
    // Package files first, then root
    if (a.packageName && !b.packageName) return -1;
    if (!a.packageName && b.packageName) return 1;

    // If both have packages, sort by package name
    if (a.packageName && b.packageName) {
      const pkgCompare = a.packageName.localeCompare(b.packageName);
      if (pkgCompare !== 0) return pkgCompare;
    }

    // Within same package/root, sort by name
    return a.name.localeCompare(b.name);
  }

  /**
   * Detect legacy flat structures and add deprecation errors
   */
  private detectLegacyStructures(
    canvases: DiscoveredCanvas[],
    executions: (DiscoveredExecution | DiscoveredExecutionWithContent)[],
    storyboards: (DiscoveredStoryboard | DiscoveredStoryboardWithContent)[],
    errors: Array<{ path: string; error: string }>
  ): void {
    // Build a set of storyboard canvas IDs for quick lookup
    const storyboardCanvasIds = new Set(storyboards.map(s => s.canvas.id));

    // Build a set of execution IDs that are part of storyboards
    const storyboardExecutionIds = new Set<string>();
    for (const storyboard of storyboards) {
      for (const workflow of storyboard.workflows) {
        for (const execution of workflow.executions) {
          storyboardExecutionIds.add(execution.id);
        }
      }
    }

    // Check for legacy flat canvases (not part of any storyboard)
    for (const canvas of canvases) {
      if (!storyboardCanvasIds.has(canvas.id)) {
        // This is a legacy flat canvas
        const canvasDir = canvas.path.split('/').slice(0, -1).join('/');
        const parts = canvasDir.split('/');
        const pvIndex = parts.indexOf(CanvasDiscovery.CANVAS_DIR);

        // Only error if it's directly in .principal-views/ (flat structure)
        if (pvIndex !== -1 && parts.length === pvIndex + 1) {
          errors.push({
            path: canvas.path,
            error: 'DEPRECATED: Legacy flat canvas structure is no longer supported. Migrate to the storyboard structure immediately. See migration guide at docs/MIGRATION_GUIDE.md for details.',
          });
        }
      }
    }

    // Check for legacy executions in __executions__/ directory
    for (const execution of executions) {
      if (!storyboardExecutionIds.has(execution.id)) {
        // Check if this execution is in __executions__/ directory
        if (execution.path.includes(`/${CanvasDiscovery.EXECUTIONS_DIR}/`)) {
          errors.push({
            path: execution.path,
            error: 'DEPRECATED: Legacy __executions__/ directory is no longer supported. Migrate executions to workflow folders within storyboards immediately. See migration guide at docs/MIGRATION_GUIDE.md for details.',
          });
        }
      }
    }
  }
}
