# Browser Export Fix - Node.js Dependencies Issue

## Problem

The `@principal-ai/principal-view-core` package currently exports Node.js-specific code from its main entry point, causing webpack build errors in browser environments.

### Current Issue

The main export (`index.js`) includes:
- `analyzeCoverage` from `./telemetry/coverage` which uses:
  - `fs/promises` (Node.js file system)
  - `path` (Node.js path module)
  - `glob` package (which uses `node:url` and `node:string_decoder`)

When bundled by webpack for browser environments, this causes errors like:
```
ERROR in node:url
Module build failed: UnhandledSchemeError: Reading from "node:url" is not handled by plugins
```

### Why This Happens

The `glob` package (v11+) uses the new Node.js `node:` protocol syntax for imports:
- `import { fileURLToPath } from 'node:url'`
- `import { StringDecoder } from 'node:string_decoder'`

These are Node.js-specific modules that don't exist in browser environments.

## Comparison with alexandria-core-library

The `@principal-ai/alexandria-core-library` package handles this correctly:

### ✅ alexandria-core-library (Correct)
- **Main export (`index.js`)**: Only browser-safe code
- **Node.js code**: Isolated in `/node` export path
- **`node:` imports**: Only in `node-adapters/NodeFileSystemAdapter.js` which is NOT exported from main

### ❌ principal-view-core (Incorrect)
- **Main export (`index.js`)**: Includes Node.js-specific code (`analyzeCoverage`, file system operations, etc.)
- **Browser export (`browser.js`)**: Correctly excludes Node.js code (but packages import from main, not `/browser`)

## Solution

### Option 1: Fix the Main Export (Recommended)

Remove Node.js-specific exports from `packages/core/src/index.ts`:

```typescript
// REMOVE these exports from index.ts:
export { analyzeCoverage } from './telemetry/coverage';
export { ConfigurationLoader } from './ConfigurationLoader';
export { LibraryLoader } from './LibraryLoader';
// ... any other exports that use fs, path, glob, etc.

// These should ONLY be exported from a separate /node entry point
```

Create a new `/node` entry point in `packages/core/package.json`:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    },
    "./browser": {
      "types": "./dist/browser.d.ts",
      "import": "./dist/browser.js",
      "default": "./dist/browser.js"
    },
    "./node": {
      "types": "./dist/node.d.ts",
      "import": "./dist/node.js",
      "default": "./dist/node.js"
    }
  }
}
```

Create `packages/core/src/node.ts`:

```typescript
/**
 * @principal-ai/principal-view-core/node
 * Node.js-specific exports (require Node.js runtime)
 */

// Export Node.js-only functionality
export { analyzeCoverage } from './telemetry/coverage';
export { ConfigurationLoader } from './ConfigurationLoader';
export { LibraryLoader } from './LibraryLoader';
// ... other Node.js-specific exports
```

### Option 2: Fix Consuming Packages (Workaround)

Update packages that consume principal-view-core to use `/browser` export:

**vite.config.ts:**
```typescript
external: [
  '@principal-ai/principal-view-core/browser',  // NOT just '@principal-ai/principal-view-core'
]
```

**Source imports:**
```typescript
// Use this:
import type { ExtendedCanvas } from '@principal-ai/principal-view-core/browser';

// NOT this:
import type { ExtendedCanvas } from '@principal-ai/principal-view-core';
```

## Workaround Applied

**Package:** `@industry-theme/repository-composition-panels@0.2.45`

**Changes:**
1. Updated `vite.config.ts` to externalize `@principal-ai/principal-view-core/browser`
2. Updated dependency to `@principal-ai/principal-view-core@^0.11.8`
3. Source code already used `/browser` imports, vite config now respects that

**Result:** Webpack build no longer tries to bundle Node.js dependencies

## Webpack Fallback (Desktop App)

For the desktop app, we added a webpack plugin to handle `node:` protocol imports as a safety measure:

```typescript
new webpack.NormalModuleReplacementPlugin(
  /^node:/,
  (resource) => {
    resource.request = resource.request.replace(/^node:/, '');
  }
)
```

This strips the `node:` prefix so webpack can resolve them, but the proper fix is to not import Node.js code in browser bundles at all.

## Solution Implemented ✅

**BREAKING CHANGE - Version 0.12.0**

Option 1 has been implemented. The main export is now browser-safe, and Node.js-specific code has been moved to the `/node` export.

### Changes Made

1. **Created `/node` entry point** (`packages/core/src/node.ts`)
   - Contains all Node.js-specific exports (file system, code generation, rules engine, etc.)
   - Fully documented with clear usage instructions

2. **Updated main export** (`packages/core/src/index.ts`)
   - Now browser-safe (matches `/browser` export)
   - Removed all Node.js-specific exports
   - Added clear documentation about what was moved to `/node`

3. **Updated package.json**
   - Added `/node` export path
   - Bumped version to 0.12.0 (breaking change)
   - All three exports now available: `.`, `./browser`, `./node`

### Migration Guide

**For Browser Environments:**
```typescript
// Main export is now browser-safe - no changes needed if using default import
import { CanvasConverter, parseYaml, renderWorkflow } from '@principal-ai/principal-view-core';
```

**For Node.js Environments:**
```typescript
// BREAKING CHANGE: Node.js-specific imports must now use /node
// Old (will break in 0.12.0):
import { ConfigurationLoader, analyzeCoverage, LibraryLoader } from '@principal-ai/principal-view-core';

// New (required in 0.12.0+):
import { ConfigurationLoader, analyzeCoverage, LibraryLoader } from '@principal-ai/principal-view-core/node';

// You can also import browser-safe code from main export:
import { CanvasConverter } from '@principal-ai/principal-view-core';
```

### What Moved to `/node`

The following exports now require `@principal-ai/principal-view-core/node`:

- **Processing:** `EventProcessor`, `ValidationEngine`, `ConfigurationValidator`, `PathBasedEventProcessor`
- **Helpers:** `GraphInstrumentationHelper`, `PathMatcher`, `GraphConverter`
- **Telemetry:** `EventValidator`, `createValidatedEmitter`, `analyzeCoverage`
- **Code Generation:** `generateTypes`, `TypeScriptGenerator`, `generatorRegistry`
- **Utilities:** `traceToCanvas`, `traceToCanvasJson`
- **Session Management:** `SessionManager`, `EventRecorderService`
- **Loaders:** `ConfigurationLoader`, `LibraryLoader`, `ExecutionLoader`, `LibraryConverter`
- **Rules Engine:** All exports from `./rules`
- **Workflow Validator:** `WorkflowValidator`, `createWorkflowValidator`

### What Stays in Main Export (Browser-Safe)

- **Types:** All TypeScript types and interfaces
- **Canvas:** `CanvasConverter`, canvas types, `CanvasDiscovery`
- **YAML:** `parseYaml`, `isYamlFile`, `getConfigNameFromFilename`
- **Workflow Rendering:** `renderWorkflow`, `parseTemplate`, scenario matching functions
- **Execution Validation:** `ExecutionValidator`, `createExecutionValidator`

## Testing the Fix

```bash
# In principal-view-core
cd packages/core
bun run build

# Verify all exports built
ls packages/core/dist/ | grep -E "^(index|browser|node)\."
# Should show: index.js, browser.js, node.js (and .d.ts files)

# In consuming package
cd /path/to/consuming-package
bun install @principal-ai/principal-view-core@^0.12.0
bun run build

# Should build without Node.js module errors
```

## Related Files

- `packages/core/src/index.ts` - Main export (✅ browser-safe)
- `packages/core/src/browser.ts` - Browser-safe export (unchanged)
- `packages/core/src/node.ts` - Node.js-specific export (✅ new)
- `packages/core/package.json` - Export paths configuration (✅ updated)

## Version Information

- **principal-view-core:** 0.12.0 (breaking change implemented)
- **repository-composition-panels:** 0.2.45 (workaround applied)
- **Issue Date:** 2026-01-24
- **Fix Date:** 2026-01-24
