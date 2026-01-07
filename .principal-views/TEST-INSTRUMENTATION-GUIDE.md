# Test Instrumentation with OTEL

## Current State

The library **already has OTEL dependencies** installed:
- `@opentelemetry/api`
- `@opentelemetry/sdk-trace-base`
- `@opentelemetry/exporter-trace-otlp-http`
- `@opentelemetry/resources`
- `@opentelemetry/semantic-conventions`

What's **missing** is actually emitting OTEL spans/logs during test execution.

## Three Approaches to Get Test Data

### Approach 1: Custom Bun Test Reporter (Recommended)

Create a custom reporter that emits OTEL spans for each test:

```typescript
// packages/core/test/otel-reporter.ts
import { trace } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const tracer = trace.getTracer('test-runner', '1.0.0');

export class OTELTestReporter {
  private suiteSpan: Span | null = null;

  onTestSuiteStart(suite: { name: string }) {
    this.suiteSpan = tracer.startSpan('test.suite', {
      attributes: {
        'test.suite.name': suite.name,
        'service.name': 'test-runner',
      },
    });
  }

  onTestStart(test: { name: string; file: string }) {
    const span = tracer.startSpan('test.case', {
      attributes: {
        'test.name': test.name,
        'test.file': test.file,
        'service.name': 'test-execution',
      },
    });

    // Store span to end it later
    test._span = span;
  }

  onTestEnd(test: { name: string; result: 'pass' | 'fail'; duration: number }) {
    if (test._span) {
      test._span.setAttributes({
        'test.result': test.result,
        'test.duration_ms': test.duration,
      });

      if (test.result === 'fail') {
        test._span.setStatus({ code: 'ERROR' });
      }

      test._span.end();
    }
  }

  onTestSuiteEnd() {
    this.suiteSpan?.end();
  }
}
```

**Usage:**
```bash
bun test --reporter=./test/otel-reporter.ts
```

### Approach 2: Wrap EventRecorderService

The library already has `EventRecorderService` - just make it emit OTEL:

```typescript
// packages/core/src/EventRecorderService.ts (modify)
import { trace } from '@opentelemetry/api';

export class EventRecorderService {
  private tracer = trace.getTracer('event-recorder', '1.0.0');

  startSession(options: { name: string }) {
    const session = // ... existing code

    // NEW: Emit OTEL span for session
    const span = this.tracer.startSpan('session.start', {
      attributes: {
        'session.id': session.id,
        'session.name': session.name,
        'service.name': 'event-recorder',
      },
    });

    session._span = span;
    return session;
  }

  recordLog(log: LogEntry) {
    // ... existing code

    // NEW: Emit OTEL log
    const otelLog: OtelLog = {
      timestamp: Date.now(),
      severity: log.metadata.level.toUpperCase(),
      body: log.message,
      resource: {
        'service.name': 'test-execution',
        'code.filepath': log.metadata.source.file,
        'code.lineno': log.metadata.source.line,
      },
      attributes: {
        'session.id': this.activeSession?.id,
      },
    };

    this.emit('otel.log', otelLog);
  }
}
```

### Approach 3: Instrument Individual Tests (Manual)

Add OTEL spans directly in test files:

```typescript
// packages/core/src/EventRecorderService.test.ts
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('test', '1.0.0');

describe('EventRecorderService', () => {
  it('should route OTEL log to correct node', () => {
    const span = tracer.startSpan('test.log-routing', {
      attributes: {
        'test.name': 'should route OTEL log to correct node',
        'test.file': 'EventRecorderService.test.ts',
      },
    });

    // Test setup span
    const setupSpan = tracer.startSpan('test.setup', {
      parent: span,
      attributes: { 'test.phase': 'setup' },
    });

    const service = new EventRecorderService(/* ... */);
    setupSpan.end();

    // Test execution span
    const execSpan = tracer.startSpan('test.execution', {
      parent: span,
      attributes: { 'test.phase': 'execution' },
    });

    const log: OtelLog = {
      timestamp: Date.now(),
      severity: 'INFO',
      body: 'Test log',
      resource: { 'service.name': 'api-gateway' },
    };

    const result = service.routeLog(log);
    execSpan.end();

    // Test assertion span
    const assertSpan = tracer.startSpan('test.assertion', {
      parent: span,
      attributes: { 'test.phase': 'assertion' },
    });

    expect(result.nodeId).toBe('api-gateway-node');
    assertSpan.end();

    span.setStatus({ code: 'OK' });
    span.end();
  });
});
```

## Connecting to the Visualization

Once you have OTEL data, pipe it to the visualization:

### Option A: Export to File (Simple)

```typescript
// Export spans to JSON file
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';

const exporter = new InMemorySpanExporter();
const processor = new BatchSpanProcessor(exporter);

// After tests run
const spans = exporter.getFinishedSpans();
fs.writeFileSync('test-execution-spans.json', JSON.stringify(spans, null, 2));
```

Then load in Storybook:
```typescript
import testSpans from './test-execution-spans.json';

export const LiveTestExecution: Story = {
  render: () => <TestVisualization spans={testSpans} />,
};
```

### Option B: Stream to Collector (Real-time)

```typescript
// packages/core/test/setup.ts
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces', // OTEL collector
});

// Tests emit spans → Collector → GraphRenderer subscribes
```

Then in your visualization:
```typescript
// Subscribe to OTEL collector
const eventSource = new EventSource('http://localhost:4318/stream');
eventSource.onmessage = (event) => {
  const span = JSON.parse(event.data);
  // Animate node based on span
  if (span.name === 'test.setup') {
    animateNode('test-setup-layer');
  }
};
```

### Option C: Use EventRecorderService (Existing)

The library already has this! Just connect it:

```typescript
// packages/core/src/EventRecorderService.test.ts
it('should record test execution', () => {
  const service = new EventRecorderService({
    graphConfig: testCanvas,
    recordingMode: 'auto', // Auto-record during tests
  });

  const session = service.startSession({ name: 'Test: Log Routing' });

  // Test runs, logs are recorded
  // ...

  service.endSession(session.id);

  // Export session events as GraphEvents
  const events = service.getSessionEvents(session.id);

  // Visualize in Storybook
  <GraphRenderer canvas={testCanvas} events={events} />
});
```

## Practical Example: Visualize Actual Test Run

```typescript
// packages/core/test/visualize-test.ts
import { EventRecorderService } from '../src/EventRecorderService';
import { test } from 'bun:test';
import fs from 'fs';

// Canvas representing the test flow
const testCanvas: ExtendedCanvas = {
  nodes: [
    { id: 'test-setup', /* ... */ },
    { id: 'canvas-converter', /* ... */ },
    { id: 'graph-renderer', /* ... */ },
    { id: 'assertions', /* ... */ },
  ],
  edges: [/* ... */],
  pv: {
    layers: [
      { id: 'setup', label: 'Setup', /* ... */ },
      { id: 'execution', label: 'Execution', /* ... */ },
      { id: 'validation', label: 'Validation', /* ... */ },
    ],
  },
};

// Record test execution
const recorder = new EventRecorderService({
  graphConfig: testCanvas,
  recordingMode: 'manual',
});

test('GraphRenderer renders', () => {
  const session = recorder.startSession({ name: 'GraphRenderer Test' });

  // Each log gets routed to canvas nodes
  recorder.recordLog({
    message: 'Setting up test data',
    metadata: {
      level: 'info',
      source: { file: 'GraphRenderer.test.tsx', line: 10 },
    },
  }); // Routes to 'test-setup' node

  recorder.recordLog({
    message: 'Converting canvas to nodes',
    metadata: {
      level: 'info',
      source: { file: 'CanvasConverter.ts', line: 42 },
    },
  }); // Routes to 'canvas-converter' node

  recorder.recordLog({
    message: 'Rendering GraphRenderer',
    metadata: {
      level: 'info',
      source: { file: 'GraphRenderer.tsx', line: 100 },
    },
  }); // Routes to 'graph-renderer' node

  recorder.recordLog({
    message: 'Assertions passed',
    metadata: {
      level: 'info',
      source: { file: 'GraphRenderer.test.tsx', line: 50 },
    },
  }); // Routes to 'assertions' node

  recorder.endSession(session.id);

  // Export for visualization
  const events = recorder.getSessionEvents(session.id);
  fs.writeFileSync(
    'packages/react/src/stories/data/test-execution.json',
    JSON.stringify(events, null, 2)
  );
});
```

Then load it in Storybook:
```typescript
import testEvents from './data/test-execution.json';

export const RealTestExecution: Story = {
  args: {
    canvas: testCanvas,
    events: testEvents, // Real events from actual test run!
  },
};
```

## Next Steps

1. **Quick Win**: Use `EventRecorderService` in existing tests
2. **Better**: Create Bun test reporter that emits OTEL
3. **Production**: Stream to OTEL collector for real-time viz

The library already has the pieces - just need to wire them together!

## Example Commands

```bash
# Run tests with recording
RECORD_TESTS=true bun test

# Run tests and export visualization
bun test --export-viz=test-execution.json

# Watch tests with live visualization
bun test --watch --visualize=http://localhost:6006
```

You could even have Storybook **automatically reload** when tests finish and new event data is written!
