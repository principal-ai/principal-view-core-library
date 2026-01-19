# Canvas Discovery Enhancement Request

**Component**: `packages/core/src/discovery/CanvasDiscovery.ts`
**Date**: 2026-01-19
**Status**: Proposed

## Issue

The `CanvasDiscovery` system currently only discovers canvas files that are located in `.principal-views` directories:

- ✅ `.principal-views/architecture.canvas` (root level)
- ✅ `packages/core/.principal-views/architecture.canvas` (package level)
- ✅ `apps/shiprail-cli/.principal-views/architecture.canvas` (apps level)

However, it does NOT discover canvas files that are placed directly in package directories:

- ❌ `apps/shiprail-cli/architecture.canvas` (package root - currently not discovered)
- ❌ `packages/core/architecture.canvas` (package root - currently not discovered)

## Current Behavior

From `CanvasDiscovery.ts:284-300`:

```typescript
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
```

This method **requires** the `.principal-views` directory to be present in the path.

## Requested Enhancement

The discovery system should support canvas files at the **package root level**, similar to how it handles `.otel.canvas` files in execution directories.

### Proposed Behavior

Allow canvas files to be discovered in these additional locations:

1. **Package root**: `apps/shiprail-cli/architecture.canvas`
2. **Package root**: `packages/core/system-overview.canvas`

These should be discovered with the same package context detection that currently works for files in `.principal-views`.

### Benefits

1. **Simpler structure**: Package-level architecture diagrams can live alongside the package code without nested directory structure
2. **Discoverability**: More intuitive for developers - `apps/foo/architecture.canvas` is easier to find than `apps/foo/.principal-views/architecture.canvas`
3. **Consistency**: Aligns with common patterns where packages have top-level documentation files (README.md, ARCHITECTURE.md, etc.)
4. **Flexibility**: Allows both patterns:
   - `.principal-views/` for collections of canvas files
   - Package root for single architectural overviews

## Implementation Suggestion

Update `isInCanvasDir()` to also check for canvas files at package boundaries:

```typescript
private isInCanvasDir(path: string): boolean {
  const parts = path.split('/');

  // Existing: Root .principal-views/file.canvas
  if (parts[0] === CanvasDiscovery.CANVAS_DIR && parts.length === 2) {
    return true;
  }

  // Existing: Package .principal-views/file.canvas
  if (parts.includes(CanvasDiscovery.CANVAS_DIR)) {
    const idx = parts.indexOf(CanvasDiscovery.CANVAS_DIR);
    return !parts.includes(CanvasDiscovery.EXECUTIONS_DIR, idx);
  }

  // NEW: Package root canvas files
  // Pattern: apps/foo/file.canvas or packages/foo/file.canvas
  const filename = parts[parts.length - 1];
  if (filename && this.isCanvasFile(filename)) {
    // Check if this is in a package directory
    // The package detection already happens in discoverCanvasFiles via findPackageForPath
    // So we just need to allow canvas files anywhere and let package detection handle context
    return true;
  }

  return false;
}

private isCanvasFile(filename: string): boolean {
  return filename.endsWith('.canvas') || filename.endsWith('.otel.canvas');
}
```

Or even simpler - just check for canvas file extension and let the existing package detection logic handle the rest:

```typescript
private isInCanvasDir(path: string): boolean {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];

  // Must be a canvas file
  if (!filename || !(filename.endsWith('.canvas') || filename.endsWith('.otel.canvas'))) {
    return false;
  }

  // Must NOT be in __executions__ directory (those are handled separately)
  if (parts.includes(CanvasDiscovery.EXECUTIONS_DIR)) {
    return false;
  }

  // Accept canvas files anywhere:
  // - .principal-views/file.canvas (existing pattern)
  // - packages/foo/.principal-views/file.canvas (existing pattern)
  // - apps/foo/architecture.canvas (NEW: package root)
  // - packages/bar/overview.canvas (NEW: package root)
  return true;
}
```

## Use Case Example

In an external project using Principal View (`shiprail-cli`), we created `apps/shiprail-cli/architecture.canvas` to document the CLI architecture. This file:

- ✅ Validates successfully with `npx @principal-ai/principal-view-cli validate`
- ✅ Has proper Principal View metadata (`pv` extensions)
- ✅ Has proper edge types from the component library
- ❌ Is not discovered by the canvas discovery system due to location

The current workaround requires moving it to `apps/shiprail-cli/.principal-views/architecture.canvas`, which:
- Requires creating a `.principal-views` directory for a single file
- Makes the architecture documentation less discoverable
- Doesn't align with common package documentation patterns

## Related Files

- **Discovery logic**: `packages/core/src/discovery/CanvasDiscovery.ts` (lines 284-326)
- **Type definitions**: `packages/core/src/discovery/types.ts`
- **Test file**: `packages/core/src/discovery/CanvasDiscovery.test.ts` (should be updated with new test cases)

## Test Cases to Add

```typescript
describe('CanvasDiscovery - Package Root Canvas Files', () => {
  it('should discover canvas files at package root', async () => {
    const fileTree = createMockFileTree([
      'apps/cli/architecture.canvas',
      'packages/core/system-overview.canvas',
    ]);

    const result = await discovery.discover(fileTree);

    expect(result.canvases).toHaveLength(2);
    expect(result.canvases[0].path).toBe('apps/cli/architecture.canvas');
    expect(result.canvases[1].path).toBe('packages/core/system-overview.canvas');
  });

  it('should detect package context for root-level canvas files', async () => {
    const fileTree = createMockFileTree([
      'packages/core/package.json',
      'packages/core/architecture.canvas',
    ]);

    const result = await discovery.discover(fileTree);

    expect(result.canvases[0].packageName).toBe('core');
    expect(result.canvases[0].scope).toBe('package');
  });
});
```

## Priority

Medium - This is a quality-of-life improvement that makes the discovery system more flexible and intuitive. The current workaround (using `.principal-views` directory) is functional but adds unnecessary directory nesting.

## Breaking Changes

None - This is purely additive. Existing canvas files in `.principal-views` directories will continue to work exactly as before.
