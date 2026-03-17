# Workflow-Span Integration Design

## Overview

This document specifies how workflow.json files capture span information and how this enables automatic edge derivation for spans.canvas files.

### Problem Statement

Currently:
- `spans.canvas` defines span conventions (patterns like `validate.*`) and edges (valid call relationships)
- `workflow.json` defines how to render traces, matching a single root span
- Events in workflows have no span context - they're assumed to be in the root span
- Edges in spans.canvas are manually authored with no validation against real traces

We want:
- Workflows to capture which span each event belongs to
- Derivation of expected edges from workflow definitions
- Validation that hand-authored spans.canvas edges match workflow-derived edges

### Design Goals

- **Minimal change**: Extend existing event structure, don't replace it
- **Backward compatible**: Events without span context default to root span
- **Concrete to abstract**: Workflows use exact span names, spans.canvas uses patterns
- **Derivable edges**: Span transitions in event sequences produce edges

---

## Schema Changes

### 1. Rename `spanPattern` to `rootSpan`

The workflow's entry point should be clearly named:

```json
{
  "version": "1.0.0",
  "rootSpan": "cli.command",    // was: spanPattern
  "scenarios": [...]
}
```

**Rationale**: `spanPattern` suggests a pattern match, but this is the exact root span name that anchors the workflow.

### 2. Extend Event Templates with Span Context

Events can specify which span they occur in:

**Current format (still valid):**
```json
"events": {
  "validation.started": "Started validation"
}
```

**Extended format:**
```json
"events": {
  "validation.started": {
    "span": "validate.canvas",
    "template": "Started validation"
  }
}
```

**Type definition:**

```typescript
interface ScenarioTemplate {
  // ... existing fields ...

  events?: Record<string, string | EventTemplate>;
}

interface EventTemplate {
  /**
   * Exact span name this event occurs in.
   * If omitted, defaults to rootSpan.
   */
  span?: string;

  /**
   * Template string for rendering this event.
   */
  template: string;
}
```

### 3. Backward Compatibility

| Format | Span Context |
|--------|--------------|
| `"event.name": "template"` | Assumes `rootSpan` |
| `"event.name": { "template": "..." }` | Assumes `rootSpan` |
| `"event.name": { "span": "x", "template": "..." }` | Uses specified span |

---

## Example: CLI Validation Workflow

```json
{
  "version": "1.0.0",
  "rootSpan": "cli.command",
  "name": "CLI Validation",
  "description": "Validates canvas files via CLI",
  "scenarioSelection": "first-match",
  "scenarios": [
    {
      "id": "success",
      "priority": 1,
      "description": "Successful validation",
      "template": {
        "introduction": "CLI Validation Started",
        "events": {
          "cli.started": "CLI invoked with {{args}}",

          "discovery.started": {
            "span": "discover.canvases",
            "template": "Discovering canvases..."
          },
          "file.read": {
            "span": "file.read",
            "template": "Reading {{file.path}}"
          },
          "discovery.complete": {
            "span": "discover.canvases",
            "template": "Found {{count}} canvases"
          },

          "validation.started": {
            "span": "validate.canvas",
            "template": "Validating {{canvas.name}}"
          },
          "schema.checked": {
            "span": "validate.canvas",
            "template": "Schema valid"
          },
          "validation.complete": {
            "span": "validate.canvas",
            "template": "Validation passed"
          },

          "cli.complete": "CLI completed successfully"
        },
        "summary": "Validation complete: {{result.count}} files checked"
      }
    }
  ]
}
```

**Event sequence with span context:**

| Order | Event | Span |
|-------|-------|------|
| 1 | `cli.started` | `cli.command` (root) |
| 2 | `discovery.started` | `discover.canvases` |
| 3 | `file.read` | `file.read` |
| 4 | `discovery.complete` | `discover.canvases` |
| 5 | `validation.started` | `validate.canvas` |
| 6 | `schema.checked` | `validate.canvas` |
| 7 | `validation.complete` | `validate.canvas` |
| 8 | `cli.complete` | `cli.command` (root) |

---

## Edge Derivation Algorithm

### Step 1: Extract Span Sequence

From the workflow events, extract the sequence of spans:

```
cli.command → discover.canvases → file.read → discover.canvases → validate.canvas → cli.command
```

### Step 2: Identify Span Transitions

A transition occurs when consecutive events are in different spans:

| From | To |
|------|----|
| `cli.command` | `discover.canvases` |
| `discover.canvases` | `file.read` |
| `file.read` | `discover.canvases` |
| `discover.canvases` | `validate.canvas` |
| `validate.canvas` | `cli.command` |

**Note:** These are temporal transitions (order), not necessarily parent-child relationships. We observe "A happened, then B happened" but can't infer nesting without trace data.

### Step 3: Match to spans.canvas Patterns

Map exact span names to spans.canvas node patterns:

| Exact Span | Matches Pattern | Node ID |
|------------|-----------------|---------|
| `discover.canvases` | `discover.*` | `discover` |
| `file.read` | `file.*` | `file` |
| `validate.canvas` | `validate.*` | `validate` |
| `cli.command` | `cli.command` | `cli-command` |

### Step 4: Derive Expected Edges

From observed transitions, derive edges to validate:

| Observed Transition | Expected Edge |
|---------------------|---------------|
| `cli.command` → `discover.canvases` | `cli-command` → `discover` |
| `discover.canvases` → `file.read` | `discover` → `file` |
| `cli.command` → `validate.canvas` | `cli-command` → `validate` |

**Important**: These edges represent "span A was active, then span B was active" - temporal relationships observed in the workflow definition. The spans.canvas author decides if this represents a call relationship worth documenting.

### Step 5: Validate Against spans.canvas

Edges are **not auto-generated**. The spans.canvas is hand-authored for layout and visual design. Derived edges are used for **validation only**.

```json
// spans.canvas edges (hand-authored)
"edges": [
  { "fromNode": "cli-command", "toNode": "discover" },
  { "fromNode": "cli-command", "toNode": "validate" },
  { "fromNode": "discover", "toNode": "file" }
]
```

**Validation flow:**

```
workflows (describe actual behavior)
    ↓ derive expected edges
    ↓ compare
spans.canvas (hand-authored, validated)
```

**Validation results:**
- Derived edge exists in spans.canvas → pass
- Derived edge missing from spans.canvas → error (undocumented call path)
- spans.canvas edge not observed in workflows → warning (documented but untested)

---

## Span Ordering (Not Nesting)

Events give us **temporal order**, not parent-child relationships:

```
1. discover.started    [span: discover.canvases]
2. file.read           [span: file.read]
3. discover.complete   [span: discover.canvases]
```

We know: `discover.started` → `file.read` → `discover.complete` (order)

We **don't know** if `file.read` is:
- A child of `discover.canvases`
- A sibling (both children of root)
- Unrelated

**To derive actual parent-child edges**, we would need:
- Real trace data with `parentSpanId`
- Or explicit declaration in the workflow

**For now:** Workflows capture span transitions (order), which is useful for documentation. True nesting validation would require trace data.

---

## Integration with spans.canvas

### Current spans.canvas Structure

```json
{
  "nodes": [
    {
      "id": "cli-command",
      "pv": {
        "otel": {
          "spanPattern": "cli.command",
          "spanKind": "SERVER"
        }
      }
    },
    {
      "id": "discover",
      "pv": {
        "otel": {
          "spanPattern": "discover.*",
          "spanKind": "INTERNAL"
        }
      }
    }
  ],
  "edges": [
    {
      "fromNode": "cli-command",
      "toNode": "discover"
    }
  ]
}
```

### Validation Rules

| Rule | Severity | Description |
|------|----------|-------------|
| `edge-not-observed` | warning | Edge in spans.canvas not seen in any workflow |
| `edge-missing` | error | Span transition in workflow has no corresponding edge |
| `span-not-declared` | error | Workflow references span not matching any spans.canvas pattern |

---

## CLI Commands

### Validate Edges

Edge validation is part of the standard `validate` command:

```bash
npx pv-cli validate

# Output:
# Validating spans.canvas edges against workflows...
#
# Edges derived from workflows:
#   cli-command → discover (seen in 2 workflows)
#   cli-command → validate (seen in 1 workflow)
#   discover → file (seen in 2 workflows)
#   validate → parse (seen in 1 workflow)
#
# Validation:
#   ✓ cli-command → discover (documented)
#   ✓ cli-command → validate (documented)
#   ✓ discover → file (documented)
#   ✗ validate → parse (ERROR: undocumented call path)
#   ⚠ cli-command → parse (WARNING: documented but not observed)
```

### Show Derived Edges (informational)

```bash
npx pv-cli validate --show-derived-edges

# Output:
# Edges derived from workflows:
#   cli-command → discover
#     └── validation-workflow.workflow.json (scenario: success)
#     └── discovery-workflow.workflow.json (scenario: full-scan)
#   cli-command → validate
#     └── validation-workflow.workflow.json (scenario: success)
#   discover → file
#     └── discovery-workflow.workflow.json (scenario: full-scan)
```

This helps when authoring spans.canvas - shows what edges need to be documented.

---

## Migration Path

### Phase 1: Schema Update
- Add `rootSpan` as alias for `spanPattern` (deprecate `spanPattern`)
- Support object form for events with `span` field
- Update TypeScript types

### Phase 2: Tooling
- Add edge derivation to CLI
- Add edge validation to `validate` command
- Update skill docs

### Phase 3: Adoption
- Update existing workflows with span context
- Generate initial spans.canvas edges from workflows
- Add CI validation

---

## Design Decisions

### Scope Handling

**Decision:** Spans in spans.canvas do not require explicit scope (for now).

**Rationale:**
- Events in otel.canvas already have `pv.otel.scope` (required for approved/implemented)
- Span scope can be inferred from the events within the span
- Cross-scope calls (e.g., your code → database library) involve external spans not in your spans.canvas
- spans.canvas implicitly documents spans from the owning scope

**Revisit when:** We have real-world data showing cross-scope edge validation is needed.

---

## Open Questions

1. **Should we support span patterns in workflows?**
   - Current proposal: exact names only
   - Alternative: allow patterns for flexibility

2. **How to handle dynamic span names?**
   - e.g., `validate.{filename}` where filename varies
   - Option: support `validate.$dynamic` syntax?

3. **Multiple scenarios with different spans?**
   - Success path uses spans A, B, C
   - Failure path uses spans A, D
   - Should edges be union of all scenarios?

4. **Span timing vs ordering?**
   - Events give order, but not explicit nesting
   - Should we add explicit `parentSpan` field?

---

## Related Documents

- [OTEL Span Matching](./OTEL-SPAN-MATCHING.md) - Runtime span matching
- [architecture.spans.md](./architecture.spans.md) - Current span conventions
- [Workflow Types](../packages/core/src/workflow/types.ts) - TypeScript definitions
