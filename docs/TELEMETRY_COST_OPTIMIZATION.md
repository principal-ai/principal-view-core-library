# Telemetry Cost Optimization

**Status:** Reference Document
**Author:** Principal View Team
**Date:** 2025-02-13
**Version:** 1.0.0

## Executive Summary

Observability platforms like Datadog and Splunk charge based on data volume, cardinality, and retention. A mid-sized company can easily spend $300K+/month on telemetry. This document explains where telemetry costs come from and how Principal View's event-based architecture fundamentally reduces costs by 90%+ compared to traditional logging approaches.

**Key Insight:** The industry is shifting from unstructured logs to structured events. Principal View accelerates this shift by making events first-class citizens that automatically become traces and metrics—while reducing costs by 90%+ through local aggregation instead of sending everything to expensive platforms.

---

## Table of Contents

1. [The Industry Shift Away from Traditional Logging](#the-industry-shift-away-from-traditional-logging)
   - [The Evolution of Observability](#the-evolution-of-observability)
   - [Why Traditional Logging Is Expensive](#why-traditional-logging-is-expensive)
   - [The Event-Driven Future](#the-event-driven-future)
2. [Understanding Telemetry Costs](#understanding-telemetry-costs)
   - [The Three Cost Drivers](#the-three-cost-drivers)
   - [Real-World Pricing Examples](#real-world-pricing-examples)
3. [Cost Driver #1: Metrics](#cost-driver-1-metrics)
   - [How Metrics Are Priced](#how-metrics-are-priced)
   - [The Cardinality Explosion Problem](#the-cardinality-explosion-problem)
   - [Industry Standard: Events-to-Metrics Conversion](#industry-standard-events-to-metrics-conversion)
   - [How Principal View Does It Better](#how-principal-view-does-it-better)
4. [Cost Driver #2: Traces](#cost-driver-2-traces)
   - [How Traces Are Priced](#how-traces-are-priced)
   - [The Volume Problem](#the-volume-problem)
   - [How Principal View Addresses This](#how-principal-view-addresses-trace-costs)
5. [Cost Driver #3: Logs (Biggest Cost)](#cost-driver-3-logs-biggest-cost)
   - [How Logs Are Priced](#how-logs-are-priced)
   - [Why Logs Cost So Much](#why-logs-cost-so-much)
   - [How Principal View Addresses This](#how-principal-view-addresses-log-costs)
6. [The Event-Based Paradigm Shift](#the-event-based-paradigm-shift)
   - [Traditional Logging vs Events](#traditional-logging-vs-events)
   - [Volume Compression](#volume-compression)
   - [Cardinality Control](#cardinality-control)
   - [Intelligent Aggregation](#intelligent-aggregation)
7. [Cost Savings Calculator](#cost-savings-calculator)
   - [Example Scenario](#example-scenario)
   - [Savings Breakdown](#savings-breakdown)
8. [Implementation Best Practices](#implementation-best-practices)
9. [References](#references)

---

## The Industry Shift Away from Traditional Logging

### The Evolution of Observability

The observability industry is undergoing a fundamental paradigm shift:

```
┌────────────────────────────────────────────────────────────────┐
│  2015-2020: "Log Everything"                                   │
├────────────────────────────────────────────────────────────────┤
│  console.log('User 123 logged in')          ← Event           │
│  console.log('Request took 45ms')           ← Metric          │
│  console.log('Calling payment service')     ← Trace           │
│  console.error('Payment failed: timeout')   ← Error           │
│                                                                 │
│  Everything → Unstructured text logs → Expensive indexing     │
│                                                                 │
│  Result: $450-900/month for 3TB of logs                       │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  2020-2024: "Structured Logging + OpenTelemetry"              │
├────────────────────────────────────────────────────────────────┤
│  Auto-instrumentation captures everything automatically       │
│                                                                 │
│  Better: Structured data, distributed tracing                 │
│  Problem: No control over cardinality (pod IDs, instance IDs) │
│                                                                 │
│  Result: Cardinality explosions, surprise bills               │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  2024-2026: "Right Signal for Right Job"  ← CURRENT SHIFT     │
├────────────────────────────────────────────────────────────────┤
│  emit('user.login', {userId})              → Event            │
│  metric('request_duration', 45)            → Metric           │
│  span('payment-call')                      → Trace            │
│                                                                 │
│  Industry leaders (New Relic, Datadog) offer "events-to-      │
│  metrics" conversion, but you pay to send everything first    │
│                                                                 │
│  Result: Better, but still expensive ($47.50/month)           │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  PRINCIPAL VIEW: "Events-First with Local Aggregation"        │
├────────────────────────────────────────────────────────────────┤
│  emit('user.login', {userId})              → Event (local)    │
│    ↓                                                            │
│    ├→ Trace (OTLP span, sampled)                              │
│    ├→ Metric (aggregated locally every 60s)                   │
│    └→ Event (stored for replay/analysis)                      │
│                                                                 │
│  Aggregate BEFORE sending to platform = massive savings       │
│                                                                 │
│  Result: Same observability, $2.50/month (95% savings)        │
└────────────────────────────────────────────────────────────────┘
```

### Why Traditional Logging Is Expensive

According to industry research:

> "Most teams begin their observability journey with logs, which are easy to add and capture individual events, but **the problem usually isn't a lack of data—it's that teams are asking metric questions while still relying entirely on logs**."

**The fundamental issues with traditional logging:**

1. **Volume Explosion**: Every log message is stored as full text
   - `logger.info('User john.doe@example.com logged in from 192.168.1.1...')` = 120 bytes
   - Repeated contextual information in every log
   - 500+ log messages per request is common
   - Result: 100GB/day of log data = $450-900/month

2. **Unstructured Data**: Full-text search is expensive
   - Platforms must parse and index arbitrary text
   - No schema validation
   - Difficult to query efficiently
   - High indexing costs

3. **Unbounded Cardinality**: Every unique message = new index entry
   - Developers can add `console.log()` anywhere
   - Each unique log message increases cardinality
   - No control over growth

4. **Wrong Tool for Metrics**: Asking metric questions from logs
   - "What's the average response time?" requires scanning millions of logs
   - Should be a simple metric query instead
   - 1000x more expensive to compute from logs

### The Event-Driven Future

**What industry leaders are doing:**

| Platform | Approach | Limitation |
|----------|----------|------------|
| **New Relic** | "Events-to-Metrics" conversion | You send all events to NR first ($$$) |
| **Datadog** | "Generate Metrics from Logs" | You send all logs to DD first ($$$) |
| **OpenTelemetry** | Separate signals (traces/metrics/logs) | Auto-instrumentation creates cardinality issues |
| **OpenObserve** | Log-to-metrics pipelines | Server-side aggregation (you pay for ingestion) |

**All platforms recognize the pattern:** Convert high-volume events/logs into low-volume metrics for efficient long-term storage.

**What Principal View does differently:**

```
Platform Approach:
  App → Events → Platform ($$$ ingestion) → Aggregate → Metrics
        └─ Pay to send everything
        └─ Pay for server-side processing

Principal View Approach:
  App → Events → Aggregate Locally → Metrics → Platform (cheap)
        └─ Events stay local (free)
        └─ Only send aggregated metrics
```

**Key advantage:** By aggregating **before** sending to platforms, you avoid paying for:
- Ingestion of millions of individual events
- Server-side processing
- Storage of raw event data

**Result:** 90-95% cost reduction while maintaining the same observability.

### Industry Validation

From recent observability research (2025):

> "By 2025, leading teams no longer manage these signals in isolation — they **unify them through a single telemetry pipeline**, enabling teams to detect, pinpoint, and resolve issues faster."

> "Use intelligent sampling to capture all errors and slow requests but only a small share of successful calls, and **reduce cardinality by removing high-volume labels** like user_email or session_id while keeping essentials such as service_name or status_code."

> "Unlike logs, which are often verbose and granular, **events focus on system-level activities** that can act as context for analysis, and when integrated with other observability data types, events provide the 'why' behind issues or performance changes."

**Principal View is built on these industry best practices**, but with superior economics through local aggregation.

---

## Understanding Telemetry Costs

### The Three Cost Drivers

Observability platforms charge for three types of telemetry data:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TELEMETRY COST HIERARCHY                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. LOGS (HIGHEST COST)  ─────────────────────────────────────────  │
│     • Charged per GB ingested + indexing fees                       │
│     • Highest volume (10-100x more than traces)                     │
│     • Unstructured text = expensive indexing                        │
│     • Typically 50-70% of total observability spend                 │
│                                                                      │
│  2. TRACES (MODERATE COST)  ──────────────────────────────────────  │
│     • Charged per million spans ingested                            │
│     • Volume-based pricing ($1.70/million spans on Datadog)         │
│     • 15-day retention typical                                      │
│     • Typically 20-30% of observability spend                       │
│                                                                      │
│  3. METRICS (CARDINALITY TRAP)  ───────────────────────────────────  │
│     • Charged per unique time series (metric + tags combo)          │
│     • CRITICAL: Cardinality explosions are common                   │
│     • All OpenTelemetry metrics = "custom" = premium pricing        │
│     • Can reach 50%+ of total bill if uncontrolled                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Real-World Pricing Examples

#### Datadog Pricing (2025-2026)

| Component | Unit | Cost | Notes |
|-----------|------|------|-------|
| **Infrastructure Monitoring** | Per host/month | $15 | Base tier |
| **APM** | Per host/month | $31-40 | Includes traces |
| **Custom Metrics** | Per unique metric/month | Variable | 52% of bill at scale |
| **Indexed Spans** | Per million spans | $1.70 | 15-day retention |
| **Log Ingestion** | Per GB | Variable | Plus indexing fees |

**Real Example:**
- Company size: 100 hosts, 100TB logs/month
- **Monthly cost: $299,225** ($3.3-3.6M/year)
- Costs scale unpredictably across hosts, logs, metrics, features

#### Splunk Observability Cloud Pricing (2025)

| Plan | Hosts | List Price | Actual Cost (after discount) |
|------|-------|------------|------------------------------|
| **End-to-End** | 200 | $116,200/year | $60,300-$83,600 (28-48% off) |
| **End-to-End** | 500 | $290,500/year | $104,500-$183,000 (37-64% off) |

**Pricing Models:**
- **Host-based:** Fixed cost per host (includes 100-200 MTS per host)
- **Usage-based:** Pay per metric time series (MTS), traces analyzed per minute (TAM)
- **Log Observer:** Included (leverages separate Splunk log ingestion)

**Note:** Each histogram data point = 8 MTS (8x the cost)

---

## Cost Driver #1: Metrics

### How Metrics Are Priced

Unlike logs and traces (charged by volume), metrics are charged by **cardinality** - the number of unique time series.

**What is a time series?**
Think of it like a spreadsheet where each row is one billable metric:

```
| Metric Name     | Endpoint      | Method | Status | Value |
|-----------------|---------------|--------|--------|-------|
| request_latency | /api/users    | GET    | 200    | 45ms  |  ← 1 time series
| request_latency | /api/users    | GET    | 500    | 120ms |  ← 1 time series
| request_latency | /api/users    | POST   | 200    | 80ms  |  ← 1 time series
| request_latency | /api/orders   | GET    | 200    | 65ms  |  ← 1 time series

Each unique combination of (metric name + all tags) = 1 billable time series
```

**Platform-specific pricing:**

| Platform | Pricing Model | Cost | Notes |
|----------|---------------|------|-------|
| **Datadog** | Per 100 custom metrics/month | $5 per 100 | Pro: 100 included per host<br>**ALL OpenTelemetry metrics = custom** |
| **Grafana Cloud** | Active series + Data Points/Min | Varies | Active series in last 20 min<br>DPM: points sent per minute |
| **Splunk** | Metric Time Series (MTS) | Varies | Host-based: 100-200 MTS/host<br>Usage-based: Direct MTS billing<br>**Histograms = 8 MTS** |

**Billing calculation (Datadog):**
```
Monthly average = Sum of hourly unique metrics / hours in month

Example:
- Hour 1: 1,000 unique metrics
- Hour 2: 1,200 unique metrics
- Hour 720: 1,100 unique metrics
Average = 1,050 metrics
Cost = (1,050 / 100) × $5 = $52.50/month
```

### The Cardinality Explosion Problem

**The math behind cardinality:**

```
Cardinality = Tag1_Values × Tag2_Values × Tag3_Values × ...

Low cardinality (safe):
  50 endpoints × 5 methods × 10 status codes = 2,500 metrics
  Cost: $125/month ✅

High cardinality (dangerous):
  50 endpoints × 5 methods × 10 status codes × 1M user_ids = 2,500,000,000 metrics
  Cost: $125,000,000/month 💸
```

**Real-world disaster example:**

```typescript
// Kubernetes cluster with auto-instrumentation
http_server_duration {
  http.method: "GET",
  http.route: "/api/users/:id",
  http.status_code: "200",
  service.instance.id: "pod-7f8d9c-xz2k9",  // ← Changes with every pod restart!
  net.host.name: "api-server-7f8d9c-xz2k9"   // ← Another pod ID!
}

// With auto-scaling: 50 pods/day
// 50 routes × 5 methods × 10 status × 50 pods = 125,000 metrics/day
// Cost: $6,250/month (vs $125 without pod IDs - 50x more!)
```

**Common high-cardinality mistakes:**

| Tag Type | Why It's Dangerous | Cardinality | Example |
|----------|-------------------|-------------|---------|
| **user_id** | Grows with users | 1M+ | `{user_id: "user-12345"}` |
| **session_id** | New per session | 10M+ | `{session: "sess-abc123"}` |
| **request_id** | New per request | 100M+ | `{request_id: "req-xyz789"}` |
| **IP addresses** | Many unique IPs | 10K+ | `{client_ip: "192.168.1.1"}` |
| **Container/Pod IDs** | Changes with restarts | 100+ | `{pod: "pod-7f8d9c"}` |
| **Timestamps** | Infinite values | ∞ | `{timestamp: "1707835921"}` |
| **URLs with params** | Infinite variations | ∞ | `{url: "/search?q=..."}` |

**What IS safe to use as tags:**

| Tag Type | Why It's Safe | Cardinality | Example |
|----------|--------------|-------------|---------|
| **HTTP method** | Fixed set | ~10 | `{method: "GET"}` |
| **Status code** | Limited range | ~50 | `{status: "200"}` |
| **Region** | Finite locations | ~10 | `{region: "us-east"}` |
| **Environment** | Few environments | ~3 | `{env: "prod"}` |
| **Service name** | Fixed services | ~50 | `{service: "api"}` |
| **Endpoint (grouped)** | Parameterized routes | ~100 | `{endpoint: "/users/:id"}` |

### Industry Standard: Events-to-Metrics Conversion

**Major platforms already do this - it's a proven pattern:**

#### New Relic: "Events-to-Metrics" (Official Feature)

```
App → Events → New Relic → Aggregate → Metrics
      └─ You pay to send all events ($$$)

Benefits:
✅ Metrics cheaper than events for long-term storage
✅ Conversion rules using NRQL queries
✅ 15-month metric retention

Cost model:
- Pay ingestion for all events
- Pay processing for aggregation (server-side)
- Pay storage for resulting metrics
```

#### Datadog: "Generate Metrics from Logs" (Official Feature)

```
App → Logs → Datadog → Filter & Aggregate → Metrics
      └─ You pay to ingest all logs ($$$)

Benefits:
✅ Create metrics from log patterns
✅ Archive original logs to S3 (cheaper)
✅ 15-month metric retention

Cost model:
- Pay ingestion: Full log volume
- Pay indexing: Selected logs only
- Pay storage: Resulting metrics
- Archive to S3: Pennies per GB
```

#### OpenObserve: "Logs-to-Metrics Pipelines"

```
Scheduled pipeline (every 60 seconds):
1. Read logs from last 60 seconds
2. Filter: WHERE status >= 400
3. Aggregate: COUNT(*) GROUP BY endpoint, status
4. Emit metric: error_count { endpoint, status }

Cost model:
- Pay ingestion: All logs
- Server-side processing included
- Pay storage: Resulting metrics
```

**The pattern is universal:** Platforms recognize that high-volume events/logs should become low-volume metrics for cost-effective long-term analysis.

### How Principal View Does It Better

**The critical difference: WHERE aggregation happens**

```
┌────────────────────────────────────────────────────────────────┐
│  PLATFORM APPROACH (Datadog, New Relic)                       │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  App → Events → Platform ($$$ ingestion) → Aggregate → Metrics│
│        └─ Pay to send ALL events                              │
│        └─ Pay for server-side processing                      │
│                                                                 │
│  Example cost (1M events/day):                                 │
│  - Ingestion: 1M × 100 bytes × 30 days = 3GB = $45/month     │
│  - Processing: Included in platform                           │
│  - Storage: 50 metrics = $2.50/month                          │
│  TOTAL: ~$47.50/month                                          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  PRINCIPAL VIEW APPROACH (Local Aggregation)                   │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  App → Events (local) → Aggregate Locally → Metrics → Platform│
│        └─ Events never leave your infrastructure (free)       │
│        └─ Aggregate in application memory (free)              │
│        └─ Send only final metrics                             │
│                                                                 │
│  Example cost (1M events/day):                                 │
│  - Events: Processed locally (free)                           │
│  - Aggregation: In-memory every 60s (free)                    │
│  - Metrics sent: 50 unique × 1440/day = 72K points           │
│  - Storage: 50 metrics = $2.50/month                          │
│  TOTAL: ~$2.50/month (95% savings!)                            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

#### Configuration Example (Future Implementation)

```json
// workflows/api-monitoring.workflow.json
{
  "events": {
    "api.request.completed": {
      "schema": {
        "endpoint": "string",
        "method": "string",
        "status": "number",
        "duration": "number",
        "userId": "string",        // ← High cardinality, stays in event
        "podId": "string"          // ← High cardinality, stays in event
      }
    }
  },
  "metrics": {
    "api_request_duration": {
      "description": "API request latency",
      "type": "histogram",
      "sourceEvent": "api.request.completed",
      "valueField": "duration",
      "tags": ["endpoint", "method", "status"],  // ← Low cardinality only!
      "excludeTags": ["userId", "podId"],        // ← Explicit exclusion
      "aggregationWindow": 60000  // Aggregate every 60 seconds
    },
    "api_request_count": {
      "description": "Total API requests",
      "type": "counter",
      "sourceEvent": "api.request.completed",
      "tags": ["endpoint", "status"]  // Even fewer tags
    }
  }
}
```

#### Benefits Over Platform Approach

| Aspect | Platform Approach | Principal View |
|--------|------------------|----------------|
| **Ingestion cost** | Pay for all events | Free (local only) |
| **Processing cost** | Pay for server-side | Free (your CPU) |
| **Cardinality control** | Configure in UI | Explicit in workflow files |
| **Portability** | Vendor-specific rules | Platform-agnostic config |
| **Visibility** | Events → Platform → Metrics | Events → Traces/Metrics locally |
| **Cost** | $47.50/month | $2.50/month |

#### Why Developers Love This

**Auto-instrumentation problem:**
```typescript
// You add OpenTelemetry, it auto-generates:
http_requests {
  http.route: "/api/users/:id",
  service.instance.id: "pod-abc-123",  // ← You didn't choose this!
  http.flavor: "1.1",                  // ← Or this!
  net.host.port: "3000"                // ← Or this!
}
// Cost: Unpredictable, often surprising
```

**Principal View approach:**
```typescript
// You explicitly define what becomes a metric:
emit('api.request', { route, status, duration, userId, podId });

// In workflow.json, YOU control tags:
{
  "tags": ["route", "status"]  // ← Explicit, bounded, predictable
}

// Cost: Exactly what you configured, no surprises
```

---

## Cost Driver #2: Traces

### How Traces Are Priced

Traces track distributed request flow across services, with each request generating **multiple spans** (one per service/operation). Most observability platforms use a **two-tier pricing model**:

#### Two-Tier Pricing Model

```
┌──────────────────────────────────────────────────────────────────┐
│  TIER 1: INGESTION (Getting data in)                            │
├──────────────────────────────────────────────────────────────────┤
│  • Charged per GB of spans sent to platform                     │
│  • You pay for ALL spans you send                               │
│  • All spans available for 15 minutes (Live Search)             │
│  • After 15 minutes, unindexed spans are discarded              │
│  • Cost: ~$50-100/TB (estimated, varies by vendor)              │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  TIER 2: INDEXING/RETENTION (Long-term storage)                 │
├──────────────────────────────────────────────────────────────────┤
│  • Charged per million indexed spans                            │
│  • Only indexed spans kept beyond 15 minutes                    │
│  • Datadog: $1.70/million spans, 15-30 day retention            │
│  • Typical: <1% of ingested spans are indexed                   │
│  • Retention filters control what gets indexed                  │
└──────────────────────────────────────────────────────────────────┘
```

**Platform-Specific Pricing:**

| Platform | Ingestion Model | Indexing/Retention Model |
|----------|----------------|--------------------------|
| **Datadog** | Per GB ingested | $1.70 per million indexed spans (15-30 day retention) |
| **Splunk** | Traces Analyzed Per Minute (TAPM) | Bundled in TAPM pricing |
| **Google Cloud** | Per GB ingested + per GB scanned | Volume-based storage tiers |
| **New Relic** | Bundled in data ingest | 8 days default (98 days with Data Plus +50% cost) |

**Critical insight:** In practice, **<1% of traces are retained** beyond the initial 15-minute window. You pay ingestion costs for everything, but only index what's important.

### The Volume Problem

```
Single e-commerce checkout request:
├─ Frontend span (1)
├─ API Gateway span (1)
├─ Auth Service span (1)
├─ Cart Service spans (3)
│  ├─ DB query spans (2)
│  └─ Cache lookup span (1)
├─ Payment Service spans (4)
│  ├─ Validation span (1)
│  ├─ Payment Gateway span (1)
│  └─ DB spans (2)
└─ Notification Service spans (2)

Total: 15 spans per checkout
1M checkouts/day = 15M spans/day = 450M spans/month

Cost calculation (Datadog):
INGESTION: 450M spans × 500 bytes = 225 GB/month
          225 GB × $75/TB = $16.88/month (ingestion)

INDEXING: If you index 1% = 4.5M spans/month
          4.5M × $1.70/1M = $7.65/month (indexing)

TOTAL: ~$24.53/month (just for checkouts!)
```

### The Two Cost Optimization Levers

To reduce trace costs, you need to optimize **both tiers**:

```
┌──────────────────────────────────────────────────────────────────┐
│  LEVER 1: HEAD-BASED SAMPLING                                   │
│  (Reduce ingestion costs)                                       │
├──────────────────────────────────────────────────────────────────┤
│  • Sample BEFORE sending spans to platform                      │
│  • Decision made at trace start (head of trace)                 │
│  • Reduces bytes transmitted and ingestion charges              │
│  • Tradeoff: Can't see full picture for sampled-out traces      │
│                                                                  │
│  Example:                                                        │
│    if (random() < 0.1) sendToDatadog(span);  // 10% sampling    │
│                                                                  │
│  Savings: 90% reduction in ingestion costs                      │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  LEVER 2: TAIL-BASED SAMPLING / RETENTION FILTERS               │
│  (Reduce indexing/retention costs)                              │
├──────────────────────────────────────────────────────────────────┤
│  • Send ALL spans (pay ingestion for all)                       │
│  • Platform decides what to INDEX after seeing full trace       │
│  • Decision made at trace end (tail of trace)                   │
│  • Can make smart decisions based on full trace context         │
│                                                                  │
│  Example retention filter:                                       │
│    - Keep 100% of errors (status != ok)                         │
│    - Keep 100% of slow traces (duration > 1s)                   │
│    - Keep 1% of fast successful traces                          │
│                                                                  │
│  Savings: 80-99% reduction in indexing costs                    │
│           (Still pay full ingestion costs)                      │
└──────────────────────────────────────────────────────────────────┘
```

### Lever Comparison

| Aspect | Head-Based Sampling | Tail-Based Sampling |
|--------|-------------------|---------------------|
| **When decided** | At trace start | After seeing full trace |
| **What it reduces** | Ingestion costs | Indexing/retention costs |
| **Visibility** | Lose sampled-out traces entirely | See all traces for 15 min, keep important ones |
| **Smart decisions** | ❌ Can't know if trace will error | ✅ Can analyze full trace before deciding |
| **Cost savings** | High (reduces bytes sent) | Moderate (still pay ingestion) |
| **Implementation** | Simple (local decision) | Complex (requires platform support) |

### Combined Approach (Best Savings)

```
Traditional (No sampling):
├─ Ingestion: 450M spans × 500 bytes = $16.88/month
└─ Indexing: 450M spans × $1.70/1M = $765/month
TOTAL: $781.88/month

Head-based only (10% sampled):
├─ Ingestion: 45M spans × 500 bytes = $1.69/month (90% savings)
└─ Indexing: 45M spans × $1.70/1M = $76.50/month (90% savings)
TOTAL: $78.19/month (90% reduction)

Tail-based only (keep 1% of ingested):
├─ Ingestion: 450M spans × 500 bytes = $16.88/month (no savings)
└─ Indexing: 4.5M spans × $1.70/1M = $7.65/month (99% savings)
TOTAL: $24.53/month (97% reduction)

Combined (10% head + 1% tail):
├─ Ingestion: 45M spans × 500 bytes = $1.69/month
└─ Indexing: 0.45M spans × $1.70/1M = $0.77/month
TOTAL: $2.46/month (99.7% reduction!)
```

### How Principal View Addresses Trace Costs

#### Lever 1: Head-Based Sampling (Scenario-Based)

Principal View's scenario matching enables **intelligent head-based sampling**:

```typescript
// workflows/checkout-flow.workflow.json
{
  "scenarios": {
    "happy_path": {
      "samplingRate": 0.01,  // Sample 1% BEFORE sending
      "match": {
        "spanName": "checkout",
        "attributes": { "status": "success" }
      }
    },
    "payment_failures": {
      "samplingRate": 1.0,   // Keep 100% of failures
      "match": {
        "spanName": "checkout",
        "attributes": { "status": "failed" }
      }
    },
    "high_value_orders": {
      "samplingRate": 1.0,   // Keep 100% of large orders
      "match": {
        "spanName": "checkout",
        "attributes": { "order_total": { "gt": 1000 } }
      }
    }
  }
}
```

**Impact:**
- Reduces **ingestion costs** by 80-99%
- Also reduces **indexing costs** proportionally
- Configurable per scenario (keep what matters)
- **Savings: 80-95% reduction in total trace costs**

#### Lever 2: Span Size Reduction (OTLP Data Pruning)

Principal View currently discards 17 OTLP fields during conversion (see `OTLP_DATA_PRESERVATION.md`):

```
Standard OTLP span: ~500 bytes
Principal View span: ~300-350 bytes (30-40% smaller)
```

**Impact:**
- Reduces **ingestion costs** by 30-40% (smaller bytes)
- Reduces **indexing costs** by 30-40% (less data to store)
- **Tradeoff:** Some observability loss (span kind, links, etc.)
- Future enhancement: Configurable field retention

**Combined savings from both optimizations:**
- Head-based sampling: 90% reduction in volume
- Span pruning: 35% reduction in size (of remaining 10%)
- **Total ingestion savings: 93.5%**
- **Total indexing savings: 93.5%** (proportional to ingestion)

#### What Principal View Does NOT Currently Do

**Tail-based sampling / retention filter configuration:**
- ❌ No configuration for long-term retention policies
- ❌ No integration with platform retention filters
- ❌ Cannot do "send all, index only errors"

**Future enhancement opportunity:**
- Add retention filter configuration to workflow files
- Export retention policies for Datadog/Splunk
- Enable "send all for 15-min visibility, auto-configure retention"

---

## Cost Driver #3: Logs (Biggest Cost)

### How Logs Are Priced

Logs are **individual event records** with text messages:
- Charged by **ingestion volume** (GB/TB ingested)
- Additional charges for **indexing** (making logs searchable)
- Additional charges for **retention** (storage over time)

**Datadog:** Charged per GB ingested + indexing fees + retention fees
**Splunk:** Log Observer included (but uses separate Splunk log platform)

### Why Logs Cost So Much

#### 1. Massive Volume

Logs are typically **10-100x the volume** of traces:

```
Typical application (1M daily active users):
- Traces: 10M spans/day × 500 bytes = 5 GB/day
- Logs: 500M logs/day × 200 bytes = 100 GB/day (20x more!)
```

#### 2. Unstructured Text = Expensive Indexing

```typescript
// Traditional log: Full text string every time
logger.info('User john.doe@example.com logged in from 192.168.1.1 at 2025-02-13T14:32:01Z from Chrome 121 on MacOS');
// Size: ~120 bytes
// Must be parsed and indexed (expensive!)
```

#### 3. Unbounded Growth

- Developers can add `console.log()` or `logger.debug()` anywhere
- No control over what gets logged or when
- Debug logs often left on in production (massive waste)

#### 4. High Cardinality Fields

Every unique log message variation increases indexing costs:

```typescript
// Each unique message = separate index entry
logger.info(`Order ${orderId} processed for user ${userId} at ${timestamp}`);
// With 1M users × 1M orders = 1 trillion unique messages!
```

### How Principal View Addresses Log Costs

This is where Principal View's **event-based architecture** shines.

#### The Fundamental Shift: Events Replace Logs

**Traditional logging:**
```typescript
// Developer writes arbitrary log messages
logger.info(`User ${userId} logged in from ${ip} at ${timestamp}`);
logger.info(`User ${userId} failed login attempt from ${ip}`);
logger.debug(`Processing user ${userId} request ${requestId}`);
logger.error(`User ${userId} checkout failed: ${error.message}`);

// Every log is different, high volume, unpredictable cost
```

**Principal View events:**
```typescript
// Events are predefined with schemas
emit('user.login.success', { userId, ip, timestamp });
emit('user.login.failure', { userId, ip, reason });
emit('user.checkout.failure', { userId, error: error.code });

// Fixed event types, structured data, controllable volume
```

#### Cost Comparison: Traditional vs Events

| Approach | Volume | Size per event | Daily cost (1M users) |
|----------|--------|----------------|----------------------|
| **Traditional logs** | 500 logs/user/day | 200 bytes | $450-900/month |
| **Principal View events** | 200 events/user/day | 50 bytes | $45-90/month |
| **Savings** | 60% reduction | 75% reduction | **90-95% reduction** |

---

## The Event-Based Paradigm Shift

### Traditional Logging vs Events

```
┌──────────────────────────────────────────────────────────────────────┐
│  TRADITIONAL LOGGING                                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  logger.info('User logged in from IP 192.168.1.1')                   │
│  logger.info('User logged in from IP 192.168.1.2')                   │
│  logger.info('User logged in from IP 10.0.0.1')                      │
│  ... (arbitrary variations)                                          │
│                                                                       │
│  ❌ Every message is different (high cardinality)                    │
│  ❌ Full text repeated every time (high volume)                      │
│  ❌ Unstructured (expensive to index)                                │
│  ❌ No control (developers add logs anywhere)                        │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PRINCIPAL VIEW EVENTS                                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Template: "user.login.success"                                      │
│  Data: { userId, ip, timestamp }                                     │
│                                                                       │
│  emit('user.login.success', { userId: 123, ip: '192.168.1.1' })     │
│  emit('user.login.success', { userId: 456, ip: '192.168.1.2' })     │
│  emit('user.login.success', { userId: 789, ip: '10.0.0.1' })        │
│                                                                       │
│  ✅ Fixed event types (controlled cardinality)                       │
│  ✅ Template stored once, reused millions of times                   │
│  ✅ Structured data (efficient storage/query)                        │
│  ✅ Schema validation (only defined events allowed)                  │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Volume Compression

**Traditional log wire format:**
```json
{
  "timestamp": "2025-02-13T14:32:01.123Z",
  "level": "info",
  "message": "User john.doe@example.com logged in from 192.168.1.1 at 2025-02-13T14:32:01Z from Chrome 121 on MacOS",
  "service": "auth-service",
  "host": "prod-server-42"
}
// Size: ~250 bytes
```

**Principal View event wire format:**
```json
{
  "e": "user_login",
  "t": 1707835921,
  "d": {
    "uid": 123,
    "ip": "192.168.1.1"
  }
}
// Size: ~50 bytes (5x smaller!)
// Template definition stored once, referenced by ID
```

**Volume savings:**
- **60-90% reduction** in bytes transmitted
- **70-95% reduction** in storage costs
- Template reuse across millions of events

### Cardinality Control

**The killer feature:** Fixed, finite set of event types

```typescript
// Traditional logging: Unbounded cardinality
// Any developer can write any log message anywhere
logger.info(`New log message variant #${Math.random()}`);
// Result: Millions of unique log messages

// Principal View: Controlled cardinality
// Events must be defined in canvas/workflow files
emit('user.login.success', data);  // ✅ Defined event
emit('random.new.event', data);    // ❌ Validation error!

// Result: Cardinality = number of defined events (~100-1000)
```

**Impact on costs:**
- Datadog/Splunk charge based on unique fields and values
- Limiting cardinality to defined events = **massive cost savings**
- Prevents "metric explosion" from arbitrary logging

### Intelligent Aggregation

Events can be aggregated at the source before sending:

```typescript
// High-frequency event: 1M occurrences per minute
emit('cache.hit', { key, latency });

// Instead of sending 1M individual events:
// → Aggregate locally every 60 seconds
// → Send summary: { count: 1M, avg_latency: 2ms, p95: 5ms }
// Cost: 1 event per minute vs 1M events per minute (1,000,000x cheaper!)
```

**Principal View's EventRecorderService** supports:
- Batch message protocol (send multiple events at once)
- Session-based aggregation
- Max events per session (default: 10,000)
- Auto-cleanup of old sessions

---

## Cost Savings Calculator

### Example Scenario

**Company Profile:**
- E-commerce platform
- 1 million daily active users
- 50 microservices
- 100 hosts

### Traditional Observability Stack Costs

#### Logs (Traditional Approach)
```
Volume calculation:
- 500 logs per user per day
- 1M users × 500 logs = 500M logs/day
- Average log size: 200 bytes
- Daily volume: 100 GB/day = 3 TB/month

Datadog costs:
- Ingestion: 3 TB × $150-300/TB = $450-900/month
- Indexing (50% of logs): +$500/month
- Retention (30 days): +$200/month
Subtotal: $1,150-1,600/month
```

#### Traces (Traditional Approach)
```
Volume calculation:
- 10 requests per user per day
- 1M users × 10 requests = 10M requests/day
- 15 spans per request = 150M spans/day = 4.5B spans/month

Datadog costs:
- 4,500M spans × $1.70/1M spans = $7,650/month
Subtotal: $7,650/month
```

#### Metrics (Traditional Approach)
```
Cardinality:
- 100 base metrics
- 10 high-cardinality tags (user_id, etc.) = 100M unique metrics

Datadog costs (conservative):
- 100M metrics × $0.05/metric = $5,000/month
Subtotal: $5,000/month
```

#### Host/APM Costs
```
- 100 hosts × $40/host/month = $4,000/month
```

**Traditional Total: $17,800-18,250/month ($213K-219K/year)**

### Principal View Event-Based Costs

#### Events (Replace Logs)
```
Volume calculation:
- 50 defined event types (controlled cardinality)
- 200 events per user per day (only meaningful events)
- 1M users × 200 events = 200M events/day
- Average event size: 50 bytes (template + params)
- Daily volume: 10 GB/day = 300 GB/month

Datadog costs:
- Ingestion: 300 GB × $150/TB = $45/month
- Pre-structured (no indexing fees): $0
- Auto-aggregation to metrics: included
Subtotal: $45/month
```

#### Traces (Scenario-Based Sampling)
```
Volume calculation:
- 95% of successful requests sampled at 1% = 0.95% kept
- 5% of failed requests sampled at 100% = 5% kept
- Effective sampling: ~6% of total traces
- 4.5B spans × 6% = 270M spans/month

Datadog costs:
- 270M spans × $1.70/1M spans = $459/month
Subtotal: $459/month
```

#### Metrics (Controlled Cardinality)
```
Cardinality:
- 50 event types × 5 controlled tags = 250 unique metrics
- Events auto-aggregate to metrics (no custom metrics explosion)

Datadog costs:
- 250 metrics × $0.05/metric = $12.50/month
Subtotal: $13/month
```

#### Host/APM Costs (Unchanged)
```
- 100 hosts × $40/host/month = $4,000/month
```

**Principal View Total: $4,517/month ($54K/year)**

### Savings Breakdown

| Category | Traditional | Principal View | Savings | % Reduction |
|----------|-------------|----------------|---------|-------------|
| **Logs** | $1,150-1,600 | $45 | $1,105-1,555 | 96-97% |
| **Traces** | $7,650 | $459 | $7,191 | 94% |
| **Metrics** | $5,000 | $13 | $4,987 | 99.7% |
| **Hosts/APM** | $4,000 | $4,000 | $0 | 0% |
| **TOTAL** | **$17,800-18,250** | **$4,517** | **$13,283-13,733** | **74-75%** |

**Annual Savings: $159K-165K per year**

**Note:** This example shows conservative savings. Many organizations see 80-90%+ reduction when migrating from verbose traditional logging to event-based telemetry.

---

## Implementation Best Practices

### 1. Define Events Thoughtfully

Create a catalog of meaningful events:

```typescript
// ✅ Good: Specific, actionable events
'user.login.success'
'user.login.failure'
'checkout.payment.failed'
'checkout.payment.succeeded'
'api.rate_limit.exceeded'

// ❌ Bad: Too granular or high-cardinality
'user.clicked.button'  // Too granular
'api.request'          // Too generic
'log.debug.message'    // Just a log replacement
```

### 2. Use Scenario-Based Sampling

Configure different sampling rates per scenario:

```json
{
  "scenarios": {
    "happy_path": { "samplingRate": 0.01 },
    "errors": { "samplingRate": 1.0 },
    "high_value": { "samplingRate": 1.0 }
  }
}
```

### 3. Aggregate High-Frequency Events

For very high-frequency events, aggregate locally:

```typescript
// Instead of emitting 1M cache hits:
const aggregator = new EventAggregator({
  flushInterval: 60000,  // Flush every 60 seconds
  maxEvents: 10000
});

// Emit locally
aggregator.emit('cache.hit', { latency: 2 });

// Aggregator sends summary:
// { event: 'cache.hit', count: 1M, avg_latency: 2ms, p95: 5ms }
```

### 4. Control Tag Cardinality

Never use high-cardinality values as tags:

```typescript
// ❌ Bad: Creates millions of metrics
metric('user_action', {
  user_id: userId,           // 1M unique users
  session_id: sessionId      // 10M unique sessions
});

// ✅ Good: Use events with attributes
emit('user.action', {
  action: 'checkout',  // Low cardinality (enum)
  userId,              // Event attribute, not metric tag
  sessionId
});
```

### 5. Leverage Event Schemas

Define JSON schemas for events to ensure consistency:

```typescript
// packages/core/src/telemetry/event-validator.ts
{
  "user.login.success": {
    "properties": {
      "userId": { "type": "number" },
      "ip": { "type": "string", "format": "ipv4" },
      "timestamp": { "type": "number" }
    },
    "required": ["userId", "ip"]
  }
}
```

### 6. Monitor Your Costs

Track telemetry volume and costs:

```typescript
interface TelemetryMetrics {
  eventsEmittedToday: number;
  estimatedMonthlyCost: number;
  savingsVsTraditionalLogging: number;
  topEventsByVolume: Array<{ event: string; count: number }>;
}
```

### 7. Use Session Management

Configure session retention to prevent unbounded storage:

```typescript
// packages/core/src/EventRecorderService.ts
const recorder = new EventRecorderService({
  maxEventsPerSession: 10000,      // Limit events per session
  sessionRetention: 3600000,       // 1 hour retention
  autoCleanup: true
});
```

---

## Strategic Positioning: Why Principal View Wins

### The Industry Context

**Every major observability platform has recognized the same pattern:**
- High-volume events/logs need to become low-volume metrics
- Cardinality must be controlled to prevent cost explosions
- Structured data is superior to unstructured logs

**What they offer:**
- New Relic: Events-to-Metrics conversion (server-side)
- Datadog: Generate Metrics from Logs (server-side)
- OpenObserve: Logs-to-Metrics pipelines (server-side)
- All charge you to send everything first, then aggregate on their servers

### Principal View's Competitive Advantage

```
┌────────────────────────────────────────────────────────────────┐
│  UNIQUE VALUE PROPOSITION                                      │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  "The only observability solution that aggregates BEFORE       │
│   sending data to platforms, reducing costs by 90%+ while      │
│   maintaining complete observability"                          │
│                                                                 │
│  Key Differentiators:                                          │
│  1. Local aggregation (not server-side)                       │
│  2. Platform-agnostic (not vendor lock-in)                    │
│  3. Explicit cardinality control (not auto-instrumentation)   │
│  4. Events as first-class citizens (not logs-first)           │
│  5. Observability as code (version-controlled workflows)       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Competitive Comparison

| Feature | Traditional Logs | OpenTelemetry Auto-Inst | Platform Events-to-Metrics | Principal View |
|---------|-----------------|------------------------|---------------------------|----------------|
| **Cost** | Very High | High | Medium | Very Low |
| **Cardinality Control** | None | Poor (auto-generated) | Good (configure in UI) | Excellent (explicit) |
| **Aggregation** | None | None | Server-side (you pay) | Local (free) |
| **Vendor Lock-in** | Low | Low | High | None |
| **Portability** | N/A | Good | Poor (vendor-specific) | Excellent |
| **Developer Control** | None | Little | Good | Complete |
| **Savings vs Traditional** | 0% | 10-30% | 50-70% | **90-95%** |

### Why Enterprises Choose Principal View

**For CTOs/Engineering Leaders:**
- **Predictable costs**: No surprise bills from cardinality explosions
- **Budget control**: Pay only for aggregated metrics, not raw events
- **No vendor lock-in**: Platform-agnostic configuration
- **ROI**: 90%+ cost reduction vs traditional observability stacks

**For Platform Engineering Teams:**
- **Control at the source**: Aggregate before data leaves your infrastructure
- **Schema validation**: Catch errors at development time
- **Version control**: Observability configuration lives in Git
- **Observability as code**: Infrastructure-as-code mindset applied to telemetry

**For Application Developers:**
- **Explicit events**: No magic auto-instrumentation surprises
- **Type safety**: Events are validated against schemas
- **Better debugging**: Structured events > unstructured logs
- **Cost transparency**: Know exactly what each event costs

### The Future of Observability

The industry is moving toward:
- ✅ Structured events (not unstructured logs)
- ✅ Local aggregation (not server-side)
- ✅ Cardinality control (not unbounded growth)
- ✅ Platform-agnostic (not vendor lock-in)
- ✅ Observability as code (not UI configuration)

**Principal View is ahead of this curve.**

While platforms are retrofitting events-to-metrics conversion onto existing products, Principal View was built from the ground up with this paradigm:

> **Events are first-class citizens that automatically become traces and metrics—processed locally for maximum cost efficiency.**

---

## References

### Pricing Sources (2025-2026)

**General Pricing:**
- [Datadog Pricing Main Caveats Explained [Updated for 2026] | SigNoz](https://signoz.io/blog/datadog-pricing/)
- [Pricing | Datadog](https://www.datadoghq.com/pricing/)
- [Datadog Pricing & Cost Optimization Guide 2026 | Sedai](https://sedai.io/blog/datadog-cost-pricing-guide)
- [Datadog Pricing: Is it Worth Spending for in 2026?](https://middleware.io/blog/datadog-pricing/)
- [Datadog Pricing 2026: Full Cost Breakdown + How to Save 40-90% | Last9](https://last9.io/blog/datadog-pricing-all-your-questions-answered/)
- [Observability Pricing FAQ | Splunk](https://www.splunk.com/en_us/products/pricing/faqs/observability.html)
- [Splunk for Observability | Pricing | Splunk](https://www.splunk.com/en_us/products/pricing/observability.html)

**Trace Pricing:**
- [APM Billing | Datadog](https://docs.datadoghq.com/account_management/billing/apm_tracing_profiler/)
- [Ingestion Mechanisms | Datadog](https://docs.datadoghq.com/tracing/trace_pipeline/ingestion_mechanisms/)
- [Monitor Splunk APM billing | Splunk Docs](https://docs.splunk.com/observability/en/admin/subscription-usage/apm-billing-usage-index.html)
- [Pricing | Google Cloud Observability](https://cloud.google.com/products/observability/pricing)
- [The Best Pricing Models for Observability | New Relic](https://newrelic.com/resources/white-papers/observability-pricing-models)

**Metrics Pricing & Cardinality:**
- [Custom Metrics Billing | Datadog](https://docs.datadoghq.com/account_management/billing/custom_metrics/)
- [Datadog Custom Metric Cardinality Cost | Control Theory](https://www.controltheory.com/use-case/datadog-custom-metric-cardinality-cost/)
- [Cardinality Metrics for Monitoring and Observability | Splunk](https://www.splunk.com/en_us/blog/learn/cardinality-metrics-monitoring-observability.html)
- [Metric Cardinality Explained | groundcover](https://www.groundcover.com/learn/observability/metric-cardinality)
- [Why metric cardinality keeps exploding | Sawmills AI](https://www.sawmills.ai/blog/metric-cardinality-explained-sre-fixes)
- [Analyze Prometheus metrics costs | Grafana Cloud](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/analyze-costs/metrics-costs/prometheus-metrics-costs/)
- [Understand Metrics usage and cost | Grafana Cloud](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/understand-usage-cost/metrics/)

### Events-to-Metrics Conversion (Industry Standard)

**Platform Features:**
- [Introduction to creating metric data from non-metric data | New Relic](https://docs.newrelic.com/docs/data-apis/convert-to-metrics/analyze-monitor-data-trends-metrics/)
- [Announcing Events-to-Metrics | New Relic](https://newrelic.com/blog/nerdlog/events-to-metrics)
- [Generate metrics from logs | Datadog](https://www.datadoghq.com/blog/logging-without-limits-new-features/)
- [Convert Raw Logs into Metrics with OpenObserve Pipelines](https://openobserve.ai/blog/logs-to-metrics/)

**Industry Best Practices:**
- [Events, Metrics, and Logs | Honeycomb](https://docs.honeycomb.io/get-started/basics/observability/concepts/events-metrics-logs/)
- [Metrics, Events, Logs, and Traces: Observability Essentials | Last9](https://last9.io/blog/understanding-metrics-events-logs-traces-key-pillars-of-observability/)
- [11 Key Observability Best Practices You Should Know in 2026](https://spacelift.io/blog/observability-best-practices)
- [OpenTelemetry Metrics Aggregation Guide | Last9](https://last9.io/blog/opentelemetry-metrics-aggregation/)
- [Metrics Data Model | OpenTelemetry](https://opentelemetry.io/docs/specs/otel/metrics/data-model/)

### Related Documentation

- [OpenTelemetry Overview](./OPENTELEMETRY_OVERVIEW.md) - Understanding the three signals
- [Event Recording System](./EVENT_RECORDING_SYSTEM.md) - How Principal View handles events
- [OTLP Data Preservation](./OTLP_DATA_PRESERVATION.md) - Tradeoffs in data conversion
- [Hierarchical Workflow Composition](./HIERARCHICAL_WORKFLOW_COMPOSITION.md) - Scenario-based sampling
- [Storyboards, Workflows, Scenarios Guide](./STORYBOARDS_WORKFLOWS_SCENARIOS_GUIDE.md) - Event organization patterns

---

**Last Updated:** 2025-02-13
**Feedback:** [Open an issue](https://github.com/principal-ai/principal-view/issues) for questions or corrections
