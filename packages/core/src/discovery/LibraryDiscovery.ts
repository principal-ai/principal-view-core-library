/**
 * Library Discovery System
 *
 * Discovers all library.yaml files across a monorepo's packages and loads their resources.
 * This is the package-aware equivalent of LibraryLoader.
 */

import type { FileTree, FileSystemAdapter } from '@principal-ai/repository-abstraction';
import { PackageLayerModule, type PackageLayer } from '@principal-ai/codebase-composition';
import { LibraryLoader } from '../LibraryLoader';
import type { ComponentLibrary } from '../types/library';

/**
 * Service with its owned scopes
 */
export interface ServiceWithScopes {
  /** Service name (from service.name attribute) */
  serviceName: string;

  /** Instrumentation scopes owned by this service */
  ownedScopes: string[];
}

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

  /** Services with their owned scopes */
  servicesWithScopes: ServiceWithScopes[];
}

/**
 * Result of library discovery
 */
export interface LibraryDiscoveryResult {
  /** All discovered libraries */
  libraries: DiscoveredLibrary[];

  /** All service names across all libraries */
  allServiceNames: string[];

  /**
   * Mapping from instrumentation scope name to owning service name
   *
   * Used to route spans from owned scopes to the correct service's storyboards.
   * For example: { "auth-me": "web-ade", "checkout": "web-ade" }
   */
  scopeToServiceMap: Map<string, string>;

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
   * @returns Discovery result with libraries, service names, and errors
   */
  async discover(
    fileTree: FileTree,
    options?: {
      fileReader?: (path: string) => Promise<string>;
    }
  ): Promise<LibraryDiscoveryResult> {
    const { fileReader } = options || {};
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
          // Extract service names and owned scopes from resources
          const { serviceNames, servicesWithScopes } = this.extractServicesInfo(loadResult.library);

          libraries.push({
            path: loadResult.path,
            packageName: pkg.packageData.name,
            packagePath: pkg.packageData.path,
            library: loadResult.library,
            serviceNames,
            servicesWithScopes,
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
      const rootPath = fileTree.root.path;
      const hasRootLibrary = await this.loader.hasLibrary(rootPath);

      if (hasRootLibrary) {
        const loadResult = await this.loader.load(rootPath);

        if (loadResult.success && loadResult.library) {
          const { serviceNames, servicesWithScopes } = this.extractServicesInfo(loadResult.library);

          // Check if we already loaded this from a package
          const alreadyLoaded = libraries.some(lib => lib.path === loadResult.path);

          if (!alreadyLoaded) {
            libraries.push({
              path: loadResult.path,
              packageName: 'root',
              packagePath: rootPath,
              library: loadResult.library,
              serviceNames,
              servicesWithScopes,
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

    // 5. Build scope to service mapping
    const scopeToServiceMap = new Map<string, string>();
    for (const lib of libraries) {
      for (const service of lib.servicesWithScopes) {
        // Map the service name to itself (service names are also valid scope names)
        scopeToServiceMap.set(service.serviceName, service.serviceName);

        // Map each owned scope to its owning service
        for (const scope of service.ownedScopes) {
          scopeToServiceMap.set(scope, service.serviceName);
        }
      }
    }

    // 6. Sort libraries by package name
    libraries.sort((a, b) => a.packageName.localeCompare(b.packageName));

    return {
      libraries,
      allServiceNames,
      scopeToServiceMap,
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
   * Extract service names and owned scopes from a library's resources
   */
  private extractServicesInfo(library: ComponentLibrary): {
    serviceNames: string[];
    servicesWithScopes: ServiceWithScopes[];
  } {
    if (!library.resources) {
      return { serviceNames: [], servicesWithScopes: [] };
    }

    const serviceNames: string[] = [];
    const servicesWithScopes: ServiceWithScopes[] = [];

    for (const attrs of Object.values(library.resources)) {
      const serviceName = attrs['service.name'];
      if (!serviceName) continue;

      serviceNames.push(serviceName);

      // Extract owned-scopes (defaults to empty array)
      const ownedScopes = attrs['owned-scopes'] || [];

      servicesWithScopes.push({
        serviceName,
        ownedScopes: Array.isArray(ownedScopes) ? ownedScopes : [],
      });
    }

    return { serviceNames, servicesWithScopes };
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
