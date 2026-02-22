# Local Development Registry Design

**Date**: February 22, 2026
**Status**: ✅ Implemented (v0.24.21)
**Related**: MATCHING_REFACTOR_IMPLEMENTATION.md, LIBRARY_TELEMETRY_AND_MATCHING.md

---

## Overview

The registry must support two modes:

1. **Production Mode**: Published libraries with immutable schematics from remote registry
2. **Development Mode**: Local services with hot-reloading schematics from filesystem

---

## Owned Scopes

### Declaring Owned Scopes in library.yaml

Services declare which instrumentation scopes they own in the `resources` section of `library.yaml`:

```yaml
# .principal-views/library.yaml
version: "1.0.0"
name: "web-ade"

resources:
  web-ade:
    service.name: "web-ade"
    owned-scopes:
      - "auth-me"
      - "collections"
      - "tts-generation"

nodeComponents: {}
edgeComponents: {}
```

### What Are Owned Scopes?

Owned scopes are instrumentation scope names that belong to this service. They are used by custom tracers:

```typescript
// This creates spans under the "auth-me" scope
const tracer = trace.getTracer('auth-me');
const span = tracer.startSpan('auth.me');
```

### How LocalRegistry Uses Owned Scopes

When a workspace is registered, LocalRegistry:
1. Reads `library.yaml` to find all `owned-scopes`
2. Maps each owned scope to the workspace
3. When a trace arrives with scope `auth-me`, it looks up the workspace that owns it

```typescript
// LocalRegistry internals
interface WorkspaceRegistration {
  workspaceId: string;
  fileTree: FileTree;
  serviceNames: string[];  // From service.name
  ownedScopes: string[];   // From owned-scopes
}

// Scope → Workspace mapping
scopeToWorkspaceId: Map<string, string>
// "auth-me" → "web-ade-workspace-123"
// "collections" → "web-ade-workspace-123"
```

### Multiple Services, Multiple Scopes

A monorepo might have multiple services, each with their own scopes:

```yaml
# Service A
resources:
  frontend:
    service.name: "frontend"
    owned-scopes:
      - "ui-components"
      - "state-management"

# Service B
resources:
  backend:
    service.name: "backend"
    owned-scopes:
      - "auth-me"
      - "payment-processing"
```

---

## Workflow Scope Field

### Declaring Scope in Workflows

Workflows can declare which instrumentation scope they expect spans from:

```json
{
  "version": "1.0.0",
  "canvas": ".principal-views/auth-me/auth-me.otel.canvas",
  "spanPattern": "auth.me",
  "scope": "auth-me",
  "status": "implemented",
  "files": ["src/app/api/auth/me/route.ts"],
  "name": "Get Current User"
}
```

### Custom vs Auto-Instrumentation Scopes

**Use custom scopes** (recommended):
```json
{
  "spanPattern": "auth.me",
  "scope": "auth-me"
}
```

This matches spans created by your custom tracer:
```typescript
const tracer = trace.getTracer('auth-me');
const span = tracer.startSpan('auth.me');
```

**Avoid auto-instrumentation scopes** when possible:
```json
{
  "spanPattern": "GET /api/auth/me/route",
  "scope": "next.js"
}
```

Auto-instrumentation spans:
- Have framework-defined names that may change
- Don't have your custom events attached
- Are harder to match reliably

### Workflow Status and Files

Track implementation lifecycle:

| Status | Description | Files Required |
|--------|-------------|----------------|
| `draft` | Design phase | No |
| `approved` | Ready for implementation | Yes |
| `implemented` | Code exists | Yes (must exist on disk) |

```json
{
  "status": "implemented",
  "files": ["src/app/api/auth/me/route.ts"]
}
```

The CLI validates:
- `files` is required when status is `approved` or `implemented`
- Files must exist on disk when status is `implemented`

---

## Detection: How to Know if a Scope is Local

### Resource Attribute Flag

Add a resource attribute to indicate development mode:

```typescript
// In OTLP trace from local development
resource.attributes = {
  "dev.mode": true,                           // ← Development flag
  "dev.workspace.path": "/Users/dev/my-app",  // ← Local workspace root
  "service.name": "checkout-service",
  "repository.url": "github.com/acme/web-ade"
}

scope: {
  name: "checkout-service",
  version: "0.0.0-dev"  // ← Local version
}
```

### Detection Logic

```typescript
function isLocalDevelopment(resource: Resource, scope: Scope): boolean {
  // Check for dev mode flag
  if (resource.attributes['dev.mode'] === true) {
    return true;
  }

  // Check for local version patterns
  if (scope.version?.includes('-dev') ||
      scope.version?.includes('-local') ||
      scope.version === '0.0.0-dev') {
    return true;
  }

  return false;
}
```

---

## Registry Architecture: Composite Pattern

### Interface

```typescript
interface StoryboardRegistryInterface {
  /**
   * Lookup schematics by scope
   */
  lookupByScope(
    scope: { name: string; version: string },
    resource: Resource
  ): Promise<VersionSnapshot | null>;

  /**
   * Check if registry supports hot-reloading
   */
  supportsHotReload(): boolean;
}
```

### Implementation: Three Registry Types

#### 1. RemoteRegistry (Production)

```typescript
/**
 * RemoteRegistry - Calls web-ade API for published libraries
 *
 * Features:
 * - HTTP caching (immutable schematics)
 * - Handles PURL lookups
 * - Handles customerId + serviceName lookups
 */
class RemoteRegistry implements StoryboardRegistryInterface {
  constructor(
    private apiBaseUrl: string,  // e.g., "https://app.principal-ade.com"
    private cacheTTL: number = 60 * 60 * 1000  // 1 hour
  ) {}

  async lookupByScope(
    scope: { name: string; version: string },
    resource: Resource
  ): Promise<VersionSnapshot | null> {
    // Check if this is a library (PURL)
    if (scope.name.startsWith('pkg:')) {
      return this.lookupLibrary(scope.name, scope.version);
    }

    // Otherwise it's a service - need customerId
    const customerId = resource.attributes['customer.id'] as string;
    if (!customerId) {
      throw new Error('Service scope requires customer.id in resource attributes');
    }

    return this.lookupService(customerId, scope.name, scope.version);
  }

  private async lookupLibrary(purl: string, version: string) {
    // 1. Parse PURL to get package info
    const { ecosystem, namespace, name } = parsePURL(purl);

    // 2. Get repository URL from package registry
    const repoUrl = await this.getPackageRepository(ecosystem, namespace, name);

    // 3. Lookup version → commit hash
    const response = await fetch(
      `${this.apiBaseUrl}/api/versions/lookup?` +
      `repositoryUrl=${encodeURIComponent(repoUrl)}&version=${version}`
    );
    const { registration } = await response.json();

    // 4. Fetch schematic by commit hash
    return this.fetchSchematic(repoUrl, registration.gitSHA);
  }

  private async lookupService(customerId: string, serviceName: string, version: string) {
    // 1. Lookup version → commit hash
    const response = await fetch(
      `${this.apiBaseUrl}/api/versions/lookup?` +
      `customerId=${customerId}&serviceName=${serviceName}&version=${version}`
    );
    const { registration } = await response.json();

    // 2. Fetch schematic
    return this.fetchSchematic(registration.repositoryUrl, registration.gitSHA);
  }

  private async fetchSchematic(repoUrl: string, commitSha: string) {
    const response = await fetch(
      `${this.apiBaseUrl}/api/versions/schematic?` +
      `repositoryUrl=${encodeURIComponent(repoUrl)}&commitSha=${commitSha}`
    );

    return response.json();
  }

  supportsHotReload(): boolean {
    return false;  // Remote registry doesn't hot-reload
  }
}
```

#### 2. LocalRegistry (Development)

```typescript
/**
 * LocalRegistry - Watches local filesystem for .canvas files
 *
 * Features:
 * - File watching with hot-reload
 * - No version registry lookups (uses filesystem directly)
 * - Rebuilds VersionSnapshot on file changes
 */
class LocalRegistry implements StoryboardRegistryInterface {
  private watcher: FSWatcher | null = null;
  private cache = new Map<string, VersionSnapshot>();
  private workspacePaths = new Map<string, string>();  // scope.name → workspace path

  constructor() {
    // Will be configured per-workspace
  }

  /**
   * Register a local workspace for hot-reloading
   */
  registerWorkspace(scopeName: string, workspacePath: string): void {
    this.workspacePaths.set(scopeName, workspacePath);

    // Start watching .principal-views folder
    const principalViewsPath = path.join(workspacePath, '.principal-views');

    if (!this.watcher) {
      this.watcher = watch(principalViewsPath, { recursive: true });

      this.watcher.on('change', (filename) => {
        if (filename?.endsWith('.canvas') || filename?.endsWith('.otel.canvas')) {
          console.log('[LocalRegistry] File changed:', filename);
          // Invalidate cache for this workspace
          this.invalidateCache(scopeName);
        }
      });
    }
  }

  async lookupByScope(
    scope: { name: string; version: string },
    resource: Resource
  ): Promise<VersionSnapshot | null> {
    const workspacePath = this.getWorkspacePath(scope, resource);
    if (!workspacePath) {
      return null;  // Not a registered local workspace
    }

    // Check cache first
    const cacheKey = `${scope.name}@${scope.version}`;
    if (this.cache.has(cacheKey)) {
      console.log('[LocalRegistry] Cache hit:', cacheKey);
      return this.cache.get(cacheKey)!;
    }

    // Build VersionSnapshot from filesystem
    const snapshot = await this.buildFromFilesystem(workspacePath);

    // Cache it
    this.cache.set(cacheKey, snapshot);

    return snapshot;
  }

  private getWorkspacePath(scope: Scope, resource: Resource): string | null {
    // Check if workspace is explicitly registered
    if (this.workspacePaths.has(scope.name)) {
      return this.workspacePaths.get(scope.name)!;
    }

    // Check for workspace path in resource attributes
    const devWorkspace = resource.attributes['dev.workspace.path'] as string;
    if (devWorkspace) {
      this.registerWorkspace(scope.name, devWorkspace);
      return devWorkspace;
    }

    return null;
  }

  private async buildFromFilesystem(workspacePath: string): Promise<VersionSnapshot> {
    const principalViewsPath = path.join(workspacePath, '.principal-views');

    // Use CanvasDiscovery to find all canvases
    const discovery = new CanvasDiscovery();
    const result = await discovery.discover(principalViewsPath);

    // Build VersionSnapshot
    return {
      repositoryUrl: 'local',
      commitSha: 'dev',
      capturedAt: new Date().toISOString(),
      canvases: result.canvases,
      storyboards: result.storyboards,
      testTraces: result.testTraces || []
    };
  }

  private invalidateCache(scopeName: string): void {
    // Remove all cached entries for this scope
    for (const [key] of this.cache) {
      if (key.startsWith(scopeName + '@')) {
        this.cache.delete(key);
        console.log('[LocalRegistry] Cache invalidated:', key);
      }
    }
  }

  supportsHotReload(): boolean {
    return true;
  }

  destroy(): void {
    this.watcher?.close();
  }
}
```

#### 3. CompositeRegistry (Router)

```typescript
/**
 * CompositeRegistry - Routes between local and remote registries
 *
 * Decision logic:
 * 1. Check if scope is in local development mode
 * 2. If yes → use LocalRegistry
 * 3. If no → use RemoteRegistry
 */
class CompositeRegistry implements StoryboardRegistryInterface {
  constructor(
    private localRegistry: LocalRegistry,
    private remoteRegistry: RemoteRegistry
  ) {}

  async lookupByScope(
    scope: { name: string; version: string },
    resource: Resource
  ): Promise<VersionSnapshot | null> {
    // Check if this is local development
    if (this.isLocalDevelopment(resource, scope)) {
      console.log('[CompositeRegistry] Using LocalRegistry for:', scope.name);
      return this.localRegistry.lookupByScope(scope, resource);
    }

    // Use remote registry for published libraries/services
    console.log('[CompositeRegistry] Using RemoteRegistry for:', scope.name);
    return this.remoteRegistry.lookupByScope(scope, resource);
  }

  private isLocalDevelopment(resource: Resource, scope: Scope): boolean {
    // Check for dev.mode flag
    if (resource.attributes['dev.mode'] === true) {
      return true;
    }

    // Check for dev version patterns
    if (scope.version?.includes('-dev') ||
        scope.version?.includes('-local') ||
        scope.version === '0.0.0-dev') {
      return true;
    }

    // Check if workspace path is provided
    if (resource.attributes['dev.workspace.path']) {
      return true;
    }

    return false;
  }

  supportsHotReload(): boolean {
    return this.localRegistry.supportsHotReload();
  }
}
```

---

## Electron ADE Integration

### Setup in Electron Main Process

```typescript
import { CompositeRegistry, LocalRegistry, RemoteRegistry } from '@principal-ai/principal-view-core';

// In Electron main process
const remoteRegistry = new RemoteRegistry('https://app.principal-ade.com');
const localRegistry = new LocalRegistry();

// Register local workspaces (from user's open projects)
localRegistry.registerWorkspace('checkout-service', '/Users/dev/my-app');
localRegistry.registerWorkspace('payment-service', '/Users/dev/my-app/services/payment');

// Create composite registry
const registry = new CompositeRegistry(localRegistry, remoteRegistry);

// Use in trace converter
const traceConverter = new TraceConverter(registry);
```

### Auto-Detection from Workspace

When user opens a project in Electron ADE:

```typescript
// When workspace is opened
function onWorkspaceOpened(workspacePath: string) {
  // Read package.json or .principal-views/config
  const packageJson = require(path.join(workspacePath, 'package.json'));
  const serviceName = packageJson.name;

  // Register with local registry
  localRegistry.registerWorkspace(serviceName, workspacePath);

  console.log('[ADE] Registered local workspace:', {
    serviceName,
    workspacePath,
    hotReload: true
  });
}
```

---

## OTLP Instrumentation Changes

### Development Mode Flag

Services need to include dev mode in resource attributes:

```typescript
// In OpenTelemetry SDK setup (development only)
const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'checkout-service',

    // Development-specific attributes
    'dev.mode': true,
    'dev.workspace.path': process.cwd(),
    'repository.url': 'github.com/acme/web-ade'
  })
);

const sdk = new NodeSDK({
  resource,
  instrumentations: [/* ... */]
});
```

### Conditional Logic (Production vs Dev)

```typescript
// In application startup
const isDevelopment = process.env.NODE_ENV === 'development';

const resource = Resource.default().merge(
  new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'checkout-service',

    ...(isDevelopment && {
      'dev.mode': true,
      'dev.workspace.path': process.cwd()
    })
  })
);
```

---

## Benefits

### For Developers

1. **Instant Feedback**: Changes to .canvas files appear immediately in traces
2. **No Deployment Required**: Test workflows locally before publishing
3. **Multi-Project Support**: Multiple local services can be developed simultaneously
4. **Seamless Transition**: Same code works in dev and production (just resource attributes change)

### For Published Libraries

1. **Immutable**: Published library schematics never change (cached)
2. **Fast**: Remote lookups cached for 1 hour
3. **Reliable**: API-based lookup ensures consistency

---

## File Watching Performance

### Optimization Strategies

1. **Debouncing**: Wait 500ms after last change before rebuilding
2. **Selective Watching**: Only watch `.principal-views/` folder
3. **Incremental Builds**: Only rebuild changed storyboard
4. **Multi-Workspace**: Each workspace watches independently

```typescript
class LocalRegistry {
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  private invalidateCache(scopeName: string): void {
    // Clear existing timer
    if (this.debounceTimers.has(scopeName)) {
      clearTimeout(this.debounceTimers.get(scopeName)!);
    }

    // Set new timer (debounce 500ms)
    const timer = setTimeout(() => {
      this.cache.delete(scopeName);
      console.log('[LocalRegistry] Cache invalidated:', scopeName);
      this.debounceTimers.delete(scopeName);
    }, 500);

    this.debounceTimers.set(scopeName, timer);
  }
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('CompositeRegistry', () => {
  it('should use LocalRegistry for dev mode', async () => {
    const scope = { name: 'my-service', version: '0.0.0-dev' };
    const resource = { attributes: { 'dev.mode': true } };

    const result = await registry.lookupByScope(scope, resource);
    expect(result).toBeTruthy();
  });

  it('should use RemoteRegistry for published libraries', async () => {
    const scope = { name: 'pkg:npm/@acme/auth-lib', version: '2.1.0' };
    const resource = { attributes: {} };

    const result = await registry.lookupByScope(scope, resource);
    expect(result).toBeTruthy();
  });
});
```

### Integration Tests

```typescript
describe('LocalRegistry hot-reload', () => {
  it('should invalidate cache when .canvas file changes', async (done) => {
    const workspacePath = '/tmp/test-workspace';
    registry.registerWorkspace('test-service', workspacePath);

    // First lookup (builds cache)
    await registry.lookupByScope({ name: 'test-service', version: 'dev' }, {});

    // Modify canvas file
    fs.writeFileSync(
      path.join(workspacePath, '.principal-views/test.canvas'),
      '{"nodes": [], "edges": []}'
    );

    // Wait for file watcher
    setTimeout(() => {
      // Second lookup should rebuild
      registry.lookupByScope({ name: 'test-service', version: 'dev' }, {})
        .then(() => done());
    }, 1000);
  });
});
```

---

## Migration Path

### Phase 1: Implement Registry Types
- Implement `RemoteRegistry`
- Implement `LocalRegistry` with file watching
- Implement `CompositeRegistry`

### Phase 2: Electron Integration
- Wire up in Electron main process
- Auto-detect workspaces on project open
- Add UI indicator for local vs remote

### Phase 3: OTLP SDK Changes
- Update instrumentation to include dev mode flag
- Update example apps
- Document setup

---

## Open Questions

1. **Multi-Workspace Conflicts**: What if two local projects use the same scope name?
   - Solution: Use workspace path as disambiguator

2. **File Watch Limits**: What if user has many projects open?
   - Solution: Only watch active/focused workspace

3. **Cache Invalidation Timing**: Should we rebuild immediately or lazy-load?
   - Current: Lazy-load (rebuild on next lookup)
   - Alternative: Eager rebuild (rebuild immediately on change)

4. **Remote Registry Fallback**: If local lookup fails, should we try remote?
   - Current: No fallback
   - Alternative: Try remote as fallback (useful for hybrid scenarios)
