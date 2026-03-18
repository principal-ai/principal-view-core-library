# Canvas File Manifest Design

## Problem Statement

Currently, there is no canvas-level aggregation of files. To determine which files are associated with a canvas, consumers must:

1. Parse the canvas JSON
2. Iterate through all nodes
3. Extract files from various properties (`pv.otel.files`, `otel.files`, `pv.references`)
4. Handle different node types (JSON Canvas nodes vs OTEL nodes)

This creates friction for panels like **Code City** that need to:
- Know which files are "in scope" for a canvas
- Understand what type of association each file has (instrumentation vs reference)
- Map files back to the nodes that reference them

## Proposed Solution

Add a `CanvasFileManifest` type that provides a structured, aggregated view of all files associated with a canvas. This can be:
1. Computed on-demand via a utility function
2. Optionally included in `DiscoveredCanvasWithContent`

## Type Definitions

Add to `packages/core/src/discovery/types.ts`:

```typescript
/**
 * Classification of how a file relates to a canvas
 */
export type CanvasFileRole =
  | 'instrumentation'  // File contains OTEL instrumentation (from otel.files)
  | 'reference'        // External reference/documentation (from pv.references)
  | 'source'           // Legacy source file (from deprecated pv.sources)
  | 'canvas-file'      // JSON Canvas file node reference

/**
 * Origin of the file - internal to repo or external
 */
export type CanvasFileOrigin = 'internal' | 'external';

/**
 * A file referenced by one or more nodes in a canvas
 */
export interface CanvasFile {
  /** File path (relative to repo root for internal, URL/package ref for external) */
  path: string;

  /** How this file relates to the canvas */
  role: CanvasFileRole;

  /** Whether the file is in this repo or external */
  origin: CanvasFileOrigin;

  /** IDs of nodes that reference this file */
  nodeIds: string[];

  /** Node types that reference this file (for filtering) */
  nodeTypes: string[];
}

/**
 * Aggregated file manifest for a canvas
 *
 * Provides a structured view of all files associated with a canvas,
 * organized by role and with bidirectional node mapping.
 */
export interface CanvasFileManifest {
  /** Canvas ID this manifest belongs to */
  canvasId: string;

  /** Canvas path */
  canvasPath: string;

  /** All files, deduplicated and merged */
  files: CanvasFile[];

  /** Quick lookup by role */
  byRole: {
    instrumentation: CanvasFile[];
    reference: CanvasFile[];
    source: CanvasFile[];  // Legacy, may be empty
    'canvas-file': CanvasFile[];
  };

  /** Quick lookup by origin */
  byOrigin: {
    internal: CanvasFile[];
    external: CanvasFile[];
  };

  /**
   * Reverse mapping: file path -> node IDs
   * Useful for highlighting nodes when a file is selected
   */
  fileToNodes: Map<string, string[]>;

  /**
   * Reverse mapping: node ID -> file paths
   * Useful for finding files when a node is selected
   */
  nodeToFiles: Map<string, string[]>;

  /** Summary statistics */
  stats: {
    totalFiles: number;
    internalFiles: number;
    externalFiles: number;
    instrumentationFiles: number;
    referenceFiles: number;
    nodesWithFiles: number;
    nodesWithoutFiles: number;
  };
}

/**
 * Discovered canvas with content AND file manifest
 */
export interface DiscoveredCanvasWithManifest extends DiscoveredCanvasWithContent {
  /** Aggregated file manifest */
  manifest: CanvasFileManifest;
}
```

## Implementation

Add to `packages/core/src/discovery/CanvasFileManifest.ts`:

```typescript
import type {
  ExtendedCanvas,
  ExtendedCanvasNode,
  OtelNode
} from '../types/canvas';
import type {
  CanvasFileManifest,
  CanvasFile,
  CanvasFileRole,
  CanvasFileOrigin
} from './types';

/**
 * Check if node is an OTEL node type
 */
function isOtelNode(node: ExtendedCanvasNode): node is OtelNode {
  return node.type.startsWith('otel-');
}

/**
 * Extract files from a single node
 */
function extractNodeFiles(node: ExtendedCanvasNode): Array<{
  path: string;
  role: CanvasFileRole;
  origin: CanvasFileOrigin;
}> {
  const files: Array<{ path: string; role: CanvasFileRole; origin: CanvasFileOrigin }> = [];

  // Handle JSON Canvas file nodes
  if (node.type === 'file' && 'file' in node) {
    files.push({
      path: node.file,
      role: 'canvas-file',
      origin: 'internal'
    });
  }

  // Handle OTEL nodes (new format)
  if (isOtelNode(node) && node.otel) {
    const origin: CanvasFileOrigin = node.otel.origin ?? 'internal';

    // Instrumentation files
    if (node.otel.files) {
      for (const path of node.otel.files) {
        files.push({ path, role: 'instrumentation', origin });
      }
    }

    // References
    if (node.otel.references) {
      for (const path of node.otel.references) {
        files.push({ path, role: 'reference', origin: 'external' });
      }
    }
  }

  // Handle PV extension nodes (legacy/hybrid format)
  if ('pv' in node && node.pv) {
    const pv = node.pv;

    // OTEL files from pv.otel.files
    if (pv.otel?.files) {
      for (const path of pv.otel.files) {
        files.push({
          path,
          role: 'instrumentation',
          origin: 'internal'
        });
      }
    }

    // References from pv.references
    if (pv.references) {
      for (const path of pv.references) {
        // Determine origin based on path format
        const origin: CanvasFileOrigin =
          path.startsWith('http') || path.startsWith('@')
            ? 'external'
            : 'internal';
        files.push({ path, role: 'reference', origin });
      }
    }

    // Legacy sources (deprecated but still supported)
    if (pv.sources) {
      for (const path of pv.sources) {
        files.push({ path, role: 'source', origin: 'internal' });
      }
    }
  }

  return files;
}

/**
 * Build a file manifest from a canvas
 *
 * @param canvas - The parsed ExtendedCanvas
 * @param canvasId - Canvas identifier
 * @param canvasPath - Canvas file path
 * @returns Aggregated file manifest
 *
 * @example
 * ```typescript
 * const manifest = buildCanvasFileManifest(canvas, 'my-canvas', '.principal-views/my-canvas.otel.canvas');
 *
 * // Get all instrumentation files
 * const instrumentationFiles = manifest.byRole.instrumentation;
 *
 * // Find which nodes reference a specific file
 * const nodeIds = manifest.fileToNodes.get('src/api/checkout.ts');
 *
 * // Get all files for a specific node
 * const files = manifest.nodeToFiles.get('node-123');
 * ```
 */
export function buildCanvasFileManifest(
  canvas: ExtendedCanvas,
  canvasId: string,
  canvasPath: string
): CanvasFileManifest {
  const fileMap = new Map<string, CanvasFile>();
  const fileToNodes = new Map<string, string[]>();
  const nodeToFiles = new Map<string, string[]>();

  let nodesWithFiles = 0;
  let nodesWithoutFiles = 0;

  for (const node of canvas.nodes ?? []) {
    const nodeFiles = extractNodeFiles(node);

    if (nodeFiles.length > 0) {
      nodesWithFiles++;
      nodeToFiles.set(node.id, nodeFiles.map(f => f.path));
    } else {
      nodesWithoutFiles++;
    }

    for (const { path, role, origin } of nodeFiles) {
      // Update fileToNodes mapping
      const existingNodes = fileToNodes.get(path) ?? [];
      if (!existingNodes.includes(node.id)) {
        existingNodes.push(node.id);
        fileToNodes.set(path, existingNodes);
      }

      // Update or create CanvasFile entry
      const existing = fileMap.get(path);
      if (existing) {
        // Merge: add node ID and type if not present
        if (!existing.nodeIds.includes(node.id)) {
          existing.nodeIds.push(node.id);
        }
        if (!existing.nodeTypes.includes(node.type)) {
          existing.nodeTypes.push(node.type);
        }
        // Role priority: instrumentation > reference > source > canvas-file
        const rolePriority: Record<CanvasFileRole, number> = {
          'instrumentation': 4,
          'reference': 3,
          'source': 2,
          'canvas-file': 1
        };
        if (rolePriority[role] > rolePriority[existing.role]) {
          existing.role = role;
        }
      } else {
        fileMap.set(path, {
          path,
          role,
          origin,
          nodeIds: [node.id],
          nodeTypes: [node.type]
        });
      }
    }
  }

  const files = Array.from(fileMap.values());

  // Build byRole lookup
  const byRole = {
    instrumentation: files.filter(f => f.role === 'instrumentation'),
    reference: files.filter(f => f.role === 'reference'),
    source: files.filter(f => f.role === 'source'),
    'canvas-file': files.filter(f => f.role === 'canvas-file')
  };

  // Build byOrigin lookup
  const byOrigin = {
    internal: files.filter(f => f.origin === 'internal'),
    external: files.filter(f => f.origin === 'external')
  };

  return {
    canvasId,
    canvasPath,
    files,
    byRole,
    byOrigin,
    fileToNodes,
    nodeToFiles,
    stats: {
      totalFiles: files.length,
      internalFiles: byOrigin.internal.length,
      externalFiles: byOrigin.external.length,
      instrumentationFiles: byRole.instrumentation.length,
      referenceFiles: byRole.reference.length,
      nodesWithFiles,
      nodesWithoutFiles
    }
  };
}
```

## Integration with CanvasDiscovery

Update `CanvasDiscovery.discover()` to optionally include manifests:

```typescript
// In DiscoveryOptions
export interface DiscoveryOptions {
  fileReader?: (path: string) => Promise<string>;
  includeContent?: boolean;

  /** When true, also builds file manifests (requires includeContent: true) */
  includeManifest?: boolean;
}

// In CanvasDiscovery.discover()
if (options?.includeManifest && options?.includeContent && content) {
  const manifest = buildCanvasFileManifest(
    content,
    canvas.id,
    canvas.path
  );
  return { ...canvas, content, manifest } as DiscoveredCanvasWithManifest;
}
```

## Usage in Code City Panel

```typescript
// In CodeCityPanel.tsx
import { buildCanvasFileManifest } from '@principal-ai/principal-view-core';

// When canvas is loaded
useEffect(() => {
  if (!scopesCanvasContent) return;

  const manifest = buildCanvasFileManifest(
    scopesCanvasContent,
    scopesCanvas?.id ?? 'unknown',
    scopesCanvas?.path ?? ''
  );

  // Now you have structured access to all files
  console.log('Instrumentation files:', manifest.byRole.instrumentation);
  console.log('Internal files:', manifest.byOrigin.internal);

  // Highlight files in the city
  const filesToHighlight = manifest.byRole.instrumentation.map(f => f.path);
  setHighlightedFiles(filesToHighlight);

}, [scopesCanvasContent]);

// When a node is selected in the canvas
const handleNodeSelect = (nodeId: string) => {
  const files = manifest.nodeToFiles.get(nodeId) ?? [];
  // Zoom to these files in the city
  zoomToFiles(files);
};

// When a file is selected in the city
const handleFileSelect = (filePath: string) => {
  const nodeIds = manifest.fileToNodes.get(filePath) ?? [];
  // Highlight these nodes in the canvas
  highlightNodes(nodeIds);
};
```

## Export from Package

Add to `packages/core/src/index.ts`:

```typescript
// File manifest utilities
export { buildCanvasFileManifest } from './discovery/CanvasFileManifest';
export type {
  CanvasFileManifest,
  CanvasFile,
  CanvasFileRole,
  CanvasFileOrigin,
  DiscoveredCanvasWithManifest
} from './discovery/types';
```

## Migration Notes

1. **No breaking changes** - This is additive functionality
2. **Backward compatible** - Handles both new OTEL nodes and legacy PV extension nodes
3. **Optional** - Consumers can choose to use `includeManifest` or call `buildCanvasFileManifest` directly

## Testing

Add tests in `packages/core/src/discovery/__tests__/CanvasFileManifest.test.ts`:

```typescript
describe('buildCanvasFileManifest', () => {
  it('extracts instrumentation files from otel nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [{
        id: 'node-1',
        type: 'otel-event',
        x: 0, y: 0, width: 100, height: 50,
        name: 'Test Event',
        otel: {
          files: ['src/api/handler.ts', 'src/api/utils.ts']
        }
      }]
    };

    const manifest = buildCanvasFileManifest(canvas, 'test', 'test.canvas');

    expect(manifest.stats.instrumentationFiles).toBe(2);
    expect(manifest.byRole.instrumentation).toHaveLength(2);
    expect(manifest.fileToNodes.get('src/api/handler.ts')).toEqual(['node-1']);
  });

  it('handles mixed node types', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node-1',
          type: 'otel-event',
          x: 0, y: 0, width: 100, height: 50,
          name: 'Event',
          otel: { files: ['src/event.ts'] }
        },
        {
          id: 'node-2',
          type: 'text',
          x: 0, y: 100, width: 100, height: 50,
          text: 'Legacy node',
          pv: {
            nodeType: 'action',
            otel: { files: ['src/action.ts'] },
            references: ['https://docs.example.com']
          }
        }
      ]
    };

    const manifest = buildCanvasFileManifest(canvas, 'test', 'test.canvas');

    expect(manifest.stats.totalFiles).toBe(3);
    expect(manifest.byOrigin.internal).toHaveLength(2);
    expect(manifest.byOrigin.external).toHaveLength(1);
  });

  it('merges duplicate file references', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'node-1',
          type: 'otel-event',
          x: 0, y: 0, width: 100, height: 50,
          name: 'Event 1',
          otel: { files: ['src/shared.ts'] }
        },
        {
          id: 'node-2',
          type: 'otel-event',
          x: 0, y: 100, width: 100, height: 50,
          name: 'Event 2',
          otel: { files: ['src/shared.ts'] }
        }
      ]
    };

    const manifest = buildCanvasFileManifest(canvas, 'test', 'test.canvas');

    expect(manifest.stats.totalFiles).toBe(1);
    expect(manifest.files[0].nodeIds).toEqual(['node-1', 'node-2']);
  });
});
```

## Future Enhancements

1. **File existence validation** - Check if internal files actually exist in the repo
2. **Glob pattern support** - Allow `otel.files` to contain glob patterns
3. **File change detection** - Track which manifest files changed between commits
4. **Scope filtering** - Filter manifest by OTEL scope or resource attributes
