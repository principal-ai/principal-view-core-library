# Sentry Integration Design Document

**Status:** Draft
**Author:** Research Team
**Date:** 2024-12-09
**Version:** 0.1.0

## Executive Summary

This document outlines a strategy for integrating the Visual Validation Framework with [Sentry](https://github.com/getsentry/sentry), enabling bidirectional compatibility between our graph-based visualization standard and Sentry's error/performance monitoring ecosystem.

The integration will allow:
1. **Span-to-Graph mapping** - Render Sentry traces as Visual Validation graphs
2. **Error context enrichment** - Link graph nodes to Sentry issues/events
3. **SDK integration** - Emit Visual Validation events from Sentry SDK hooks
4. **Performance issue visualization** - Display Sentry-detected performance problems on graphs

---

## Table of Contents

1. [Background](#background)
2. [Sentry Architecture Overview](#sentry-architecture-overview)
3. [Data Model Comparison](#data-model-comparison)
4. [Integration Approaches](#integration-approaches)
5. [Schema Extensions](#schema-extensions)
6. [Implementation Milestones](#implementation-milestones)
7. [API Contracts](#api-contracts)
8. [Security Considerations](#security-considerations)
9. [Open Questions](#open-questions)

---

## Background

### Visual Validation Framework

Our framework provides configuration-driven, event-based graph visualization for:
- System architecture visualization
- Real-time monitoring via event streams
- Test execution flow validation
- Path-based log association with components

**Core Concepts:**
- `GraphConfiguration` - Defines node types, edge types, and connection rules
- `GraphEvent` - Events that create/update/animate nodes and edges
- `PathBasedEventProcessor` - Associates logs with graph components via source path matching

### Why Sentry Integration?

Sentry is the de facto standard for error/performance monitoring with:
- 100k+ organizations using it
- First-class distributed tracing support
- Rich span/transaction data model
- Performance issue detection

Integrating with Sentry enables:
1. **Adoption** - Users already instrumented with Sentry can immediately visualize their systems
2. **Error context** - Clicking a graph node shows related Sentry issues
3. **Performance insights** - Surface Sentry-detected N+1 queries, slow spans, etc. on graphs
4. **Trace visualization** - Alternative to Sentry's waterfall: graph-based trace view

---

## Sentry Architecture Overview

### Core Data Models

```
┌─────────────────────────────────────────────────────────────────┐
│                        SENTRY EVENT MODEL                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Event     │    │ Transaction │    │    Span     │         │
│  │             │    │             │    │             │         │
│  │ • event_id  │    │ • trace_id  │    │ • span_id   │         │
│  │ • type      │    │ • spans[]   │    │ • parent_id │         │
│  │ • message   │    │ • op        │    │ • op        │         │
│  │ • level     │    │ • status    │    │ • status    │         │
│  │ • timestamp │    │ • duration  │    │ • data      │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                 │
│         └──────────────────┴──────────────────┘                 │
│                            │                                    │
│                            ▼                                    │
│                    ┌─────────────┐                              │
│                    │    Group    │ (Issue grouping)             │
│                    │             │                              │
│                    │ • fingerprint                              │
│                    │ • status    │                              │
│                    │ • priority  │                              │
│                    └─────────────┘                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Span Structure

Sentry spans contain rich operational data:

```typescript
interface SentrySpan {
  // Identity
  span_id: string;
  trace_id: string;
  parent_span_id?: string;

  // Timing
  start_timestamp: number;
  timestamp: number;  // end time
  exclusive_time?: number;

  // Classification
  op: string;  // e.g., 'http', 'db', 'cache', 'queue'
  description?: string;
  status: SpanStatus;

  // Attributes
  data: {
    // HTTP
    'http.method'?: string;
    'http.url'?: string;
    'http.status_code'?: number;

    // Database
    'db.name'?: string;
    'db.system'?: string;
    'db.operation'?: string;

    // Source code
    'code.filepath'?: string;
    'code.lineno'?: number;
    'code.function'?: string;

    // Custom
    [key: string]: unknown;
  };

  tags: Record<string, string>;
  sentry_tags: Record<string, string>;
}
```

### Operation Types

Sentry categorizes spans by `op` (operation):

| Category | Operations | Description |
|----------|------------|-------------|
| **HTTP** | `http`, `http.client`, `http.server` | HTTP requests |
| **Database** | `db`, `db.query`, `db.sql.query`, `db.redis` | Database operations |
| **Cache** | `cache`, `cache.get`, `cache.put` | Caching operations |
| **Queue** | `queue`, `queue.submit`, `queue.process` | Message queues |
| **File** | `file`, `file.read`, `file.write` | File I/O |
| **Serialize** | `serialize`, `deserialize` | Data serialization |
| **UI** | `ui.load`, `ui.render`, `navigation` | Frontend rendering |
| **Function** | `function`, `middleware` | Code execution |

### Performance Issue Detection

Sentry automatically detects performance issues via span analysis:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PERFORMANCE DETECTORS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  N+1 DB Queries     │    │  Slow DB Query      │            │
│  │  ─────────────────  │    │  ────────────────   │            │
│  │  Detects repeated   │    │  Queries > 500ms    │            │
│  │  similar queries    │    │  threshold          │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Consecutive HTTP   │    │  Large Payload      │            │
│  │  ─────────────────  │    │  ────────────────   │            │
│  │  Sequential API     │    │  Response > 1MB     │            │
│  │  calls in series    │    │  threshold          │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────┐            │
│  │  Main Thread I/O    │    │  Render Blocking    │            │
│  │  ─────────────────  │    │  ────────────────   │            │
│  │  File/DB on UI      │    │  Assets blocking    │            │
│  │  thread (mobile)    │    │  page render        │            │
│  └─────────────────────┘    └─────────────────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model Comparison

### Structural Mapping

| Visual Validation | Sentry | Notes |
|-------------------|--------|-------|
| `GraphConfiguration` | - | No direct equivalent; VV is configuration-driven |
| `NodeType` | `span.op` category | Map span operations to node types |
| `EdgeType` | Parent-child relationship | Implicit in `parent_span_id` |
| `Node` | `Span` | Each span becomes a node |
| `Edge` | Span hierarchy | Connect parent to child spans |
| `GraphEvent` | Span ingestion | Events emitted as spans arrive |
| `NodeState` | `span.status` | Map span status to visual states |

### Hierarchy Comparison

**Sentry:** Flat span list with `parent_span_id` references
```
spans: [
  { span_id: 'a', parent_span_id: null },
  { span_id: 'b', parent_span_id: 'a' },
  { span_id: 'c', parent_span_id: 'a' },
  { span_id: 'd', parent_span_id: 'b' },
]
```

**Visual Validation:** Explicit nodes and edges
```yaml
nodes:
  - id: 'a'
    type: 'http.server'
  - id: 'b'
    type: 'db.query'
  - id: 'c'
    type: 'cache.get'
  - id: 'd'
    type: 'db.query'

edges:
  - id: 'a->b'
    source: 'a'
    target: 'b'
  - id: 'a->c'
    source: 'a'
    target: 'c'
  - id: 'b->d'
    source: 'b'
    target: 'd'
```

### Event Flow Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                        EVENT FLOW COMPARISON                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SENTRY FLOW:                                                    │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐        │
│  │   SDK   │──▶│  Relay  │──▶│  Kafka  │──▶│ Consumer│        │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘        │
│       │                                          │              │
│       ▼                                          ▼              │
│  Span created                              Stored/Indexed       │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  VISUAL VALIDATION FLOW:                                         │
│  ┌─────────┐   ┌─────────────┐   ┌───────────────┐             │
│  │  Test/  │──▶│  Event      │──▶│ Validation    │             │
│  │  App    │   │  Processor  │   │ Engine        │             │
│  └─────────┘   └─────────────┘   └───────────────┘             │
│       │              │                   │                      │
│       ▼              ▼                   ▼                      │
│  GraphEvent     State Update       Rule Checking                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration Approaches

### Approach 1: Sentry SDK Integration (Recommended)

Hook into the Sentry SDK to emit Visual Validation events alongside Sentry spans.

```typescript
// sentry-vv-integration.ts
import * as Sentry from '@sentry/node';
import { EventProcessor, GraphConfiguration } from '@principal-ai/visual-validation-core';

export function createSentryVVIntegration(config: GraphConfiguration) {
  const processor = new EventProcessor(config);

  return {
    name: 'VisualValidation',
    setupOnce() {
      // Hook into span creation
      Sentry.addEventProcessor((event, hint) => {
        if (event.type === 'transaction' && event.spans) {
          // Convert transaction to root node
          processor.processEvent({
            id: crypto.randomUUID(),
            type: 'node',
            timestamp: Date.now(),
            payload: {
              operation: 'create',
              nodeId: event.event_id,
              nodeType: mapOpToNodeType(event.contexts?.trace?.op),
              data: extractNodeData(event),
            },
          });

          // Convert each span to node + edge
          for (const span of event.spans) {
            emitSpanAsNodeAndEdge(processor, span, event.event_id);
          }
        }
        return event;
      });
    },
  };
}

function mapOpToNodeType(op: string | undefined): string {
  if (!op) return 'unknown';

  const mapping: Record<string, string> = {
    'http': 'api',
    'http.client': 'api',
    'http.server': 'server',
    'db': 'database',
    'db.query': 'database',
    'db.sql.query': 'database',
    'cache': 'cache',
    'cache.get': 'cache',
    'queue': 'queue',
    'queue.submit': 'queue',
  };

  return mapping[op] || op.split('.')[0] || 'unknown';
}
```

**Pros:**
- Real-time integration
- Works with existing Sentry instrumentation
- Minimal additional setup

**Cons:**
- Requires SDK modification
- Client-side overhead

### Approach 2: Trace API Adapter

Fetch completed traces from Sentry API and convert to Visual Validation format.

```typescript
// sentry-trace-adapter.ts
import { GraphConfiguration, GraphState } from '@principal-ai/visual-validation-core';

interface SentryTraceResponse {
  transactions: SentryTransaction[];
  orphan_errors: SentryError[];
}

export async function fetchTraceAsGraph(
  traceId: string,
  config: GraphConfiguration,
  sentryConfig: { org: string; project: string; token: string }
): Promise<GraphState> {
  const response = await fetch(
    `https://sentry.io/api/0/organizations/${sentryConfig.org}/events-trace/${traceId}/`,
    {
      headers: { Authorization: `Bearer ${sentryConfig.token}` },
    }
  );

  const trace: SentryTraceResponse = await response.json();
  return convertTraceToGraph(trace, config);
}

function convertTraceToGraph(
  trace: SentryTraceResponse,
  config: GraphConfiguration
): GraphState {
  const nodes = new Map();
  const edges = new Map();

  // Process transactions and their spans
  for (const tx of trace.transactions) {
    // Add transaction as root node
    nodes.set(tx.event_id, {
      id: tx.event_id,
      type: mapOpToNodeType(tx['transaction.op']),
      data: {
        name: tx.transaction,
        duration: tx['transaction.duration'],
        status: tx['transaction.status'],
        sentryEventId: tx.event_id,
        sentryProjectId: tx.project_id,
      },
      state: 'default',
    });

    // Process child spans
    if (tx.spans) {
      for (const span of tx.spans) {
        nodes.set(span.span_id, {
          id: span.span_id,
          type: mapOpToNodeType(span.op),
          data: {
            name: span.description || span.op,
            duration: span.timestamp - span.start_timestamp,
            status: span.status,
            ...span.data,
          },
          state: span.status === 'ok' ? 'default' : 'error',
        });

        // Create edge from parent
        const parentId = span.parent_span_id || tx.event_id;
        edges.set(`${parentId}->${span.span_id}`, {
          id: `${parentId}->${span.span_id}`,
          type: 'calls',
          source: parentId,
          target: span.span_id,
        });
      }
    }
  }

  // Add orphan errors as error nodes
  for (const error of trace.orphan_errors) {
    nodes.set(error.event_id, {
      id: error.event_id,
      type: 'error',
      data: {
        title: error.title,
        message: error.message,
        level: error.level,
        sentryIssueId: error['issue.id'],
      },
      state: 'error',
    });
  }

  return { nodes, edges, timestamp: Date.now() };
}
```

**Pros:**
- No SDK changes required
- Works with historical data
- Full trace context

**Cons:**
- Not real-time
- Requires API access

### Approach 3: Span Buffer Stream

Connect directly to Sentry's span buffer (self-hosted) for real-time streaming.

```typescript
// For self-hosted Sentry with Redis access
import Redis from 'ioredis';
import { EventProcessor } from '@principal-ai/visual-validation-core';

export class SentrySpanBufferStream {
  private redis: Redis;
  private processor: EventProcessor;

  constructor(redisUrl: string, processor: EventProcessor) {
    this.redis = new Redis(redisUrl);
    this.processor = processor;
  }

  async subscribe(traceId: string) {
    // Listen to span buffer keys
    const pattern = `span-buf:z:${traceId}:*`;

    // Poll for new spans (simplified)
    const spans = await this.redis.zrange(pattern, 0, -1);
    for (const spanData of spans) {
      const span = JSON.parse(spanData);
      this.processor.processEvent(this.spanToEvent(span));
    }
  }

  private spanToEvent(span: any) {
    return {
      id: crypto.randomUUID(),
      type: 'node' as const,
      timestamp: Date.now(),
      payload: {
        operation: 'create',
        nodeId: span.span_id,
        nodeType: span.op,
        data: span.data,
      },
    };
  }
}
```

**Pros:**
- True real-time
- Low latency

**Cons:**
- Self-hosted only
- Direct infrastructure access required

---

## Schema Extensions

### Extended GraphConfiguration for Sentry

```yaml
# .principal-views/sentry-instrumented.yaml
metadata:
  name: "Sentry Instrumented System"
  version: "1.0.0"
  description: "System with Sentry integration"

# Sentry integration configuration
sentry:
  enabled: true
  dsn: "${SENTRY_DSN}"  # Optional: for SDK integration
  org: "my-org"          # For API integration
  project: "my-project"

  # Map Sentry span ops to node types
  opMappings:
    http: api
    http.client: api
    http.server: server
    db: database
    db.query: database
    db.sql.query: database
    db.redis: cache
    cache: cache
    cache.get: cache
    cache.put: cache
    queue: queue
    queue.submit: queue
    queue.process: worker

nodeTypes:
  api:
    shape: hexagon
    color: "#2196F3"
    icon: "globe"
    dataSchema:
      name: { type: string }
      method: { type: string }
      url: { type: string }
      statusCode: { type: number }
    states:
      default: { color: "#2196F3" }
      success: { color: "#4CAF50" }
      error: { color: "#F44336" }
      slow: { color: "#FF9800" }

    # Sentry-specific extensions
    sentryMapping:
      spanOps: ['http', 'http.client', 'http.server']
      extractAttributes:
        - 'http.method'
        - 'http.url'
        - 'http.status_code'
      stateRules:
        - condition: "data['http.status_code'] >= 500"
          state: error
        - condition: "duration > 1000"
          state: slow

  database:
    shape: cylinder
    color: "#9C27B0"
    icon: "database"
    dataSchema:
      name: { type: string }
      system: { type: string }
      query: { type: string }
    states:
      default: { color: "#9C27B0" }
      slow: { color: "#FF9800" }
      n_plus_one: { color: "#F44336", pulse: true }

    sentryMapping:
      spanOps: ['db', 'db.query', 'db.sql.query']
      extractAttributes:
        - 'db.name'
        - 'db.system'
        - 'db.statement'
      # Link to Sentry performance issues
      performanceIssues:
        - type: 'n_plus_one_db'
          state: n_plus_one
          highlightRelated: true
        - type: 'slow_db_query'
          state: slow

  cache:
    shape: diamond
    color: "#00BCD4"
    icon: "zap"
    sentryMapping:
      spanOps: ['cache', 'cache.get', 'cache.put', 'db.redis']

  queue:
    shape: rectangle
    color: "#FF5722"
    icon: "inbox"
    sentryMapping:
      spanOps: ['queue', 'queue.submit', 'queue.process']

  error:
    shape: octagon
    color: "#F44336"
    icon: "alert-triangle"
    dataSchema:
      title: { type: string }
      message: { type: string }
      level: { type: string }
      sentryIssueId: { type: string }

edgeTypes:
  calls:
    style: solid
    directed: true
    color: "#666"

  error_link:
    style: dashed
    directed: true
    color: "#F44336"
    animated: true
    animationType: pulse

allowedConnections:
  - from: api
    to: [database, cache, queue, api]
    via: calls
  - from: database
    to: database
    via: calls
  - from: queue
    to: [api, database]
    via: calls
  - from: "*"
    to: error
    via: error_link

# Deep linking configuration
linking:
  sentry:
    issue: "https://sentry.io/organizations/{org}/issues/{issueId}/"
    event: "https://sentry.io/organizations/{org}/issues/{issueId}/events/{eventId}/"
    trace: "https://sentry.io/organizations/{org}/performance/trace/{traceId}/"
```

### Node Data Extensions

```typescript
// Extended node data for Sentry integration
interface SentryNodeData {
  // Standard VV fields
  name: string;

  // Sentry references (for deep linking)
  sentryEventId?: string;
  sentrySpanId?: string;
  sentryTraceId?: string;
  sentryProjectId?: string;
  sentryIssueId?: string;

  // Sentry span data
  sentryOp?: string;
  sentryStatus?: string;
  sentryDuration?: number;

  // Performance issue data
  sentryPerformanceIssue?: {
    type: string;
    title: string;
    culprit?: string;
    affectedSpans?: string[];
  };

  // Custom span attributes
  [key: string]: unknown;
}
```

---

## Implementation Milestones

### Milestone 1: Core Type Definitions

**Scope:** Add Sentry-related types to `@principal-ai/visual-validation-core`

**Files to create/modify:**
- `packages/core/src/types/sentry.ts` - Sentry type definitions
- `packages/core/src/types/index.ts` - Export Sentry types

**Deliverables:**
- [ ] `SentrySpan` interface
- [ ] `SentryTransaction` interface
- [ ] `SentryError` interface
- [ ] `SentryIntegrationConfig` interface
- [ ] `SentryNodeData` extended interface

### Milestone 2: Span-to-Graph Converter

**Scope:** Utility to convert Sentry spans to Visual Validation graph state

**Files to create:**
- `packages/core/src/integrations/sentry/SpanConverter.ts`
- `packages/core/src/integrations/sentry/OpMapper.ts`
- `packages/core/src/integrations/sentry/index.ts`

**Deliverables:**
- [ ] `convertSpanToNode()` function
- [ ] `convertSpanHierarchyToEdges()` function
- [ ] `convertTraceToGraphState()` function
- [ ] `mapSentryOpToNodeType()` with configurable mappings
- [ ] Unit tests with sample Sentry data

### Milestone 3: Sentry Trace API Adapter

**Scope:** Fetch traces from Sentry API and convert to graph format

**Files to create:**
- `packages/core/src/integrations/sentry/TraceApiAdapter.ts`
- `packages/core/src/integrations/sentry/SentryClient.ts`

**Deliverables:**
- [ ] `SentryClient` class for API calls
- [ ] `fetchTrace()` method
- [ ] `fetchProjectTraces()` method
- [ ] Error handling and rate limiting
- [ ] Integration tests (mocked)

### Milestone 4: SDK Integration Hook

**Scope:** Sentry SDK integration for real-time event emission

**Files to create:**
- `packages/sentry-integration/` - New package
- `packages/sentry-integration/src/SentryVVIntegration.ts`

**Deliverables:**
- [ ] `createSentryVVIntegration()` factory
- [ ] Transaction event processor
- [ ] Span-to-event converter
- [ ] Performance issue handler
- [ ] npm package `@principal-ai/visual-validation-sentry`

### Milestone 5: React Components for Sentry

**Scope:** UI components for Sentry-integrated visualizations

**Files to create:**
- `packages/react/src/components/SentryTraceViewer.tsx`
- `packages/react/src/components/SentryErrorBadge.tsx`
- `packages/react/src/components/SentryPerformanceIndicator.tsx`

**Deliverables:**
- [ ] Trace viewer component with Sentry deep links
- [ ] Error badge component for nodes
- [ ] Performance issue indicator component
- [ ] Node click handler for Sentry navigation
- [ ] Storybook stories

### Milestone 6: Documentation & Examples

**Scope:** Complete documentation and example configurations

**Deliverables:**
- [ ] `docs/SENTRY_INTEGRATION_GUIDE.md`
- [ ] `.principal-views/examples/sentry-web-app.yaml`
- [ ] `.principal-views/examples/sentry-microservices.yaml`
- [ ] Example project with full integration

---

## API Contracts

### SpanConverter API

```typescript
import {
  SpanConverter,
  SentryIntegrationConfig
} from '@principal-ai/visual-validation-core/integrations/sentry';

const config: SentryIntegrationConfig = {
  opMappings: {
    'http': 'api',
    'db': 'database',
  },
  extractAttributes: ['http.method', 'http.url', 'db.name'],
};

const converter = new SpanConverter(config);

// Convert single span
const node = converter.spanToNode(sentrySpan);

// Convert full trace
const graphState = converter.traceToGraphState(sentryTrace);
```

### TraceApiAdapter API

```typescript
import {
  SentryClient,
  TraceApiAdapter
} from '@principal-ai/visual-validation-core/integrations/sentry';

const client = new SentryClient({
  baseUrl: 'https://sentry.io',
  org: 'my-org',
  token: process.env.SENTRY_TOKEN,
});

const adapter = new TraceApiAdapter(client, graphConfig);

// Fetch and convert trace
const graphState = await adapter.fetchTraceAsGraph(traceId);

// Stream traces for a project
for await (const trace of adapter.streamProjectTraces(projectSlug)) {
  processor.mergeState(trace);
}
```

### SDK Integration API

```typescript
import * as Sentry from '@sentry/node';
import { createSentryVVIntegration } from '@principal-ai/visual-validation-sentry';
import { EventProcessor, loadConfiguration } from '@principal-ai/visual-validation-core';

const config = loadConfiguration('.principal-views/sentry-instrumented.yaml');
const processor = new EventProcessor(config);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    createSentryVVIntegration({
      processor,
      config,
      emitToWebSocket: 'ws://localhost:8080/events',
    }),
  ],
});
```

---

## Security Considerations

### API Token Handling

- Never store Sentry tokens in configuration files
- Use environment variables: `${SENTRY_TOKEN}`
- Support token rotation
- Minimum required scopes: `project:read`, `event:read`

### Data Privacy

- Sentry events may contain PII
- Implement data scrubbing before display
- Respect Sentry's data retention policies
- Support organization-level access controls

### Network Security

- All Sentry API calls over HTTPS
- Validate SSL certificates
- Implement request timeouts
- Rate limit API calls (Sentry limit: 40 req/s)

---

## Open Questions

1. **Scope of initial integration**
   - Start with read-only trace visualization?
   - Include real-time SDK integration in v1?

2. **Configuration storage**
   - Store Sentry org/project in `.principal-views/` config?
   - Separate `.sentry` config file?

3. **Performance issue visualization**
   - How to visually indicate N+1 queries affecting multiple nodes?
   - Animate affected edges? Highlight node cluster?

4. **Bi-directional linking**
   - Deep link from VV node → Sentry issue/event (easy)
   - Link from Sentry → VV visualization (requires URL scheme)

5. **Self-hosted vs SaaS**
   - Different integration paths for self-hosted Sentry?
   - Direct Redis/Kafka access for self-hosted?

6. **Multi-project traces**
   - Sentry traces can span multiple projects
   - How to handle cross-project node types?

---

## Appendix A: Sentry Span Operations Reference

Complete list of Sentry span operations and suggested Visual Validation node type mappings:

| Sentry Op | Category | Suggested Node Type | Icon |
|-----------|----------|---------------------|------|
| `http` | HTTP | `api` | globe |
| `http.client` | HTTP | `api` | arrow-right |
| `http.server` | HTTP | `server` | server |
| `db` | Database | `database` | database |
| `db.query` | Database | `database` | search |
| `db.sql.query` | Database | `database` | code |
| `db.redis` | Cache | `cache` | zap |
| `cache` | Cache | `cache` | layers |
| `cache.get` | Cache | `cache` | download |
| `cache.put` | Cache | `cache` | upload |
| `queue` | Queue | `queue` | inbox |
| `queue.submit` | Queue | `queue` | send |
| `queue.process` | Queue | `worker` | cog |
| `task` | Task | `worker` | play |
| `subprocess` | Process | `worker` | terminal |
| `serialize` | Data | `transform` | package |
| `deserialize` | Data | `transform` | unpack |
| `file` | File | `storage` | file |
| `file.read` | File | `storage` | file-text |
| `file.write` | File | `storage` | file-plus |
| `grpc` | RPC | `api` | radio |
| `graphql` | API | `api` | git-branch |
| `websocket` | Realtime | `api` | radio |
| `ui.load` | UI | `frontend` | monitor |
| `ui.render` | UI | `frontend` | layout |
| `navigation` | UI | `frontend` | compass |
| `resource` | Resource | `resource` | box |
| `function` | Code | `function` | code |
| `middleware` | Code | `middleware` | layers |

---

## Appendix B: Sentry Performance Issue Types

| Issue Type | Detection | Visual Treatment |
|------------|-----------|------------------|
| `n_plus_one_db` | Repeated similar DB queries | Pulse affected nodes, highlight edges |
| `slow_db_query` | Query > 500ms | Orange state on DB node |
| `consecutive_http` | Sequential HTTP calls | Dashed edges between API nodes |
| `large_http_payload` | Response > 1MB | Warning badge on API node |
| `file_io_main_thread` | File I/O on UI thread | Red state on file node |
| `render_blocking_asset` | CSS/JS blocking render | Red edge to frontend node |
| `m_n_plus_one_db` | M×N query pattern | Cluster highlight |
| `http_overhead` | High HTTP overhead | Timing badge on edges |

---

## References

- [Sentry Documentation](https://docs.sentry.io/)
- [Sentry GitHub Repository](https://github.com/getsentry/sentry)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)
- [Visual Validation Framework Documentation](./README.md)
- [JSON Canvas Specification](https://jsoncanvas.org/spec/1.0/)
