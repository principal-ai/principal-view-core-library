# CLI Validate Command Refactoring - January 28, 2026

## Summary
Refactored the `validate` command to be comprehensive and smart about what it validates. Published two new versions: `0.9.0` (comprehensive validation) and `0.9.1` (smart filtering).

## Problem
The original setup had confusing command semantics:
- `validate` - Only validated canvas files
- `validate-execution` - Separate command for execution files
- `lint` - Also validated workflows (mixed concerns)
- Users had to remember which command validates what

Additionally, the validate command was checking ALL canvas files, including regular `.canvas` files that don't need strict OTEL validation.

## Solution

### Phase 1: Comprehensive Validate (v0.9.0)
**Changed the semantics:**
- **`validate`** = Comprehensive structural validation (does it work?)
  - Canvas files (.otel.canvas)
  - Workflow templates (.workflow.json)
  - Execution artifacts (.otel.json)
  - Component library (library.yaml)
- **`lint`** = Style and conventions (does it follow best practices?)
  - Configurable linting rules via `.privurc.yaml`
  - Focus on code style and patterns

**Removed:**
- `validate-execution` command (functionality moved to `validate --execution-only`)

**Added flags:**
- `--canvas-only` - Only validate canvas files
- `--workflow-only` - Only validate workflow files
- `--execution-only` - Only validate execution files

### Phase 2: Smart Filtering (v0.9.1)
**Use existing type system:**
The core `CanvasDiscovery` already had a `CanvasType = 'otel' | 'regular'` type system in place. We just needed to use it.

**Changed validation logic:**
```typescript
// Before: Validated ALL canvas files (21 files with lots of noise)
for (const canvas of discoveryResult.canvases) {
  validateFile(canvas.path, ...);
}

// After: Only validate OTEL canvas files (9 files, focused validation)
for (const canvas of discoveryResult.canvases) {
  if (canvas.type !== 'otel') continue; // Skip regular canvas files
  validateFile(canvas.path, ...);
}
```

**Why this matters:**
- Regular `.canvas` files are standard JSON Canvas format - no strict requirements
- OTEL `.otel.canvas` files need strict validation:
  - Must have source file references
  - Must have markdown documentation
  - Must follow storyboard structure
  - Must have event schemas

## Files Changed

### v0.9.0
```
packages/cli/src/commands/validate.ts    - Extended to validate workflows & executions
packages/cli/src/commands/lint.ts        - Updated description
packages/cli/src/index.ts                - Removed validate-execution import
packages/cli/src/commands/validate-execution.ts  - DELETED
```

### v0.9.1
```
packages/cli/src/commands/validate.ts    - Filter by canvas.type === 'otel'
```

## Usage Examples

```bash
# Validate everything (only OTEL canvases, all workflows, all executions)
privu validate

# Validate only OTEL canvas files
privu validate --canvas-only

# Validate only workflow templates
privu validate --workflow-only

# Validate only execution artifacts
privu validate --execution-only

# Lint for style and conventions
privu lint
```

## Test Results

**Test location:** `/Users/griever/Developer/backlog-adaptation/`

**Before (v0.8.4):**
```
Validating 21 canvas file(s)...
- 12 regular .canvas files → Deprecation warnings (noise)
- 9 .otel.canvas files → Actual validation errors
```

**After (v0.9.1):**
```
Validating 9 canvas file(s)...
- 12 regular .canvas files → Ignored (discovered but not validated)
- 9 .otel.canvas files → Actual validation errors (clean output)
```

## Next Steps: UI Integration

The `DiscoveredCanvas` interface in core already has the `type` field:

```typescript
interface DiscoveredCanvas {
  path: string;
  type: 'otel' | 'regular';  // ← Use this in the UI
  name: string;
  // ... other fields
}
```

**For dynamic-file-tree component:**
1. Check `canvas.type` when rendering
2. Style regular canvas files differently:
   - Gray them out or use a different icon
   - Add tooltip: "Standard canvas file (not validated)"
   - Maybe a badge or indicator
3. Filter controls in UI to show/hide regular canvases

**Example rendering logic:**
```tsx
{canvases.map(canvas => (
  <CanvasRow
    key={canvas.id}
    canvas={canvas}
    variant={canvas.type === 'otel' ? 'primary' : 'muted'}
    tooltip={canvas.type === 'regular' ? 'Standard canvas (view-only)' : undefined}
  />
))}
```

## Published Versions

- ✅ `@principal-ai/principal-view-cli@0.9.0` - Comprehensive validation
- ✅ `@principal-ai/principal-view-cli@0.9.1` - Smart filtering

## Architecture Notes

**Separation of Concerns:**
- **Core (`CanvasDiscovery`)**: Discovers all files, tags them with type
- **CLI (`validate`)**: Validates only what needs validation (OTEL files)
- **UI (`dynamic-file-tree`)**: Shows all files, styled by type

This keeps the discovery logic pure (no filtering) while allowing consumers (CLI, UI) to decide how to process the discovered files.

**Type System is Key:**
The existing `CanvasType` in core was already doing the heavy lifting. We just needed to respect it in the CLI validation logic.

## Git Commits

```bash
git log --oneline -3
a7d6dce fix(cli): only validate OTEL canvas files, ignore regular canvas files
8ad7846 feat(cli): refactor validate command to be comprehensive
2ffb85c chore(cli): bump version to 0.8.4 and fix hardcoded version
```

---

**Questions for tomorrow:**
1. Should regular canvas files show up in the UI at all, or should we add a toggle?
2. What visual treatment do we want for regular vs OTEL canvases?
3. Do we need a migration tool to convert regular → OTEL canvases?
