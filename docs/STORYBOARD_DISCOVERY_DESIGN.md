# Storyboard Discovery Design

## Implementation Status

**Version:** 1.0.0
**Phase:** Phase 3 (Full Deprecation)
**Status:** ✅ Implemented

**What's Available:**
- ✅ Storyboard discovery system (hierarchical structure support)
- ✅ Deprecation warnings for legacy flat structure
- ✅ Lint errors for flat structure usage
- ✅ Full backward compatibility with legacy structure (deprecated)
- ✅ Documentation and migration guide
- ⏸️ CLI automated migration tools (future enhancement)

**Migration:** **IMPORTANT:** Legacy flat structure is fully deprecated and will show lint errors. Upgrade to storyboard structure immediately. See [Migration Guide](./MIGRATION_GUIDE.md) for upgrade instructions.

---

## Overview

This document describes the enhanced discovery system that introduces **storyboards** as a first-class organizational concept for Principal Views. A storyboard groups a canvas with its related workflows and executions in a hierarchical folder structure.

## Motivation

### Current Limitations (Flat Structure)

```
.principal-views/
  ├── checkout-flow.otel.canvas
  ├── checkout-flow.workflow.json
  └── __executions__/
      ├── success-test.otel.json
      └── error-test.otel.json
```

**Problems:**
- Hard to associate multiple workflows with one canvas
- Hard to associate executions with specific workflows
- No clear relationship between workflow and its test executions
- Doesn't scale well with multiple workflows per feature area
- Scenarios are variations of a workflow, but executions are scattered

### Goals

1. **Clear Hierarchy:** Storyboard → Workflows → Executions
2. **Multiple Workflows:** Easy to have many workflow variations for one canvas
3. **Organized Executions:** Each workflow has its own execution files
4. **Backward Compatible:** Keep supporting flat structure
5. **Scenario-Aware:** Executions should be grouped with the workflow that defines their scenarios

## Folder Structure

### New Structure (Storyboard-Based)

```
.principal-views/
  └── checkout-flow/                      # Storyboard folder
      ├── checkout-flow.otel.canvas       # Canvas definition (required, exactly 1)
      ├── checkout/                        # Workflow folder
      │   ├── checkout.workflow.json      # Workflow definition (required, exactly 1)
      │   ├── success-1.otel.json         # Execution matching "success" scenario
      │   ├── success-2.otel.json         # Another success test run
      │   ├── declined-1.otel.json        # Execution matching "declined" scenario
      │   └── timeout-1.otel.json         # Execution matching "timeout" scenario
      └── refund/                          # Another workflow for the same canvas
          ├── refund.workflow.json         # Defines: full-refund, partial-refund scenarios
          ├── full-1.otel.json
          └── partial-1.otel.json
```

### Hierarchy Rules

```
Storyboard/
  ├── *.otel.canvas (required, exactly 1)
  └── workflow-name/ (0 or more workflow folders)
      ├── workflow-name.workflow.json (required, exactly 1)
      └── *.otel.json (0 or more execution files)
```

### Key Concepts

- **Storyboard** = A canvas + its workflows (represents a feature area or system component)
- **Workflow** = A `.workflow.json` file with multiple scenario definitions
- **Scenario** = A variation defined within the workflow.json (success, error, timeout, etc.)
- **Execution** = A test trace file (`.otel.json`) that matches one of the workflow's scenarios

### Legacy Structure (Still Supported)

```
.principal-views/
  ├── old-style.otel.canvas               # Flat structure
  ├── old-style.workflow.json             # Legacy workflow location
  └── __executions__/                      # Legacy execution location
      └── old-style.otel.json
```

**Both structures are supported for backward compatibility.**

## Discovery Types

### Enhanced Discovery Result

```typescript
interface CanvasDiscoveryResult {
  // NEW: Storyboard-based discovery
  storyboards: DiscoveredStoryboard[];

  // Backward compatibility: flat structure
  canvases: DiscoveredCanvas[];      // Legacy canvases not in storyboards
  executions: DiscoveredExecution[]; // Legacy executions not in storyboards

  errors: Array<{ path: string; error: string }>;
}
```

### Storyboard

```typescript
interface DiscoveredStoryboard {
  /** Unique identifier: 'checkout-flow' or 'package-name/checkout-flow' */
  id: string;

  /** Display name from canvas or folder name */
  name: string;

  /** Full path to storyboard folder: '.principal-views/checkout-flow' */
  path: string;

  /** Folder basename: 'checkout-flow' */
  basename: string;

  /** The canvas file in this storyboard */
  canvas: DiscoveredCanvas;

  /** All workflow folders in this storyboard */
  workflows: DiscoveredWorkflow[];

  /** Package name for monorepos (e.g., 'core' from 'packages/core/.principal-views/') */
  packageName?: string;

  /** Scope indicator */
  scope: 'root' | 'package';
}
```

### Workflow

```typescript
interface DiscoveredWorkflow {
  /** Unique identifier: 'checkout-flow/checkout' or 'pkg/checkout-flow/checkout' */
  id: string;

  /** Display name from template.name or folder name */
  name: string;

  /** Full path to workflow.json: 'checkout/checkout.workflow.json' */
  path: string;

  /** Folder basename: 'checkout' */
  basename: string;

  /** Parent storyboard ID: 'checkout-flow' */
  storyboardId: string;

  /** Resolved path to canvas: '../checkout-flow.otel.canvas' */
  canvasPath: string;

  /** Parsed workflow template (if includeContent option enabled) */
  template?: WorkflowTemplate;

  /** Execution files in this workflow folder */
  executions: DiscoveredExecution[];

  /** Package name for monorepos */
  packageName?: string;

  /** Scope indicator */
  scope: 'root' | 'package';
}
```

### Enhanced Execution

```typescript
interface DiscoveredExecution {
  // ... existing fields ...

  /** Parent workflow ID (if in storyboard structure): 'checkout-flow/checkout' */
  workflowId?: string;

  /** Canvas basename (still used for legacy flat structure matching) */
  canvasBasename: string;
}
```

### Workflow Template Structure

```typescript
interface WorkflowTemplate {
  version: string;
  canvas: string;  // Relative path: '../storyboard-name.otel.canvas'
  name: string;
  description?: string;
  mode: WorkflowMode;
  scenarios: WorkflowScenario[];  // Scenarios defined in the workflow
  // ... other fields
}

// Example workflow.json:
{
  "version": "1.0.0",
  "canvas": "../checkout-flow.otel.canvas",
  "name": "Checkout Flow",
  "scenarios": [
    { "id": "success", "description": "Successful checkout" },
    { "id": "declined", "description": "Payment declined" },
    { "id": "timeout", "description": "Request timeout" }
  ]
}
```

## Discovery Algorithm

### High-Level Flow

```
CanvasDiscovery.discover(fileTree) →
  1. Discover packages (existing, cached by fileTree SHA)
  2. Build package lookup map
  3. Discover storyboards (NEW)
     ├─ Find storyboard folders
     ├─ Validate canvas in each storyboard
     ├─ Discover workflows in each storyboard
     └─ Discover executions in each workflow
  4. Discover legacy canvases (existing, filtered)
  5. Discover legacy executions (existing, filtered)
  6. Sort results
  7. Return comprehensive discovery result
```

### Storyboard Discovery Logic

```typescript
async discoverStoryboards(
  fileTree: FileTree,
  packageMap: Map<string, PackageLayer>,
  options: DiscoveryOptions
): Promise<DiscoveredStoryboard[]> {

  const storyboards: DiscoveredStoryboard[] = [];

  // 1. Find all .principal-views directories
  const pvDirs = this.findPrincipalViewsDirs(fileTree);

  for (const pvDir of pvDirs) {
    // 2. Find subdirectories that contain a canvas file
    const folders = this.findFoldersWithCanvas(pvDir, fileTree);

    for (const folder of folders) {
      // 3. Validate exactly 1 canvas file
      const canvasFile = this.findCanvasInFolder(folder, fileTree);
      if (!canvasFile) {
        errors.push({ path: folder, error: 'Storyboard must have exactly 1 canvas file' });
        continue;
      }

      // 4. Discover workflows within this storyboard
      const workflows = await this.discoverWorkflowsInStoryboard(
        folder,
        canvasFile,
        fileTree,
        options
      );

      // 5. Resolve package context
      const packageInfo = this.findPackageForPath(folder, packageMap);
      const basename = folder.split('/').pop()!;

      // 6. Create storyboard
      storyboards.push({
        id: packageInfo ? `${packageInfo.name}/${basename}` : basename,
        name: canvasFile.name || basename,
        path: folder,
        basename,
        canvas: canvasFile,
        workflows,
        packageName: packageInfo?.name,
        scope: packageInfo ? 'package' : 'root',
      });
    }
  }

  return storyboards;
}
```

### Workflow Discovery Logic

```typescript
async discoverWorkflowsInStoryboard(
  storyboardPath: string,
  canvas: DiscoveredCanvas,
  fileTree: FileTree,
  options: DiscoveryOptions
): Promise<DiscoveredWorkflow[]> {

  const workflows: DiscoveredWorkflow[] = [];

  // 1. Find subdirectories that contain a .workflow.json file
  const workflowFolders = this.findFoldersWithWorkflowFile(storyboardPath, fileTree);

  for (const folder of workflowFolders) {
    // 2. Validate exactly 1 workflow file
    const workflowFile = this.findWorkflowFileInFolder(folder, fileTree);
    if (!workflowFile) {
      errors.push({ path: folder, error: 'Workflow folder must have exactly 1 .workflow.json file' });
      continue;
    }

    // 3. Parse workflow template (if includeContent)
    let template: WorkflowTemplate | undefined;
    if (options.includeContent && options.fileReader) {
      const content = await options.fileReader(workflowFile.path);
      template = JSON.parse(content) as WorkflowTemplate;

      // Validate canvas reference
      const resolvedCanvasPath = this.resolveCanvasReference(
        folder,
        template.canvas,
        canvas.path
      );

      if (!resolvedCanvasPath) {
        errors.push({
          path: workflowFile.path,
          error: `Workflow canvas reference '${template.canvas}' does not resolve to parent canvas '${canvas.path}'`
        });
      }
    }

    // 4. Discover executions in this workflow folder
    const executions = this.discoverExecutionsInWorkflow(folder, fileTree, options);

    // 5. Create workflow
    const basename = folder.split('/').pop()!;
    const storyboardBasename = storyboardPath.split('/').pop()!;

    workflows.push({
      id: `${canvas.id}/${basename}`,
      name: template?.name || basename,
      path: `${basename}/${basename}.workflow.json`,
      basename,
      storyboardId: canvas.id,
      canvasPath: canvas.path,
      template,
      executions,
      packageName: canvas.packageName,
      scope: canvas.scope,
    });
  }

  return workflows;
}
```

### Execution Discovery in Workflow

```typescript
discoverExecutionsInWorkflow(
  workflowPath: string,
  fileTree: FileTree,
  options: DiscoveryOptions
): DiscoveredExecution[] {

  const executions: DiscoveredExecution[] = [];

  // Find all .otel.json files in workflow folder
  const executionFiles = fileTree.allFiles.filter(file =>
    file.path.startsWith(workflowPath) &&
    file.path.endsWith('.otel.json') &&
    !file.path.includes('/')  // Only direct children, not nested
  );

  for (const file of executionFiles) {
    executions.push({
      // ... standard execution fields ...
      workflowId: workflowId,  // Link to parent workflow
      canvasBasename: canvasBasename,
    });
  }

  return executions;
}
```

## Validation Rules

### New Validation Rules

The rules engine will include new rules for storyboard structure validation:

#### 1. `storyboard-structure` (error)

**Checks:**
- Storyboard folder MUST have exactly 1 canvas file (`.canvas` or `.otel.canvas`)
- Canvas basename SHOULD match folder name (warning if different)

**Example violation:**
```
✖ error  storyboard-structure  Storyboard folder has 0 canvas files
  → .principal-views/checkout-flow/
  Storyboard folders must contain exactly one .canvas or .otel.canvas file
```

#### 2. `workflow-structure` (error)

**Checks:**
- Workflow folder MUST have exactly 1 `.workflow.json` file
- Workflow basename SHOULD match folder name (warning if different)

**Example violation:**
```
✖ error  workflow-structure  Workflow folder has 2 .workflow.json files
  → .principal-views/checkout-flow/checkout/
  Workflow folders must contain exactly one .workflow.json file
```

#### 3. `workflow-canvas-reference` (error)

**Checks:**
- `workflow.canvas` field MUST resolve to parent storyboard's canvas file
- Path SHOULD be relative: `../storyboard-name.otel.canvas`

**Example violation:**
```
✖ error  workflow-canvas-reference  Invalid canvas reference
  → checkout/checkout.workflow.json
  Canvas reference '../payment.otel.canvas' does not resolve to parent
  storyboard canvas 'checkout-flow.otel.canvas'

  Suggestion: Use canvas: "../checkout-flow.otel.canvas"
```

#### 4. `workflow-execution-coverage` (warning)

**Checks:**
- Workflow folder has execution files
- Execution files should match defined scenarios (by convention)

**Example violation:**
```
⚠ warning  workflow-execution-coverage  No executions found
  → .principal-views/checkout-flow/checkout/
  Workflow defines 3 scenarios but has no execution files

  Suggestion: Add test execution files for: success, declined, timeout
```

### Enhanced Existing Rules

**`no-unknown-fields`:** Extend to validate storyboard folder conventions

**`required-metadata`:** Validate workflow template structure

## Backward Compatibility

### Support Matrix

| Structure | Supported | Discovery Method | Notes |
|-----------|-----------|------------------|-------|
| Flat canvas | ✅ Yes | `canvases[]` | Legacy structure |
| Flat execution | ✅ Yes | `executions[]` | Legacy `__executions__/` |
| Flat workflow | ✅ Yes | Custom loader | Not in core discovery yet |
| Storyboard | ✅ Yes | `storyboards[]` | New structure |

### Discovery Result for Mixed Structures

```typescript
{
  storyboards: [
    {
      id: 'checkout-flow',
      canvas: { /* ... */ },
      workflows: [ /* ... */ ],
    }
  ],

  // Legacy canvases not in storyboards
  canvases: [
    {
      id: 'old-style-canvas',
      path: '.principal-views/old-style.otel.canvas',
      // ...
    }
  ],

  // Legacy executions not in storyboards
  executions: [
    {
      id: 'old-style-execution',
      path: '.principal-views/__executions__/old-style.otel.json',
      // ...
    }
  ],

  errors: []
}
```

## Migration Path

### Phase 1: Dual Support (Completed)

- ✅ Old flat structure keeps working
- ✅ New storyboard structure is available
- ✅ Discovery returns both formats
- ✅ All tools support both structures

**Status:** Completed

### Phase 2: Recommend New Structure (Completed - v0.15.0)

- ✅ Deprecation warnings in CanvasDiscovery for legacy structures
- ✅ Documentation shows storyboard as preferred pattern
- ✅ Migration guide: flat → storyboard (manual)
- ✅ CLI `init` generates storyboard structure by default
- ⏸️ CLI command: `privu migrate storyboard` (decided against automated migration for now)

**Status:** Completed (v0.15.0)

**What was delivered:**
- Discovery system emits deprecation warnings for flat canvas and `__executions__/` structures
- All documentation updated to recommend storyboards
- Comprehensive migration guide with step-by-step instructions
- Both structures continue to work (backward compatibility maintained)

### Phase 3: Full Deprecation (Current - v1.0.0)

- ✅ Lint errors for flat structure
- ✅ Clear deprecation messaging in all documentation
- ✅ Flat structure support maintained for backward compatibility (with errors)
- ⏸️ Auto-migration in `privu lint --fix` (future enhancement)

**Status:** Implemented (v1.0.0)

**What's working:**
- Discovery system now emits **errors** (not warnings) for flat canvas and `__executions__/` structures
- All documentation clearly states flat structure is fully deprecated
- Storyboard structure is the only supported approach going forward
- Legacy structure still works but produces validation errors
- Migration guide provides clear upgrade path

**Timeline:** Legacy flat structure will be removed in v2.0.0

## Examples

### Example 1: E-Commerce Checkout

```
.principal-views/
  └── checkout/
      ├── checkout.otel.canvas           # Defines: cart, payment, fulfillment nodes
      ├── happy-path/
      │   ├── happy-path.workflow.json   # Scenario: success
      │   ├── success-1.otel.json
      │   └── success-2.otel.json
      ├── payment-failures/
      │   ├── payment-failures.workflow.json  # Scenarios: declined, fraud, timeout
      │   ├── declined-1.otel.json
      │   ├── fraud-1.otel.json
      │   └── timeout-1.otel.json
      └── inventory-issues/
          ├── inventory-issues.workflow.json  # Scenarios: out-of-stock, partial
          ├── out-of-stock-1.otel.json
          └── partial-1.otel.json
```

**Discovered structure:**
```typescript
{
  storyboards: [
    {
      id: 'checkout',
      name: 'E-Commerce Checkout',
      canvas: { /* ... */ },
      workflows: [
        {
          id: 'checkout/happy-path',
          name: 'Happy Path',
          executions: [
            { id: 'success-1', /* ... */ },
            { id: 'success-2', /* ... */ }
          ]
        },
        {
          id: 'checkout/payment-failures',
          name: 'Payment Failures',
          executions: [
            { id: 'declined-1', /* ... */ },
            { id: 'fraud-1', /* ... */ },
            { id: 'timeout-1', /* ... */ }
          ]
        },
        {
          id: 'checkout/inventory-issues',
          name: 'Inventory Issues',
          executions: [
            { id: 'out-of-stock-1', /* ... */ },
            { id: 'partial-1', /* ... */ }
          ]
        }
      ]
    }
  ]
}
```

### Example 2: Monorepo Package

```
packages/
  └── api/
      └── .principal-views/
          └── authentication/
              ├── authentication.otel.canvas
              ├── login/
              │   ├── login.workflow.json      # Scenarios: success, invalid-creds, locked
              │   ├── success-1.otel.json
              │   ├── invalid-1.otel.json
              │   └── locked-1.otel.json
              └── refresh-token/
                  ├── refresh-token.workflow.json
                  └── expired-1.otel.json
```

**Discovered structure:**
```typescript
{
  storyboards: [
    {
      id: 'api/authentication',           // Package-scoped ID
      packageName: 'api',
      scope: 'package',
      workflows: [ /* ... */ ]
    }
  ]
}
```

## CLI Updates

### New Commands

```bash
# Initialize new storyboard
privu init storyboard <name>

# Example output:
# Created .principal-views/checkout/
# Created .principal-views/checkout/checkout.otel.canvas
# Created .principal-views/checkout/happy-path/
# Created .principal-views/checkout/happy-path/happy-path.workflow.json

# Migrate flat structure to storyboard
privu migrate storyboard

# Validate storyboard structure
privu validate .principal-views/checkout/

# List all storyboards
privu list --format=storyboards
```

### Enhanced Validation Output

```bash
$ privu validate

.principal-views/checkout/checkout.otel.canvas
  ✓ Valid OTEL canvas

.principal-views/checkout/happy-path/happy-path.workflow.json
  ✓ Valid workflow
  ✓ Canvas reference resolves correctly
  ✓ 2 execution files found

.principal-views/checkout/payment-failures/payment-failures.workflow.json
  ✓ Valid workflow
  ⚠ warning  workflow-execution-coverage
    Workflow defines 3 scenarios but only has 2 execution files

✓ 1 storyboard, 2 workflows, 4 executions
⚠ 1 warning
```

## Implementation Plan

### Phase 1: Core Discovery (Priority)

- [ ] Add storyboard types to `/packages/core/src/discovery/types.ts`
- [ ] Implement `discoverStoryboards()` in `CanvasDiscovery.ts`
- [ ] Implement `discoverWorkflowsInStoryboard()`
- [ ] Update `CanvasDiscoveryResult` to include storyboards
- [ ] Update tests for storyboard discovery

### Phase 2: Validation Rules

- [ ] Add `storyboard-structure` rule
- [ ] Add `workflow-structure` rule
- [ ] Add `workflow-canvas-reference` rule
- [ ] Add `workflow-execution-coverage` rule
- [ ] Update CLI validation to report storyboard issues

### Phase 3: CLI Commands

- [ ] Update `privu init` to support storyboard generation
- [ ] Add `privu migrate storyboard` command
- [ ] Update `privu list` to show storyboards
- [ ] Update `privu validate` output for storyboards

### Phase 4: UI Updates

- [ ] Update panels to consume storyboard discovery results
- [ ] Remove custom `WorkflowLoader` (use core discovery)
- [ ] Update tree view to show storyboard hierarchy
- [ ] Add storyboard-aware navigation

### Phase 5: Documentation

- [ ] Update README with storyboard examples
- [ ] Write migration guide
- [ ] Update API documentation
- [ ] Create tutorial: "Building Your First Storyboard"

## Open Questions

1. **Should workflow folders allow nested subfolders?**
   - Current: No, workflows are direct children of storyboard
   - Consider: Allowing grouping like `workflows/payments/checkout/`

2. **Should we support multiple canvases per storyboard?**
   - Current: Exactly 1 canvas per storyboard
   - Consider: Multiple related canvases (e.g., API + UI canvases)

3. **How to handle execution file naming conventions?**
   - Current: Any `.otel.json` file is valid
   - Consider: Enforcing scenario prefix (e.g., `success-*.otel.json`)

4. **Should library.json be storyboard-scoped or global?**
   - Current: Global `.principal-views/library.json`
   - Consider: Per-storyboard `checkout/library.json`

## References

- [CanvasDiscovery Implementation](../packages/core/src/discovery/CanvasDiscovery.ts)
- [Discovery Types](../packages/core/src/discovery/types.ts)
- [Rules Engine](../packages/core/src/rules/engine.ts)
- [CLI Validation](../packages/cli/src/commands/validate.ts)
- [Workflow Types](../packages/core/src/workflow/types.ts)
