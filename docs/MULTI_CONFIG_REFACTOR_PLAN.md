# Multi-Config Architecture Refactor Plan

## Overview
Refactor Visual Validation Framework to support **multiple graph configurations** stored in `.vgc/` folder, using the **adapter pattern** for environment-agnostic file operations.

---

## Phase 1: Repository Abstraction Updates

### 1.1 Move FileSystemAdapter to repository-abstraction
**Location**: `/Users/griever/Developer/repository-abstraction`

**Tasks**:
- [ ] Create `src/adapters/FileSystemAdapter.ts` interface
- [ ] Create `src/adapters/NodeFileSystemAdapter.ts` implementation
- [ ] Create `src/adapters/InMemoryFileSystemAdapter.ts` for testing
- [ ] Export adapters from main `index.ts`
- [ ] Add tests for adapters
- [ ] Update package version
- [ ] Publish to npm (or ensure workspace linking works)

**Interface to add**:
```typescript
export interface FileSystemAdapter {
  // File operations
  exists(path: string): boolean;
  readFile(path: string): string;
  readDir(path: string): string[];
  isDirectory(path: string): boolean;

  // Path operations
  join(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string, ext?: string): string;
  extname(path: string): string;
}
```

---

## Phase 2: Visual Validation Core Library Updates

### 2.1 Add repository-abstraction dependency
**Files**: `packages/core/package.json`

**Tasks**:
- [ ] Add `@principal-ai/repository-abstraction` to dependencies
- [ ] Install dependencies (`bun install`)

### 2.2 Create ConfigurationLoader utility
**New file**: `packages/core/src/ConfigurationLoader.ts`

**Features**:
```typescript
export class ConfigurationLoader {
  constructor(private fsAdapter: FileSystemAdapter) {}

  // Scan .vgc/ folder for all YAML files
  loadAll(baseDir: string): ConfigurationLoadResult;

  // Load specific config by name
  loadByName(name: string, baseDir: string): ConfigurationFile;

  // List available config names
  listConfigurations(baseDir: string): string[];

  // Check if .vgc/ exists
  hasConfigDirectory(baseDir: string): boolean;
}
```

**Returns**:
```typescript
interface ConfigurationFile {
  name: string;           // e.g., "architecture"
  path: string;          // e.g., ".vgc/architecture.yaml"
  config: PathBasedGraphConfiguration;
}

interface ConfigurationLoadResult {
  configs: ConfigurationFile[];
  errors: Array<{ file: string; error: string }>;
}
```

### 2.3 Add YAML parsing support
**New file**: `packages/core/src/utils/YamlParser.ts`

**Tasks**:
- [ ] Add `js-yaml` dependency
- [ ] Create parser utility
- [ ] Add error handling for invalid YAML
- [ ] Support both .yaml and .yml extensions

### 2.4 Update core types
**File**: `packages/core/src/types/index.ts`

**Tasks**:
- [ ] Remove any single-config assumptions
- [ ] Add multi-config types if needed
- [ ] Keep existing types backward compatible

### 2.5 Update exports
**File**: `packages/core/src/index.ts`

**Tasks**:
- [ ] Export `ConfigurationLoader`
- [ ] Export configuration-related types
- [ ] Export `FileSystemAdapter` re-export from repository-abstraction

### 2.6 Update tests
**Files**: `packages/core/src/__tests__/ConfigurationLoader.test.ts` (new)

**Tasks**:
- [ ] Create tests using `InMemoryFileSystemAdapter`
- [ ] Test loading multiple configs
- [ ] Test error handling (missing .vgc, invalid YAML, etc.)
- [ ] Test loading by name
- [ ] Test listing configurations

---

## Phase 3: Documentation Updates

### 3.1 Update CONFIGURATION_REFERENCE.md
**File**: `docs/CONFIGURATION_REFERENCE.md`

**Changes**:
- [ ] Replace all `vvf.config.yaml` with `.vgc/` folder structure
- [ ] Update file location section (lines 19-32)
- [ ] Add examples of multiple configs
- [ ] Add section on naming conventions
- [ ] Update all examples to show folder structure

**New structure**:
```yaml
your-project/
  .vgc/                    ← Configuration folder
    ├── architecture.yaml  ← System architecture graph
    ├── data-flow.yaml     ← Data flow graph
    └── deployment.yaml    ← Deployment topology
  src/
  package.json
```

### 3.2 Update PATH_BASED_ASSOCIATION.md
**File**: `docs/PATH_BASED_ASSOCIATION.md`

**Changes**:
- [ ] Update all config file references
- [ ] Update examples to use `.vgc/` folder
- [ ] Show how different graphs can track different aspects

### 3.3 Update PANEL_INTEGRATION_PLAN.md
**File**: `docs/PANEL_INTEGRATION_PLAN.md`

**Changes**:
- [ ] Update ConfigLoader implementation (lines 260-329)
- [ ] Show multi-config selector UI
- [ ] Update file watching for `.vgc/` folder
- [ ] Remove "future enhancement" for multiple configs (it's now core)

### 3.4 Update IMPLEMENTATION_MILESTONES.md
**File**: `docs/IMPLEMENTATION_MILESTONES.md`

**Changes**:
- [ ] Update all examples to use `.vgc/` folder
- [ ] Add note about multi-config as core feature

### 3.5 Update MANUAL_LAYOUT_GUIDE.md
**File**: `docs/MANUAL_LAYOUT_GUIDE.md`

**Changes**:
- [ ] Update config file references
- [ ] Show examples in `.vgc/` context

### 3.6 Update main README.md
**File**: `README.md`

**Changes**:
- [ ] Update usage examples
- [ ] Show ConfigurationLoader usage
- [ ] Update file structure diagrams

### 3.7 Update package READMEs
**Files**: `packages/core/README.md`, `packages/react/README.md`

**Changes**:
- [ ] Update examples to use `.vgc/` folder
- [ ] Show ConfigurationLoader API
- [ ] Add adapter pattern documentation

---

## Phase 4: React Package Updates

### 4.1 Update GraphRenderer for multi-config
**File**: `packages/react/src/components/GraphRenderer.tsx`

**Changes**:
- [ ] Ensure component works with any config (already should)
- [ ] Add optional `configName` prop for identification
- [ ] No breaking changes needed (config is already passed in)

### 4.2 Create ConfigurationSelector component (optional)
**New file**: `packages/react/src/components/ConfigurationSelector.tsx`

**Features**:
```typescript
interface ConfigurationSelectorProps {
  configurations: ConfigurationFile[];
  selectedConfig: string;
  onConfigChange: (configName: string) => void;
}
```

### 4.3 Update examples and stories
**Files**: `packages/react/src/stories/*.stories.tsx`

**Changes**:
- [ ] Update examples to show multi-config usage
- [ ] Add story showing config switching
- [ ] Update documentation in stories

---

## Phase 5: Example Configurations

### 5.1 Create example .vgc folder
**New folder**: `.vgc/` (at project root for examples)

**Files to create**:
- [ ] `.vgc/simple-service.yaml` - Basic 3-component example
- [ ] `.vgc/microservices.yaml` - Complex microservice architecture
- [ ] `.vgc/data-pipeline.yaml` - Data processing pipeline
- [ ] `.vgc/test-validation.yaml` - Test validation graph

### 5.2 Create .vgc README
**New file**: `.vgc/README.md`

**Content**:
- Explain what this folder is
- Naming conventions
- How to create new configs
- Link to full documentation

---

## Phase 6: Migration Guide

### 6.1 Create MIGRATION.md
**New file**: `docs/MIGRATION.md`

**Content**:
- [ ] How to migrate from single config to `.vgc/` folder
- [ ] Breaking changes (if any)
- [ ] Code examples showing before/after
- [ ] Step-by-step migration instructions

**Migration steps**:
```bash
# Before (old way - no longer supported)
your-project/
  vvf.config.yaml

# After (new way)
your-project/
  .vgc/
    main.yaml  # Your existing config moved here
```

---

## Phase 7: Testing & Validation

### 7.1 Integration tests
**New file**: `packages/core/src/__tests__/integration/multi-config.test.ts`

**Tests**:
- [ ] Load multiple configs from .vgc folder
- [ ] Switch between configs
- [ ] Handle missing .vgc folder gracefully
- [ ] Handle invalid YAML files
- [ ] Verify each config loads independently

### 7.2 Update existing tests
**Files**: All existing test files

**Changes**:
- [ ] Update mocks to use adapter pattern
- [ ] Use InMemoryFileSystemAdapter for tests
- [ ] Remove hardcoded file paths

### 7.3 Manual testing checklist
- [ ] Create test project with .vgc folder
- [ ] Load all configs successfully
- [ ] Verify error handling
- [ ] Test with React components
- [ ] Test file watching (if implemented)

---

## Phase 8: Cleanup

### 8.1 Remove old single-config code
**Tasks**:
- [ ] Search for any hardcoded "vvf.config.yaml" references
- [ ] Remove or update deprecated code
- [ ] Update error messages

### 8.2 Update package versions
**Files**: `package.json` files

**Version bump**: `0.2.0` → `0.3.0` (minor version - new feature)

**Changes**:
- [ ] Update core package version
- [ ] Update react package version
- [ ] Update dependencies between packages

---

## Implementation Order

### Sprint 1: Foundation (repository-abstraction + core loader)
1. Phase 1: Move FileSystemAdapter to repository-abstraction
2. Phase 2.1-2.3: Add dependency, create ConfigurationLoader, add YAML parsing

### Sprint 2: Core implementation
3. Phase 2.4-2.6: Update types, exports, tests
4. Phase 5: Create example .vgc folder

### Sprint 3: Documentation
5. Phase 3: Update all documentation
6. Phase 6: Create migration guide

### Sprint 4: React & Testing
7. Phase 4: Update React package
8. Phase 7: Testing & validation

### Sprint 5: Polish & Release
9. Phase 8: Cleanup
10. Final review & publish

---

## Breaking Changes

### What breaks:
❌ Looking for `vvf.config.yaml` at project root
❌ Any code that assumes single config file

### What stays compatible:
✅ All configuration schemas (just location changes)
✅ Core event processing logic
✅ React components (config is injected)
✅ Validation rules

---

## Success Criteria

- [ ] No references to single config file anywhere
- [ ] All docs use `.vgc/` folder pattern
- [ ] ConfigurationLoader works with adapters
- [ ] Can load multiple configs simultaneously
- [ ] Tests pass with InMemoryFileSystemAdapter
- [ ] Example .vgc folder with 4+ configs
- [ ] Migration guide complete
- [ ] Published version 0.3.0

---

## Risk Mitigation

**Risk**: Breaking existing users
**Mitigation**: Clear migration guide, version bump, changelog

**Risk**: Adapter dependency complexity
**Mitigation**: Provide default Node adapter, clear examples

**Risk**: YAML parsing adds dependency
**Mitigation**: Use well-maintained `js-yaml`, document alternatives

---

## Notes

- This is an alpha library, so breaking changes are acceptable
- Focus on clean architecture over backward compatibility
- Multi-config support is a core feature, not an add-on
- Adapter pattern enables testing and future browser support
