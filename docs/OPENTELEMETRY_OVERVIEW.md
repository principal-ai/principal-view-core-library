# OpenTelemetry Overview

**Status:** Reference Document
**Author:** Research Team
**Date:** 2024-12-21
**Version:** 0.1.0

## Executive Summary

OpenTelemetry (OTEL) is an open standard for collecting and exporting telemetry data (traces, logs, metrics) from software systems. This document provides a high-level overview of OpenTelemetry concepts relevant to the Visual Validation Framework's goal of visualizing log activity on architectures.

---

## Table of Contents

1. [The Three Signals](#the-three-signals)
2. [Core Concepts](#core-concepts)
   - [Trace & Span](#1-trace--span)
   - [Context Propagation](#2-context-propagation)
   - [Resource](#3-resource)
   - [Attributes](#4-attributes)
3. [Architecture Overview](#architecture-overview)
4. [ID Generation](#id-generation)
5. [Relevance to Visual Validation](#relevance-to-visual-validation)
6. [References](#references)

---

## The Three Signals

OpenTelemetry defines three core telemetry signals:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OPENTELEMETRY SIGNALS                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. TRACES  ──────────────────────────────────────────────────────  │
│     "What happened during this request?"                             │
│                                                                      │
│     A trace is a tree of operations (spans) showing how a request   │
│     flows through your system.                                       │
│                                                                      │
│         [HTTP Request] ─┬─▶ [Auth Check] ─▶ [DB Query]              │
│                         └─▶ [Cache Lookup]                          │
│                                                                      │
│  2. LOGS  ────────────────────────────────────────────────────────  │
│     "What happened at this moment?"                                  │
│                                                                      │
│     Discrete events with timestamps, severity, and messages.         │
│     Can be linked to traces via TraceId/SpanId.                     │
│                                                                      │
│         [ERROR] 2024-12-21 10:30:45 "Connection refused" span=abc   │
│                                                                      │
│  3. METRICS  ─────────────────────────────────────────────────────  │
│     "What are the numbers over time?"                                │
│                                                                      │
│     Aggregated measurements: counters, gauges, histograms.          │
│                                                                      │
│         requests_total: 1,542                                        │
│         latency_p99: 230ms                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Signal Comparison

| Signal  | Purpose                          | Granularity      | Use Case                        |
| ------- | -------------------------------- | ---------------- | ------------------------------- |
| Traces  | Track request flow               | Per-request      | Debugging distributed systems   |
| Logs    | Record discrete events           | Per-event        | Error investigation, audit      |
| Metrics | Measure aggregated values        | Time-windowed    | Alerting, dashboards            |

---

## Core Concepts

### 1. Trace & Span

A **Trace** represents a single request journey through your system, identified by a **TraceId** (128-bit random identifier).

A **Span** represents one operation within a trace, identified by a **SpanId** (64-bit random identifier). Each span has:

- **Name**: Describes the operation (e.g., "POST /checkout")
- **Start time**: When the operation began
- **Duration**: How long it took
- **Parent span**: Reference to the calling operation (if any)
- **Attributes**: Key-value metadata
- **Events**: Timestamped annotations within the span
- **Status**: Success, error, or unset

#### Span Hierarchy Example

```
TRACE: A single "request journey" through your system
       Identified by a TraceId (128-bit random ID)

SPAN: One operation within a trace
      Identified by a SpanId (64-bit random ID)
      Has: name, start time, duration, parent span, attributes

Example: User clicks "Buy Now"

TraceId: abc123...
│
├─ Span A: "POST /checkout"        (root span, no parent)
│   ├─ Span B: "validate-cart"     (parent: A)
│   ├─ Span C: "charge-payment"    (parent: A)
│   │   └─ Span D: "stripe-api"    (parent: C)
│   └─ Span E: "send-confirmation" (parent: A)
```

#### Temporal View

Spans can also be visualized on a timeline:

```
Time ──────────────────────────────────────────────────────────▶

[─────────────── Span A: POST /checkout ───────────────────────]
  [── Span B: validate-cart ──]
                    [────────── Span C: charge-payment ────────]
                      [── Span D: stripe-api ──]
                                              [─ Span E: send ─]
```

### 2. Context Propagation

Context propagation is the mechanism that passes TraceId/SpanId across service boundaries, enabling distributed tracing:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Frontend   │  HTTP   │   API       │  gRPC   │  Database   │
│             │────────▶│   Gateway   │────────▶│   Service   │
│  TraceId: X │ Header: │  TraceId: X │ Header: │  TraceId: X │
│  SpanId: 1  │ X / 1   │  SpanId: 2  │ X / 2   │  SpanId: 3  │
└─────────────┘         └─────────────┘         └─────────────┘

The TraceId stays the same across all services.
Each service creates a new SpanId, linking to its parent.
```

#### W3C Trace Context Standard

The standard header format for propagating trace context:

```
traceparent: {version}-{trace-id}-{parent-span-id}-{trace-flags}
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

| Field          | Size     | Description                              |
| -------------- | -------- | ---------------------------------------- |
| version        | 2 chars  | Always "00" for current spec             |
| trace-id       | 32 chars | 128-bit trace identifier                 |
| parent-span-id | 16 chars | 64-bit parent span identifier            |
| trace-flags    | 2 chars  | Sampling flags (01 = sampled)            |

#### Propagation Mechanisms

| Transport      | Propagation Method                    |
| -------------- | ------------------------------------- |
| HTTP           | `traceparent` / `tracestate` headers  |
| gRPC           | Metadata                              |
| Message Queues | Message headers/properties            |
| In-process     | Thread-local context                  |

### 3. Resource

A **Resource** describes the entity producing telemetry - the "who am I?" of observability:

```yaml
resource:
  # Service identification
  service.name: "payment-service"
  service.version: "2.1.0"
  service.namespace: "checkout"

  # Deployment context
  deployment.environment: "production"

  # Kubernetes context
  k8s.cluster.name: "prod-us-east"
  k8s.namespace.name: "checkout"
  k8s.deployment.name: "payment-service"
  k8s.pod.name: "payment-service-7d8f9-x2k4m"

  # Infrastructure
  host.name: "node-3.cluster.local"
  host.type: "n2-standard-4"
  cloud.provider: "gcp"
  cloud.region: "us-east1"
```

All telemetry (spans, logs, metrics) from the same process shares the same Resource. This enables:

- Correlating telemetry by origin
- Filtering by service, environment, region
- Auto-discovering system architecture from telemetry

### 4. Attributes

Attributes are key-value pairs that provide context to spans, logs, and metrics. OpenTelemetry defines **Semantic Conventions** - standardized attribute names for common concepts:

#### HTTP Attributes

```yaml
http.request.method: "POST"
http.route: "/api/v1/checkout"
url.full: "https://api.example.com/api/v1/checkout"
http.response.status_code: 200
```

#### Database Attributes

```yaml
db.system: "postgresql"
db.name: "orders"
db.operation: "SELECT"
db.statement: "SELECT * FROM users WHERE id = $1"
```

#### Messaging Attributes

```yaml
messaging.system: "rabbitmq"
messaging.destination.name: "orders.created"
messaging.operation: "publish"
```

#### Exception Attributes

```yaml
exception.type: "ConnectionError"
exception.message: "Connection refused"
exception.stacktrace: "..."
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        YOUR APPLICATION                              │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    OTEL SDK                                  │   │
│   │                                                              │   │
│   │  TracerProvider ──▶ Tracer ──▶ Spans                        │   │
│   │  LoggerProvider ──▶ Logger ──▶ LogRecords                   │   │
│   │  MeterProvider  ──▶ Meter  ──▶ Metrics                      │   │
│   │                                                              │   │
│   │  All share the same Resource (who am I?)                    │   │
│   │  All share Context Propagation (trace continuity)           │   │
│   │                                                              │   │
│   └────────────────────────┬────────────────────────────────────┘   │
│                            │ OTLP (OpenTelemetry Protocol)          │
└────────────────────────────┼────────────────────────────────────────┘
                             ▼
                 ┌───────────────────────┐
                 │   OTEL Collector      │
                 │                       │
                 │ • Receives telemetry  │
                 │ • Processes/enriches  │
                 │ • Exports to backends │
                 └───────────┬───────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │  Jaeger  │      │  Sentry  │      │  Custom  │
    │          │      │          │      │  Backend │
    └──────────┘      └──────────┘      └──────────┘
```

### Component Responsibilities

| Component         | Responsibility                                          |
| ----------------- | ------------------------------------------------------- |
| **SDK**           | Instrument code, create spans/logs/metrics              |
| **API**           | Vendor-neutral interface for instrumentation            |
| **Propagators**   | Inject/extract trace context across boundaries          |
| **Exporters**     | Send telemetry to backends (OTLP, Jaeger, Zipkin, etc.) |
| **Collector**     | Receive, process, and export telemetry                  |

### The Collector

The OTEL Collector is a standalone service that:

1. **Receives** telemetry via multiple protocols (OTLP, Jaeger, Zipkin, etc.)
2. **Processes** data (batching, sampling, enrichment, filtering)
3. **Exports** to one or more backends

```yaml
# Example Collector configuration
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
  resource:
    attributes:
      - key: environment
        value: production
        action: insert

exporters:
  otlp:
    endpoint: "backend.example.com:4317"
  logging:
    loglevel: debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, resource]
      exporters: [otlp, logging]
```

---

## ID Generation

### TraceId

- **Size**: 128 bits (32 hexadecimal characters)
- **Generation**: Random, generated once at request start
- **Propagation**: Passed to all downstream services
- **Example**: `4bf92f3577b34da6a3ce929d0e0e4736`

### SpanId

- **Size**: 64 bits (16 hexadecimal characters)
- **Generation**: Random, generated for each operation
- **Linking**: References parent via `parentSpanId`
- **Example**: `00f067aa0ba902b7`

### Generation Examples

```typescript
// Using Web Crypto API
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Simplified alternative
function generateTraceIdSimple(): string {
  return crypto.randomUUID().replace(/-/g, '');  // 32 hex chars
}

function generateSpanIdSimple(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);  // 16 hex chars
}
```

### Validity Rules

- TraceId must not be all zeros (`00000000000000000000000000000000`)
- SpanId must not be all zeros (`0000000000000000`)
- Both must be lowercase hexadecimal

---

## Relevance to Visual Validation

OpenTelemetry concepts map directly to Visual Validation Framework concepts:

| OpenTelemetry         | Visual Validation           | Mapping                                    |
| --------------------- | --------------------------- | ------------------------------------------ |
| **TraceId**           | Animation sequence          | Single user action flowing through graph   |
| **SpanId + ParentId** | Edges                       | Call graph / parent-child relationships    |
| **Resource**          | Node identity               | `service.name` → which node                |
| **Span**              | Node + state change         | Operation on a component                   |
| **LogRecord**         | GraphEvent                  | Event that updates node state              |
| **Attributes**        | Node.data / NodeState       | `http.status_code` → state, tooltips       |
| **SeverityNumber**    | NodeState                   | ERROR (17+) → error state                  |

### Log Correlation Dimensions

OpenTelemetry logs can be correlated with architecture in three dimensions:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LOG CORRELATION DIMENSIONS                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. TIME CORRELATION                                                 │
│     ├─ Timestamp / ObservedTimestamp                                │
│     └─ → Animate nodes on timeline, replay activity                 │
│                                                                      │
│  2. TRACE CONTEXT (Execution Context)                               │
│     ├─ TraceId: Groups all logs in a distributed transaction        │
│     ├─ SpanId: Links log to specific operation/node                 │
│     └─ → Draw edges showing log flow through architecture           │
│                                                                      │
│  3. RESOURCE CONTEXT (Origin)                                       │
│     ├─ service.name, service.namespace                              │
│     ├─ k8s.pod.name, k8s.deployment.name                           │
│     ├─ host.name, container.id                                      │
│     └─ → Map logs to architecture nodes by resource attributes      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Severity to State Mapping

OpenTelemetry defines severity levels 1-24:

| SeverityNumber | Level   | Suggested Node State |
| -------------- | ------- | -------------------- |
| 1-4            | TRACE   | debug                |
| 5-8            | DEBUG   | debug                |
| 9-12           | INFO    | default              |
| 13-16          | WARN    | warning              |
| 17-20          | ERROR   | error                |
| 21-24          | FATAL   | critical             |

---

## References

- [OpenTelemetry Specification](https://github.com/open-telemetry/opentelemetry-specification)
- [OpenTelemetry Semantic Conventions](https://github.com/open-telemetry/semantic-conventions)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [W3C Baggage](https://www.w3.org/TR/baggage/)
- [OTLP Specification](https://github.com/open-telemetry/opentelemetry-proto)
- [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector)
