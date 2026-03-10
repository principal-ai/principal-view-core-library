# Feature Request: Input/Output Node Synthesis in Workflows

## Problem

When defining `.otel.canvas` files, we often include `input` and `output` nodes to represent the data flow boundaries of an operation. These nodes are useful for visualization but create friction in workflow templates:

1. **Not Real Events**: Input/output nodes represent data boundaries, not actual telemetry events that get emitted via `span.addEvent()`

2. **Template Mismatches**: Workflow templates that reference `input.*` or `output.*` events show "missing data" warnings because these events are never emitted

3. **Implementation Confusion**: Developers implementing instrumentation are unsure whether they need to emit events for input/output nodes

## Current Behavior

In a canvas like `get-file-tree.otel.canvas`:
```json
{
  "id": "input-repo-path",
  "pv": {
    "nodeType": "input",
    "event": {
      "name": "input.repository.path",
      "attributes": { "path": { "type": "string" } }
    }
  }
},
{
  "id": "output-filetree",
  "pv": {
    "nodeType": "output",
    "event": {
      "name": "output.file.tree",
      "attributes": { "status": { "type": "string" } }
    }
  }
}
```

The workflow template then references:
```json
"events": {
  "input.repository.path": "Input: {{path}}",
  "output.file.tree": "Output: {{status}}"
}
```

But since `input.repository.path` and `output.file.tree` are never emitted as actual span events, the template shows missing data.

## Proposed Solutions

### Option 1: Auto-Synthesize from Span Attributes

Input/output events could be **automatically synthesized** from the span's attributes and status:

- **Input nodes**: Extract values from span attributes that match the input schema
- **Output nodes**: Synthesize from span status code and result attributes

Example synthesis:
```typescript
// For a span with attributes:
span.setAttribute('repository.path', '/path/to/repo');

// Auto-synthesize input event:
{
  name: 'input.repository.path',
  attributes: { path: '/path/to/repo' }
}

// For span completion:
span.setStatus({ code: SpanStatusCode.OK });

// Auto-synthesize output event:
{
  name: 'output.file.tree',
  attributes: { status: 'success' }
}
```

### Option 2: Mark as Non-Emitted in Canvas

Add a flag to indicate nodes that are visualization-only:

```json
{
  "id": "input-repo-path",
  "pv": {
    "nodeType": "input",
    "synthesized": true,  // <-- Don't expect explicit event emission
    "event": { ... }
  }
}
```

The validator and workflow matcher would then:
- Skip validation for `synthesized: true` nodes
- Auto-generate event data from span context

### Option 3: Separate Canvas Node Types

Distinguish between:
- `otel-event`: Explicitly emitted events (require implementation)
- `data-node`: Visualization-only nodes (synthesized or omitted from templates)

```json
{
  "id": "input-repo-path",
  "pv": {
    "nodeType": "data-node",  // Not an emittable event
    "dataFlow": "input"
  }
}
```

## Recommendation

**Option 1 (Auto-Synthesis)** provides the best developer experience:

1. Canvas files remain expressive and complete for visualization
2. No changes needed to existing canvas files
3. Workflows "just work" without manual event emission
4. Clear separation: `otel-event` nodes = implement, `input/output` nodes = auto-synthesized

## Implementation Notes

The synthesis could happen in:
- **TraceConverter**: When processing spans, synthesize input/output events based on nodeType
- **Workflow Matcher**: Fall back to span attributes when input/output events are missing
- **CLI Validator**: Skip "not implemented" warnings for input/output nodes

## Related

- Discovered while implementing OTLP instrumentation for `repository-monitoring-server`
- The `get-file-tree.otel.canvas` has input/output nodes that caused workflow template warnings
