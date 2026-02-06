/**
 * Library Discovery System
 *
 * Discovers all library.yaml files across a monorepo's packages and loads their resources.
 * This is the package-aware equivalent of LibraryLoader.
 */

import type { FileTree, FileSystemAdapter } from '@principal-ai/repository-abstraction';
import { PackageLayerModule, type PackageLayer } from '@principal-ai/codebase-composition';
import { LibraryLoader } from '../LibraryLoader';
import type { ComponentLibrary, ResourceAttributes } from '../types/library';

/**
 * Discovered library with metadata
 */
export interface DiscoveredLibrary {
  /** Library file path */
  path: string;

  /** Package this library belongs to */
  packageName: string;

  /** Package path */
  packagePath: string;

  /** Loaded library content */
  library: ComponentLibrary;

  /** Service names from this library's resources */
  serviceNames: string[];
}

/**
 * Result of library discovery
 */
export interface LibraryDiscoveryResult {
  /** All discovered libraries */
  libraries: DiscoveredLibrary[];

  /** All service names across all libraries */
  allServiceNames: string[];

  /** Errors encountered during discovery */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Discovery system for finding and loading all library.yaml files in a monorepo
 *
 * @example
 * ```typescript
 * const discovery = new LibraryDiscovery(fsAdapter);
 * const result = await discovery.discover(fileTree);
 *
 * console.log('Found libraries:', result.libraries.length);
 * console.log('All services:', result.allServiceNames);
 * ```
 */
export class LibraryDiscovery {
  private static readonly CANVAS_DIR = '.principal-views';

  private packageModule: PackageLayerModule;
  private packageCache: Map<string, PackageLayer[]> = new Map();
  private loader: LibraryLoader;

  constructor(private fsAdapter: FileSystemAdapter) {
    this.packageModule = new PackageLayerModule();
    this.loader = new LibraryLoader(fsAdapter);
  }

  /**
   * Discover all library.yaml files in the file tree
   *
   * @param fileTree - FileTree from repository-abstraction
   * @param options - Discovery options
   * @param options.fileReader - Optional function to read file contents (for package.json parsing)
   * @param options.repositoryPath - Absolute path to repository root (required for correct path resolution)
   * @returns Discovery result with libraries, service names, and errors
   */
  async discover(
    fileTree: FileTree,
    options?: {
      fileReader?: (path: string) => Promise<string>;
      repositoryPath?: string;
    }
  ): Promise<LibraryDiscoveryResult> {
    const { fileReader, repositoryPath } = options || {};
    const errors: Array<{ path: string; error: string }> = [];
    const libraries: DiscoveredLibrary[] = [];

    // 1. Discover packages (with caching by fileTree.sha)
    const packages = await this.discoverPackagesWithCache(fileTree, fileReader);

    // 2. For each package, try to load its library.yaml
    for (const pkg of packages) {
      try {
        // Check if this package has a .principal-views directory
        const pvDir = this.fsAdapter.join(pkg.packageData.path, LibraryDiscovery.CANVAS_DIR);
        const pvDirExists = await this.fsAdapter.exists(pvDir);

        if (!pvDirExists) {
          continue; // No .principal-views directory, skip
        }

        // Try to load library from this package
        const loadResult = await this.loader.load(pkg.packageData.path);

        if (loadResult.success && loadResult.library) {
          // Extract service names from resources
          const serviceNames = this.extractServiceNames(loadResult.library);

          libraries.push({
            path: loadResult.path,
            packageName: pkg.packageData.name,
            packagePath: pkg.packageData.path,
            library: loadResult.library,
            serviceNames,
          });
        } else if (loadResult.error && !loadResult.error.includes('No library file found')) {
          // Only report errors that aren't "file not found" (which is normal)
          errors.push({
            path: loadResult.path,
            error: loadResult.error,
          });
        }
      } catch (error) {
        errors.push({
          path: pkg.packageData.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 3. Also check root directory for a library.yaml (non-package libraries)
    try {
      // Use provided repositoryPath, fallback to fileTree.path, or current directory
      const rootPath = repositoryPath || (fileTree as any).path || '.';
      const hasRootLibrary = await this.loader.hasLibrary(rootPath);

      if (hasRootLibrary) {
        const loadResult = await this.loader.load(rootPath);

        if (loadResult.success && loadResult.library) {
          const serviceNames = this.extractServiceNames(loadResult.library);

          // Check if we already loaded this from a package
          const alreadyLoaded = libraries.some(lib => lib.path === loadResult.path);

          if (!alreadyLoaded) {
            libraries.push({
              path: loadResult.path,
              packageName: 'root',
              packagePath: rootPath,
              library: loadResult.library,
              serviceNames,
            });
          }
        } else if (loadResult.error) {
          errors.push({
            path: loadResult.path,
            error: loadResult.error,
          });
        }
      }
    } catch (error) {
      // Ignore root library errors
    }

    // 4. Collect all service names
    const allServiceNames = libraries.flatMap(lib => lib.serviceNames);

    // 5. Sort libraries by package name
    libraries.sort((a, b) => a.packageName.localeCompare(b.packageName));

    return {
      libraries,
      allServiceNames,
      errors,
    };
  }

  /**
   * Clear package cache (useful when file tree changes)
   */
  clearCache(): void {
    this.packageCache.clear();
  }

  /**
   * Extract service names from a library's resources
   */
  private extractServiceNames(library: ComponentLibrary): string[] {
    if (!library.resources) {
      return [];
    }

    // resources is Record<string, ResourceAttributes>
    return Object.values(library.resources)
      .map(attrs => attrs['service.name'])
      .filter((name): name is string => !!name);
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
}
