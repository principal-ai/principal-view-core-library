# Trace Canvas Service

## Overview

A development tool that converts OpenTelemetry traces from test runs into canvas diagrams. The primary use case is visualizing test execution during development, with captured traces saved as `.canvas.json` files for use in Storybook mocks and documentation.

### Design Philosophy

**"Pit of Success" Approach**: Make the right thing easy. When developers see their spans rendered as visual diagrams in real-time, they naturally add more instrumentation because it provides immediate feedback. This instrumentation then becomes production-ready observability "for free."

### Goals

1. **Immediate value** - Run tests, see diagrams instantly
2. **Low friction** - Works with standard OTel SDK, no custom instrumentation API
3. **Scales up** - Same instrumentation patterns work in production
4. **Encourages best practices** - Visual feedback rewards good span naming, proper parent-child relationships, meaningful attributes
5. **Reusable artifacts** - Captured traces become Storybook mocks and test fixtures

---

## What This Is (and Isn't)

### OpenTelemetry Basics

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           YOUR APPLICATION                              │
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │ Your Code   │    │  OTel SDK   │    │  Exporter   │                │
│   │             │───►│  (tracing)  │───►│  (sender)   │────────────────┼───► OTLP
│   │ span.start()│    │             │    │             │                │
│   └─────────────┘    └─────────────┘    └─────────────┘                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

| Term | What it means |
|------|---------------|
| **SDK** | Library in your app that creates spans |
| **Exporter** | Part of SDK that sends telemetry out |
| **OTLP** | The wire protocol (like HTTP, but for telemetry) |
| **Collector** | Optional proxy that receives, processes, and routes telemetry |

### Our Approach: Simple OTLP Receiver

We're building a **lightweight OTLP receiver service**, not a full OTel Collector. The difference:

| Full OTel Collector | Our Trace Canvas Service |
|---------------------|--------------------------|
| Written in Go | Written in TypeScript (fits our ecosystem) |
| General-purpose pipeline | Single purpose: traces → canvas |
| Multiple receivers, processors, exporters | Just OTLP in, canvas out |
| Production-grade routing | Dev-time visualization |

**Can we add a real Collector later?** Yes. Since we speak standard OTLP, users can put a Collector in front of us whenever they need production features (sampling, multi-destination routing, etc.):

```
Today:     App ──OTLP──► Trace Canvas Service

Later:     App ──OTLP──► Collector ──OTLP──► Trace Canvas Service
                              │
                              └──────────► Datadog/Jaeger/etc.
```

---

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────────────────────┐
│   Test Runner   │     │            Trace Canvas Service                     │
│                 │     │                                                     │
│  ┌───────────┐  │     │  ┌────────────┐   ┌─────────────┐   ┌────────────┐ │
│  │  App Code │  │     │  │   OTLP     │   │   Trace     │   │  Canvas    │ │
│  │  + OTel   │──┼────►│  │  Receiver  │──►│  Assembler  │──►│  Writer    │ │
│  │   SDK     │  │     │  │            │   │             │   │            │ │
│  └───────────┘  │     │  └────────────┘   └─────────────┘   └─────┬──────┘ │
│                 │     │                                           │        │
└─────────────────┘     └───────────────────────────────────────────┼────────┘
                                                                    │
                          ┌─────────────────────────────────────────┤
                          │                                         │
                          ▼                                         ▼
                ┌──────────────────┐                    ┌───────────────────┐
                │  .canvas.json    │                    │  WebSocket Server │
                │  files (mocks)   │                    │  (live view)      │
                └──────────────────┘                    └─────────┬─────────┘
                          │                                       │
                          ▼                                       ▼
                ┌──────────────────┐                    ┌───────────────────┐
                │   Storybook      │                    │  React Viewer     │
                │   Stories        │                    │  (dev time)       │
                └──────────────────┘                    └───────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **OTLP Receiver** | Accept traces via gRPC (port 4317) or HTTP (port 4318) |
| **Trace Assembler** | Buffer spans, correlate by traceId, detect trace completion |
| **Canvas Writer** | Convert `OtelSpan[]` → `ExtendedCanvas`, save to files |
| **WebSocket Server** | Stream incremental updates for live viewing (optional) |
| **React Viewer** | Render canvas, handle layout, show live updates |

---

## OTel to Canvas Mapping

### Core Mappings

| OTel Concept | Canvas Concept | Notes |
|--------------|----------------|-------|
| `Span` | `CanvasTextNode` | Node per span with `pv` extensions |
| `parentSpanId` → `spanId` | `CanvasEdge` | Edge from parent to child span |
| `Resource.service.name` | `CanvasGroupNode` | Group nodes by service |
| `Span.kind` | `pv.shape` | Visual differentiation by span kind |
| `Span.status.code` | `pv.states` | Error/OK states with colors |
| `Span.events` | Edge animations | Events trigger visual effects |
| `Span.attributes` | `pv.dataSchema` | Shown in node details |

### Span Kind to Visual Shape

```typescript
const kindToShape: Record<OtelSpan['kind'], PVShape> = {
  'SERVER':   'hexagon',    // Entry points
  'CLIENT':   'diamond',    // Outbound calls
  'PRODUCER': 'rectangle',  // Async send
  'CONSUMER': 'rectangle',  // Async receive
  'INTERNAL': 'circle',     // Internal operations
};
```

### Span Kind to Node Color

```typescript
const kindToColor: Record<OtelSpan['kind'], string> = {
  'SERVER':   '#4f46e5',  // Indigo - entry points stand out
  'CLIENT':   '#0891b2',  // Cyan - outbound calls
  'PRODUCER': '#059669',  // Emerald - async producers
  'CONSUMER': '#059669',  // Emerald - async consumers
  'INTERNAL': '#6b7280',  // Gray - internal ops are subtle
};
```

### Status to State Mapping

```typescript
const statusToState: Record<OtelSpan['status']['code'], PVState> = {
  'OK':    { color: '#22c55e', icon: 'check-circle', label: 'Success' },
  'ERROR': { color: '#ef4444', icon: 'x-circle', label: 'Error' },
  'UNSET': { color: '#6b7280', icon: 'circle', label: 'Unknown' },
};
```

---

## Span to Canvas Conversion

### Interface

```typescript
interface SpanToCanvasOptions {
  /** Group spans by service into CanvasGroupNodes */
  groupByService?: boolean;

  /** Layout algorithm for positioning */
  layout?: 'hierarchical' | 'timeline' | 'force-directed';

  /** Filter spans by minimum duration (ms) to reduce noise */
  minDurationMs?: number;

  /** Maximum depth of span hierarchy to show */
  maxDepth?: number;

  /** Aggregate spans with same name into single node with count */
  aggregateSimilar?: boolean;
}

interface TraceCanvasResult {
  canvas: ExtendedCanvas;
  stats: {
    totalSpans: number;
    displayedSpans: number;
    services: string[];
    rootSpan: string;
    duration: number;
  };
}

function traceToCanvas(
  spans: OtelSpan[],
  options?: SpanToCanvasOptions
): TraceCanvasResult;
```

### Conversion Algorithm

```typescript
function traceToCanvas(spans: OtelSpan[], options: SpanToCanvasOptions = {}): TraceCanvasResult {
  const { groupByService = true, layout = 'hierarchical' } = options;

  // 1. Build span tree
  const spanMap = new Map(spans.map(s => [s.spanId, s]));
  const roots = spans.filter(s => !s.parentSpanId || !spanMap.has(s.parentSpanId));

  // 2. Group by service if enabled
  const serviceGroups = groupByService
    ? groupSpansByService(spans)
    : new Map([['default', spans]]);

  // 3. Create group nodes for services
  const groupNodes: CanvasGroupNode[] = [...serviceGroups.entries()].map(
    ([serviceName, serviceSpans], i) => ({
      id: `service-${serviceName}`,
      type: 'group',
      x: i * 400,
      y: 0,
      width: 350,
      height: calculateGroupHeight(serviceSpans),
      label: serviceName,
      pv: {
        nodeType: 'service',
        name: serviceName,
        icon: 'server',
      },
    })
  );

  // 4. Create span nodes
  const spanNodes: CanvasTextNode[] = spans.map(span =>
    spanToNode(span, serviceGroups)
  );

  // 5. Create edges from parent-child relationships
  const edges: CanvasEdge[] = spans
    .filter(span => span.parentSpanId && spanMap.has(span.parentSpanId))
    .map(span => ({
      id: `edge-${span.parentSpanId}-${span.spanId}`,
      fromNode: span.parentSpanId!,
      toNode: span.spanId,
      toEnd: 'arrow',
      pv: {
        edgeType: 'span-child',
        style: span.resource['service.name'] !== spanMap.get(span.parentSpanId)?.resource['service.name']
          ? 'dashed'  // Cross-service calls are dashed
          : 'solid',
      },
    }));

  // 6. Apply layout
  const positioned = applyLayout(layout, [...groupNodes, ...spanNodes], edges);

  return {
    canvas: {
      nodes: positioned.nodes,
      edges: positioned.edges,
      pv: {
        version: '1.0.0',
        name: `Trace: ${roots[0]?.name ?? 'Unknown'}`,
        display: {
          theme: 'dark',
          animation: { enabled: true, speed: 1 },
        },
      },
    },
    stats: {
      totalSpans: spans.length,
      displayedSpans: spanNodes.length,
      services: [...serviceGroups.keys()],
      rootSpan: roots[0]?.name ?? 'Unknown',
      duration: calculateTraceDuration(spans),
    },
  };
}

function spanToNode(span: OtelSpan, serviceGroups: Map<string, OtelSpan[]>): CanvasTextNode {
  const serviceName = span.resource['service.name'] ?? 'unknown';
  const duration = span.endTime
    ? (toMs(span.endTime) - toMs(span.startTime))
    : undefined;

  return {
    id: span.spanId,
    type: 'text',
    x: 0,  // Set by layout
    y: 0,  // Set by layout
    width: 200,
    height: 60,
    text: span.name,
    pv: {
      nodeType: 'span',
      name: span.name,
      description: duration ? `${duration.toFixed(2)}ms` : 'In progress...',
      shape: kindToShape[span.kind],
      fill: kindToColor[span.kind],
      states: {
        current: span.status?.code ?? 'UNSET',
        definitions: statusToState,
      },
      otel: {
        kind: 'instance',
        category: 'span',
      },
      dataSchema: {
        fields: [
          { name: 'traceId', type: 'string', value: span.traceId },
          { name: 'spanId', type: 'string', value: span.spanId },
          { name: 'kind', type: 'string', value: span.kind },
          { name: 'duration', type: 'number', value: duration },
          ...Object.entries(span.attributes ?? {}).map(([k, v]) => ({
            name: k,
            type: typeof v as 'string' | 'number' | 'boolean',
            value: v,
          })),
        ],
      },
    },
  };
}
```

---

## Live Streaming Protocol

### WebSocket Messages

#### Server → Client

```typescript
// Initial state when client connects
interface InitMessage {
  type: 'init';
  traces: Map<string, ExtendedCanvas>;  // Current active traces
}

// New span received
interface SpanAddedMessage {
  type: 'span:added';
  traceId: string;
  node: CanvasTextNode;
  edge?: CanvasEdge;  // Edge to parent if exists
  parentNodeId?: string;
}

// Span completed (has endTime now)
interface SpanCompletedMessage {
  type: 'span:completed';
  traceId: string;
  spanId: string;
  duration: number;
  status: OtelSpan['status'];
}

// Span event occurred (exception, log, etc.)
interface SpanEventMessage {
  type: 'span:event';
  traceId: string;
  spanId: string;
  event: OtelSpan['events'][0];
  animation?: PVEdgeActivation;  // Trigger edge animation
}

// Trace completed (all spans have endTime, timeout reached)
interface TraceCompletedMessage {
  type: 'trace:completed';
  traceId: string;
  canvas: ExtendedCanvas;  // Final complete canvas
  stats: TraceCanvasResult['stats'];
}
```

#### Client → Server

```typescript
// Subscribe to specific trace
interface SubscribeMessage {
  type: 'subscribe';
  traceId?: string;  // Omit for all traces
}

// Request full canvas for trace
interface GetTraceMessage {
  type: 'get:trace';
  traceId: string;
}

// Clear completed traces
interface ClearMessage {
  type: 'clear';
  olderThan?: number;  // Unix timestamp
}
```

### Streaming Flow

```
Test starts span "HTTP GET /users"
    │
    ▼
Service receives span (no endTime yet)
    │
    ├── Broadcasts: { type: 'span:added', node: {...}, edge: {...} }
    ├── (If file output enabled, buffers for trace completion)
    │
    ▼
React viewer receives message
    │
    ├── Adds node to canvas with "in-progress" indicator
    ├── Runs incremental layout (pushes existing nodes if needed)
    └── Animates node entry

... time passes ...

Span completes with endTime
    │
    ▼
Service receives updated span
    │
    ├── Broadcasts: { type: 'span:completed', duration: 42.5, status: 'OK' }
    │
    ▼
React viewer updates node
    │
    ├── Updates node description with duration
    ├── Sets state to 'OK' (green check icon)
    └── Removes "in-progress" indicator

... all spans complete or timeout ...

    │
    ▼
Service writes trace to file
    │
    └── packages/react/stories/__traces__/http-get-users.canvas.json
```

---

## Layout Algorithms

### Hierarchical (Default for Test Runs)

Best for showing parent-child relationships clearly.

```
        ┌──────────────────┐
        │  HTTP GET /api   │  (root span)
        └────────┬─────────┘
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
┌──────────┐          ┌──────────┐
│ Auth     │          │ Database │
│ Validate │          │  Query   │
└──────────┘          └────┬─────┘
                           │
                      ┌────┴────┐
                      ▼         ▼
                 ┌───────┐ ┌───────┐
                 │ Index │ │ Fetch │
                 │ Scan  │ │ Rows  │
                 └───────┘ └───────┘
```

### Timeline

Shows temporal relationships, good for identifying parallelism and bottlenecks.

```
Time ──────────────────────────────────────────────►

Service A  ████████████████░░░░░░░░░░░░░░░░░░░░░░░░
           HTTP GET /api

Service B  ░░░░░░████████░░░░░░░░░░░░░░░░░░░░░░░░░░
                 Auth

Service C  ░░░░░░░░░░░░░░█████████████████░░░░░░░░░
                         DB Query
                              ░░░░████░░░░░░░░░░░░░
                                   Index
                              ░░░░░░░░████░░░░░░░░░
                                        Fetch
```

### Force-Directed

Good for exploring complex traces with many cross-service calls.

```typescript
interface LayoutOptions {
  algorithm: 'hierarchical' | 'timeline' | 'force-directed';

  // Hierarchical options
  direction?: 'TB' | 'LR';  // Top-to-bottom or left-to-right
  levelSeparation?: number;
  nodeSeparation?: number;

  // Timeline options
  timeScale?: number;  // Pixels per millisecond
  swimlanes?: boolean; // Group by service in rows

  // Force-directed options
  repulsion?: number;
  attraction?: number;
  iterations?: number;
}
```

---

## Developer Experience

### Getting Started

```bash
# Install the service
npm install -g @principal-ai/trace-canvas-service

# Start the service (defaults: OTLP HTTP on 4318, WebSocket on 8080)
trace-canvas-service

# Or with file output for Storybook mocks
trace-canvas-service --output ./stories/__traces__

# In another terminal, run your tests with OTEL configured
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm test

# Open the viewer (if running with --live)
open http://localhost:8080
```

### Configuration

```yaml
# trace-canvas-service.yaml
receiver:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

assembler:
  # Wait for spans before considering trace complete
  traceTimeout: 5s

  # Filter noisy internal spans
  filter:
    minDurationMs: 1
    excludeNames:
      - "internal/*"

output:
  # Write completed traces to files (for Storybook mocks)
  files:
    enabled: true
    directory: ./stories/__traces__
    naming: root-span  # or 'trace-id' or 'service-timestamp'

  # Live streaming for real-time viewing
  websocket:
    enabled: true
    port: 8080
    cors:
      allowedOrigins: ["http://localhost:*"]

canvas:
  layout: hierarchical
  groupByService: true
```

### Framework Integration Examples

#### Jest + Node.js

```typescript
// jest.setup.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
  serviceName: 'my-app-tests',
});

sdk.start();

afterAll(() => sdk.shutdown());
```

#### Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
    env: {
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
    },
  },
});
```

#### pytest + Python

```python
# conftest.py
import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

@pytest.fixture(scope="session", autouse=True)
def setup_tracing():
    provider = TracerProvider()
    processor = BatchSpanProcessor(OTLPSpanExporter(
        endpoint="localhost:4317",
        insecure=True,
    ))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)

    yield

    provider.shutdown()
```

### Custom Span Annotations

Developers can add attributes that influence the canvas visualization:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

// These attributes will be reflected in the canvas
tracer.startActiveSpan('processOrder', {
  attributes: {
    // Standard semantic conventions (auto-detected)
    'http.method': 'POST',
    'http.url': '/api/orders',

    // Custom attributes (shown in node details)
    'order.id': orderId,
    'order.total': total,

    // Canvas hints (optional, for power users)
    'canvas.color': '#f59e0b',  // Override node color
    'canvas.icon': 'shopping-cart',  // Set node icon
  },
}, async (span) => {
  // ... do work
  span.end();
});
```

---

## Integration with Existing Infrastructure

### Extending CanvasConverter

The existing `CanvasConverter` in `packages/core` converts `ExtendedCanvas` to React Flow format. The collector's output is an `ExtendedCanvas`, so it naturally integrates:

```typescript
import { CanvasConverter } from '@principal-ai/principal-view-core';
import { useReactFlow } from 'reactflow';

function TraceViewer({ canvas }: { canvas: ExtendedCanvas }) {
  const { nodes, edges } = CanvasConverter.toReactFlow(canvas);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      // ... other props
    />
  );
}
```

### Using Existing OTel Types

The service uses the types already defined in `packages/core/src/types/otel.ts`:

```typescript
import type { OtelSpan, OtelResource } from '@principal-ai/principal-view-core';

// Service receives raw OTLP, converts to our OtelSpan type
function otlpToOtelSpan(protoSpan: otlp.Span): OtelSpan {
  return {
    traceId: bufferToHex(protoSpan.traceId),
    spanId: bufferToHex(protoSpan.spanId),
    parentSpanId: protoSpan.parentSpanId ? bufferToHex(protoSpan.parentSpanId) : undefined,
    name: protoSpan.name,
    kind: protoKindToKind(protoSpan.kind),
    startTime: protoSpan.startTimeUnixNano,
    endTime: protoSpan.endTimeUnixNano || undefined,
    resource: resourceFromProto(protoSpan.resource),
    attributes: attributesFromProto(protoSpan.attributes),
    status: statusFromProto(protoSpan.status),
    events: eventsFromProto(protoSpan.events),
  };
}
```

### Audit Integration

The service can produce audit reports using the existing `AuditReport` types:

```typescript
import type { AuditReport, LogRoutingResult } from '@principal-ai/principal-view-core';

// Track which spans map to expected services
function auditTraceMapping(
  spans: OtelSpan[],
  expectedCanvas: ExtendedCanvas
): AuditReport {
  // Compare actual services in trace vs nodes in expected canvas
  // Report orphaned spans (services not in canvas)
  // Report silent nodes (canvas nodes with no spans)
}
```

---

## Dogfooding: principal-view-core-library Tests

We'll use this tool on our own test suite first. This gives us:

1. **Real test data** for Storybook stories
2. **Validation** that the trace → canvas conversion works
3. **Example instrumentation** for documentation

### Test Infrastructure Setup

```typescript
// packages/core/test/setup.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'principal-view-core-tests',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
  }),
});

// Start before tests
sdk.start();

// Shutdown after all tests complete
afterAll(async () => {
  await sdk.shutdown();
});
```

### Instrumenting Test Scenarios

```typescript
// packages/core/test/canvas-converter.test.ts
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('canvas-converter-tests');

describe('CanvasConverter', () => {
  it('converts nodes with pv extensions', async () => {
    await tracer.startActiveSpan('test:convert-pv-nodes', async (span) => {
      span.setAttribute('test.name', 'converts nodes with pv extensions');

      // Trace the actual conversion
      await tracer.startActiveSpan('CanvasConverter.toReactFlow', async (convertSpan) => {
        const result = CanvasConverter.toReactFlow(testCanvas);
        convertSpan.setAttribute('node.count', result.nodes.length);
        convertSpan.setAttribute('edge.count', result.edges.length);
        convertSpan.end();
      });

      expect(result.nodes).toHaveLength(3);
      span.end();
    });
  });
});
```

### Capturing Traces as Story Mocks

```
packages/
├── core/
│   └── test/
│       └── setup.ts              # OTel SDK initialization
├── react/
│   └── stories/
│       └── __traces__/           # Captured trace canvases
│           ├── converter-happy-path.canvas.json
│           ├── converter-error-case.canvas.json
│           └── full-validation-flow.canvas.json
└── trace-canvas-service/         # New package
    └── src/
        ├── receiver.ts           # OTLP HTTP receiver
        ├── assembler.ts          # Span → Trace correlation
        └── writer.ts             # Trace → Canvas file output
```

### npm Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:traced": "trace-canvas-service --output packages/react/stories/__traces__ & vitest && kill %1",
    "test:live": "trace-canvas-service --live --port 8080 & vitest --watch"
  }
}
```

### Using Captured Traces in Storybook

```typescript
// packages/react/stories/TraceViewer.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { TraceViewer } from '../src/TraceViewer';

// Import captured test traces
import converterTrace from './__traces__/converter-happy-path.canvas.json';
import errorTrace from './__traces__/converter-error-case.canvas.json';

const meta: Meta<typeof TraceViewer> = {
  title: 'Visualization/TraceViewer',
  component: TraceViewer,
};

export default meta;

export const HappyPath: StoryObj<typeof TraceViewer> = {
  args: {
    canvas: converterTrace,
  },
};

export const WithErrors: StoryObj<typeof TraceViewer> = {
  args: {
    canvas: errorTrace,
  },
};
```

### Output File Naming

Traces are saved with meaningful names based on test metadata:

```typescript
interface TraceOutputOptions {
  /** Directory to write canvas files */
  outputDir: string;

  /** How to name output files */
  naming: 'trace-id' | 'root-span' | 'service-timestamp';

  /** Only save traces matching this filter */
  filter?: {
    services?: string[];
    minSpans?: number;
    hasErrors?: boolean;
  };
}

// Examples:
// naming: 'trace-id'        → abc123def456.canvas.json
// naming: 'root-span'       → test-convert-pv-nodes.canvas.json
// naming: 'service-timestamp' → principal-view-core-tests-1703520000.canvas.json
```

---

## Implementation Phases

### Phase 1: Core Service + Dogfooding

- OTLP HTTP receiver (simpler than gRPC for dev use)
- Basic span buffering and trace correlation
- `traceToCanvas()` conversion function
- File output to `__traces__/` directory
- Integration with principal-view-core test suite

**Deliverable**: Captured traces from our own tests, usable in Storybook

### Phase 2: Live Streaming

- WebSocket server
- Incremental span-to-node updates
- React viewer with live updates
- Basic hierarchical layout

**Deliverable**: Real-time trace visualization during test runs

### Phase 3: Enhanced Visualization

- Multiple layout algorithms
- Span filtering and aggregation
- Timeline view with duration bars
- Error highlighting and navigation

**Deliverable**: Production-quality visualization with multiple views

### Phase 4: Developer Experience

- npm package with zero-config defaults
- Framework integration guides
- VS Code extension for inline viewing
- Trace comparison (before/after)

**Deliverable**: Polished developer tool ready for public release

---

## Open Questions

1. **Trace boundary detection**: How long to wait after last span before considering a trace "complete"? Default to 5s with configurable timeout?

2. **Multi-trace view**: Should the viewer show all traces from a test run, or one at a time? Consider a trace list sidebar with single-trace detail view.

3. **Span aggregation UX**: When aggregating similar spans, how to show the individual instances? Expandable node? Separate detail panel?

4. **Canvas persistence**: Should completed traces be saved as `.canvas.json` files for later viewing? Could enable trace archaeology and comparison.

5. **Error workflow**: When a span has ERROR status, what's the ideal UX? Auto-zoom to error? Error panel with stack trace? Filter to show only error path?

---

## Related Files

- `packages/core/src/types/otel.ts` - OTel type definitions
- `packages/core/src/types/canvas.ts` - Canvas schema
- `packages/core/src/types/audit.ts` - Audit report types
- `packages/core/src/canvas-converter.ts` - Canvas to React Flow conversion
- `packages/react/` - React Flow rendering components
