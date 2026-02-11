# Coverage Tool: Implementation Layer Integration

## Overview

This document describes how to integrate the `ImplementationFileLayerModule` from `@principal-ai/codebase-composition` into the coverage tool to replace pattern-based implementation file detection with a more sophisticated, framework-aware approach.

## Current Implementation

### Pattern-Based Detection (Current)

Location: `packages/core/src/telemetry/coverage.ts`

```typescript
export const DEFAULT_IMPLEMENTATION_CONFIG: ImplementationFileConfig = {
  include: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js',
    'src/**/*.jsx',
    'src/**/*.py',
    'src/**/*.go',
    'lib/**/*.ts',
    'app/**/*.ts',
  ],
  exclude: [
    '**/*.test.*',
    '**/*.spec.*',
    '**/*.config.*',
    '**/*.d.ts',
    '**/dist/**',
    '**/build/**',
    '**/node_modules/**',
    '**/__tests__/**',
    '**/.next/**',
  ],
};

function isImplementationFile(filePath: string, config: ImplementationFileConfig): boolean {
  // Simple glob pattern matching
  // ...
}
```

**Limitations:**
- Simple pattern matching doesn't understand project structure
- Treats all packages the same way
- Can't distinguish between framework-specific patterns
- Doesn't understand monorepo boundaries
- Manual configuration required for edge cases

## Target: Implementation Layer Module

### What It Provides

Location: `/Users/griever/Developer/new-panels/codebase-composition/src/modules/ImplementationFileLayerModule.ts`

Package: `@principal-ai/codebase-composition@0.2.43`

**Capabilities:**
- ✅ **Package-aware**: Respects package boundaries in monorepos
- ✅ **Multi-language**: TypeScript, Python, Rust, Go, Java, C++, C#, etc.
- ✅ **Smart exclusions**: Understands test files, configs, type declarations, build files
- ✅ **Framework-specific**: Recognizes Vue, Svelte component files
- ✅ **Comprehensive patterns**:
  - Test files: `.test.*`, `.spec.*`, `test_*.py`, `*_test.go`
  - Test directories: `__tests__`, `test/`, `e2e/`, etc.
  - Config files: `.config.*`, `setup.py`, `conftest.py`, `package.json`, etc.
  - Build tooling: `Dockerfile`, `Makefile`, `build.rs`, etc.
  - Script directories: `scripts/`, `tools/`, `.github/`
- ✅ **Extension breakdown**: Provides statistics by file extension

### API

```typescript
import {
  ImplementationFileLayerModule,
  PackageLayerModule,
  FileSystemModule,
  NodeFileSystemAdapter
} from '@principal-ai/codebase-composition/node';

// 1. Build file tree
const fsModule = new FileSystemModule({
  directoryPath: '/path/to/project',
  buildFileSystemTree: async (path) => {
    const service = new FilesystemService(new NodeFileSystemAdapter());
    return await service.buildFileSystemTreeFromPath(path);
  }
});
const { fileSystemTree } = await fsModule.loadFileSystemTree();

// 2. Detect packages
const packageModule = new PackageLayerModule();
const packageLayers = await packageModule.createPackageLayers(fileSystemTree);

// 3. Get implementation files per package
const implModule = new ImplementationFileLayerModule();
const implLayers = implModule.createImplementationFileLayers(packageLayers, fileSystemTree);

// 4. Extract all implementation files
const allImplementationFiles = implLayers.flatMap(
  layer => layer.implementationData.implementationFiles
);
```

### Data Structure

```typescript
interface ImplementationFileLayer extends BaseLayer {
  type: 'implementation-files';

  implementationData: {
    sourcePackageId: string;          // PackageLayer ID
    packagePath: string;               // "packages/foo" or ""
    packageName: string;               // "@scope/package-name"
    implementationFiles: string[];     // Array of file paths
    fileCount: number;                 // Total count
    filesByExtension?: Record<string, number>;  // {".ts": 45, ".tsx": 12}
  };
}
```

## Integration Plan

### Phase 1: Parallel Implementation (Validation)

Add codebase-composition alongside current pattern-based approach to validate results.

```typescript
// packages/core/src/telemetry/coverage.ts

import {
  ImplementationFileLayerModule,
  PackageLayerModule,
  FileSystemModule
} from '@principal-ai/codebase-composition/node';

export interface CoverageOptions {
  // Existing
  config?: ImplementationFileConfig;

  // New: Use codebase-composition
  useImplementationLayer?: boolean;
}

export async function analyzeCoverage(
  fileTree: FileTree,
  fileReader: (path: string) => Promise<string>,
  options: CoverageOptions = {}
): Promise<CoverageMetrics> {
  let implementationFiles: Set<string>;

  if (options.useImplementationLayer) {
    // Use codebase-composition
    implementationFiles = await getImplementationFilesFromLayer(fileTree);
  } else {
    // Use pattern-based (current)
    implementationFiles = new Set(
      getImplementationFiles(fileTree, options.config || DEFAULT_IMPLEMENTATION_CONFIG)
    );
  }

  // Rest of coverage calculation remains the same
  // ...
}

async function getImplementationFilesFromLayer(fileTree: FileTree): Promise<Set<string>> {
  // Detect packages
  const packageModule = new PackageLayerModule();
  const packageLayers = await packageModule.createPackageLayers(fileTree);

  // Get implementation files
  const implModule = new ImplementationFileLayerModule();
  const implLayers = implModule.createImplementationFileLayers(packageLayers, fileTree);

  // Flatten to set of file paths
  const files = new Set<string>();
  for (const layer of implLayers) {
    for (const file of layer.implementationData.implementationFiles) {
      files.add(file);
    }
  }

  return files;
}
```

**CLI Flag:**
```bash
privu coverage --use-implementation-layer
```

### Phase 2: Make It Default

After validation, make implementation layer the default:

```typescript
export async function analyzeCoverage(
  fileTree: FileTree,
  fileReader: (path: string) => Promise<string>,
  options: CoverageOptions = {}
): Promise<CoverageMetrics> {
  // Default to true
  const useLayer = options.useImplementationLayer ?? true;

  const implementationFiles = useLayer
    ? await getImplementationFilesFromLayer(fileTree)
    : getImplementationFilesFromPatterns(fileTree, options.config);

  // ...
}
```

**CLI Flag (for fallback):**
```bash
privu coverage                          # Uses implementation layer (default)
privu coverage --use-patterns           # Falls back to pattern-based
```

### Phase 3: Remove Pattern-Based Code

Once validated and stable, remove the old pattern-based approach entirely.

## Benefits of Implementation Layer

### 1. **Monorepo Support**

Pattern-based:
```typescript
// Counts ALL .ts files matching patterns
// Doesn't understand package boundaries
// Can double-count files in nested packages
```

Implementation layer:
```typescript
// Respects package boundaries
// Correctly handles nested packages
// Each file belongs to exactly one package
```

### 2. **Framework Intelligence**

Pattern-based:
```typescript
// Must manually add .vue, .svelte to patterns
// Might miss framework-specific conventions
```

Implementation layer:
```typescript
// Automatically recognizes:
// - Vue components (.vue)
// - Svelte components (.svelte)
// - Framework-specific test patterns
```

### 3. **Test Detection**

Pattern-based:
```typescript
exclude: [
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**'
]
// Might miss: test_*.py, *_test.go, custom test dirs
```

Implementation layer:
```typescript
// Comprehensive test detection:
// - .test.ts, .spec.ts (JS/TS)
// - test_*.py (Python)
// - *_test.go (Go)
// - .test.rs (Rust)
// - __tests__, test/, e2e/, etc. (directories)
```

### 4. **Config Detection**

Pattern-based:
```typescript
exclude: [
  '**/*.config.*'
]
// Might miss: setup.py, conftest.py, Cargo.toml, go.mod
```

Implementation layer:
```typescript
// Recognizes config files by:
// - Pattern (.config.*)
// - Exact names (package.json, tsconfig.json)
// - Ecosystem-specific (setup.py, Cargo.toml, go.mod)
```

### 5. **Build Artifacts**

Pattern-based:
```typescript
exclude: [
  '**/dist/**',
  '**/build/**'
]
// Manual list, might miss framework-specific build dirs
```

Implementation layer:
```typescript
// Comprehensive exclusion:
// - dist/, build/, .next/, coverage/
// - Dockerfile, Makefile, build.rs
// - scripts/, tools/, .github/
```

## Enhanced Coverage Metrics

With implementation layer, we can provide richer metrics:

```typescript
interface CoverageMetrics {
  // Existing
  totalImplementationFiles: number;
  filesWithInstrumentation: number;
  coveragePercentage: number;

  // New: Per-package breakdown
  packageCoverage?: PackageCoverageMetrics[];
}

interface PackageCoverageMetrics {
  packageName: string;
  packagePath: string;
  totalFiles: number;
  filesWithInstrumentation: number;
  coveragePercentage: number;
  filesByExtension: Record<string, number>;
}
```

**CLI Output:**
```
🎯 Overall Coverage: 66.7%

📦 Package Breakdown:
   @myapp/core:
     Files: 45 (.ts: 40, .tsx: 5)
     Instrumented: 30
     Coverage: 66.7%

   @myapp/api:
     Files: 20 (.ts: 18, .py: 2)
     Instrumented: 15
     Coverage: 75.0%
```

## Migration Steps

### Step 1: Update Dependencies

```bash
cd packages/core
# Already has @principal-ai/codebase-composition@^0.2.41
# Update to latest:
bun add @principal-ai/codebase-composition@^0.2.43
```

### Step 2: Add Implementation Layer Support

```typescript
// packages/core/src/telemetry/coverage.ts

import {
  ImplementationFileLayerModule,
  PackageLayerModule,
  type ImplementationFileLayer
} from '@principal-ai/codebase-composition/node';

// Add function to get implementation files from layer
// (see Phase 1 code above)
```

### Step 3: Add CLI Flag

```typescript
// packages/cli/src/commands/coverage.ts

command
  .option('--use-implementation-layer', 'Use codebase-composition for file detection (experimental)')
  .option('--use-patterns', 'Use pattern-based file detection (legacy)')
```

### Step 4: Test on Multiple Projects

```bash
# Test on different project types
privu coverage --dir ~/typescript-monorepo --use-implementation-layer
privu coverage --dir ~/python-project --use-implementation-layer
privu coverage --dir ~/go-service --use-implementation-layer

# Compare with pattern-based
privu coverage --dir ~/typescript-monorepo --use-patterns
```

### Step 5: Make Default

After validation:
- Remove `--use-implementation-layer` flag (becomes default)
- Keep `--use-patterns` flag for backwards compatibility
- Update docs

### Step 6: Cleanup

After adoption period:
- Remove pattern-based code
- Remove `--use-patterns` flag
- Remove `ImplementationFileConfig` interface

## Testing Strategy

### Unit Tests

```typescript
// packages/core/src/telemetry/coverage.test.ts

describe('analyzeCoverage with implementation layer', () => {
  test('detects implementation files in monorepo packages', async () => {
    const fileTree = createMonorepoFileTree();
    const metrics = await analyzeCoverage(fileTree, mockReader, {
      useImplementationLayer: true
    });

    expect(metrics.packageCoverage).toHaveLength(2);
    expect(metrics.packageCoverage[0].packageName).toBe('@myapp/core');
  });

  test('excludes test files', async () => {
    const fileTree = createFileTree([
      'src/handler.ts',
      'src/handler.test.ts',
      'test/integration.test.ts'
    ]);

    const metrics = await analyzeCoverage(fileTree, mockReader, {
      useImplementationLayer: true
    });

    // Should only count src/handler.ts
    expect(metrics.totalImplementationFiles).toBe(1);
  });
});
```

### Integration Tests

Test against real projects:

```bash
# Create test fixture projects
tests/fixtures/
  typescript-monorepo/
  python-package/
  go-service/
  mixed-language/
```

Run coverage and assert:
- File counts match expectations
- Test files excluded
- Config files excluded
- Correct package boundaries

## Performance Considerations

### Caching

Implementation layer detection can be cached:

```typescript
// Cache implementation layers per project
const implLayerCache = new Map<string, ImplementationFileLayer[]>();

function getCachedImplementationFiles(
  projectPath: string,
  fileTree: FileTree
): Set<string> {
  const cacheKey = `${projectPath}-${fileTree.sha}`;

  if (implLayerCache.has(cacheKey)) {
    return flattenToFileSet(implLayerCache.get(cacheKey)!);
  }

  const layers = computeImplementationLayers(fileTree);
  implLayerCache.set(cacheKey, layers);
  return flattenToFileSet(layers);
}
```

### Incremental Updates

For watch mode or CI:

```typescript
// Only recompute if package structure changed
function hasPackageStructureChanged(
  oldTree: FileTree,
  newTree: FileTree
): boolean {
  // Check if package.json, Cargo.toml, go.mod, etc. changed
  const packageManifests = [
    'package.json',
    'Cargo.toml',
    'go.mod',
    'pyproject.toml'
  ];

  // Compare file tree
  // ...
}
```

## References

- Implementation Layer Module: `/Users/griever/Developer/new-panels/codebase-composition/src/modules/ImplementationFileLayerModule.ts`
- Package: `@principal-ai/codebase-composition@0.2.43`
- Current Coverage Tool: `packages/core/src/telemetry/coverage.ts`
- Documentation: `docs/coverage-tool.md`

## Timeline

- **Phase 1** (1-2 days): Add parallel implementation, test on multiple projects
- **Phase 2** (1 week): Make default, gather feedback, fix edge cases
- **Phase 3** (1 week): Remove pattern-based code after stability confirmation

## Success Metrics

- ✅ Works on TypeScript, Python, Go, Rust projects
- ✅ Correctly handles monorepos
- ✅ No false positives (test files, configs counted)
- ✅ No false negatives (implementation files missed)
- ✅ Performance acceptable (< 1s for typical projects)
- ✅ Per-package metrics provide value
