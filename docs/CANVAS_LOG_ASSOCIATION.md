# Canvas-Log Association Design

**Status:** Draft
**Author:** Research Team
**Date:** 2024-12-21
**Version:** 0.1.0

## Executive Summary

This document describes how Visual Validation canvases are associated with OpenTelemetry logs, enabling real-time visualization of log activity on architecture diagrams. It also introduces the concept of **Log Auditing** - using canvas definitions to identify orphaned, unmapped, or redundant logs in a system.

---

## Table of Contents

1. [The Mapping Problem](#the-mapping-problem)
2. [Association Strategies](#association-strategies)
   - [Resource-Based Mapping](#strategy-1-resource-based-mapping)
   - [Span-Based Mapping](#strategy-2-span-based-mapping)
   - [Explicit Annotation](#strategy-3-explicit-annotation)
3. [Canvas Scope Model](#canvas-scope-model)
4. [Node Resource Matching](#node-resource-matching)
5. [Edge Derivation from Traces](#edge-derivation-from-traces)
6. [Log Auditing](#log-auditing)
   - [Orphaned Log Detection](#orphaned-log-detection)
   - [Coverage Analysis](#coverage-analysis)
   - [Audit Reports](#audit-reports)
7. [Configuration Schema](#configuration-schema)
8. [Implementation Notes](#implementation-notes)

---

## The Mapping Problem

A canvas contains **nodes** representing architecture components. Logs arrive from various **sources**. The fundamental question is: how does a log know which node it belongs to?

```
┌─────────────────────────────────────────────────────────────────────┐
│                     THE MAPPING PROBLEM                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   CANVAS                              LOGS                           │
│   ┌─────────────────┐                 ┌─────────────────┐           │
│   │                 │                 │ {                │           │
│   │  [API Gateway]  │    ◀──???──▶    │   resource:     │           │
│   │       │         │                 │     service.name│           │
│   │  [User Service] │                 │   traceId: ...  │           │
│   │       │         │                 │   spanId: ...   │           │
│   │  [Database]     │                 │   body: "..."   │           │
│   │                 │                 │ }                │           │
│   └─────────────────┘                 └─────────────────┘           │
│                                                                      │
│   How does a log know which node it belongs to?                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

The solution leverages OpenTelemetry's **Resource** concept - metadata describing where telemetry originates.

---

## Association Strategies

### Strategy 1: Resource-Based Mapping

Canvas nodes are defined to match OpenTelemetry Resource attributes. This is the **recommended primary strategy**.

```yaml
# Canvas configuration
nodes:
  - id: 'api-gateway'
    type: 'api'
    resourceMatch:
      service.name: 'api-gateway'

  - id: 'user-db'
    type: 'database'
    resourceMatch:
      service.name: 'user-service'
      db.system: 'postgresql'
```

When a log arrives:

```yaml
# Log with resource
resource:
  service.name: 'api-gateway'
  deployment.environment: 'production'
# → Matches node "api-gateway" via service.name
```

**Advantages:**

- Uses standard OTEL attributes
- No application code changes required
- Works with any OTEL-instrumented system

**Disadvantages:**

- Requires upfront canvas configuration
- May need updates as services change

### Strategy 2: Span-Based Mapping

When visualizing distributed traces, spans create a call graph. Each span's resource identifies the node, and parent-child relationships define edges.

```
Trace abc123:
  Span 1 (service: api-gateway)       ──▶  Node: api-gateway activates
    └─ Span 2 (service: user-svc)     ──▶  Node: user-service activates
         └─ Span 3 (service: db)      ──▶  Node: database activates

Edge animation follows span hierarchy:
  api-gateway → user-service → database
```

**Mapping rules:**

- Span's `resource.service.name` → Node identification
- Span's `parentSpanId` → Edge source
- Span's `spanId` → Edge target

### Strategy 3: Explicit Annotation

Applications can include custom attributes that directly reference canvas elements:

```yaml
# In the log/span attributes
attributes:
  pv.canvas.id: 'checkout-flow' # Which canvas
  pv.node.id: 'api-gateway' # Which node
```

**Advantages:**

- Precise control
- Supports dynamic node assignment

**Disadvantages:**

- Requires application code changes
- Coupling between app and visualization

### Recommended Approach: Layered Strategy

Use strategies in combination:

1. **Primary:** Resource-based matching (automatic)
2. **Secondary:** Span-based for trace visualization
3. **Override:** Explicit annotation when needed

---

## Canvas Scope Model

A canvas **scope** defines which telemetry is relevant to that canvas. Only logs matching the scope are considered for node routing.

```yaml
canvas:
  id: 'checkout-system'
  name: 'Checkout Flow'

  scope:
    # ALL conditions must match for a log to be in scope
    deployment.environment: 'production'
    service.namespace: 'checkout'
```

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SCOPE FILTERING                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   All Logs                                                           │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ●   │   │
│   │  ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ●   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼ scope filter                          │
│                                                                      │
│   Canvas-Scoped Logs                                                 │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  ● ● ● ● ● ● ● ● ●                                          │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              ▼ node routing                          │
│                                                                      │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│   │ Node A   │  │ Node B   │  │ Node C   │  │ Orphaned │           │
│   │ ● ● ●    │  │ ● ●      │  │ ● ●      │  │ ●        │           │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Scope Matching Rules

| Operator | Description            | Example                          |
| -------- | ---------------------- | -------------------------------- |
| Exact    | Attribute equals value | `service.name: "api"`            |
| Glob     | Wildcard matching      | `service.name: "checkout-*"`     |
| Regex    | Pattern matching       | `service.name: /^checkout-.+$/`  |
| Exists   | Attribute is present   | `k8s.pod.name: { exists: true }` |

---

## Node Resource Matching

Each node defines `resourceMatch` - the criteria for routing logs to that node.

```yaml
nodes:
  - id: 'api-gateway'
    type: 'api'
    label: 'API Gateway'
    resourceMatch:
      service.name: 'checkout-api'

  - id: 'payment-service'
    type: 'service'
    label: 'Payments'
    resourceMatch:
      service.name: 'payment-*' # Glob pattern

  - id: 'orders-db'
    type: 'database'
    label: 'Orders DB'
    resourceMatch:
      db.system: 'postgresql'
      db.name: 'orders' # Multiple conditions (AND)

  - id: 'any-redis'
    type: 'cache'
    label: 'Redis Cache'
    resourceMatch:
      db.system: 'redis' # Matches any Redis instance
```

### Matching Priority

When multiple nodes could match a log, priority is determined by:

1. **Specificity:** More conditions = higher priority
2. **Exact over glob:** Exact matches beat patterns
3. **Declaration order:** Earlier nodes win ties

```yaml
# Log with: service.name: "payment-validator"

nodes:
  - id: 'payment-validator' # Priority 1: Exact match
    resourceMatch:
      service.name: 'payment-validator'

  - id: 'payment-services' # Priority 2: Glob match
    resourceMatch:
      service.name: 'payment-*'

  - id: 'all-services' # Priority 3: Matches anything
    resourceMatch:
      service.name: '*'
```

---

## Edge Derivation from Traces

Edges can be statically defined or dynamically derived from trace data.

### Static Edges

Pre-defined connections that are always displayed:

```yaml
edges:
  - id: 'api-to-payment'
    source: 'api-gateway'
    target: 'payment-service'
    type: 'calls'
```

### Dynamic Edges from Spans

When processing traces, edges are created based on span parent-child relationships:

```
Span A (api-gateway)
  └─ Span B (payment-service)
       └─ Span C (orders-db)

Derived edges:
  api-gateway ──calls──▶ payment-service
  payment-service ──calls──▶ orders-db
```

### Edge Animation

When a trace flows through the system:

```typescript
interface EdgeAnimation {
  edgeId: string;
  traceId: string;
  timestamp: number;
  duration: number;
  direction: 'forward' | 'backward';
  style: 'pulse' | 'flow' | 'highlight';
}
```

---

## Log Auditing

A powerful capability of canvas-log association is **Log Auditing** - analyzing logs against canvas definitions to identify gaps, redundancies, and issues.

### Orphaned Log Detection

**Orphaned logs** are logs that:

1. Match the canvas scope (they're relevant to this system)
2. Do NOT match any node's `resourceMatch`

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ORPHANED LOG DETECTION                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Canvas: checkout-system                                            │
│   Scope: environment=production, namespace=checkout                  │
│                                                                      │
│   Defined Nodes:                                                     │
│   ├─ api-gateway (service.name: checkout-api)                       │
│   ├─ payment-service (service.name: payment-*)                      │
│   └─ orders-db (db.system: postgresql, db.name: orders)             │
│                                                                      │
│   ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│   Incoming Logs:                                                     │
│   ✓ service.name: checkout-api          → api-gateway               │
│   ✓ service.name: payment-validator     → payment-service           │
│   ✓ db.system: postgresql, db.name: orders → orders-db              │
│   ✗ service.name: inventory-service     → ORPHANED                  │
│   ✗ service.name: notification-worker   → ORPHANED                  │
│                                                                      │
│   Orphaned logs indicate:                                            │
│   • Missing nodes in canvas definition                               │
│   • Unexpected services in the namespace                             │
│   • Misconfigured resource attributes                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Orphan Categories

| Category          | Description                       | Action                    |
| ----------------- | --------------------------------- | ------------------------- |
| **Missing Node**  | Legitimate service not in canvas  | Add node to canvas        |
| **Misconfigured** | Wrong resource attributes         | Fix instrumentation       |
| **Out of Scope**  | Service shouldn't be in namespace | Move service or fix scope |
| **Deprecated**    | Old service still emitting        | Remove or migrate service |
| **Test/Debug**    | Development artifacts             | Clean up or filter        |

### Coverage Analysis

Analyze how well a canvas covers its intended system:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     COVERAGE ANALYSIS                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Canvas: checkout-system                                            │
│   Analysis Period: Last 24 hours                                     │
│                                                                      │
│   COVERAGE SUMMARY                                                   │
│   ────────────────                                                   │
│   Total logs in scope:     45,231                                    │
│   Mapped to nodes:         42,108 (93.1%)                            │
│   Orphaned:                 3,123 (6.9%)                             │
│                                                                      │
│   NODE ACTIVITY                                                      │
│   ─────────────                                                      │
│   api-gateway          ████████████████████  18,421 logs            │
│   payment-service      ██████████            9,203 logs             │
│   orders-db            ████████              7,891 logs             │
│   notification-svc     ██████                6,593 logs             │
│   redis-cache          (no logs)             0 logs      ⚠️         │
│                                                                      │
│   ORPHAN BREAKDOWN                                                   │
│   ────────────────                                                   │
│   inventory-service    ██████                2,841 logs  → Add node? │
│   legacy-adapter       █                       282 logs  → Deprecate?│
│                                                                      │
│   WARNINGS                                                           │
│   ────────                                                           │
│   ⚠️  Node 'redis-cache' received no logs - verify instrumentation  │
│   ⚠️  3,123 orphaned logs from 2 unique sources                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Silent Nodes

Nodes that are defined but receive no logs may indicate:

- Missing instrumentation
- Misconfigured `resourceMatch`
- Service not running
- Incorrect scope

### Audit Reports

Generate actionable reports from canvas-log analysis:

```typescript
interface AuditReport {
  canvas: string;
  period: { start: Date; end: Date };

  summary: {
    totalLogs: number;
    mappedLogs: number;
    orphanedLogs: number;
    coveragePercent: number;
  };

  nodeActivity: Array<{
    nodeId: string;
    logCount: number;
    errorCount: number;
    lastSeen: Date | null;
    status: 'active' | 'silent' | 'error-heavy';
  }>;

  orphans: Array<{
    resourceSignature: Record<string, string>;
    logCount: number;
    sampleLogs: string[];
    suggestedAction: 'add-node' | 'fix-instrumentation' | 'remove' | 'investigate';
  }>;

  recommendations: Array<{
    type: 'add-node' | 'remove-node' | 'fix-match' | 'check-instrumentation';
    target: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}
```

### Audit Use Cases

1. **Onboarding New Services**

   - Deploy service to namespace
   - Run audit to see orphaned logs
   - Add corresponding node to canvas

2. **Decommissioning Services**

   - Mark node as deprecated
   - Monitor for remaining log activity
   - Remove node when logs stop

3. **Instrumentation Validation**

   - Compare expected vs actual resource attributes
   - Identify services with missing OTEL setup
   - Verify trace context propagation

4. **Architecture Discovery**
   - Start with empty canvas + broad scope
   - Run audit to discover all log sources
   - Auto-generate nodes from orphan analysis

---

## Configuration Schema

### Complete Canvas Configuration

```yaml
# .principal-views/checkout-system.yaml

metadata:
  name: 'Checkout System'
  version: '1.0.0'
  description: 'Production checkout flow visualization'

canvas:
  id: 'checkout-system'

  # Scope: which logs are relevant to this canvas
  scope:
    deployment.environment: 'production'
    service.namespace: 'checkout'

  # Audit configuration
  audit:
    enabled: true
    orphanThreshold: 100 # Alert if >100 orphaned logs
    silentNodeAlertAfter: '1h' # Alert if node silent for 1 hour
    coverageTarget: 95 # Target 95% coverage

# Node definitions
nodes:
  - id: 'web-frontend'
    type: 'frontend'
    label: 'Web App'
    resourceMatch:
      service.name: 'checkout-web'
    position: { x: 100, y: 100 }

  - id: 'api-gateway'
    type: 'api'
    label: 'API Gateway'
    resourceMatch:
      service.name: 'checkout-api'
    position: { x: 300, y: 100 }

  - id: 'payment-service'
    type: 'service'
    label: 'Payments'
    resourceMatch:
      service.name: 'payment-*'
    position: { x: 500, y: 100 }

  - id: 'orders-db'
    type: 'database'
    label: 'Orders DB'
    resourceMatch:
      db.system: 'postgresql'
      db.name: 'orders'
    position: { x: 500, y: 300 }

  - id: 'redis-cache'
    type: 'cache'
    label: 'Session Cache'
    resourceMatch:
      db.system: 'redis'
    position: { x: 300, y: 300 }

# Edge definitions
edges:
  - source: 'web-frontend'
    target: 'api-gateway'
    type: 'calls'

  - source: 'api-gateway'
    target: 'payment-service'
    type: 'calls'

  - source: 'api-gateway'
    target: 'redis-cache'
    type: 'reads'

  - source: 'payment-service'
    target: 'orders-db'
    type: 'writes'

# Node type definitions (can also be global)
nodeTypes:
  frontend:
    shape: 'rectangle'
    color: '#4CAF50'
    icon: 'monitor'

  api:
    shape: 'hexagon'
    color: '#2196F3'
    icon: 'globe'

  service:
    shape: 'rectangle'
    color: '#9C27B0'
    icon: 'box'

  database:
    shape: 'cylinder'
    color: '#FF9800'
    icon: 'database'

  cache:
    shape: 'diamond'
    color: '#00BCD4'
    icon: 'zap'
```

---

## Implementation Notes

### Log Routing Algorithm

```typescript
interface LogRouter {
  /**
   * Route a log to a canvas node
   * @returns nodeId or null if orphaned
   */
  route(log: OtelLog, canvas: Canvas): string | null;

  /**
   * Check if log is in canvas scope
   */
  isInScope(log: OtelLog, canvas: Canvas): boolean;

  /**
   * Find all matching nodes (for debugging)
   */
  findMatches(log: OtelLog, canvas: Canvas): NodeMatch[];
}

function routeLog(log: OtelLog, canvas: Canvas): RoutingResult {
  // 1. Check scope
  if (!matchesScope(log.resource, canvas.scope)) {
    return { status: 'out-of-scope' };
  }

  // 2. Find matching nodes
  const matches: NodeMatch[] = [];
  for (const node of canvas.nodes) {
    const score = calculateMatchScore(log.resource, node.resourceMatch);
    if (score > 0) {
      matches.push({ nodeId: node.id, score });
    }
  }

  // 3. Return best match or orphan
  if (matches.length === 0) {
    return {
      status: 'orphaned',
      resource: log.resource,
    };
  }

  matches.sort((a, b) => b.score - a.score);
  return {
    status: 'routed',
    nodeId: matches[0].nodeId,
  };
}
```

### Audit Collection

```typescript
interface AuditCollector {
  /**
   * Record a routed log
   */
  recordRouted(nodeId: string, log: OtelLog): void;

  /**
   * Record an orphaned log
   */
  recordOrphaned(log: OtelLog): void;

  /**
   * Generate audit report for time period
   */
  generateReport(start: Date, end: Date): AuditReport;

  /**
   * Get real-time orphan stream
   */
  orphanStream(): AsyncIterable<OrphanedLog>;
}
```

---

## References

- [OpenTelemetry Overview](./OPENTELEMETRY_OVERVIEW.md)
- [OpenTelemetry Resource Semantic Conventions](https://github.com/open-telemetry/semantic-conventions/blob/main/docs/resource/README.md)
- [Sentry Integration Design](./SENTRY_INTEGRATION_DESIGN.md)
