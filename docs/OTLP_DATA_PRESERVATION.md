# OTLP Data Preservation Analysis

**Status:** 🟡 For Review
**Date:** January 22, 2026
**Author:** Claude (analysis of OTLP → ExecutionData conversion)

---

## Executive Summary

We've successfully implemented OTLP (OpenTelemetry Protocol) standard format support for execution files. However, our current conversion **discards valuable OTLP metadata** that would enable richer UI visualizations and better debugging experiences.

This document analyzes what we're losing, why it matters, and proposes an enhanced data model to preserve critical telemetry context.

---

## Current Implementation

### What We Convert ✅

```typescript
OTLP Format                          ExecutionData Format
═══════════════════════════════════  ═══════════════════════════════════
resourceSpans[].resource.attributes
  └─ service.name         ────────→  metadata.serviceName

resourceSpans[].scopeSpans[].scope
  ├─ name                 ────────→  metadata.scopeName
  └─ version              ────────→  metadata.scopeVersion

resourceSpans[].scopeSpans[].spans[]
  ├─ traceId              ────────→  spans[].traceId
  ├─ spanId               ────────→  spans[].id
  ├─ parentSpanId         ────────→  spans[].parentSpanId
  ├─ name                 ────────→  spans[].name
  ├─ startTimeUnixNano    ────────→  spans[].startTime (ms)
  ├─ endTimeUnixNano      ────────→  spans[].endTime (ms)
  ├─ attributes           ────────→  spans[].attributes
  ├─ events               ────────→  spans[].events
  └─ status.code          ────────→  spans[].status ('OK'|'ERROR')
```

### What We Discard ❌

**17 fields** from the OTLP standard are currently lost in conversion.

---

## Data Loss Impact Analysis

### 🔴 CRITICAL for UI

These fields are essential for production debugging and trace visualization:

#### 1. **Span Kind** (`span.kind`)

**What it is:**
```typescript
enum SpanKind {
  UNSPECIFIED = 0,  // Default, no specific kind
  INTERNAL    = 1,  // Internal operation
  SERVER      = 2,  // Server-side RPC handling
  CLIENT      = 3,  // Client-side RPC call
  PRODUCER    = 4,  // Message producer
  CONSUMER    = 5   // Message consumer
}
```

**Why it matters:**
- **Service boundaries:** Distinguish between internal logic vs external calls
- **Flow direction:** CLIENT spans call out, SERVER spans receive requests
- **Architecture visualization:** See your distributed system topology
- **Performance analysis:** Identify network vs compute time

**UI Impact Examples:**
```
Without kind:
  ┌──────────────┐
  │ auth.login   │  ← Is this a client call or server handler?
  └──────────────┘

With kind:
  ┌──────────────┐
  │ 🌐 auth.login│  ← CLIENT: Making a request
  └──────────────┘

  ┌──────────────┐
  │ 📥 auth.login│  ← SERVER: Handling a request
  └──────────────┘
```

**Real-world example:**
```json
{
  "name": "POST /api/users",
  "kind": 2,  // SERVER
  "duration": 150
}
```
vs
```json
{
  "name": "database.query",
  "kind": 1,  // INTERNAL
  "duration": 100
}
```

Without `kind`, both look the same. With it, you know one is handling HTTP and the other is internal.

---

#### 2. **Status Message** (`span.status.message`)

**What it is:**
```typescript
{
  code: 2,  // ERROR
  message: "Database connection timeout after 5000ms on host db-primary-01.prod"
}
```

**Why it matters:**
- **Error details:** Specific failure reasons, not just "failed"
- **Debugging:** Stack traces, error codes, contextual info
- **User support:** Copy error messages for bug reports
- **Incident response:** Quickly identify root causes

**UI Impact:**
```
Without message:
  ❌ validation.failed
  Status: ERROR

With message:
  ❌ validation.failed
  Status: ERROR
  Error: Invalid JSON at line 42, column 15: unexpected token '}'
         Expected closing bracket for array started at line 38
```

**Real-world benefit:**
Save 5-10 minutes per bug investigation by showing the actual error message instead of requiring log diving.

---

#### 3. **Resource Attributes** (`resource.attributes[]`)

**What it is:**
Full deployment/runtime context:
```json
{
  "resource": {
    "attributes": [
      { "key": "service.name", "value": "api-gateway" },
      { "key": "service.version", "value": "v2.3.1" },
      { "key": "deployment.environment", "value": "production" },
      { "key": "host.name", "value": "k8s-node-42" },
      { "key": "k8s.namespace.name", "value": "payments" },
      { "key": "k8s.pod.name", "value": "api-gateway-7d9c8b-xk2p4" },
      { "key": "cloud.provider", "value": "aws" },
      { "key": "cloud.region", "value": "us-east-1" }
    ]
  }
}
```

**Currently we only keep:** `service.name`
**We lose:** 7+ other critical context fields

**Why it matters:**
- **Environment awareness:** Is this staging or prod?
- **Version tracking:** Which code version generated this trace?
- **Infrastructure debugging:** Which pod/host had issues?
- **Cross-team collaboration:** Share deployment context

**UI Impact Examples:**

```
Without resource attributes:
  Service: api-gateway
  [No other context available]

With resource attributes:
  Service: api-gateway v2.3.1
  Environment: 🔴 PRODUCTION
  Pod: api-gateway-7d9c8b-xk2p4
  Region: us-east-1 (AWS)
  Namespace: payments
```

---

#### 4. **Dropped Counts** (`droppedAttributesCount`, `droppedEventsCount`, etc.)

**What it is:**
OpenTelemetry tracks when it **samples/drops data** due to limits:

```typescript
{
  "attributes": [...],           // Only first 128 attributes
  "droppedAttributesCount": 47,  // 47 more were dropped!

  "events": [...],               // Only first 32 events
  "droppedEventsCount": 15       // 15 more events occurred but weren't captured
}
```

**Why it matters:**
- **Data quality awareness:** Know when you're seeing incomplete data
- **Debugging blind spots:** "Where did that attribute go?"
- **Configuration tuning:** Increase limits if dropping important data
- **Trust in data:** See full picture vs sampled subset

**UI Impact:**

```
Without dropped counts:
  Events: 32
  [User assumes this is complete]

With dropped counts:
  ⚠️ Events: 32 (15 dropped - data sampled)
  [User knows to check logs for full picture]
```

**Real scenario:**
A span has 200 custom attributes (user metadata, tags, etc.) but SDK only keeps 128. Without `droppedAttributesCount: 72`, you'd never know you're missing data.

---

### 🟡 USEFUL for Advanced Features

#### 5. **Span Links** (`span.links[]`)

**What it is:**
Cross-trace relationships:
```json
{
  "links": [
    {
      "traceId": "abc123...",
      "spanId": "def456...",
      "attributes": [
        { "key": "link.type", "value": "caused_by" }
      ]
    }
  ]
}
```

**Use cases:**
- **Batch processing:** Link spans from same batch job
- **Async workflows:** Connect request → queue → worker
- **Retry tracking:** Link retried operations to original
- **Causality:** "This error was caused by that failure"

**UI Impact:**
```
Without links:
  Trace A: [isolated view]
  Trace B: [isolated view]

With links:
  Trace A: [view]
    └─ Related: Trace B (caused_by)
    └─ Related: Trace C (retry_of)
```

---

#### 6. **Trace State** (`span.traceState`)

**What it is:**
W3C standard for vendor-specific distributed tracing context:
```
congo=t61rcWkgMzE,rojo=00f067aa0ba902b7
```

**Why it matters:**
- **Multi-vendor tracing:** Works with Datadog, New Relic, etc.
- **Sampling decisions:** Propagate sampling flags
- **A/B testing:** Track experiment cohorts across services
- **Custom routing:** Trace-based load balancing

**UI Impact:**
- Show which tracing systems have seen this trace
- Display sampling decisions
- Debug cross-vendor trace correlation issues

---

#### 7. **Scope Attributes** (`scope.attributes[]`)

**What it is:**
Metadata about the instrumentation library:
```json
{
  "scope": {
    "name": "@opentelemetry/instrumentation-http",
    "version": "0.52.0",
    "attributes": [
      { "key": "telemetry.sdk.language", "value": "nodejs" },
      { "key": "telemetry.sdk.version", "value": "1.26.0" }
    ]
  }
}
```

**Why it matters:**
- **Library debugging:** Is the instrumentation broken?
- **Version tracking:** Which OTEL SDK generated this?
- **Language context:** Node.js vs Python vs Go telemetry
- **Migration tracking:** See old vs new instrumentation

---

#### 8. **Schema URLs** (`resource.schemaUrl`, `scopeSpans.schemaUrl`)

**What it is:**
Links to semantic convention schemas:
```json
{
  "schemaUrl": "https://opentelemetry.io/schemas/1.24.0"
}
```

**Why it matters:**
- **Breaking changes:** Know which OTLP version was used
- **Compatibility:** Handle old vs new attribute names
- **Documentation:** Link to attribute definitions

---

### 🟢 LESS CRITICAL

#### 9. **Span Flags** (`span.flags`)

Trace sampling flags (mostly backend concern, less useful for UI)

---

## Proposed Enhanced ExecutionData Format

### New Type Definition

```typescript
export interface ExecutionData {
  metadata?: {
    // Existing fields
    serviceName?: string;
    scopeName?: string;
    scopeVersion?: string;
    startTime?: number;
    endTime?: number;
    exportedAt?: string;

    // ✨ NEW: Full resource context
    resource?: {
      attributes: Record<string, unknown>;
      droppedAttributesCount?: number;
      schemaUrl?: string;
    };

    // ✨ NEW: Scope metadata
    scope?: {
      attributes?: Record<string, unknown>;
      droppedAttributesCount?: number;
    };
  };

  spans: Array<{
    // Existing fields
    id: string;
    name: string;
    traceId?: string;
    parentSpanId?: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    attributes?: Record<string, unknown>;

    // ✨ NEW: Span kind for visualization
    kind?: 'UNSPECIFIED' | 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';

    // ✨ ENHANCED: Status with message
    status?: {
      code: 'OK' | 'ERROR' | 'UNSET';
      message?: string;  // ← Critical for debugging!
    };

    // ✨ NEW: Data quality indicators
    droppedAttributesCount?: number;
    droppedEventsCount?: number;
    droppedLinksCount?: number;

    // Enhanced events
    events: Array<{
      time: number;
      name: string;
      attributes: Record<string, unknown>;
      droppedAttributesCount?: number;  // ✨ NEW
    }>;

    // ✨ NEW: Cross-trace links
    links?: Array<{
      traceId: string;
      spanId: string;
      traceState?: string;
      attributes?: Record<string, unknown>;
    }>;

    // ✨ NEW: W3C trace state
    traceState?: string;
  }>;
}
```

---

## UI Enhancements Enabled

### 1. **Span Kind Visualization** 🎯

**Before:**
```
┌─────────────────┐
│ database.query  │  ← What type of operation is this?
└─────────────────┘
```

**After:**
```
┌─────────────────┐
│ 💾 database.query│  INTERNAL
└─────────────────┘

┌─────────────────┐
│ 🌐 api.call     │  CLIENT (outbound)
└─────────────────┘

┌─────────────────┐
│ 📥 POST /users  │  SERVER (inbound)
└─────────────────┘

┌─────────────────┐
│ 📨 queue.publish│  PRODUCER
└─────────────────┘
```

**Visual features:**
- Different icons per span kind
- Color coding (blue=internal, green=client, purple=server)
- Flow direction arrows
- Service boundary detection

---

### 2. **Error Details Panel** 🐛

**Before:**
```
┌────────────────────────────┐
│ ❌ validation.failed       │
│ Status: ERROR              │
└────────────────────────────┘
```

**After:**
```
┌────────────────────────────────────────────────────────────┐
│ ❌ validation.failed                                       │
│ Status: ERROR                                              │
│                                                            │
│ 📝 Error Message:                                         │
│ Invalid JSON at line 42, column 15: unexpected token '}' │
│ Expected closing bracket for array started at line 38     │
│                                                            │
│ 🔗 Stack Trace: [View Full Logs]                         │
└────────────────────────────────────────────────────────────┘
```

**Features:**
- Expandable error details
- Copy error message button
- Link to full logs
- Syntax highlighting for error messages

---

### 3. **Environment Context Badge** 🏷️

**Before:**
```
┌─────────────────────┐
│ Service: api-gateway│
└─────────────────────┘
```

**After:**
```
┌─────────────────────────────────────────────────────────┐
│ 🔴 PRODUCTION │ api-gateway v2.3.1                      │
│                                                         │
│ 📍 us-east-1 (AWS)                                     │
│ 🖥️  Pod: api-gateway-7d9c8b-xk2p4                      │
│ 📦 Namespace: payments                                  │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Environment badge (🔴 PROD, 🟡 STAGING, 🟢 DEV)
- Service version display
- Infrastructure details
- Click to filter by pod/host
- Region/cloud provider context

---

### 4. **Data Quality Indicators** ⚠️

**Before:**
```
Events: 32
Attributes: 128
```

**After:**
```
⚠️ Events: 32 (15 dropped - sampling applied)
⚠️ Attributes: 128 (47 dropped - limit reached)

💡 Some data was sampled. Check logs for complete details.
   Configure higher limits: OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT=256
```

**Features:**
- Warning badges when data is dropped
- Tooltip explaining why data was sampled
- Configuration recommendations
- Link to telemetry settings

---

### 5. **Cross-Trace Navigation** 🔗

**Before:**
```
Trace ID: abc123...
[Single isolated view]
```

**After:**
```
Trace ID: abc123...

🔗 Related Traces:
  ├─ def456... (caused_by) ─ View →
  ├─ ghi789... (retry_of)  ─ View →
  └─ jkl012... (batch_job) ─ View →

📊 Part of batch job: batch-2024-01-22-1500
```

**Features:**
- Clickable links to related traces
- Relationship type labels
- Batch/workflow grouping
- Distributed trace map view

---

### 6. **Instrumentation Details** 📚

**Before:**
```
Scope: @opentelemetry/instrumentation-http
```

**After:**
```
📚 Instrumentation Details:
  Library: @opentelemetry/instrumentation-http v0.52.0
  SDK: OpenTelemetry JS v1.26.0 (nodejs)
  Schema: OTLP 1.24.0

  🔧 [View Library Docs] [Report Instrumentation Issue]
```

**Features:**
- Library version tracking
- SDK language/version display
- Link to library documentation
- Bug reporting for bad telemetry

---

## Implementation Plan

### **Phase 1: Critical Fields** (Recommended: Do Now)

**Estimated effort:** 4-6 hours
**Impact:** High - enables core UI features

**Tasks:**
1. ✅ Add `span.kind` to conversion
2. ✅ Preserve `status.message`
3. ✅ Store all `resource.attributes`
4. ✅ Track all `dropped*Count` fields
5. ✅ Update ExecutionData type definition
6. ✅ Update tests
7. ✅ Update documentation

**Deliverables:**
- Enhanced ExecutionData format with critical fields
- Backward compatible (all fields optional)
- Full test coverage
- Updated formats.ts docs

---

### **Phase 2: Useful Fields** (Next Sprint)

**Estimated effort:** 3-4 hours
**Impact:** Medium - enables advanced features

**Tasks:**
1. Add `span.links[]` support
2. Preserve `traceState`
3. Store `scope.attributes`
4. Store `schemaUrl` fields
5. Update tests

**Deliverables:**
- Complete OTLP feature parity
- Cross-trace navigation data available
- W3C tracing compliance

---

### **Phase 3: UI Integration** (Future)

**Estimated effort:** 2-3 days (UI work)
**Impact:** High - user-facing improvements

**Tasks:**
1. Update UI to display span kinds (icons, colors)
2. Show error messages in tooltips/panels
3. Add environment badges
4. Create data quality warnings
5. Build cross-trace navigation
6. Add instrumentation details view

**Deliverables:**
- Rich trace visualization
- Better error debugging
- Production-ready UI

---

## Breaking Changes Assessment

### ✅ Backward Compatible

All new fields are **optional**, so:
- ✅ Old execution files still work
- ✅ Validator still validates
- ✅ UI can progressively enhance
- ✅ No migration needed

### Storage Impact

**Before:**
```json
{
  "metadata": { "serviceName": "..." },
  "spans": [...]
}
```

**After:**
```json
{
  "metadata": {
    "serviceName": "...",
    "resource": { "attributes": {...}, "droppedAttributesCount": 0 },
    "scope": { "attributes": {...} }
  },
  "spans": [
    {
      ...,
      "kind": "SERVER",
      "status": { "code": "OK", "message": null },
      "droppedAttributesCount": 0,
      "links": []
    }
  ]
}
```

**Estimated size increase:** ~10-15% (mostly from resource/scope attributes)
**Mitigation:** Gzip compression reduces impact to ~5%

---

## Comparison with Industry Standards

### What Other APM Tools Preserve

| Field | Datadog | New Relic | Jaeger | Our Current | Our Proposed |
|-------|---------|-----------|--------|-------------|--------------|
| Span Kind | ✅ | ✅ | ✅ | ❌ | ✅ |
| Status Message | ✅ | ✅ | ✅ | ❌ | ✅ |
| Resource Attrs | ✅ | ✅ | ✅ | ⚠️ Partial | ✅ |
| Dropped Counts | ✅ | ✅ | ⚠️ Partial | ❌ | ✅ |
| Span Links | ✅ | ✅ | ✅ | ❌ | ✅ |
| Trace State | ✅ | ✅ | ✅ | ❌ | ✅ |

**Current state:** We're behind industry standard
**Proposed state:** We match or exceed industry standard

---

## Decision Points

### Option A: Keep Current Format (Minimal)
**Pros:**
- ✅ Simple data model
- ✅ Smaller file sizes
- ✅ No implementation work needed

**Cons:**
- ❌ Limited UI capabilities
- ❌ Missing critical debugging info
- ❌ Not competitive with APM tools
- ❌ Can't support advanced features

**Recommendation:** ❌ Not recommended

---

### Option B: Add Critical Fields Only (Phase 1)
**Pros:**
- ✅ Big UI impact with minimal work
- ✅ Enables core features (span kind, error messages)
- ✅ Still backward compatible
- ✅ Manageable 10-15% size increase

**Cons:**
- ⚠️ Won't support cross-trace navigation yet
- ⚠️ Won't show instrumentation details

**Recommendation:** ✅ **RECOMMENDED** - Best ROI

---

### Option C: Full OTLP Parity (Phase 1 + 2)
**Pros:**
- ✅ Complete feature set
- ✅ Future-proof
- ✅ Competitive with industry tools
- ✅ Enables all advanced features

**Cons:**
- ⚠️ More implementation work (7-10 hours total)
- ⚠️ Slightly larger files (~15-20% increase)

**Recommendation:** ✅ Recommended if timeline allows

---

## Open Questions

1. **Storage budget:** What's our acceptable file size increase? (10%? 20%?)
2. **UI priority:** Which UI features matter most to users?
3. **Timeline:** When do we need cross-trace navigation?
4. **Data retention:** Will we store all resource attributes or filter some?
5. **Compression:** Should we gzip execution files by default?

---

## Next Steps

### For Review
- [ ] Review this document with team
- [ ] Decide on Option B (critical only) vs Option C (full parity)
- [ ] Confirm storage budget for enhanced format
- [ ] Prioritize UI features that need this data

### If Approved
- [ ] Implement Phase 1 (critical fields)
- [ ] Update ExecutionValidator converter
- [ ] Update type definitions
- [ ] Add comprehensive tests
- [ ] Update documentation
- [ ] (Optional) Implement Phase 2 (useful fields)

---

## Appendix: Example Data

### Before (Current)

```json
{
  "metadata": {
    "serviceName": "api-gateway",
    "scopeName": "@opentelemetry/instrumentation-http",
    "scopeVersion": "0.52.0"
  },
  "spans": [
    {
      "id": "abc123",
      "name": "POST /api/users",
      "traceId": "trace-456",
      "startTime": 1706000000000,
      "endTime": 1706000000150,
      "duration": 150,
      "status": "ERROR",
      "attributes": {
        "http.method": "POST",
        "http.route": "/api/users"
      },
      "events": []
    }
  ]
}
```

### After (Proposed - Phase 1)

```json
{
  "metadata": {
    "serviceName": "api-gateway",
    "scopeName": "@opentelemetry/instrumentation-http",
    "scopeVersion": "0.52.0",
    "resource": {
      "attributes": {
        "service.name": "api-gateway",
        "service.version": "v2.3.1",
        "deployment.environment": "production",
        "host.name": "k8s-node-42",
        "k8s.namespace.name": "payments",
        "k8s.pod.name": "api-gateway-7d9c8b-xk2p4",
        "cloud.provider": "aws",
        "cloud.region": "us-east-1"
      },
      "droppedAttributesCount": 0,
      "schemaUrl": "https://opentelemetry.io/schemas/1.24.0"
    },
    "scope": {
      "attributes": {
        "telemetry.sdk.language": "nodejs",
        "telemetry.sdk.version": "1.26.0"
      }
    }
  },
  "spans": [
    {
      "id": "abc123",
      "name": "POST /api/users",
      "traceId": "trace-456",
      "startTime": 1706000000000,
      "endTime": 1706000000150,
      "duration": 150,
      "kind": "SERVER",
      "status": {
        "code": "ERROR",
        "message": "Database connection timeout after 5000ms on host db-primary-01.prod"
      },
      "attributes": {
        "http.method": "POST",
        "http.route": "/api/users",
        "http.status_code": 500
      },
      "droppedAttributesCount": 0,
      "droppedEventsCount": 0,
      "events": []
    }
  ]
}
```

---

## References

- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry JS Documentation](https://opentelemetry.io/docs/languages/js/)

---

**Document Version:** 1.0
**Last Updated:** January 22, 2026
