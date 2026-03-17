---
name: implement-workflow-telemetry
description: Guide users through implementing OpenTelemetry instrumentation in production code based on workflow.json definitions. Clarifies span vs event concepts and shows correct instrumentation patterns.
---

# Implement Workflow Telemetry Skill

Guide users through implementing OpenTelemetry instrumentation in production source code based on their workflow.json definitions.

## Purpose

This skill bridges the gap between **defining telemetry** (workflow.json) and **implementing telemetry** (source code). It ensures developers understand the correct OTEL concepts and emit telemetry that matches their workflow definitions.

## Critical Concept: Spans vs Events

**This is the most common misconception. Clarify this immediately.**

```
WRONG mental model:
  "Each event in my workflow.json is a span I need to create"

CORRECT mental model:
  "The spanPattern is the span. Events are emitted WITHIN that span."
```

### The OTEL Hierarchy

```
Trace
  └── Span (operation boundary - e.g., "data.validation")
        ├── Event: validation.started
        ├── Event: validation.progress
        ├── Event: validation.complete (or validation.error)
        └── Attributes, Status, etc.
```

### How workflow.json Maps to Code

```json
// workflow.json
{
  "spanPattern": "data.validation",     // ← THIS is the span name
  "scenarios": [{
    "template": {
      "events": {
        "validation.started": "...",    // ← These are EVENTS within the span
        "validation.complete": "..."    // ← NOT separate spans
      }
    }
  }]
}
```

```typescript
// Source code - CORRECT implementation
const span = tracer.startSpan('data.validation');  // ONE span matching spanPattern

span.addEvent('validation.started', { 'input.count': 100 });  // Events WITHIN span
// ... do validation work ...
span.addEvent('validation.complete', { 'output.count': 95 });

span.end();  // Span ends after all events
```

## When to Use This Skill

Use this skill when the user:
- Has a workflow.json and needs to implement the telemetry in source code
- Is confused about spans vs events
- Wants to instrument production code (not just tests)
- Needs guidance on where to place instrumentation in their code
- Wants to ensure their telemetry matches their workflow definition

## Prerequisites

- User has a `.workflow.json` file (use `create-workflow-scenarios` skill if not)
- User has a `.otel.canvas` file with event schemas (use `create-otel-canvas` skill if not)
- Basic familiarity with OpenTelemetry concepts

## Interactive Workflow

### Phase 1: Understand the Workflow Definition

1. **Read the workflow.json file**
   - Identify the `spanPattern` - this is the span name to create
   - List all events from `template.events` keys across all scenarios
   - Note any attributes referenced in templates (these need to be emitted)

2. **Read the associated canvas file**
   - Get the full event schemas with attribute types and requirements
   - Identify which attributes are required vs optional

3. **Present a summary to the user:**
   ```
   Based on your workflow.json, you need to:

   Create ONE span named: "data.validation"

   Emit these events WITHIN that span:
   - validation.started
     Required: input.recordCount (integer)
   - validation.complete
     Required: output.validCount (integer), duration.ms (number)
   - validation.error (for failure scenarios)
     Required: error.message (string), error.type (string)
   ```

### Phase 2: Locate Implementation Points

1. **Find the source file(s)**
   - Check `pv.references` in the canvas nodes
   - Or ask the user which file implements this functionality

2. **Identify instrumentation points:**
   - **Span start**: Where does the operation begin?
   - **Events**: Where do state transitions occur?
   - **Span end**: Where does the operation complete (success or failure)?

3. **Show the user the code structure:**
   ```
   Found: src/validators/data-validator.ts

   Instrumentation points:
   - Line 45: validateData() entry → Start span, emit validation.started
   - Line 78: validation loop complete → Emit validation.complete
   - Line 62: catch block → Emit validation.error
   - Line 80: function exit → End span
   ```

### Phase 3: Set Up Telemetry Infrastructure

1. **Check if telemetry helper exists**
   - Look for existing `telemetry.ts` or similar
   - Check for @opentelemetry/api import

2. **If not, create a minimal helper:**

   ```typescript
   // src/telemetry.ts
   import { trace, type Tracer, type Span } from '@opentelemetry/api';

   const TRACER_NAME = 'your-service-name';
   const TRACER_VERSION = '1.0.0';

   export function getTracer(): Tracer {
     return trace.getTracer(TRACER_NAME, TRACER_VERSION);
   }

   export { type Span };
   ```

3. **Explain the library pattern:**
   - Only import `@opentelemetry/api` (the API package)
   - Never import SDK packages in library/application code
   - The host application configures the actual provider
   - If no provider is configured, you get a no-op tracer (safe)

### Phase 4: Implement the Instrumentation

**Show the CORRECT pattern:**

```typescript
import { getTracer, type Span } from './telemetry';
import { SpanStatusCode } from '@opentelemetry/api';

export async function validateData(input: DataInput): Promise<ValidationResult> {
  const tracer = getTracer();

  // ONE span for the entire operation (matches spanPattern)
  const span = tracer.startSpan('data.validation', {
    attributes: {
      // Static attributes known at span start
      'input.source': input.source,
    }
  });

  try {
    // Emit start event
    span.addEvent('validation.started', {
      'input.recordCount': input.records.length,
    });

    // Do the actual work
    const result = await performValidation(input);

    // Emit completion event
    span.addEvent('validation.complete', {
      'output.validCount': result.validRecords.length,
      'output.invalidCount': result.invalidRecords.length,
      'duration.ms': result.durationMs,
    });

    span.setStatus({ code: SpanStatusCode.OK });
    return result;

  } catch (error) {
    // Emit error event
    span.addEvent('validation.error', {
      'error.type': error.constructor.name,
      'error.message': error instanceof Error ? error.message : String(error),
    });

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Validation failed',
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));

    throw error;

  } finally {
    // ALWAYS end the span
    span.end();
  }
}
```

### Phase 5: Common Patterns

#### Pattern 1: Simple Operation (Start → Complete/Error)

```typescript
const span = tracer.startSpan('operation.name');
try {
  span.addEvent('operation.started', { /* attributes */ });
  const result = await doWork();
  span.addEvent('operation.complete', { /* attributes */ });
  span.setStatus({ code: SpanStatusCode.OK });
  return result;
} catch (error) {
  span.addEvent('operation.error', { /* attributes */ });
  span.setStatus({ code: SpanStatusCode.ERROR });
  throw error;
} finally {
  span.end();
}
```

#### Pattern 2: Multi-Step Operation with Progress

```typescript
const span = tracer.startSpan('pipeline.process');
try {
  span.addEvent('pipeline.started', { 'steps.total': 3 });

  await step1();
  span.addEvent('pipeline.step.complete', { 'step.name': 'parsing', 'step.index': 1 });

  await step2();
  span.addEvent('pipeline.step.complete', { 'step.name': 'validation', 'step.index': 2 });

  await step3();
  span.addEvent('pipeline.step.complete', { 'step.name': 'transform', 'step.index': 3 });

  span.addEvent('pipeline.complete', { 'steps.succeeded': 3 });
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.addEvent('pipeline.error', { /* ... */ });
  span.setStatus({ code: SpanStatusCode.ERROR });
  throw error;
} finally {
  span.end();
}
```

#### Pattern 3: Nested Operations (Child Spans)

When an operation contains distinct sub-operations that should be tracked separately:

```typescript
import { context, trace } from '@opentelemetry/api';

const parentSpan = tracer.startSpan('order.process');
try {
  span.addEvent('order.started', { 'order.id': orderId });

  // Child span for distinct sub-operation
  const paymentSpan = tracer.startSpan('payment.process', {
    // Link to parent via context
  }, context.active());

  try {
    paymentSpan.addEvent('payment.started', { /* ... */ });
    await processPayment();
    paymentSpan.addEvent('payment.complete', { /* ... */ });
    paymentSpan.setStatus({ code: SpanStatusCode.OK });
  } finally {
    paymentSpan.end();
  }

  span.addEvent('order.complete', { /* ... */ });
} finally {
  parentSpan.end();
}
```

**Note:** Only create child spans for truly distinct operations. Most workflows need just ONE span with multiple events.

#### Pattern 4: Loop with Events

```typescript
const span = tracer.startSpan('batch.process');
span.addEvent('batch.started', { 'items.total': items.length });

let processed = 0;
let failed = 0;

for (const item of items) {
  try {
    await processItem(item);
    processed++;
    // Don't emit event per item unless needed for debugging
  } catch (error) {
    failed++;
    span.addEvent('batch.item.failed', {
      'item.id': item.id,
      'error.message': error.message,
    });
  }
}

span.addEvent('batch.complete', {
  'items.processed': processed,
  'items.failed': failed,
});
span.end();
```

### Phase 6: Verify Implementation

1. **Check event names match workflow.json:**
   ```bash
   # Events in workflow.json template.events:
   validation.started, validation.complete, validation.error

   # Events in source code span.addEvent():
   validation.started ✓
   validation.complete ✓
   validation.error ✓
   ```

2. **Check attributes match canvas schema:**
   - All required attributes are included
   - Attribute types match (string, number, boolean)
   - Attribute names use dot notation consistently

3. **Run with telemetry enabled:**
   - Configure an OTEL collector or console exporter
   - Execute the code path
   - Verify span and events appear correctly

4. **Test against canvas schema (optional but recommended):**
   ```bash
   # If you have setup-otel-testing configured
   bun test
   ```

## Common Mistakes

### Mistake 1: Creating a Span Per Event

```typescript
// WRONG - Don't do this!
const startSpan = tracer.startSpan('validation.started');
startSpan.end();

const completeSpan = tracer.startSpan('validation.complete');
completeSpan.end();
```

```typescript
// CORRECT - One span, multiple events
const span = tracer.startSpan('data.validation');
span.addEvent('validation.started', { ... });
span.addEvent('validation.complete', { ... });
span.end();
```

### Mistake 2: Forgetting to End Spans

```typescript
// WRONG - Span never ends on error
const span = tracer.startSpan('operation');
span.addEvent('started');
await riskyOperation();  // If this throws, span.end() never called
span.addEvent('complete');
span.end();
```

```typescript
// CORRECT - Use try/finally
const span = tracer.startSpan('operation');
try {
  span.addEvent('started');
  await riskyOperation();
  span.addEvent('complete');
} finally {
  span.end();  // Always called
}
```

### Mistake 3: Emitting Events After Span Ends

```typescript
// WRONG - Event after span.end() is lost
span.end();
span.addEvent('late.event');  // This won't be recorded!
```

### Mistake 4: Using Span Name as Event Name

```typescript
// WRONG - spanPattern used as event name
span.addEvent('data.validation', { ... });  // This should be the SPAN name

// CORRECT - Event names from template.events
span.addEvent('validation.started', { ... });
```

### Mistake 5: Importing SDK Packages in Application Code

```typescript
// WRONG - Don't import SDK packages
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';

// CORRECT - Only import API package
import { trace } from '@opentelemetry/api';
```

## Attribute Naming Conventions

Follow these conventions for consistency:

| Pattern | Example | Use For |
|---------|---------|---------|
| `entity.property` | `order.id`, `user.email` | Domain entities |
| `action.result` | `validation.count`, `parse.duration` | Operation outcomes |
| `error.property` | `error.type`, `error.message` | Error details |
| `input.property` | `input.size`, `input.format` | Input data |
| `output.property` | `output.count`, `output.path` | Output data |
| `duration.unit` | `duration.ms`, `duration.seconds` | Timing |

## Integration with Canvas Validation

If you want runtime validation of emitted events against your canvas schema:

```typescript
import { createValidatedSpanEmitter } from '@principal-ai/core';
import canvas from '../.principal-views/my-feature/my-feature.otel.canvas';

const span = tracer.startSpan('data.validation');
const emit = createValidatedSpanEmitter(canvas, 'validation-node-id', span, {
  strict: false,  // false for production (warns), true for tests (throws)
});

emit('validation.started', { 'input.recordCount': 100 });
emit('validation.complete', { 'output.validCount': 95 });

span.end();
```

This validates attributes against the canvas schema and warns/throws on mismatches.

## Success Criteria

After implementing telemetry, verify:

- [ ] ONE span created matching `spanPattern` from workflow.json
- [ ] Events emitted WITHIN span using `span.addEvent()`
- [ ] Event names match `template.events` keys exactly
- [ ] Required attributes included (from canvas schema)
- [ ] Span always ends (via try/finally pattern)
- [ ] Error scenarios emit error events and set span status
- [ ] Only `@opentelemetry/api` imported (not SDK packages)

## Example Session

```
User: "I have a workflow.json for my file processor, how do I implement the telemetry?"

Claude: "I'll help you implement the telemetry. Let me read your workflow.json first."

[Reads workflow.json]

"I see your workflow definition. Here's what you need to implement:

**Important: Events are NOT spans!**

Your `spanPattern` is `file.process` - this is the ONE span you create.
The events in your template (`process.started`, `process.complete`, `process.error`)
are emitted WITHIN that span using `span.addEvent()`.

You need:
- ONE span: `file.process`
- Events within it:
  - `process.started` (required attrs: file.path, file.size)
  - `process.complete` (required attrs: output.lines, duration.ms)
  - `process.error` (required attrs: error.type, error.message)

Let me show you how to instrument your processFile() function..."

[Shows implementation with correct span/event pattern]
```

## References

- **setup-otel-testing**: For test instrumentation and validation
- **create-workflow-scenarios**: For creating workflow.json files
- **create-otel-canvas**: For defining event schemas
- **OpenTelemetry JS API**: https://opentelemetry.io/docs/languages/js/
- **Span Events**: https://opentelemetry.io/docs/concepts/signals/traces/#span-events
