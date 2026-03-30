# Scope and Surface Filtering Design

This document outlines the design for hierarchical filtering of workflows by **scope** (instrumentation scope) and **surface** (span convention).

## Concepts

### OpenTelemetry Hierarchy

```
Resource (service identity)
└── Scope (instrumentation scope / tracer instance)
    └── Span (unit of work)
        └── Events (points in time within a span)
```

### Principal View Mapping

| OTEL Concept | Canvas Type | Node Type | Example |
|--------------|-------------|-----------|---------|
| Resource | `.resources.canvas` | `otel-resource` | `service.name: auth-api` |
| Scope | `.scopes.canvas` | `otel-scope` | `auth-service` |
| Span | `.spans.canvas` | `otel-span-convention` | `auth.login` |
| Workflow | `.workflow.json` | N/A | `login-flow` |

## Key Assumptions

### 1. Each span belongs to exactly one scope

In OpenTelemetry, a span is created by a tracer (scope). Each span instance belongs to exactly one scope.

```typescript
// In code, a span is created by a specific tracer
const tracer = trace.getTracer('auth-service'); // scope
const span = tracer.startSpan('auth.login');    // span belongs to 'auth-service'
```

### 2. A workflow's scope is determined by its rootSpan

The workflow's "home" scope is the scope that creates its entry point (rootSpan). While child spans within the workflow may cross scope boundaries (e.g., calling into libraries with their own instrumentation), the workflow itself is anchored to one scope.

```
Workflow: login-flow
  rootSpan: auth.login (scope: auth-service) ← workflow belongs to auth-service
    ├── auth.validate-token (scope: auth-service)
    └── database.query (scope: db-client)  ← different scope, but workflow still "lives" in auth-service
```

### 3. Span conventions declare their scope

Each span convention node in `spans.canvas` declares which scope creates it:

```json
{
  "type": "otel-span-convention",
  "label": "Login",
  "otel": {
    "spanPattern": "auth.login",
    "scope": "auth-service"
  }
}
```

### 4. Filters are hierarchical

Filtering is hierarchical: Scope → Surface (Span) → Workflow

- Selecting a **scope** shows only workflows whose rootSpan belongs to that scope
- Selecting a **surface** (span convention) shows only workflows that reference that span
- Both filters can be combined

## Data Model Changes

### ReferencedSpan (implemented in v0.26.16)

```typescript
interface ReferencedSpan {
  pattern: string;   // e.g., "auth.login"
  label?: string;    // e.g., "Login" (from spans.canvas node label)
  scope?: string;    // e.g., "auth-service" (from spans.canvas node otel.scope)
}
```

### DiscoveredWorkflow (implemented)

```typescript
interface DiscoveredWorkflow {
  // ... existing fields ...
  scope: 'root' | 'package';  // existing field - package/root scope

  /** Span conventions referenced by this workflow */
  referencedSpans?: ReferencedSpan[];

  /**
   * The instrumentation scope this workflow belongs to.
   * Derived from the rootSpan's scope in spans.canvas.
   * Only populated when includeContent: true during discovery.
   */
  instrumentationScope?: string;

  /**
   * Display label for the instrumentation scope.
   * Resolved from scopes.canvas.
   */
  instrumentationScopeLabel?: string;
}
```

Note: Uses `instrumentationScope` instead of `scope` to avoid conflict with the existing `scope: 'root' | 'package'` field.

## Implementation Plan

### Phase 1: Extend span lookup to include scope ✅ (v0.26.16)

1. ✅ Renamed `buildSpanLabelLookup` to `buildSpanLookup` and updated to extract `otel.scope` from span convention nodes
2. ✅ Changed return type from `Map<string, string>` to `Map<string, SpanInfo>` where `SpanInfo = { label?: string; scope?: string }`
3. ✅ Added `buildScopeLabelLookup` to build scope label lookup from `scopes.canvas` nodes

### Phase 2: Add scope to ReferencedSpan and DiscoveredWorkflow ✅ (v0.26.16)

1. ✅ Updated `ReferencedSpan` type to include `scope?: string`
2. ✅ When populating `referencedSpans`, include the scope from the lookup
3. ✅ Added `instrumentationScope?: string` and `instrumentationScopeLabel?: string` to `DiscoveredWorkflow`
4. ✅ Derive workflow's scope from its rootSpan's scope

### Phase 3: Add validation rules ✅ (v0.26.16)

1. ✅ Validate workflow's `rootSpan` exists in spans.canvas
2. ✅ Validate span conventions have `otel.scope` defined
3. ✅ Warn if scope references don't exist in scopes.canvas
4. ✅ Add these to the discovery `errors` array via `validateScopeHierarchy()`

### Phase 4: Update StoryboardListPanel (TODO)

1. Add scope filter dropdown (similar to surface filter)
2. Show scope labels from scopes.canvas
3. Collect unique scopes from workflows
4. Make filters hierarchical:
   - When scope is selected, surface dropdown only shows surfaces in that scope
   - When surface is selected, scope dropdown auto-selects the matching scope

## Example: Filtering Flow

Given:
- Scopes: `auth-service`, `payment-service`, `db-client`
- Surfaces: `auth.login`, `auth.logout`, `payment.process`, `db.query`
- Workflows: `login-flow`, `checkout-flow`

User interaction:

1. **Initial state**: All workflows visible
2. **Select scope "auth-service"**: Shows only `login-flow` (its rootSpan `auth.login` belongs to `auth-service`)
3. **Surface dropdown updates**: Only shows `auth.login`, `auth.logout` (surfaces in `auth-service`)
4. **Select surface "auth.login"**: Further filters to workflows referencing that span

## Validation Requirements

To ensure the hierarchical filtering works correctly, we add validation rules:

### 1. Workflow rootSpan must exist in spans.canvas

Every workflow's `rootSpan` must have a corresponding `otel-span-convention` node in `spans.canvas`.

**Error if missing:**
```
Workflow "login-flow" has rootSpan "auth.login" but no matching span convention
was found in spans.canvas. Add an otel-span-convention node with
spanPattern: "auth.login".
```

### 2. Span conventions must declare a scope

Every `otel-span-convention` node in `spans.canvas` must have `otel.scope` defined.

**Error if missing:**
```
Span convention "auth.login" in spans.canvas does not declare a scope.
Add otel.scope to specify which instrumentation scope creates this span.
```

### 3. Scope must exist in scopes.canvas

The `otel.scope` value on a span convention should reference a valid scope defined in `scopes.canvas`.

**Warning if missing:**
```
Span convention "auth.login" references scope "auth-service" but no matching
otel-scope node was found in scopes.canvas. Consider adding it for documentation.
```

This validation ensures:
- All workflows have a determinable scope
- The scope hierarchy is fully documented
- Filtering will work correctly for all workflows

## Design Decisions

### Scope is always derived from rootSpan

We do NOT use the `scope` field in workflow.json for filtering. The workflow's scope is always derived from its rootSpan's scope in spans.canvas.

This keeps spans.canvas as the **single source of truth** for scope ownership.

### Scope labels come from scopes.canvas

When displaying scopes in the filter dropdown, we look up the scope name in `scopes.canvas` to get its display label from the `otel-scope` node.

## Related Files

- `packages/core/src/discovery/types.ts` - `ReferencedSpan`, `DiscoveredWorkflow`
- `packages/core/src/discovery/CanvasDiscovery.ts` - `buildSpanLookup`, `buildScopeLabelLookup`, `validateScopeHierarchy`, discovery logic
- `packages/core/src/types/canvas.ts` - `OtelSpanConventionNode`, `OtelScopeNode`, `OtelMetadata`
