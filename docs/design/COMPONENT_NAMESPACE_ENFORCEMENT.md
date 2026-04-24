# Component Namespace Enforcement Design

## Problem Statement

Event names drift. Today, an event like `validation.started` can be emitted from anywhere in a codebase — a file under `src/validation/`, a middleware under `src/middleware/`, or a utility under `src/utils/`. Nothing prevents naming inconsistencies where:

- An event named `validation.started` is emitted from code that has nothing to do with validation.
- A folder called `conversion/` emits events named `parse.*` instead of `conversion.*`.
- Refactors rename folders but leave the old namespace intact (or vice versa), causing event identity to silently diverge from code location.

The existing system provides **scope**-level identity via OpenTelemetry instrumentation scopes and maps scopes to events canvas files (e.g., `backlog.md.cli` → `backlog-md-cli.events.canvas`). However, **within a scope**, the relationship between internal components and event namespaces is unenforced — any file can emit any event in any namespace.

This design proposes a lightweight enforcement mechanism that binds event namespaces to folder-defined components by extending the existing `event-namespace` node schema with a path declaration.

## Background

### Existing concepts

| Concept | Role | Where it's defined |
|---|---|---|
| **Instrumentation scope** | Module-level identity (OTEL scope name) | `.scopes.canvas`, `library.yaml` |
| **Scope → events canvas mapping** | File naming convention | `ScopeEventsValidator` |
| **Event namespace** | Component-level identity within a scope | `event-namespace` nodes in `.events.canvas` |
| **Event name format** | `{namespace}.{action}`, min 2 segments | `EventsCanvasValidator.extractNamespace` |
| **`code.filepath` attribute** | Runtime source location on emitted events | OTEL convention, honored by `EventValidator` |
| **Scope `otel.files`** | Scope-level path declaration (already exists) | `OtelMetadata` on `otel-scope` nodes |

### The gap

The scope system answers *"which module emitted this event?"* and already declares source files via `otel.files` on scope nodes. The namespace system answers *"which component within the module?"* but has **no path declaration** — there is no way to say "the `events` namespace corresponds to `src/events/`."

This is the missing piece. Scopes already do this; namespaces should too.

## Proposed Solution

### Three-tier hierarchy

Formalize the mapping between code organization and event identity:

```
scope     = module    = package boundary      (declared via scope otel.files)
namespace = component = internal subsystem    (declared via namespace paths — NEW)
action    = operation = specific event        (suffix)
```

Example:

```
Scope:     principal-ai.core    (otel.files: ["packages/core/**"])
Component: events                (paths:      ["packages/core/src/events"])
Event:     events.canvas.validated
            └────┬────┘ └────┬────┘
            namespace      action
```

### Extend the `event-namespace` node

Add a `paths` field to the existing namespace schema. Each entry may reference a single file or a folder; folders cover all descendants. Using an array matches the existing `otel.files: string[]` pattern on scope nodes and accommodates legitimate multi-location cases (generated code, platform splits, migration periods).

**Before (current):**

```json
{
  "id": "events",
  "type": "event-namespace",
  "namespace": {
    "name": "events",
    "description": "Event canvas validation lifecycle",
    "events": [ ... ]
  }
}
```

**After (proposed):**

```json
{
  "id": "events",
  "type": "event-namespace",
  "namespace": {
    "name": "events",
    "description": "Event canvas validation lifecycle",
    "paths": ["packages/core/src/events"],
    "events": [ ... ]
  }
}
```

**Schema addition** (in `src/types/canvas.ts`):

```typescript
interface EventNamespaceDefinition {
  name: string;
  description?: string;
  paths?: string[];           // NEW: folder or file paths relative to repo root
  events: EventDefinition[];
}
```

The field is **optional**. Namespaces without `paths` remain unenforced (matches today's behavior) — enforcement is opt-in per namespace.

### Why this is better than a separate manifest

1. **No new file format.** Authors already edit `.events.canvas` when defining events. Adding one field keeps namespace identity, documentation, and location bound together.
2. **Single source of truth.** Event name, description, attributes, severity, *and* source location all live on one node. Reading one node tells you everything about the namespace.
3. **Scope is implicit.** The events canvas filename already maps to a scope (existing `ScopeEventsValidator` convention). No need to re-declare scope in a separate manifest.
4. **Consistent with scopes.** `otel-scope` nodes already declare `otel.files`. Adding `paths` to `event-namespace` nodes is the same pattern one level down — namespace-level declaration mirrors scope-level declaration.
5. **Opt-in by construction.** Namespaces without `paths` are unenforced. No migration is forced.

### When to use multiple paths

One entry is expected to be the norm. A namespace legitimately needs more than one path in cases like:

| Case | Example |
|---|---|
| **Generated code mirrors source** | `["src/events", "src/generated/events"]` — both emit `events.*` but codegen output can't be co-located with handwritten source |
| **Platform-specific implementations** | `["src/platform/browser/http", "src/platform/node/http"]` — splitting into separate namespaces would leak a platform detail into event identity |
| **Migration period** | Old and new locations coexist during a cutover without forcing premature churn |
| **Facade + internal implementation** | `["src/events", "src/_internal/events"]` — public API and private impl share the namespace |

Cases that *look* multi-path but aren't:

- "I want to group three subfolders conceptually" → create a wrapping folder with a single path.
- "I have subcomponents" → use **nested namespaces** (see precedence below), not multiple paths on one namespace.
- "Test helpers emit events" → tests shouldn't emit production events; fix the emission, not the path.

The validator warns when `paths.length > 1` to prompt "are you sure?", without blocking the legitimate cases.

### Nested namespaces and precedence

A namespace hierarchy like `workflow` / `workflow.scenarios` / `workflow.templates` corresponds naturally to a folder hierarchy. The existing event-name grammar already supports multi-segment namespaces — this design adds spatial meaning to that hierarchy via path declarations.

**Rule: longest-prefix wins (partitioning).**

A file is covered by **at most one** namespace: whichever namespace's declared path most specifically covers it. Parent namespaces cover their subtree *except* where a deeper namespace claims a sub-path. Parent and child namespaces **partition** the tree — they never overlap on the same file.

Example:

```json
{
  "namespace": { "name": "workflow",
                 "paths": ["src/workflow"] }
},
{
  "namespace": { "name": "workflow.scenarios",
                 "paths": ["src/workflow/scenarios"] }
}
```

| File | Covered by | Legal events |
|---|---|---|
| `src/workflow/orchestrator.ts` | `workflow` (parent only) | `workflow.*` |
| `src/workflow/scenarios/matcher.ts` | `workflow.scenarios` (longer prefix) | `workflow.scenarios.*` |
| `src/workflow/scenarios/helpers/fmt.ts` | `workflow.scenarios` (inherited) | `workflow.scenarios.*` |

If only the child namespace is declared (no `workflow` namespace exists), files in `src/workflow/*.ts` at the parent level are orphaned — they're not covered by any path and emit `events-orphan-emission` warnings if they emit events.

**Namespace name is independent of path depth.** A namespace named `matchers` can legally declare `paths: ["src/workflow/scenarios"]`. The rule enforces emission location, not naming hierarchy. This gives authors freedom to use short names (`retry` vs `infrastructure.http.retry`) without forcing a folder restructure. If this flexibility causes confusion in practice, a warning can be added later.

### Path resolution algorithm

Given a source file path and an emitted event:

1. Locate the events canvas for the emitting scope (via the existing scope → canvas filename convention).
2. Extract the namespace from the event name (existing `extractNamespace` logic).
3. Find all `event-namespace` nodes whose `paths` cover the emitting file. Pick the one whose matching path is the **longest prefix** of the file path.
4. If no node has `paths` covering the file → `events-orphan-emission` (warning).
5. If the matched namespace equals the event's namespace → pass.
6. If the matched namespace differs from the event's namespace → `events-namespace-paths-conflict` (error). The event is using the wrong namespace for its emission location.
7. If the event's declared namespace has no `paths` at all, but another namespace's `paths` cover the file → same conflict error.

### Validation modes

| Mode | Trigger | Input | Existing hook |
|---|---|---|---|
| **Static cross-canvas** | Canvas validation (CLI) | `otel.files` on `otel-event` nodes vs `paths` on `event-namespace` nodes | CLI `validate` command, `EventsCanvasValidator` |
| **Runtime** | Trace processing / test execution | `code.filepath` attribute on emitted events | `EventValidator`, `EventRecorderService` — deferred |

**Recommendation:** ship static cross-canvas validation first. Both sources of truth already live in canvases the CLI loads — an `otel-event` node already declares its implementation files via `otel.files`, and (after Phase 1) an `event-namespace` node declares its code location via `paths`. Comparing the two is language-agnostic, requires no AST parsing, and slots into the existing `validate` pipeline that already cross-checks canvases. Runtime validation is a later layer — useful for catching drift from code that wasn't registered in `otel.files`, but much less leverage per unit of work.

### Error codes

Extend the existing `events-*` error code family.

**Phase 1 (canvas-time — shipped):**

| Code | Severity | Meaning |
|---|---|---|
| `events-namespace-multiple-paths` | warning | A namespace declares more than one path — prompt to confirm the multi-location is intentional |
| `events-namespace-paths-missing` | warning | A `paths` entry does not exist on disk |
| `events-namespace-paths-overlap` | error | Two namespaces declare paths that overlap in a way that isn't a clean parent-child partition |

**Phase 2 (static cross-canvas):**

| Code | Severity | Meaning |
|---|---|---|
| `events-otel-files-wrong-namespace` | error | A file in an `otel-event.otel.files` list is covered by a *different* namespace's paths than the event's own (longest-prefix match) |
| `events-otel-files-orphan` | warning | A file in an `otel-event.otel.files` list is not covered by any namespace's paths |

The two rules partition the failure space. Enforcement is opt-in per namespace: if the event's namespace declares no `paths`, its files are not checked.

**Phase 2+ (runtime, deferred):**

| Code | Severity | Meaning |
|---|---|---|
| `events-namespace-paths-mismatch` | error | Event emitted from file `X` uses namespace `Y`, but none of `Y.paths` cover `X` |
| `events-namespace-paths-conflict` | error | Event emitted from file `X` uses namespace `Y`, but namespace `Z` has a longer-prefix path covering `X` |
| `events-orphan-emission` | warning | File `X` emits an event but is not covered by any namespace `paths` in the scope's canvas |

### Canvas-level validation

Extend `EventsCanvasValidator` to check:

1. For each namespace node with `paths`, verify each entry exists on disk (warning if missing).
2. No two namespaces have overlapping `paths` values **except** in the parent-child case where one path is strictly a prefix of the other (that's a valid partition, handled by longest-prefix resolution).
3. Every `paths` entry must be inside the scope's file boundary (covered by the scope's `otel.files`). A namespace can't reach outside its scope.
4. Warn when any namespace has `paths.length > 1`.

### Handling shared/utility code

Files that don't belong to any component (shared utils, type definitions, helpers) are simply **not covered by any namespace `paths`**. Two design options for how to treat event emissions from these files:

- **Lenient (recommended for v1):** emit `events-orphan-emission` as a warning. Authors can silence with an inline annotation if the emission is intentional.
- **Strict:** require either a namespace path covering the file or an explicit exempt declaration.

A future canvas-level `exemptPaths` array could be added if strict mode is wanted, but is out of scope for the initial design.

## Case Study: packages/core

### Current state (mixed organization)

**Already component-shaped** (map cleanly to namespaces):
`events/`, `scopes/`, `spans/`, `workflow/`, `dashboard/`, `execution/`, `discovery/`, `registry/`, `parsers/`, `matchers/`, `orchestration/`, `rules/`, `telemetry/`, `codegen/`, `storyboard/`, `cli/`

**Root-level services with no component folder**:
`EventProcessor.ts`, `ValidationEngine.ts`, `ConfigurationLoader.ts`, `ConfigurationValidator.ts`, `LibraryLoader.ts`, `PathBasedEventProcessor.ts`, `SessionManager.ts`, `EventRecorderService.ts`

**Shared/technical folders** (no component identity):
`types/`, `utils/`, `helpers/`, `generated/`

### Proposed canvas: `principal-ai-core.events.canvas`

Each existing `event-namespace` node gains a `paths` field:

```json
{
  "nodes": [
    {
      "id": "events",
      "type": "event-namespace",
      "namespace": {
        "name": "events",
        "description": "Events canvas validation lifecycle",
        "paths": ["packages/core/src/events"],
        "events": [
          { "name": "events.canvas.validated", "severity": "INFO" },
          { "name": "events.namespace.mismatch", "severity": "ERROR" }
        ]
      }
    },
    {
      "id": "workflow",
      "type": "event-namespace",
      "namespace": {
        "name": "workflow",
        "paths": ["packages/core/src/workflow"],
        "events": [
          { "name": "workflow.scenario.resolved", "severity": "INFO" },
          { "name": "workflow.template.rendered", "severity": "INFO" }
        ]
      }
    },
    {
      "id": "trace",
      "type": "event-namespace",
      "namespace": {
        "name": "trace",
        "description": "Trace processing pipeline (parsers + matchers + orchestration)",
        "paths": ["packages/core/src/trace"],
        "events": [
          { "name": "trace.span.parsed", "severity": "INFO" },
          { "name": "trace.span.matched", "severity": "INFO" },
          { "name": "trace.orchestrated", "severity": "INFO" }
        ]
      }
    },
    {
      "id": "event-processor",
      "type": "event-namespace",
      "namespace": {
        "name": "event-processor",
        "paths": ["packages/core/src/event-processor"],
        "events": [
          { "name": "event-processor.event.ingested", "severity": "INFO" }
        ]
      }
    }
  ]
}
```

Shared folders (`types/`, `utils/`, `helpers/`, `generated/`) simply have no corresponding namespace node whose `paths` cover them. Event emissions from those files produce `events-orphan-emission` warnings.

### Tensions this surfaces

1. **Root-level services have no component home.** Today `EventProcessor.ts`, `ValidationEngine.ts`, etc. float at `src/`. The rule forces them into folders — good hygiene, a refactor prerequisite rather than a design flaw.

2. **`ValidationEngine.ts` vs `src/validation/`.** Architectural drift is already present — a top-level file and a folder both claim "validation." The rule forces a choice: is `ValidationEngine` the validator (→ moves into `src/validation-engine/`), or is `src/validation/` the component and `ValidationEngine.ts` should move into it?

3. **Trace processing is fragmented.** `parsers/`, `matchers/`, `orchestration/` collectively implement one pipeline. The author can either group them under `src/trace/` with a single `trace` namespace (shown above) or keep them flat as three namespaces. The canvas author chooses.

4. **`utils/` and `helpers/` both exist.** The rule doesn't fix the duplication, but event emissions from these folders now produce orphan warnings, making the non-component status visible instead of invisible.

### Example events under this scheme

```
events.canvas.validated           → packages/core/src/events/
events.namespace.mismatch
scopes.hierarchy.invalid          → packages/core/src/scopes/
workflow.scenario.resolved        → packages/core/src/workflow/
workflow.template.rendered
trace.span.parsed                 → packages/core/src/trace/
trace.span.matched
trace.orchestrated
codegen.types.generated           → packages/core/src/codegen/
registry.version.registered       → packages/core/src/registry/
discovery.canvas.found            → packages/core/src/discovery/
validation-engine.constraint.violated → packages/core/src/validation-engine/
event-processor.event.ingested    → packages/core/src/event-processor/
```

## Alternatives Considered

### Separate manifest file (`component-map.yaml`)

**Rejected** in favor of extending the events canvas.

- **Pros:** centralizes all namespace-to-path mappings in one place per package; easier to read as a standalone architecture document.
- **Cons:** introduces a new file format; splits namespace identity (events canvas) from namespace location (manifest); authors now maintain two files in sync.

The canvas-extension approach wins because the events canvas is already the authoritative source for namespace identity. Adding one field keeps the data model coherent.

### Per-folder marker files (`.component.yaml`)

**Rejected.**

- **Pros:** component identity travels with the folder on rename/move.
- **Cons:** architecture is scattered across the tree; no central view; another file format to learn.

### Singular `path` instead of `paths` array

**Rejected.** Single-path has architectural appeal (forces one location per namespace), but breaks under generated code, platform splits, and migration periods. Using `paths: string[]` matches the existing `otel.files: string[]` convention on scope nodes, and a canvas-time warning when `paths.length > 1` preserves the "one location" pressure without hard-blocking legitimate cases.

### Requiring namespace name to mirror path depth

**Rejected.** A namespace at `src/workflow/scenarios/` could be named `workflow.scenarios` *or* `matchers` — the rule enforces emission location, not naming hierarchy. This gives authors freedom to use short names where appropriate without forcing folder restructures. May be revisited if practice shows the divergence causes confusion.

## Open Questions

1. **Orchestration files.** A top-level coordinator file emits events for multiple sub-operations. Is it its own namespace (e.g., `pipeline.*`) or does it emit events across multiple namespaces? Current proposal: it is its own namespace, placed in its own folder, emitting orchestration-level events only.

2. **Multi-emitter events.** The same event may be emitted from multiple locations. Does any single out-of-component emission break the rule? Current proposal: yes — the namespace's `paths` are the only legal emission surface for events in that namespace.

3. **Language support.** Runtime validation via `code.filepath` is language-agnostic. Static analysis requires per-language AST parsers. What languages are in scope for the first release?

4. **Explicit exemption.** Should shared folders (`types/`, `utils/`) be explicitly exemptable via a canvas-level field, or is the orphan-emission warning enough? Current proposal: warning-only for v1; add `exemptPaths` later if noise becomes a problem.

## Non-Goals

- **Not** enforcing folder structure itself. This design only binds event namespaces to whatever folder structure already exists.
- **Not** auto-generating event names from folder names. Authors still declare events explicitly in `.events.canvas`; the rule only constrains *where* they can be emitted.
- **Not** requiring namespace names to mirror folder hierarchy. Name and location are independent declarations.
- **Not** replacing OTEL scopes. Scope enforcement (package-level via `otel.files`) and namespace enforcement (component-level via namespace `paths`) are complementary layers.
- **Not** a static type system for events. Runtime validation catches emission-site mismatches; it does not prevent compile-time references to events by name.
- **Not** a backwards-compatibility tool. Retrofitting is possible but opt-in — namespaces without `paths` remain unenforced.

## Migration & Rollout

1. **Phase 1 (shipped):** Schema change — add optional `paths` to `event-namespace` nodes. `EventsCanvasValidator` checks that declared paths exist, don't form invalid overlaps, and warns on multi-path declarations.
2. **Phase 2:** Static cross-canvas validation. For every `otel-event` node, cross-reference each entry in `otel.files` against the declared `paths` of the event's namespace. Emits `events-otel-files-outside-namespace`, `events-otel-files-wrong-namespace`, and `events-otel-files-orphan`.
3. **Phase 3 (deferred):** Runtime validation via `code.filepath` for emissions from code not declared in any `otel-event.otel.files`.
4. **Phase 4 (deferred):** Cross-scope leak detection — flag when an event's `otel.files` crosses the boundary of its scope's declared `otel.files`.
