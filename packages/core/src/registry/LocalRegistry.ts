/**
 * LocalRegistry - Browser-safe registry for local workspaces
 *
 * Features:
 * - Uses FileTree abstraction (browser-safe)
 * - No version registry lookups (uses FileTree directly)
 * - Cache invalidation via external triggers
 * - Supports multiple registered workspaces
 *
 * Note: File watching must be handled externally by calling invalidateCache()
 * when .principal-views files change.
 */

import type { FileTree } from '@principal-ai/repository-abstraction';
import type { StoryboardRegistryInterface } from '../types/registered-trace';
import type { VersionSnapshot } from '../types/version-registry';
import { CanvasDiscovery } from '../discovery/CanvasDiscovery';

/**
 * File reader function type
 */
export type FileReader = (path: string) => Promise<string>;

/**
 * Workspace registration
 */
interface WorkspaceRegistration {
  scopeName: string;
  fileTree: FileTree;
}

/**
 * Local registry for development mode
 */
export class LocalRegistry implements StoryboardRegistryInterface {
  private cache = new Map<string, VersionSnapshot>();
  private workspaces = new Map<string, WorkspaceRegistration>();
  private discovery: CanvasDiscovery;

  constructor(private fileReader: FileReader) {
    this.discovery = new CanvasDiscovery();
  }

  /**
   * Register a local workspace
   *
   * File watching should be handled externally. When .principal-views files change,
   * call invalidateCache(scopeName) to rebuild the snapshot.
   *
   * @param scopeName - Scope name (e.g., "checkout-service")
   * @param fileTree - FileTree for the workspace
   */
  registerWorkspace(scopeName: string, fileTree: FileTree): void {
    // Check if already registered
    if (this.workspaces.has(scopeName)) {
      console.log('[LocalRegistry] Workspace already registered:', scopeName);
      return;
    }

    this.workspaces.set(scopeName, {
      scopeName,
      fileTree,
    });

    console.log('[LocalRegistry] Registered workspace:', {
      scopeName,
      fileTreeSha: fileTree.sha,
    });
  }

  /**
   * Unregister a workspace (cleanup)
   */
  unregisterWorkspace(scopeName: string): void {
    const workspace = this.workspaces.get(scopeName);
    if (!workspace) {
      return;
    }

    // Clear cache
    this.cache.delete(scopeName);

    // Remove registration
    this.workspaces.delete(scopeName);

    console.log('[LocalRegistry] Unregistered workspace:', scopeName);
  }

  async lookupByScope(
    scope: { name: string; version: string },
    resource: { attributes?: Record<string, unknown> }
  ): Promise<VersionSnapshot | null> {
    const workspace = this.workspaces.get(scope.name);
    if (!workspace) {
      return null; // Not a registered local workspace
    }

    // Check cache first
    const cacheKey = scope.name;
    if (this.cache.has(cacheKey)) {
      console.log('[LocalRegistry] Cache hit:', cacheKey);
      return this.cache.get(cacheKey)!;
    }

    // Build VersionSnapshot from FileTree
    console.log('[LocalRegistry] Building snapshot from FileTree:', scope.name);
    const snapshot = await this.buildFromFileTree(workspace.fileTree);

    // Cache it
    this.cache.set(cacheKey, snapshot);

    return snapshot;
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

    for (const [scopeName] of this.workspaces) {
      scopes.push({
        name: scopeName,
        versions: ['dev'], // Local workspaces always use 'dev' version
      });
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
      workspaces.push({
        scopeName: workspace.scopeName,
        fileTreeSha: workspace.fileTree.sha || 'unknown',
      });
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
