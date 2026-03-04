# Feature Request: Status for Auto-Instrumented Events

## Use Case: Logfire Auto-Instrumentation

When using observability platforms like [Logfire](https://logfire.pydantic.dev/), instrumentation for common libraries is handled automatically via single-line setup calls. This is a significant value proposition for developers who want observability without manual instrumentation.

### Example: lerim-cli Project

In the lerim-cli project, tracing is configured in `src/lerim/config/tracing.py`:

```python
logfire.instrument_pydantic_ai()  # Agent runs, model requests, tool calls
logfire.instrument_dspy()          # ChainOfThought, Predict
logfire.instrument_httpx()         # HTTP requests
```

This auto-instrumentation creates spans like:
- `pydantic_ai.agent.run` - Full agent execution
- `pydantic_ai.model.request` - LLM API calls with token counts
- `pydantic_ai.tool.call` - Tool invocations
- `dspy.ChainOfThought` - DSPy reasoning steps
- `dspy.Predict` - DSPy predictions
- `httpx.request` - Outbound HTTP calls

These spans contain valuable attributes (token counts, latencies, model names, etc.) that are useful to document in a canvas for visualization and workflow scenarios.

## The Problem

We wanted to create a canvas documenting these auto-instrumented events. The challenge:

### Current Status Values

The validator enforces three status values:
- `draft` - Event is being designed
- `approved` - Event is approved for implementation
- `implemented` - Event exists in source code

### Validation Behavior

When `status: "implemented"` is set, the validator checks that the event name appears in the specified source files:

```json
{
  "pv": {
    "event": {
      "name": "pydantic_ai.agent.run"
    },
    "sources": ["src/lerim/runtime/agent.py"],
    "otel": {
      "kind": "span",
      "category": "lifecycle"
    },
    "status": "implemented"
  }
}
```

**Error:**
```
Node "agent-run" is marked as "implemented" but event "pydantic_ai.agent.run" not found in file "src/lerim/runtime/agent.py"
```

This is correct behavior - the event IS implemented, but not in OUR source files. It's implemented in the PydanticAI library via Logfire's instrumentation wrapper.

### Current Workaround

We set all auto-instrumented nodes to `status: "draft"`:

```json
{
  "pv": {
    "event": {
      "name": "pydantic_ai.agent.run",
      "attributes": { ... }
    },
    "sources": ["src/lerim/runtime/agent.py"],
    "otel": {
      "kind": "span",
      "category": "lifecycle"
    },
    "status": "draft"
  }
}
```

**Issues with this workaround:**
1. `draft` implies the event is still being designed, which is misleading
2. The canvas doesn't accurately reflect that these events ARE emitted at runtime
3. Coverage metrics would incorrectly show these as unimplemented
4. No way to distinguish "truly draft" from "auto-instrumented"

## Proposed Solution

Add a new status value: `external` (or `auto-instrumented`)

### Option A: `external` Status

```json
{
  "pv": {
    "event": {
      "name": "pydantic_ai.agent.run"
    },
    "sources": ["src/lerim/runtime/agent.py"],
    "otel": {
      "kind": "span",
      "category": "lifecycle"
    },
    "status": "external"
  }
}
```

**Validation behavior:**
- Skip source file checking (event is implemented elsewhere)
- Count as "implemented" for coverage metrics
- Optionally allow documenting the external library/framework

### Option B: `auto-instrumented` Status with Metadata

```json
{
  "pv": {
    "event": {
      "name": "pydantic_ai.agent.run"
    },
    "otel": {
      "kind": "span",
      "category": "lifecycle"
    },
    "status": "auto-instrumented",
    "instrumentation": {
      "library": "logfire",
      "via": "logfire.instrument_pydantic_ai()"
    }
  }
}
```

**Benefits:**
- More explicit about how the event is created
- Documents the instrumentation method for onboarding
- Could enable future features (e.g., linking to library docs)

## Affected Scenarios

This pattern appears in multiple observability setups:

1. **Logfire + PydanticAI/DSPy** (our use case)
2. **OpenTelemetry auto-instrumentation** (e.g., `opentelemetry-instrumentation-flask`)
3. **Datadog APM** (automatic tracing)
4. **New Relic** (auto-instrumentation)
5. **AWS X-Ray** (SDK instrumentation)

## Implementation Considerations

1. **Validator changes:**
   - Add `external` (or similar) to valid status enum
   - Skip source file validation for external status
   - Ensure coverage calculations include external as "implemented"

2. **UI changes:**
   - Visual indicator for external events (different badge/icon)
   - Tooltip showing "Auto-instrumented via [library]" if metadata provided

3. **Documentation:**
   - Update status documentation
   - Add examples for documenting auto-instrumented events

## Canvas Example

See `.principal-views/llm-internals/` in [lerim-cli](https://github.com/lerim-dev/lerim-cli) for the full canvas documenting auto-instrumented LLM operations. Currently using `draft` status as workaround.

## Summary

The current three-state status model (`draft`/`approved`/`implemented`) doesn't accommodate the common pattern of auto-instrumented events from external libraries. Adding an `external` or `auto-instrumented` status would:

1. Accurately represent the implementation state
2. Enable correct coverage metrics
3. Document observability provided by external tooling
4. Avoid misleading "draft" status on production events
