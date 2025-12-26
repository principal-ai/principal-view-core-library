# Adding OpenTelemetry to Tests

This guide explains how to add OpenTelemetry tracing to your test suite. Captured traces can be used for debugging, visualization, and generating test fixtures.

## Why Trace Tests?

- **Visibility**: See exactly what your code does during test execution
- **Debugging**: Trace parent-child relationships and timing
- **Fixtures**: Export traces as mock data for Storybook or other tools
- **Best practices**: Same instrumentation patterns work in production

## Quick Start

### 1. Install Dependencies

```bash
# Using bun
bun add -d @opentelemetry/api @opentelemetry/sdk-trace-base @opentelemetry/resources @opentelemetry/semantic-conventions

# Using npm
npm install -D @opentelemetry/api @opentelemetry/sdk-trace-base @opentelemetry/resources @opentelemetry/semantic-conventions
```

### 2. Create Test Setup File

Create `test/setup.ts`:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  InMemorySpanExporter,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { afterAll } from 'bun:test'; // or 'vitest', '@jest/globals', etc.
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

// Configuration
const SERVICE_NAME = 'my-project-tests';
const OUTPUT_PATH = join(__dirname, '../__traces__/test-run.json');

// Create resource identifying this test suite
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: SERVICE_NAME,
  'test.framework': 'bun:test',
  'test.run.id': `${Date.now()}`,
});

// In-memory exporter collects all spans
const memoryExporter = new InMemorySpanExporter();

// Create and register provider
const provider = new BasicTracerProvider({
  resource,
  spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
});
trace.setGlobalTracerProvider(provider);

// Export tracer for use in tests
export const tracer = trace.getTracer(SERVICE_NAME);

// Helper: wrap a test function with a span
export function traced<T>(
  name: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => T | Promise<T>
): () => Promise<T> {
  return async () => {
    return tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        span.end();
      }
    });
  };
}

// Helper: create a child span for an operation
// NOTE: In Bun, you must pass the parent span explicitly due to async_hooks limitations
export async function withSpan<T>(
  name: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => T | Promise<T>,
  parentSpan?: ReturnType<typeof tracer.startSpan> // Required for Bun!
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

// Convert span to JSON
function spanToJson(span: ReadableSpan) {
  // Bun workaround: parentSpanId getter doesn't work, access parentSpanContext directly
  const parentSpanId = (span as unknown as { parentSpanContext?: { spanId?: string } })
    .parentSpanContext?.spanId;

  return {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    name: span.name,
    kind: ['INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'][span.kind],
    startTime: span.startTime[0] * 1000 + span.startTime[1] / 1_000_000,
    endTime: span.endTime[0] * 1000 + span.endTime[1] / 1_000_000,
    duration: span.duration[0] * 1000 + span.duration[1] / 1_000_000,
    attributes: Object.fromEntries(Object.entries(span.attributes ?? {})),
    status: {
      code: ['UNSET', 'OK', 'ERROR'][span.status.code],
      message: span.status.message,
    },
    events: span.events.map(e => ({
      name: e.name,
      timestamp: e.time[0] * 1000 + e.time[1] / 1_000_000,
      attributes: Object.fromEntries(Object.entries(e.attributes ?? {})),
    })),
  };
}

// Write spans to file after all tests complete
afterAll(async () => {
  const spans = memoryExporter.getFinishedSpans();

  if (spans.length > 0) {
    const output = {
      exportedAt: new Date().toISOString(),
      serviceName: SERVICE_NAME,
      spanCount: spans.length,
      spans: spans.map(spanToJson),
    };

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\n📊 Wrote ${spans.length} spans to ${OUTPUT_PATH}`);
  }

  await provider.shutdown();
});
```

### 3. Configure Test Runner

#### Bun

Add to `bunfig.toml`:

```toml
[test]
preload = ["./test/setup.ts"]
```

#### Vitest

Add to `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
  },
});
```

#### Jest

Add to `jest.config.js`:

```javascript
module.exports = {
  setupFilesAfterEnv: ['./test/setup.ts'],
};
```

### 4. Use in Tests

```typescript
import { describe, test, expect } from 'bun:test';
import { traced, withSpan, tracer } from './setup';

describe('MyFeature', () => {
  // Option 1: Wrap entire test with traced()
  test('does something', traced('test:does-something', async (span) => {
    span.setAttribute('input.size', 42);

    const result = await myFunction();

    span.setAttribute('output.success', true);
    expect(result).toBeDefined();
  }));

  // Option 2: Trace specific operations with withSpan()
  test('processes data', async () => {
    const data = await withSpan('fetch:data', async (span) => {
      span.setAttribute('source', 'api');
      return fetchData();
    });

    const result = await withSpan('process:data', async (span) => {
      span.setAttribute('item.count', data.length);
      return processData(data);
    });

    expect(result).toHaveLength(data.length);
  });

  // Option 3: Manual span control
  test('complex flow', async () => {
    await tracer.startActiveSpan('test:complex-flow', async (span) => {
      span.setAttribute('test.type', 'integration');

      // Nested spans inherit the parent context
      await tracer.startActiveSpan('step:1', async (step1) => {
        // ... do work
        step1.end();
      });

      await tracer.startActiveSpan('step:2', async (step2) => {
        // ... do work
        step2.end();
      });

      span.end();
    });
  });
});
```

## Output Format

Traces are written to `__traces__/test-run.json`:

```json
{
  "exportedAt": "2025-12-26T00:51:55.570Z",
  "serviceName": "my-project-tests",
  "spanCount": 3,
  "spans": [
    {
      "traceId": "abc123...",
      "spanId": "def456...",
      "parentSpanId": null,
      "name": "test:does-something",
      "kind": "INTERNAL",
      "startTime": 1703548800000,
      "endTime": 1703548800050,
      "duration": 50,
      "attributes": {
        "input.size": 42,
        "output.success": true
      },
      "status": { "code": "OK" },
      "events": []
    }
  ]
}
```

## Best Practices

### Naming Conventions

Use consistent span name prefixes:

| Prefix | Use for |
|--------|---------|
| `test:` | Top-level test spans |
| `setup:` | Test setup/fixtures |
| `teardown:` | Cleanup operations |
| `db:` | Database operations |
| `http:` | HTTP requests |
| `cache:` | Cache operations |
| `compute:` | CPU-intensive work |

Example: `test:user-registration`, `db:insert-user`, `http:send-welcome-email`

### Useful Attributes

```typescript
span.setAttribute('test.name', 'should create user');
span.setAttribute('test.file', 'user.test.ts');
span.setAttribute('db.query', 'INSERT INTO users...');
span.setAttribute('http.method', 'POST');
span.setAttribute('http.url', '/api/users');
span.setAttribute('error.type', 'ValidationError');
span.setAttribute('item.count', items.length);
```

### Recording Errors

```typescript
try {
  await riskyOperation();
} catch (error) {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  span.recordException(error);
  throw error;
}
```

### Adding Events

Events are timestamped logs within a span:

```typescript
span.addEvent('cache-miss', { key: 'user:123' });
// ... fetch from database
span.addEvent('cache-populated', { key: 'user:123', ttl: 3600 });
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_TRACE_OUTPUT` | Output file path | `__traces__/test-run.json` |
| `OTEL_CONSOLE_EXPORT` | Also print spans to console | `false` |
| `OTEL_SERVICE_NAME` | Override service name | (from setup) |

### Console Export for Debugging

Add console export for debugging:

```typescript
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

const spanProcessors = [new SimpleSpanProcessor(memoryExporter)];

if (process.env.OTEL_CONSOLE_EXPORT === 'true') {
  spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}

const provider = new BasicTracerProvider({
  resource,
  spanProcessors,
});
```

Run with: `OTEL_CONSOLE_EXPORT=true bun test`

## Sending to External Services

To send traces to Jaeger, Zipkin, or other backends, add the OTLP exporter:

```bash
bun add -d @opentelemetry/exporter-trace-otlp-http
```

```typescript
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

const otlpExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
});

const provider = new BasicTracerProvider({
  resource,
  spanProcessors: [
    new SimpleSpanProcessor(memoryExporter),      // Keep in-memory for file output
    new BatchSpanProcessor(otlpExporter),          // Send to OTLP endpoint
  ],
});
```

## Troubleshooting

### No spans captured

- Ensure setup file is preloaded before tests run
- Check that `afterAll` hook is executing (add a console.log)
- Verify spans are being ended with `span.end()`

### Parent-child relationships not working

Spans need to be created within the same async context. Use `startActiveSpan`:

```typescript
// Correct - child inherits parent context
await tracer.startActiveSpan('parent', async (parent) => {
  await tracer.startActiveSpan('child', async (child) => {
    // child.parentSpanId === parent.spanId
    child.end();
  });
  parent.end();
});
```

### Bun: Context propagation not working

**Known Issue**: Bun's `async_hooks` implementation doesn't fully support the async context propagation that OpenTelemetry relies on. This causes:

1. **Each span gets a different `traceId`** - traces aren't connected
2. **`span.parentSpanId` returns `undefined`** - hierarchy is lost
3. **`startActiveSpan` doesn't propagate context** - child spans are orphaned

**Workaround**: Pass the parent span explicitly to `withSpan()`:

```typescript
// ❌ Doesn't work in Bun - context isn't propagated
test('broken in bun', traced('test:example', async (span) => {
  const result = await withSpan('child:operation', async (child) => {
    // child has different traceId, no parentSpanId!
    return doSomething();
  });
}));

// ✅ Works in Bun - pass parent span explicitly
test('works in bun', traced('test:example', async (span) => {
  const result = await withSpan('child:operation', async (child) => {
    // child has same traceId, correct parentSpanId
    return doSomething();
  }, span);  // <-- pass parent span as third argument
}));
```

Update your `withSpan` helper to accept and use the parent span:

```typescript
import { trace, context, SpanStatusCode, type Span } from '@opentelemetry/api';

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => T | Promise<T>,
  parentSpan?: Span  // Optional for Node.js, required for Bun
): Promise<T> {
  const activeContext = context.active();
  const parentContext = parentSpan
    ? trace.setSpan(activeContext, parentSpan)
    : activeContext;

  const span = tracer.startSpan(name, {}, parentContext);

  return context.with(trace.setSpan(parentContext, span), async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

**Also fix `parentSpanId` extraction** when converting spans to JSON:

```typescript
function spanToJson(span: ReadableSpan) {
  // Bun workaround: the parentSpanId getter returns undefined
  // Access parentSpanContext.spanId directly instead
  const parentSpanId = (span as unknown as {
    parentSpanContext?: { spanId?: string }
  }).parentSpanContext?.spanId;

  return {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    ...(parentSpanId ? { parentSpanId } : {}),
    // ... rest of span data
  };
}
```

**Status**: This is a known limitation of Bun's runtime. Track progress:
- https://github.com/oven-sh/bun/issues (search for "async_hooks" or "AsyncLocalStorage")

This workaround can be removed once Bun fully supports async context propagation.

### Spans have wrong timestamps

OpenTelemetry uses high-resolution time. The conversion to milliseconds:

```typescript
const ms = span.startTime[0] * 1000 + span.startTime[1] / 1_000_000;
```

## Next Steps

- Convert captured traces to canvas diagrams for visualization
- Use trace data as Storybook fixtures
- Add tracing to production code using the same patterns
