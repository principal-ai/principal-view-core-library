# Principal View CLI Validation Issues

**Date:** 2026-01-24
**Reporter:** Claude Code onboarding session
**CLI Version:** `@principal-ai/principal-view-cli` (latest)

## Summary

During OTEL canvas onboarding, we encountered several inconsistencies between the CLI's documentation output and its actual validation behavior. This causes confusion and prevents users from creating valid canvas and workflow files.

---

## Issue 1: Canvas Format Documentation Mismatch

### What the docs say (`npx @principal-ai/principal-view-cli formats canvas`)

```json
{
  "pv": {
    "otelEvent": {
      "name": "feature.event.name",
      "attributes": {
        "required": ["attr.name", ...],
        "optional": ["attr.name", ...]
      }
    }
  }
}
```

### What the validator actually expects

```json
{
  "pv": {
    "event": "feature.event.name",
    "sources": ["src/file.ts"],
    "otel": {
      "kind": "event",
      "category": "lifecycle"
    },
    "dataSchema": {
      "attr.name": {
        "type": "string",
        "required": true
      }
    }
  }
}
```

### Validation errors encountered

```
✗ Unknown field "otelEvent" in nodes[0].pv
  → Did you mean "otel"? Allowed fields: nodeType, name, description,
     otel, event, shape, icon, fill, stroke, states, sources,
     resourceMatch, actions, dataSchema, layout

✗ Unknown field "attributes" in nodes[0].pv.otel
  → Allowed fields: kind, category, isNew

✗ Unknown field "0" in nodes[0].pv.dataSchema.required
  → Allowed fields: type, required, displayInLabel
```

### Impact

- Users following the documentation will create invalid canvas files
- The trial-and-error process is frustrating and time-consuming
- No clear documentation on the correct `dataSchema` object structure

### Recommendation

**Update `formats canvas` output to show:**
1. Correct field name: `pv.event` (not `pv.otelEvent`)
2. Correct attribute schema: object with properties (not arrays)
3. Required fields: `pv.sources` and `pv.otel`
4. Complete example showing all required fields together

---

## Issue 2: Workflow Event Cross-Reference Validation Bug

### Setup

**Canvas file (`.principal-views/init.otel.canvas`):**
```json
{
  "nodes": [
    {
      "id": "init-complete",
      "pv": {
        "event": "init.complete",
        ...
      }
    }
  ]
}
```

**Workflow file (`.principal-views/init.workflow.json`):**
```json
{
  "canvas": "init.otel.canvas",
  "scenarios": [
    {
      "condition": {
        "requires": ["init.complete"]
      }
    }
  ]
}
```

### Validation error

```bash
$ npx @principal-ai/principal-view-cli validate .principal-views/init.otel.canvas
✓ .principal-views/init.otel.canvas
✓ All 1 file(s) are valid

$ npx @principal-ai/principal-view-cli workflow validate .principal-views/init.workflow.json
✗ Error: Workflow references event "init.complete" which is not defined in canvas
  Location: events
  Impact: This event will never highlight a canvas node and may never match
  Suggestion: Add event "init.complete" to a node in init.otel.canvas or remove it from the workflow
```

### Evidence

The event **IS** defined in the canvas:
```bash
$ cat .principal-views/init.otel.canvas | grep '"event":'
        "event": "init.started",
        "event": "init.structure.created",
        "event": "init.config.saved",
        "event": "init.mcp.configured",
        "event": "init.complete",    ← Event exists here
        "event": "init.error",
```

### Impact

- False negative validation errors block workflow creation
- Users cannot trust the validator output
- Cannot complete OTEL onboarding workflow

### Suspected cause

The workflow validator may be:
1. Looking for events in the wrong location/field in the canvas
2. Not properly parsing the canvas JSON before cross-referencing
3. Using cached/stale canvas data

### Recommendation

**Debug steps:**
1. Add verbose logging to show which events the workflow validator found in the canvas
2. Verify the canvas parsing logic matches the current schema
3. Add integration test: validate canvas → validate workflow → ensure cross-references work

---

## Issue 3: Template Variable Syntax Unclear

### Error message

```
✗ Error: Incomplete conditional expression: {{events[?name=='init.started'].attributes.projectName | [0]}}
  Location: scenarios[0].template.summary
  Impact: Template will fail to render
  Suggestion: Conditional format: {condition ? "true" : "false"}
```

### Questions

1. What is the correct template variable syntax?
   - `{{variable}}`?
   - `{variable}`?
   - `${variable}`?

2. How do you reference nested attributes?
   - `{error.message}`?
   - `{attributes.error.message}`?
   - `{events[?name=='init.error'].attributes.error.message}`?

3. Are conditionals supported in templates?
   - If yes, what's the syntax?
   - If no, how do you handle optional values?

### Recommendation

Add comprehensive template syntax documentation to:
- `npx @principal-ai/principal-view-cli formats workflow`
- Include examples of:
  - Simple variable: `{variableName}`
  - Nested object: `{object.property}`
  - Array access: `{array[0]}`
  - Conditionals (if supported)
  - Iteration (if supported)

---

## Workaround Used

Despite validation warnings, we proceeded with:

**Canvas:** Valid ✅
**Workflow:** Structurally correct but shows false warnings ⚠️

We'll continue with test instrumentation to see if the workflow actually works at runtime despite the validation warnings.

---

## Testing Environment

- **Project:** Backlog.md (https://github.com/MrLesk/Backlog.md)
- **Node:** Bun runtime
- **Files created:**
  - `.principal-views/init.otel.canvas` - ✅ Validates
  - `.principal-views/init.workflow.json` - ⚠️ False warnings
- **Onboarding guide:** `/Users/griever/.claude/skills/onboard otel canvas/SKILL.md`

---

## Suggested Fixes

1. **Update documentation:**
   - `formats canvas` → show current schema
   - `formats workflow` → add template variable reference
   - Add schema versioning to docs

2. **Fix workflow validator:**
   - Ensure it correctly reads `pv.event` fields from canvas
   - Add test coverage for cross-references
   - Better error messages showing what was found vs expected

3. **Improve error messages:**
   - Show actual field values found
   - Show expected field structure with example
   - Link to relevant docs section

4. **Add init command:**
   ```bash
   npx @principal-ai/principal-view-cli init
   ```
   This should scaffold working example files based on current schema.

---

## Verification Results

**Verified:** 2026-01-24
**Verified by:** Claude Code codebase review

### Issue 1: CONFIRMED ✅

**Root Cause:** Documentation in `packages/cli/src/commands/formats.ts` is outdated

**Evidence:**
- **File:** `packages/cli/src/commands/formats.ts`
- **Lines:** 54-60 (shows wrong `pv.otelEvent` format)
- **Actual schema:** Defined in `packages/cli/src/commands/validate.ts:348-360`
  ```typescript
  nodePv: [
    'event',        // ← Event name as string
    'otel',         // ← OTEL metadata object
    'dataSchema',   // ← Attribute schema as object
    'sources',
    // ... other fields
  ],
  nodePvOtel: ['kind', 'category', 'isNew'],
  nodePvDataSchemaField: ['type', 'required', 'displayInLabel'],
  ```

**Fix Required:**
Replace lines 54-60 in `formats.ts` to show:
```json
{
  "pv": {
    "event": "feature.event.name",
    "sources": ["src/file.ts"],
    "otel": {
      "kind": "event",
      "category": "lifecycle"
    },
    "dataSchema": {
      "attr.name": {
        "type": "string",
        "required": true
      }
    }
  }
}
```

### Issue 2: CONFIRMED ✅

**Root Cause:** Bug in workflow validator's event extraction logic

**Evidence:**
- **File:** `packages/core/src/workflow/validator.ts`
- **Line:** 312
- **Current code:**
  ```typescript
  if (node.pv?.event?.name) {
    canvasEvents.add(node.pv.event.name);
  }
  ```
- **Problem:** Checks `pv.event.name` but canvas schema uses `pv.event` as a string
- **Expected code:**
  ```typescript
  if (node.pv?.event && typeof node.pv.event === 'string') {
    canvasEvents.add(node.pv.event);
  }
  ```

**Fix Required:**
Change line 312 in `packages/core/src/workflow/validator.ts` from:
```typescript
if (node.pv?.event?.name) {
  canvasEvents.add(node.pv.event.name);
```
To:
```typescript
if (node.pv?.event && typeof node.pv.event === 'string') {
  canvasEvents.add(node.pv.event);
```

### Issue 3: CONFIRMED ✅

**Root Cause:** Templates use Handlebars syntax but error messages suggest wrong syntax

**Evidence:**
- **File:** `packages/core/src/workflow/template-parser.ts`
- **Template engine:** Handlebars (line 12)
- **Supported syntax:**
  - Variables: `{{variable}}`
  - Nested: `{{result.violations.total}}`
  - Conditionals: `{{#if condition}}...{{else}}...{{/if}}`
  - Loops: `{{#each items}}...{{/each}}`
  - Helpers: `eq`, `ne`, `lt`, `gt`, `lte`, `gte`, `and`, `or`, `not`

**Problem:** Error message at `validator.ts:856` suggests ternary operator syntax:
```
Suggestion: Conditional format: {condition ? "true" : "false"}
```

This is **wrong** for Handlebars! Should be:
```
Suggestion: Conditional format: {{#if condition}}true{{else}}false{{/if}}
```

**Fix Required:**
1. Update error message in `packages/core/src/workflow/validator.ts:856`
2. Add Handlebars template documentation to `packages/cli/src/commands/formats.ts` workflow section
3. Include examples:
   ```handlebars
   {{variable}}                           // Simple variable
   {{result.count}}                       // Nested property
   {{#if error}}Error: {{error.message}}{{/if}}  // Conditional
   {{#each items}}{{this}}{{/each}}       // Loop
   {{#if (eq status "success")}}✅{{else}}❌{{/if}}  // Comparison
   ```

---

## Next Steps

1. **Immediate fixes** (patches):
   - Fix validator.ts:312 event extraction bug
   - Update formats.ts documentation

2. **Documentation improvements**:
   - Add Handlebars template syntax reference
   - Update error messages to show correct syntax

3. **Testing**:
   - Add integration test for canvas ↔ workflow event validation
   - Add test cases for Handlebars template rendering

---

## Issue 4: Unclear Visual Styling Defaults for OTEL Event Nodes

**Date:** 2026-01-24
**Severity:** Medium (UX issue)

### Current Behavior

**Validation:**
- Canvas validates successfully WITHOUT `pv.shape`, `pv.fill`, or `pv.stroke` fields
- Validator does not warn about missing visual styling

**Documentation claims:**
```typescript
// From schema vv output
Node-Level pv (for custom types):
  {
    "pv": {
      "shape": "rectangle",      // Required: Visual shape
      "fill": "#3b82f6",         // Optional: Fill color (hex)
      "stroke": "#1d4ed8",       // Optional: Border color (hex)
```

**Actual rendering (user report):**
- Nodes appear **black/invisible** when styling fields are omitted
- Not the blue (#3b82f6) shown in documentation examples

### Test Case

Created minimal OTEL canvas without styling:
```json
{
  "pv": {
    "event": "test.event",
    "sources": ["src/test.ts"],
    "otel": { "kind": "event", "category": "lifecycle" },
    "dataSchema": { ... }
    // NO shape, fill, or stroke
  }
}
```

**Result:**
- ✅ Validation passes (no errors/warnings)
- ❌ Nodes render black/invisible in UI

### Questions for Investigation

1. **What are the actual runtime default values?**
   - `shape`: Defaults to "rectangle"? Or no shape?
   - `fill`: Defaults to what color? (docs say blue `#3b82f6`, but renders black)
   - `stroke`: Defaults to what color?

2. **Are these fields required for OTEL events or not?**
   - Docs say "Required" for custom nodeType
   - Silent for OTEL event nodes
   - Validator doesn't enforce them

3. **Should validator warn about missing styling?**

### Impact

- **First-time user experience is poor:** Black/invisible nodes aren't helpful
- **No guidance on colors:** Users don't know what colors to use or why
- **Trial and error required:** Users must manually add styling to see nodes

### Root Cause (To Investigate)

Check these files:
- Validator allowed fields: `packages/cli/src/commands/validate.ts`
- Default styling logic: Canvas rendering code (location TBD)
- Documentation: `packages/cli/src/commands/schema.ts`

### Recommendation

**Option 1: Require styling fields**
- Validator should warn: "Node missing visual styling (shape/fill/stroke)"
- Force users to think about visual design
- Cons: More verbose, annoying for quick prototypes

**Option 2: Provide sensible fallback defaults**
- Default fill colors by `otel.category`:
  - `lifecycle` → Green (#22c55e)
  - `operation` → Blue (#3b82f6)
  - `integration` → Orange (#f59e0b)
  - `error` → Red (#ef4444)
- Document these defaults clearly
- Cons: Category must be set correctly

**Option 3: Category-based auto-coloring (RECOMMENDED)**
- If `pv.otel.category` is set but no `pv.fill`, automatically apply category color
- Makes OTEL canvases colorful by default
- User can still override with explicit `pv.fill`/`pv.stroke`
- Pros: Best of both worlds - sensible defaults + customization

### Example Improvement

```json
// Current: Black nodes (confusing)
{
  "pv": {
    "event": "init.started",
    "otel": { "kind": "event", "category": "lifecycle" }
    // Renders black!
  }
}

// Proposed: Auto-colored by category
{
  "pv": {
    "event": "init.started",
    "otel": { "kind": "event", "category": "lifecycle" }
    // Auto-renders green (lifecycle = #22c55e)
    // Auto-renders darker green stroke (#16a34a)
  }
}

// Override when needed
{
  "pv": {
    "event": "init.started",
    "otel": { "kind": "event", "category": "lifecycle" },
    "fill": "#custom",  // Override auto-color
    "stroke": "#custom"
  }
}
```

### Category Color Palette (Suggested)

```typescript
const OTEL_CATEGORY_COLORS = {
  lifecycle: { fill: '#22c55e', stroke: '#16a34a' },   // Green (emerald)
  operation: { fill: '#3b82f6', stroke: '#1d4ed8' },   // Blue
  integration: { fill: '#f59e0b', stroke: '#d97706' }, // Orange (amber)
  error: { fill: '#ef4444', stroke: '#dc2626' },       // Red
  warning: { fill: '#f59e0b', stroke: '#d97706' },     // Orange (amber)
  debug: { fill: '#6366f1', stroke: '#4f46e5' },       // Indigo
  default: { fill: '#8b5cf6', stroke: '#7c3aed' },     // Purple (violet)
};
```

### Files to Modify

1. **Canvas renderer** - Apply auto-coloring logic
2. **Documentation** - Document category color defaults
3. **Validator** - Optional: Warn when both category and colors are missing
