# Principal View CLI Validation Issues

This document describes two validation issues discovered while building workflows for the alexandria-collections project.

## Issue 1: Markdown Files Incorrectly Parsed as Canvas Files

### Description
The validator attempts to parse `.md` files as JSON when validating directories, resulting in false positive errors.

### Steps to Reproduce
1. Create a directory with a `.otel.canvas` file and a `.md` documentation file
2. Run: `npx @principal-ai/principal-view-cli@latest validate ".principal-views/collection-storage/**/*"`
3. Observe error:

```
✗ .principal-views/collection-storage/collection-storage.md
  ✗ Failed to parse JSON: Unexpected token '#', "# Collecti"... is not valid JSON
```

### Expected Behavior
Markdown files should be ignored by the validator, or only canvas/workflow JSON files should be validated.

### Actual Behavior
The validator attempts to parse markdown files as JSON and reports a parsing error.

### Impact
- Creates noise in validation output
- Could confuse users into thinking documentation files need to be JSON
- Makes it harder to identify actual validation errors

### Suggested Fix
Update the file discovery logic to:
1. Only validate files matching `*.canvas`, `*.otel.canvas`, or `*.workflow.json`
2. OR: Add explicit file type detection and skip non-JSON files with a different message
3. OR: Document that markdown files should not be in the same directory as canvas files

---

## Issue 2: Workflow Event Filtering Incorrectly Reported as Errors

### Description
When workflows filter a canvas to show only a subset of events (the primary purpose of workflows), the validator reports all unused events as errors, even though this is intentional and expected behavior.

### Steps to Reproduce
1. Create a canvas with multiple events (e.g., 13 events for different operations)
2. Create a workflow that filters to show only relevant events for a specific user journey
3. Use `spanPattern` to specify which events to include
4. Run validation
5. Observe warnings:

```
✗ .principal-views/collection-storage/collection-setup.workflow.json
  ✗ Canvas defines event "collection.update" which is not used in this workflow scenario
  ✗ Canvas defines event "collection.delete" which is not used in this workflow scenario
  ✗ Canvas defines event "collection.get" which is not used in this workflow scenario
  ... (9 more warnings for intentionally excluded events)
```

### Example Use Case
**Canvas**: Defines all operations for a storage adapter (create, update, delete, get, import, export, etc.)

**Workflows**: Filter the canvas by user journey:
- `collection-setup.workflow.json` - Shows only `collection.create` + `repository.add` (setup flow)
- `collection-maintenance.workflow.json` - Shows only update/add/remove operations
- `collection-deletion.workflow.json` - Shows only `collection.delete` with cascade behavior
- `data-migration.workflow.json` - Shows only bulk operations (import/export/clear)
- `query-operations.workflow.json` - Shows only read operations

Each workflow **intentionally** uses only a subset of canvas events. The unused events are not errors - they're filtered out by design.

### Expected Behavior
One of the following:
1. **No warnings** for unused events when workflows use `spanPattern` to filter
2. **Info-level message** (not error) explaining filtering is active
3. **Validation flag** to suppress these warnings (e.g., `--allow-filtered-workflows`)
4. Different severity levels: ERROR for missing events, INFO for unused events

### Actual Behavior
All unused events are reported as errors (marked with ✗), making it appear that the workflows are invalid when they are actually working correctly.

### Impact
- Makes validation output extremely noisy (5 workflows × 10 unused events = 50+ warnings)
- Obscures actual validation errors
- Confuses users into thinking their workflows are broken
- Discourages creating focused, filtered workflows (defeats the purpose of workflows)
- Makes CI/CD integration difficult (exit code 1 even when everything is correct)

### Suggested Fix
Options in order of preference:

1. **Best**: Don't warn about unused events when `spanPattern` is present - the pattern explicitly defines filtering intent
2. **Good**: Change severity from ERROR to INFO for unused events
3. **Acceptable**: Add a `--strict` flag that enables unused event warnings (off by default)
4. **Minimum**: Document this behavior clearly so users know to ignore these warnings

### Related Code
The validation happens when running:
```bash
npx @principal-ai/principal-view-cli@latest validate ".principal-views/**/*"
```

Exit code is 1 even though the files are valid and functional.

---

## Environment
- CLI Version: `@principal-ai/principal-view-cli@0.14.16` (as of 2026-02-18)
- Project: alexandria-collections
- Canvas: `.principal-views/collection-storage/collection-storage.otel.canvas`
- Workflows: 5 filtered workflow files

## Test Case
Repository with working example: https://github.com/[org]/alexandria-collections
Path: `.principal-views/collection-storage/`

Files demonstrate both issues:
- `collection-storage.md` triggers false positive markdown parsing error
- `*.workflow.json` files trigger unused event warnings by design
