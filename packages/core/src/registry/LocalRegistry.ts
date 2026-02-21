/**
 * LocalRegistry - Browser-safe registry for local workspaces
 *
 * Features:
 * - Uses FileTree abstraction (browser-safe)
 * - No version registry lookups (uses FileTree directly)
 * - Cache invalidation via external triggers
 * - Supports multiple registered workspaces
 * - Auto-discovers scope names from library.yaml resources
 *
 * Note: File watching must be handled externally by calling invalidateCache()
 * when .principal-views files change.
 */

import type { FileTree, FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { StoryboardRegistryInterface } from '../types/registered-trace';
import type { VersionSnapshot } from '../types/version-registry';
import { CanvasDiscovery } from '../discovery/CanvasDiscovery';
import { LibraryDiscovery } from '../discovery/LibraryDiscovery';

/**
 * File reader function type
 */
export type FileReader = (path: string) => Promise<string>;

/**
 * Workspace registration
 */
interface WorkspaceRegistration {
  workspaceId: string;
  fileTree: FileTree;
  scopeNames: string[]; // All discovered scope names for this workspace
}

/**
 * Local registry for development mode
 */
export class LocalRegistry implements StoryboardRegistryInterface {
  private cache = new Map<string, VersionSnapshot>();
  private workspaces = new Map<string, WorkspaceRegistration>(); // workspaceId → registration
  private scopeToWorkspaceId = new Map<string, string>(); // scopeName → workspaceId
  private discovery: CanvasDiscovery;
  private libraryDiscovery: LibraryDiscovery | null = null;

  constructor(
    private fileReader: FileReader,
    fsAdapter?: FileSystemAdapter
  ) {
    this.discovery = new CanvasDiscovery();
    if (fsAdapter) {
      this.libraryDiscovery = new LibraryDiscovery(fsAdapter);
    }
  }

  /**
   * Register a local workspace
   *
   * Auto-discovers scope names from library.yaml resources section.
   * Each service in resources with a service.name becomes a scope name.
   *
   * File watching should be handled externally. When .principal-views files change,
   * call invalidateCache(scopeName) to rebuild the snapshot.
   *
   * @param fileTree - FileTree for the workspace
   * @returns Array of discovered scope names
   */
  async registerWorkspace(fileTree: FileTree): Promise<string[]> {
    const workspaceId = fileTree.metadata.id;

    // Check if already registered
    if (this.workspaces.has(workspaceId)) {
      console.log('[LocalRegistry] Workspace already registered:', workspaceId);
      const existing = this.workspaces.get(workspaceId)!;
      return existing.scopeNames;
    }

    // Auto-discover scope names from library.yaml
    const scopeNames = await this.discoverScopeNames(fileTree);

    if (scopeNames.length === 0) {
      console.warn('[LocalRegistry] No scope names discovered for workspace:', workspaceId);
      console.warn('[LocalRegistry] Make sure library.yaml has a resources section with service.name attributes');
    }

    // Register workspace
    this.workspaces.set(workspaceId, {
      workspaceId,
      fileTree,
      scopeNames,
    });

    // Map all scope names to this workspace
    for (const scopeName of scopeNames) {
      this.scopeToWorkspaceId.set(scopeName, workspaceId);
    }

    console.log('[LocalRegistry] Registered workspace:', {
      workspaceId,
      scopeNames,
      fileTreeSha: fileTree.sha,
    });

    return scopeNames;
  }

  /**
   * Unregister a workspace (cleanup)
   * @param workspaceId - Workspace ID (from fileTree.metadata.id)
   */
  unregisterWorkspace(workspaceId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return;
    }

    // Clear cache for all scope names
    for (const scopeName of workspace.scopeNames) {
      this.cache.delete(scopeName);
      this.scopeToWorkspaceId.delete(scopeName);
    }

    // Remove registration
    this.workspaces.delete(workspaceId);

    console.log('[LocalRegistry] Unregistered workspace:', {
      workspaceId,
      scopeNames: workspace.scopeNames,
    });
  }

  async lookupByScope(
    scope: { name: string; version: string },
    _resource: { attributes?: Record<string, unknown> }
  ): Promise<VersionSnapshot | null> {
    // Map scope name to workspace ID
    const workspaceId = this.scopeToWorkspaceId.get(scope.name);
    if (!workspaceId) {
      console.log('[LocalRegistry] No workspace registered for scope:', scope.name);
      return null;
    }

    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      console.error('[LocalRegistry] Workspace not found:', workspaceId);
      return null;
    }

    // Check cache first (cache by scope name for granularity)
    const cacheKey = scope.name;
    if (this.cache.has(cacheKey)) {
      console.log('[LocalRegistry] Cache hit:', cacheKey);
      return this.cache.get(cacheKey)!;
    }

    // Build VersionSnapshot from FileTree
    console.log('[LocalRegistry] Building snapshot from FileTree:', {
      scopeName: scope.name,
      workspaceId,
    });
    const snapshot = await this.buildFromFileTree(workspace.fileTree);

    // Cache it
    this.cache.set(cacheKey, snapshot);

    return snapshot;
  }

  /**
   * Auto-discover scope names from library.yaml files
   *
   * Uses LibraryDiscovery to find all library.yaml files across packages
   * and extract service.name from their resources sections.
   *
   * @param fileTree - FileTree to discover scope names from
   * @returns Array of discovered scope names (service.name values)
   */
  private async discoverScopeNames(fileTree: FileTree): Promise<string[]> {
    if (!this.libraryDiscovery) {
      console.warn('[LocalRegistry] No LibraryDiscovery available - provide FileSystemAdapter to constructor');
      return [];
    }

    try {
      const result = await this.libraryDiscovery.discover(fileTree, {
        fileReader: this.fileReader,
      });

      if (result.errors.length > 0) {
        console.warn('[LocalRegistry] Errors during library discovery:', result.errors);
      }

      console.log('[LocalRegistry] Discovered service names:', result.allServiceNames);
      return result.allServiceNames;
    } catch (error) {
      console.error('[LocalRegistry] Failed to discover scope names:', error);
      return [];
    }
  }

  /**
   * Build VersionSnapshot from FileTree using CanvasDiscovery
   */
  private async buildFromFileTree(fileTree: FileTree): Promise<VersionSnapshot> {
    // Use CanvasDiscovery to find all storyboards
    const discoveryResult = await this.discovery.discover(fileTree, {
      fileReader: this.fileReader,
      includeContent: true,
    });

    const snapshot: VersionSnapshot = {
      repositoryUrl: 'local',
      commitSha: fileTree.sha || 'dev',
      storyboards: discoveryResult.storyboards,
      registeredAt: new Date().toISOString(),
      metadata: {
        environment: 'development',
        isLocal: true,
      },
    };

    console.log('[LocalRegistry] Built snapshot from FileTree:', {
      sha: fileTree.sha,
      storyboards: discoveryResult.storyboards.length,
      errors: discoveryResult.errors.length,
    });

    return snapshot;
  }

  /**
   * Invalidate cache for a scope
   *
   * Call this when .principal-views files change to trigger rebuild on next lookup.
   * Debouncing should be handled by external file watcher if needed.
   */
  invalidateCache(scopeName: string): void {
    this.cache.delete(scopeName);
    console.log('[LocalRegistry] Cache invalidated:', scopeName);
  }

  async listScopes(): Promise<Array<{ name: string; versions: string[] }>> {
    const scopes: Array<{ name: string; versions: string[] }> = [];

    for (const workspace of this.workspaces.values()) {
      for (const scopeName of workspace.scopeNames) {
        scopes.push({
          name: scopeName,
          versions: ['dev'], // Local workspaces always use 'dev' version
        });
      }
    }

    return scopes;
  }

  supportsHotReload(): boolean {
    return true;
  }

  /**
   * Get list of registered workspaces
   */
  getRegisteredWorkspaces(): Array<{ scopeName: string; fileTreeSha: string }> {
    const workspaces: Array<{ scopeName: string; fileTreeSha: string }> = [];

    for (const workspace of this.workspaces.values()) {
      for (const scopeName of workspace.scopeNames) {
        workspaces.push({
          scopeName,
          fileTreeSha: workspace.fileTree.sha || 'unknown',
        });
      }
    }

    return workspaces;
  }

  /**
   * Cleanup: clear all state
   */
  destroy(): void {
    console.log('[LocalRegistry] Destroying and clearing state...');

    // Clear state
    this.workspaces.clear();
    this.cache.clear();
    this.discovery.clearCache();
  }
}
