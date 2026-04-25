# Scope Path Enforcement Design

## Problem Statement

Scopes identify *which module* emitted a telemetry event — they are the top of the three-tier hierarchy (scope → namespace → action) established by the component-namespace design. Today a scope name like `principal-ai.core` is claimed by a canvas and associated with a set of owned scopes via `library.yaml`, but **nothing prevents code outside that module from instantiating the scope** and emitting events under its identity:

- A file under `packages/react/` can call `trace.getTracer('principal-ai.core')` and emit events that look like they came from `core` — scope identity silently diverges from physical code location.
- A refactor that extracts code from one module into another leaves scope names behind — emissions keep reporting the old scope even though the code has moved.
- Cross-package leaks (e.g., `packages/cli/` emitting events under `principal-ai.core`'s scope) are invisible to the validator today.

The component-namespace design ([`COMPONENT_NAMESPACE_ENFORCEMENT.md`](./COMPONENT_NAMESPACE_ENFORCEMENT.md)) solved this one tier down: an `event-namespace` node can declare `paths`, and events in that namespace may only be emitted from files covered by those paths. Scopes need the same treatment one tier up.

## Background

### Existing concepts

| Concept | Role | Where it's defined |
|---|---|---|
| **Instrumentation scope** | Module-level identity (OTEL scope name) | `.scopes.canvas`, `library.yaml` (`owned-scopes`) |
| **Scope → events canvas mapping** | File naming convention | `ScopeEventsValidator` |
| **Event namespace `paths`** | Component-level code-location partition | `event-namespace.namespace.paths` |
| **Namespace path resolution** | Longest-prefix match within a scope | `NamespacePathIndex` |
| **`otel-event.otel.files`** | Per-event emission-site list | `OtelMetadata` on event nodes |
| **`otel-scope.otel.files`** | Field exists but not enforced | `OtelMetadata` inherited by `OtelScopeNode` |

### The gap

`OtelScopeNode` inherits `OtelMetadata` (`packages/core/src/types/canvas.ts:921`), which includes an optional `files?: string[]`. Three issues:

1. **Not enforced.** `ScopesCanvasValidator` only checks that each owned scope has a node with a description. Nothing validates that `otel.files` entries exist on disk, that they partition cleanly across scopes, or that child artifacts (events, namespaces) stay within the scope's region.
2. **Semantically overloaded.** On `otel-event` nodes, `otel.files` means *"this event is emitted at these specific files"* (a list of emission sites). On `otel-scope` nodes the natural meaning is *"this scope owns this region of the repo"* (a partition). Those are different concepts and should not share a field.
3. **Inconsistent with namespace design.** Namespaces introduced a dedicated `paths` field rather than reusing `otel.files`, precisely so longest-prefix ownership partitioning could be modeled cleanly. Scopes should follow the same pattern.

## Proposed Solution

### Three-tier hierarchy, fully partitioned

Formalize the code-location partition at every tier:

```
scope     = module        paths on otel-scope nodes       (NEW)
namespace = component     paths on event-namespace nodes  (shipped)
action    = operation     suffix only
```

Scope paths define **module boundaries**; namespace paths define **component regions inside those boundaries**. Every namespace `paths` entry must be covered by its owning scope's `paths` — the tiers nest.

### Extend the `otel-scope` node

Add a dedicated `paths?: string[]` field to `OtelScopeNode`. Keep it separate from the inherited `otel.files` so the "ownership region" semantics remain distinct from the "emission site list" semantics already in use elsewhere.

**Before (current):**

```json
{
  "id": "core-scope",
  "type": "otel-scope",
  "description": "principal-ai core library",
  "otel": {
    "scope": "principal-ai.core"
  }
}
```

**After (proposed):**

```json
{
  "id": "core-scope",
  "type": "otel-scope",
  "description": "principal-ai core library",
  "paths": ["packages/core/src"],
  "otel": {
    "scope": "principal-ai.core"
  }
}
```

**Schema addition** (in `src/types/canvas.ts`):

```typescript
export interface OtelScopeNode extends OtelNodeBase {
  type: 'otel-scope';
  description?: string;
  /**
   * Optional source paths that define this scope's code region.
   * Each entry may be a folder (covers all descendants) or a specific file.
   * When present, events under this scope may only originate from files
   * covered by one of these paths, and every namespace declared in this
   * scope's events canvas must declare `paths` inside this region.
   * Scopes without `paths` remain unenforced — opt-in per scope.
   */
  paths?: string[];
  otel: OtelMetadata & {
    scope: string;
  };
}
```

The field is **optional**. Scopes without `paths` remain unenforced, matching today's behavior.

### Why a new field instead of reusing `otel.files`

Considered and rejected. See [Alternatives](#alternatives-considered). Summary: `otel.files` on event nodes already means "emission sites"; overloading it to mean "ownership region" on scope nodes would force every consumer that reads `otel.files` to branch on node type, and would make the partition semantics invisible at the schema level. A dedicated field is a single-line schema addition that keeps the two concepts separated everywhere downstream.

### Nested scopes and precedence

Scope names are dotted strings (`principal-ai.core`, `principal-ai.core.validation`). A nested scope is a child of its prefix scope. The same **longest-prefix wins** rule from the namespace design applies one tier up:

```json
{ "otel-scope": { "otel": { "scope": "principal-ai.core" },
                  "paths": ["packages/core/src"] } },
{ "otel-scope": { "otel": { "scope": "principal-ai.core.validation" },
                  "paths": ["packages/core/src/validation"] } }
```

| File | Covered by | Legal scope |
|---|---|---|
| `packages/core/src/events/canvas.ts` | `principal-ai.core` (parent only) | `principal-ai.core` |
| `packages/core/src/validation/engine.ts` | `principal-ai.core.validation` (longer prefix) | `principal-ai.core.validation` |
| `packages/core/src/validation/rules/foo.ts` | `principal-ai.core.validation` (inherited) | `principal-ai.core.validation` |

Parent and child scopes **partition** the tree — they never overlap on the same file. Sibling scopes may not overlap at all.

### When to use multiple paths

Same guidance as namespace paths. One entry should be the norm. Legitimate multi-path cases for scopes:

| Case | Example |
|---|---|
| **Monorepo package bundled as one scope** | `["packages/core/src", "packages/core-shared/src"]` when two packages publish under one scope name |
| **Generated code mirrors source** | `["packages/core/src", "packages/core/generated"]` |
| **Platform-specific implementations** | `["packages/core/browser", "packages/core/node"]` |
| **Migration period** | Old and new locations coexist during a cutover |

The validator warns when `paths.length > 1` to prompt "are you sure?" — same convention as namespaces.

### Relationship to namespace paths

Scope and namespace tiers nest. For each scope with `paths` declared:

- Every `event-namespace` node in that scope's events canvas whose `namespace.paths` is set must have each entry covered by at least one of the scope's `paths`.
- A namespace path escaping its scope's region is an error (`scopes-namespace-paths-escape`) — it means the canvas is claiming a component lives outside its module.
- Scopes without `paths` do not constrain their namespaces (opt-in per scope). Namespaces without `paths` in an enforced scope are still allowed — namespace-level enforcement remains independently opt-in.

### Resolution algorithm (static)

Given a source file and a target scope:

1. Across all `otel-scope` nodes with `paths` declared, find those whose paths cover the file.
2. Pick the scope whose matched path is the **longest prefix** of the file.
3. If that scope's name equals the target scope → pass.
4. If a different scope has a longer prefix → `scopes-otel-files-wrong-scope` (error): the event or artifact is claiming the wrong scope for its location.
5. If no scope has paths covering the file → `scopes-otel-files-orphan` (warning).

Scopes without `paths` do not participate in resolution — they neither claim nor deny any file.

### Validation modes

| Mode | Trigger | Input | Hook |
|---|---|---|---|
| **Canvas-time (Phase 1)** | Canvas validation (CLI) | `paths` on `otel-scope` nodes | Extend `ScopesCanvasValidator` |
| **Static cross-canvas (Phase 2)** | Canvas validation (CLI) | `otel-event.otel.files` and `event-namespace.paths` vs owning scope's `paths` | New `ScopePathsValidator` (analogue of `OtelEventPathsValidator`) |
| **Runtime (Phase 3, deferred)** | Trace processing / test execution | `code.filepath` on emitted events | `EventValidator`, `EventRecorderService` |

Ship Phase 1 first. Phase 2 slots into the existing cross-canvas pipeline the CLI already runs.

### Error codes

Extend the `scopes-*` error code family.

**Phase 1 (canvas-time):**

| Code | Severity | Meaning |
|---|---|---|
| `scopes-paths-multiple` | warning | A scope declares more than one path — prompt to confirm |
| `scopes-paths-missing` | warning | A `paths` entry does not exist on disk |
| `scopes-paths-overlap` | error | Two scopes declare paths that overlap outside a valid parent-child partition |
| `scopes-namespace-paths-escape` | error | A namespace's `paths` entry is not covered by its owning scope's `paths` |

**Phase 2 (static cross-canvas):**

| Code | Severity | Meaning |
|---|---|---|
| `scopes-otel-files-wrong-scope` | error | A file in an `otel-event.otel.files` list is covered by a different scope's paths than the canvas it's declared in |
| `scopes-otel-files-orphan` | warning | A file in an `otel-event.otel.files` list is not covered by any scope's paths |

**Phase 3 (runtime, deferred):**

| Code | Severity | Meaning |
|---|---|---|
| `scopes-emission-wrong-scope` | error | Event emitted from file `X` under scope `S`, but scope `T` has a longer-prefix path covering `X` |
| `scopes-emission-orphan` | warning | File `X` emits an event but is not covered by any scope's `paths` |

### Canvas-level validation (Phase 1 detail)

Extend `ScopesCanvasValidator` to check, for each `otel-scope` node with `paths`:

1. Each path entry exists on disk (warning if missing).
2. No two scopes have overlapping `paths` except in the strict parent-child prefix case (handled by longest-prefix resolution).
3. Every `paths` entry must be inside the repository (no absolute paths, no escapes).
4. Warn when any scope has `paths.length > 1`.
5. Cross-check: for each namespace in this scope's events canvas that declares `namespace.paths`, every entry must be covered by this scope's `paths`.

Check 5 requires the validator to locate the events canvas for the scope — the scope → events canvas mapping already exists via `ScopeEventsValidator`, so this is a wiring task rather than a new lookup.

### Handling shared/utility code

Same lenient-by-default stance as namespaces. Files not covered by any scope's `paths` are simply unowned; emissions from them produce `scopes-emission-orphan` warnings (Phase 3). No strict mode is planned for v1.

### Reuse opportunities

The namespace design already ships:

- `packages/core/src/events/path-helpers.ts` — `normalizePath`, `pathCovers`, `pathsOverlap`. All reusable as-is.
- `packages/core/src/events/NamespacePathIndex.ts` — longest-prefix resolver. Generalize or clone for scope-level resolution (`ScopePathIndex`), keyed on scope name rather than `(scope, filepath)`.
- `packages/core/src/events/OtelEventPathsValidator.ts` — the cross-canvas validator pattern. Phase 2's `ScopePathsValidator` is a direct analogue operating at the scope tier.

Cloning vs. generalizing is a judgment call. The namespace index's `(scope, filepath) → namespace` API is already scope-keyed; extracting a shared `PathIndex<K>` is possible but not required for the first cut. Start by cloning, factor out shared internals once the second validator lands.

## Case Study: packages/core

### Current state

The repo has one scopes canvas (`.principal-views/architecture.scopes.canvas`) declaring scope nodes for each owned scope. Scopes today carry description only — no `paths`.

### Proposed canvas: `architecture.scopes.canvas`

Each `otel-scope` node gains a `paths` field:

```json
{
  "nodes": [
    {
      "id": "core-scope",
      "type": "otel-scope",
      "description": "principal-ai core library (canvas validation, trace processing, codegen)",
      "paths": ["packages/core/src"],
      "otel": { "scope": "principal-ai.core" }
    },
    {
      "id": "cli-scope",
      "type": "otel-scope",
      "description": "principal-ai CLI",
      "paths": ["packages/cli/src"],
      "otel": { "scope": "principal-ai.cli" }
    },
    {
      "id": "react-scope",
      "type": "otel-scope",
      "description": "principal-ai React components",
      "paths": ["packages/react/src"],
      "otel": { "scope": "principal-ai.react" }
    },
    {
      "id": "logger-scope",
      "type": "otel-scope",
      "description": "shared logger",
      "paths": ["packages/logger/src"],
      "otel": { "scope": "principal-ai.logger" }
    }
  ]
}
```

With all namespaces in `packages/core/src/events/principal-ai-core.events.canvas` declaring `paths` under `packages/core/src/**`, the scope-namespace nesting check passes trivially. Any future namespace declaring, say, `paths: ["packages/react/src/hooks"]` inside the core events canvas would surface `scopes-namespace-paths-escape`.

### Tensions this surfaces

1. **Monorepo root vs. package root.** `paths: ["packages/core/src"]` scopes cleanly to a package. If a scope ever spans multiple packages, multi-path is the escape hatch — but the warning will prompt authors to confirm.
2. **Test code and fixtures.** `packages/core/src/**/*.test.ts` is covered by the core scope's paths — tests can legally emit core events. If tests emitting production events is undesirable, a dedicated `scopes-paths-exclude` field could be added later. Out of scope for v1.
3. **Build artifacts.** `dist/`, `generated/`, etc. should not be covered by scope paths. Authors should list source paths only.

## Alternatives Considered

### Reuse `otel.files` on `otel-scope` nodes

**Rejected.** The field exists, which is superficially attractive, but:

- `otel.files` on `otel-event` nodes already means "emission sites" — the exhaustive list of files that emit this event. Overloading it to mean "ownership region" on scope nodes splits the semantics based on node type, forcing every consumer that reads `otel.files` to branch.
- The namespace design deliberately introduced a separate `paths` field for the same reason. Mirroring that at the scope tier keeps the data model coherent across tiers.
- Consumers that currently read `otel.files` on scope nodes (e.g., `telemetry/coverage.ts`) would need to interpret the field differently under this rule. A dedicated field avoids the retrofit.

### Infer scope paths from namespace paths

**Rejected.** Could define scope paths as the union of all namespace paths under that scope. But:

- Scopes may own code that is not part of any namespace (orchestrators, top-level services). Inferred paths would not cover those files.
- Scope ownership is a deliberate architectural claim; deriving it bottom-up blurs the distinction between the tiers.
- The canvas becomes non-self-describing — reading the scopes canvas no longer tells you where the scope lives.

### Per-package marker file (`.scope.yaml`)

**Rejected** for the same reasons the namespace design rejected per-folder markers: architecture scatters across the tree, no central view, another format.

## Open Questions

1. **External scopes.** Scopes declared in `library.yaml` as `origin: external` have no code in this repo. They should be allowed to omit `paths` even if other scopes enforce them. Current proposal: `paths` is optional and unenforced when absent; external scopes naturally opt out.

2. **Scope declared in library.yaml but not in scopes canvas.** `library.yaml` lists `owned-scopes`; the scopes canvas provides visual metadata. If a scope is only in `library.yaml`, it cannot declare `paths`. Current proposal: `paths` enforcement requires a scopes canvas node; library-only scopes remain unenforced. Document the limitation; revisit if needed.

3. **Single-file scopes.** A tiny package might want a single-file scope path (`packages/foo/src/index.ts`). The longest-prefix rule already supports file entries. No change needed, but worth calling out in docs.

4. **Cross-scope events.** Some events are legitimately emitted from multiple scopes (instrumentation of a shared helper). Phase 3 runtime validation would flag these. Current proposal: treat as `scopes-emission-wrong-scope` by default; add an allowlist mechanism only if real-world cases justify the complexity.

## Non-Goals

- **Not** replacing `library.yaml` scope declaration. `owned-scopes` remains the authoritative list of scopes a package claims. `paths` adds spatial enforcement; it does not move scope identity.
- **Not** enforcing package boundaries at the filesystem level. Authors can still `import` across packages; the rule only governs which scope name may be used to emit from a given file.
- **Not** auto-generating scope names from folder paths. Scope name and location are independent declarations.
- **Not** a runtime sandbox. Runtime validation (Phase 3) reports violations but does not prevent emissions.
- **Not** a migration tool. Retrofitting is opt-in — scopes without `paths` remain unenforced.

## Migration & Rollout

1. **Phase 1** — Schema change: add optional `paths` to `OtelScopeNode`. Extend `ScopesCanvasValidator` to check path existence, partition validity, multi-path warnings, and scope-namespace nesting (`scopes-namespace-paths-escape`).
2. **Phase 2** — Static cross-canvas: `ScopePathsValidator` checks every `otel-event.otel.files` entry against the owning scope's `paths`. Emits `scopes-otel-files-wrong-scope` and `scopes-otel-files-orphan`.
3. **Phase 3 (deferred)** — Runtime validation via `code.filepath` for emissions from code not declared in any `otel-event.otel.files`.
4. **Phase 4 (deferred)** — Consider a canvas-level `exemptPaths` if orphan warnings prove too noisy in practice.

Phase 1 dogfooding: add `paths` to each `otel-scope` node in `architecture.scopes.canvas` and run `cli validate`. Phase 2 dogfooding: same, with the cross-canvas validator wired into the CLI pipeline alongside `OtelEventPathsValidator`.
