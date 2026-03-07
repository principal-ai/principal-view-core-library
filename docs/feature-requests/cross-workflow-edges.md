# Feature Request: Cross-Workflow Edge Linking

## Status: PROPOSAL

## Summary

Add the ability to define edges that connect nodes across different workflows, enabling visualization of causal relationships between separate workflow spans (e.g., a renderer UI workflow triggering a main process workflow in an Electron app).

## Problem Statement

### The Challenge

In systems with multiple processes or layers, workflows often span process boundaries:

```
Renderer Process                    Main Process
┌─────────────────────┐            ┌─────────────────────┐
│  app_updates.ui     │            │  app_updates.check  │
│  (workflow span)    │ ─triggers→ │  (workflow span)    │
│                     │            │                     │
│  • settings_opened  │            │  • check.started    │
│  • check_requested ─┼────────────┼→ • check.available  │
│  • error_displayed  │            │  • error.occurred   │
└─────────────────────┘            └─────────────────────┘
```

Currently, workflows are matched independently via `spanPattern`. There's no way to:
1. Define that one workflow **triggers** another
2. Visualize causal relationships across workflow boundaries
3. Correlate spans from different processes in the UI

### Real-World Example

In Principal ADE's app update system:
- **Renderer workflow** (`app_updates.ui`): User opens settings, clicks "Check for Updates"
- **Main process workflow** (`app_updates.check`): Receives IPC, queries GitHub, returns result

These are separate traces (different processes), but causally linked. When debugging "update checks hang", you need to see both workflows together.

## Current Edge Schema

Edges currently support:

```json
{
  "id": "unique-edge-id",
  "fromNode": "source-node-id",
  "fromSide": "right",
  "toNode": "target-node-id",
  "toSide": "left",
  "label": "descriptive label",
  "pv": {
    "edgeType": "ipc-send"
  }
}
```

Edge types defined in canvas `pv.edgeTypes`:
- `user-interaction`, `ipc-send`, `ipc-receive`, `function-call`, `http-request`, `event-emit`

## Proposed Solutions

### Option A: Workflow Metadata on Edges

Extend the `pv` section with workflow linking information:

```json
{
  "id": "ui-triggers-check",
  "fromNode": "check-button",
  "toNode": "check-for-updates",
  "label": "triggers",
  "pv": {
    "edgeType": "ipc-send",
    "crossWorkflow": {
      "from": {
        "spanPattern": "app_updates.ui",
        "event": "app_updates.user.check_requested"
      },
      "to": {
        "spanPattern": "app_updates.check",
        "event": "app_updates.check.started"
      },
      "correlation": "trigger"
    }
  }
}
```

**Pros:**
- Backward compatible (existing edges still work)
- Explicit about which workflows are linked
- Can specify correlation type (`trigger`, `response`, `parallel`)

**Cons:**
- Duplicates workflow/event info already on nodes
- More verbose

### Option B: Edge Type for Cross-Workflow

Add a new edge type specifically for workflow bridges:

```yaml
# In library.yaml edgeComponents
workflow-bridge:
  label: "Workflow Bridge"
  description: "Causal link between separate workflow spans"
  style: "dashed"
  color: "#F59E0B"
  animated: true
```

Then in canvas:

```json
{
  "id": "ui-triggers-check",
  "fromNode": "check-button",
  "toNode": "check-for-updates",
  "label": "triggers check workflow",
  "pv": {
    "edgeType": "workflow-bridge"
  }
}
```

**Pros:**
- Simple, uses existing schema
- Visual distinction via edge styling
- Nodes already contain workflow info via their events

**Cons:**
- Less explicit about correlation semantics
- No metadata for tooling to understand the relationship

### Option C: Separate Cross-Workflow Links Section

Add a new top-level section for workflow relationships:

```json
{
  "pv": { ... },
  "nodes": [ ... ],
  "edges": [ ... ],
  "workflowLinks": [
    {
      "id": "ui-to-check",
      "from": {
        "workflow": "update-ui-flow.workflow.json",
        "event": "app_updates.user.check_requested"
      },
      "to": {
        "workflow": "update-check-flow.workflow.json",
        "event": "app_updates.check.started"
      },
      "type": "triggers",
      "description": "User clicking check button initiates main process update check"
    }
  ]
}
```

**Pros:**
- Clean separation of concerns
- Explicit workflow-to-workflow relationships
- Can be processed independently from visual edges

**Cons:**
- New schema concept to implement
- May diverge from visual edge representation

### Option D: OTEL Span Links (Runtime Correlation)

At instrumentation time, pass trace context through IPC and create OTEL span links:

```typescript
// Renderer: Include trace context in IPC message
const currentContext = context.active();
appVersionClient.checkForUpdate({
  trigger: 'manual',
  _traceContext: propagation.inject(currentContext)
});

// Main process: Create linked span
const linkedContext = propagation.extract(input._traceContext);
const checkSpan = tracer.startSpan('app_updates.check', {
  links: [{ context: linkedContext }]
});
```

**Pros:**
- Actual trace correlation in observability backends
- Standard OTEL pattern
- Enables distributed tracing UIs to connect the dots

**Cons:**
- Runtime only (doesn't help static canvas visualization)
- Requires instrumentation changes
- Not all visualization tools support span links well

## Recommendation

**Combine Options A + D:**

1. **Canvas visualization** (Option A): Add `crossWorkflow` metadata to edges for static documentation and canvas rendering
2. **Runtime correlation** (Option D): Implement span links for actual trace correlation in observability tools

This gives you:
- Clear visual documentation of workflow relationships
- Actual distributed trace correlation in production
- Flexibility to visualize cross-workflow edges differently (dashed, animated, different color)

## UI Considerations

When rendering edges with `crossWorkflow` metadata:

1. **Different visual style**: Dashed/animated line, distinct color
2. **Tooltip**: Show source and target workflow names
3. **Click behavior**: Could navigate to the linked workflow
4. **Scenario view**: When viewing a scenario, highlight related cross-workflow edges

## Acceptance Criteria

- [ ] Schema supports cross-workflow edge metadata
- [ ] Edge type(s) for cross-workflow links defined in library.yaml
- [ ] GraphRenderer renders cross-workflow edges with distinct styling
- [ ] Validation: warn if cross-workflow edge references non-existent workflow
- [ ] Documentation updated with examples
- [ ] (Optional) OTEL span link instrumentation helper utilities

## Related Work

- [HIERARCHICAL_WORKFLOW_COMPOSITION.md](../HIERARCHICAL_WORKFLOW_COMPOSITION.md) - Parent-child workflow relationships within same trace
- This proposal addresses **sibling** workflow relationships across process boundaries

## Open Questions

1. Should cross-workflow edges be defined in canvas or in a separate manifest?
2. How should the UI indicate when viewing a workflow that has external triggers/dependencies?
3. Should we support bidirectional cross-workflow edges (request/response patterns)?
4. How does this interact with scenario matching across workflows?
