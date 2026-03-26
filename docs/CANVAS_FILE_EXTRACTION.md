# Canvas File Extraction

This document clarifies the different file-related fields on canvas nodes and proposes centralized utilities for extracting them.

## Field Definitions

Canvas nodes have two distinct file-related concepts:

### `pv.otel.files` (or `otel.files` on OTEL node types)

**Purpose:** Instrumentation locations - the specific files where this OTEL event/span is implemented.

**Used for:**
- Telemetry coverage analysis (does the event exist in the code?)
- Code navigation (jump to instrumentation)
- Validation (do the files exist?)

**Example:**
```json
{
  "pv": {
    "otel": {
      "files": ["src/app/api/auth/callback/route.ts"]
    }
  }
}
```

### `pv.references` (or `otel.references` on OTEL node types)

**Purpose:** Auxiliary references - documentation, external packages, related resources.

**Used for:**
- Documenting external dependencies (`@logfire/pydantic-ai`)
- Linking to documentation URLs
- Cross-referencing related code that isn't the instrumentation site
- Grounding draft nodes that don't have implementation locations yet

**Example:**
```json
{
  "pv": {
    "references": [
      "@logfire/pydantic-ai",
      "https://docs.pydantic.dev/logfire/"
    ]
  }
}
```

## Current Problem

The `buildOtelHighlightLayers.ts` in web-ade treats `references` as a fallback for `files`:

```ts
// web-ade/src/lib/otel-coverage/buildOtelHighlightLayers.ts
function getOtelFiles(node: ExtendedCanvasNode): string[] {
  if (node.pv?.otel?.files?.length > 0) return node.pv.otel.files;
  if (node.pv?.references?.length > 0) {
    // Filter to file paths only
    return node.pv.references.filter(ref => !ref.startsWith('http') && ...);
  }
  return [];
}
```

This conflates two different concepts and leads to incorrect behavior when:
- A node has references to external packages but no local files
- A node has documentation URLs in references
- A node has both files AND references (references get ignored)

## Proposed Solution

### 1. Separate Extraction Functions

Add to `@principal-ai/principal-view-core`:

```ts
// In packages/core/src/utils/nodeFiles.ts

/**
 * Get instrumentation file paths from a canvas node.
 * These are the files where the event/span is implemented.
 */
export function getInstrumentationFiles(node: ExtendedCanvasNode): string[] {
  // OTEL node types have top-level otel field
  if (isOtelNode(node)) {
    return node.otel?.files ?? [];
  }
  // Legacy/text nodes use pv.otel.files
  return node.pv?.otel?.files ?? [];
}

/**
 * Get auxiliary references from a canvas node.
 * These are documentation, external packages, and related resources.
 */
export function getReferences(node: ExtendedCanvasNode): string[] {
  if (isOtelNode(node)) {
    return node.otel?.references ?? [];
  }
  return node.pv?.references ?? [];
}

/**
 * Get all file paths associated with a canvas node.
 * Combines instrumentation files and file-path references (not URLs/packages).
 *
 * Use this for UI display (showing related files) but NOT for coverage analysis.
 */
export function getAllRelatedFiles(node: ExtendedCanvasNode): string[] {
  const instrFiles = getInstrumentationFiles(node);
  const refs = getReferences(node);

  // Filter references to only file paths
  const fileRefs = refs.filter(ref =>
    !ref.startsWith('http') &&
    !ref.startsWith('@') &&
    (ref.includes('/') || ref.endsWith('.ts') || ref.endsWith('.tsx'))
  );

  // Dedupe and combine
  return [...new Set([...instrFiles, ...fileRefs])];
}
```

### 2. Use Cases

| Use Case | Function to Use |
|----------|----------------|
| Coverage analysis | `getInstrumentationFiles()` |
| "Jump to implementation" | `getInstrumentationFiles()` |
| File existence validation | `getInstrumentationFiles()` |
| Show related files in UI | `getAllRelatedFiles()` |
| File City highlighting (selected canvas) | `getAllRelatedFiles()` |
| Show external references | `getReferences()` |

### 3. Migration

1. Add new utilities to `@principal-ai/principal-view-core`
2. Update `web-ade/src/lib/otel-coverage/buildOtelHighlightLayers.ts` to use the new functions
3. Update `electron-app` to use the new functions for canvas file display
4. Deprecate inline extraction logic in consumers

## Open Questions

1. Should `getAllRelatedFiles()` include files from child nodes (for canvas-level aggregation)?
2. Should we add a `getExternalPackages()` helper that filters references to `@scope/package` patterns?
3. How should workflow.json scenario files factor in? They have their own `files` arrays.
