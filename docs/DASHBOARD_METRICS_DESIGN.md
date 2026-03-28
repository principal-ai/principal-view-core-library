# Dashboard & Metrics Design: Bridging Implementation and Observability

This document outlines the design for associating workflows with production metrics, enabling bidirectional understanding between implementation and dashboards.

---

## Concrete Use Case: Mobile vs Desktop View Percentage

**Question**: "What percentage of users see the mobile view vs the non-mobile view?"

### The Current State (web-ade)

The web-ade codebase already has:

1. **Mobile detection** in components (`window.innerWidth < 768`)
2. **OTEL instrumentation** with `isMobile` attribute in events
3. **Separate workflows** for mobile and desktop interactions

```
.principal-views/activity-feed/
├── feed-load/
│   └── feed-load.workflow.json          # Has "isMobile" in init event
├── mobile-interaction/
│   └── mobile-interaction.workflow.json  # Mobile-specific flows
└── desktop-interaction/
    └── desktop-interaction.workflow.json # Desktop-specific flows
```

**Existing event** (from `feed-load.workflow.json`):
```json
{
  "name": "activity-feed.init.started",
  "attributes": {
    "isMobile": { "type": "boolean", "required": true }
  }
}
```

### The Problem

The data exists, but there's no way to:
1. Define "I want a metric called `mobile_view_percentage`"
2. Document that this metric comes from the `activity-feed.init.started` event
3. Validate that the `isMobile` attribute exists and is boolean
4. Show this metric on a dashboard linked back to the implementation

### The Solution with Dashboard Files

**Step 1: Create the dashboard definition**

```
.principal-views/
├── activity-feed/
│   └── ...existing workflows...
└── dashboards/
    └── activity-feed-analytics.dashboard.json
```

**`activity-feed-analytics.dashboard.json`**:
```json
{
  "$schema": "https://principal.ai/schemas/dashboard.v1.json",
  "id": "activity-feed-analytics",
  "name": "Activity Feed Analytics",
  "description": "User engagement metrics for the activity feed",
  "owner": "web-ade-team",

  "externalLinks": {
    "grafana": "https://grafana.internal/d/activity-feed"
  },

  "metrics": [
    {
      "id": "mobile-view-percentage",
      "name": "Mobile View Percentage",
      "description": "Percentage of activity feed loads on mobile devices",
      "type": "gauge",
      "unit": "percent",

      "sources": [{
        "storyboard": "activity-feed",
        "workflow": "feed-load",
        "nodes": ["init-started"],
        "event": "activity-feed.init.started"
      }],

      "query": {
        "derivation": "percentage",
        "filter": "isMobile = true",
        "over": "count(*)",
        "window": "1h"
      }
    },
    {
      "id": "feed-loads-by-viewport",
      "name": "Feed Loads by Viewport",
      "description": "Count of feed loads grouped by mobile/desktop",
      "type": "counter",
      "unit": "count",

      "sources": [{
        "storyboard": "activity-feed",
        "workflow": "feed-load",
        "nodes": ["init-started"],
        "event": "activity-feed.init.started"
      }],

      "query": {
        "derivation": "count",
        "groupBy": ["isMobile"],
        "window": "1h"
      }
    },
    {
      "id": "mobile-interaction-rate",
      "name": "Mobile Interaction Rate",
      "description": "Average interactions per mobile session",
      "type": "gauge",
      "unit": "interactions/session",

      "sources": [{
        "storyboard": "activity-feed",
        "workflow": "mobile-interaction",
        "nodes": ["card-swipe", "commit-browse"]
      }],

      "query": {
        "derivation": "rate",
        "window": "1h"
      }
    }
  ],

  "layout": {
    "rows": [
      {
        "title": "Viewport Distribution",
        "panels": ["mobile-view-percentage", "feed-loads-by-viewport"]
      },
      {
        "title": "Mobile Engagement",
        "panels": ["mobile-interaction-rate"]
      }
    ]
  }
}
```

**Step 2: Update workflow to declare dashboard association**

In `feed-load.workflow.json`, add:
```json
{
  "observability": {
    "dashboards": ["activity-feed-analytics"],
    "monitored": true
  }
}
```

### What Validation Enables

With this structure, we can validate:

| Check | Result |
|-------|--------|
| Does `isMobile` attribute exist? | ✓ Defined in `activity-feed.init.started` event |
| Is `isMobile` a boolean? | ✓ `"type": "boolean"` in schema |
| Is `= true` valid for boolean? | ✓ Equality check on boolean is valid |
| Does the workflow reference this dashboard? | Check `observability.dashboards` |

### What This Answers

**For the engineer asking "what % see mobile?":**
1. Look at `activity-feed-analytics.dashboard.json`
2. Find `mobile-view-percentage` metric
3. See it comes from `activity-feed.init.started` event with `isMobile` attribute
4. Understand exactly what's being measured

**For the engineer changing the mobile detection logic:**
1. See that `feed-load` workflow has `observability.dashboards: ["activity-feed-analytics"]`
2. Know that changes here affect dashboard metrics
3. Validation warns if `isMobile` attribute is removed/renamed

**For automated validation:**
```
✓ dashboard/valid-workflow-refs: "activity-feed/feed-load" exists
✓ metric/filter-attributes-exist: "isMobile" exists in init-started event
✓ metric/filter-type-compatibility: "= true" valid for boolean
✓ cross/bidirectional-refs: workflow declares this dashboard
```

---

## Concrete Use Case: Daily Home Page Views

**Question**: "How many users viewed the home page each day?"

### The Event

`activity-feed.init.started` fires on every home page load. This is our page view event.

### Dashboard Definition

```json
{
  "metrics": [
    {
      "id": "daily-home-page-views",
      "name": "Daily Home Page Views",
      "description": "Total home page views per day",
      "type": "counter",
      "unit": "views",

      "sources": [{
        "storyboard": "activity-feed",
        "workflow": "feed-load",
        "event": "activity-feed.init.started"
      }],

      "query": {
        "derivation": "count",
        "timeGroup": "day"
      }
    },
    {
      "id": "daily-home-page-views-by-viewport",
      "name": "Daily Home Page Views by Viewport",
      "description": "Home page views per day, split by mobile/desktop",
      "type": "counter",
      "unit": "views",

      "sources": [{
        "storyboard": "activity-feed",
        "workflow": "feed-load",
        "event": "activity-feed.init.started"
      }],

      "query": {
        "derivation": "count",
        "groupBy": ["isMobile"],
        "timeGroup": "day"
      }
    }
  ]
}
```

### Time Grouping Options

| `timeGroup` | Description | Example Output |
|-------------|-------------|----------------|
| `minute` | Per-minute counts | `2024-03-27 14:32: 47 views` |
| `hour` | Per-hour counts | `2024-03-27 14:00: 1,247 views` |
| `day` | Per-day counts | `2024-03-27: 28,493 views` |
| `week` | Per-week counts | `2024-W13: 184,291 views` |
| `month` | Per-month counts | `2024-03: 752,847 views` |

### What This Produces

```
Daily Home Page Views
─────────────────────
2024-03-25: 28,493
2024-03-26: 31,247  ▲ +9.6%
2024-03-27: 29,102  ▼ -6.8%

Daily Home Page Views by Viewport
──────────────────────────────────
           Mobile    Desktop
2024-03-25: 9,847    18,646
2024-03-26: 11,023   20,224
2024-03-27: 10,156   18,946
```

### Adding More Dimensions

Want to know views by hour of day to see peak times?

```json
{
  "id": "hourly-pattern",
  "query": {
    "derivation": "count",
    "timeGroup": "hour",
    "groupBy": ["isMobile"]
  }
}
```

Want to see views by referrer or user type? Add attributes to the event:

```json
// In the canvas event schema
{
  "name": "activity-feed.init.started",
  "attributes": {
    "isMobile": { "type": "boolean" },
    "referrer": { "type": "string" },
    "user.authenticated": { "type": "boolean" },
    "user.tier": { "type": "string", "values": ["free", "pro", "enterprise"] }
  }
}
```

Then query:
```json
{
  "id": "daily-views-by-tier",
  "query": {
    "derivation": "count",
    "groupBy": ["user.tier"],
    "timeGroup": "day"
  }
}
```

### Validation

```
✓ daily-home-page-views
  ├── Source: activity-feed/feed-load → activity-feed.init.started
  ├── Derivation "count": valid (no special requirements)
  └── TimeGroup "day": valid

✓ daily-home-page-views-by-viewport
  ├── Source: activity-feed/feed-load → activity-feed.init.started
  ├── Attribute "isMobile": found (boolean)
  └── TimeGroup "day": valid
```

---

## Architectural Decision: Prescriptive Dashboard Files

The dashboard file is **prescriptive**, not just descriptive. It is the source of truth that:

1. **Defines** what metrics should exist
2. **Generates** OTEL Collector aggregation rules
3. **Validates** that the underlying event schema supports the metric
4. **Documents** where the metric comes from

### How It Works

```
┌─ Dashboard Definition ────────────────────────────────────────────────┐
│                                                                        │
│  {                                                                     │
│    "id": "daily-home-page-views",                                     │
│    "query": {                                                         │
│      "derivation": "count",                                           │
│      "groupBy": ["isMobile"],                                         │
│      "timeGroup": "day"                                               │
│    },                                                                 │
│    "sources": [{                                                      │
│      "event": "activity-feed.init.started"                            │
│    }]                                                                 │
│  }                                                                    │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
        │
        │ 1. Validate against canvas schema
        ▼
┌─ Validation ──────────────────────────────────────────────────────────┐
│                                                                        │
│  ✓ Event "activity-feed.init.started" exists in canvas                │
│  ✓ Attribute "isMobile" exists (type: boolean)                        │
│  ✓ Derivation "count" is valid                                        │
│  ✓ TimeGroup "day" is valid                                           │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
        │
        │ 2. Generate collector config
        ▼
┌─ Generated OTEL Collector Config ─────────────────────────────────────┐
│                                                                        │
│  processors:                                                          │
│    metrics/daily-home-page-views:                                     │
│      type: spanmetrics                                                │
│      match:                                                           │
│        event_name: "activity-feed.init.started"                       │
│      dimensions:                                                      │
│        - isMobile                                                     │
│      aggregation:                                                     │
│        type: count                                                    │
│        time_bucket: 1d                                                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
        │
        │ 3. Collector creates metric
        ▼
┌─ Metrics Store ───────────────────────────────────────────────────────┐
│                                                                        │
│  daily_home_page_views{isMobile="true", day="2024-03-27"} = 10,156   │
│  daily_home_page_views{isMobile="false", day="2024-03-27"} = 18,946  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
        │
        │ 4. Dashboard reads metric
        ▼
┌─ Dashboard UI ────────────────────────────────────────────────────────┐
│                                                                        │
│  Daily Home Page Views                                                │
│  ─────────────────────                                                │
│             Mobile     Desktop                                        │
│  2024-03-27: 10,156    18,946                                        │
│                                                                        │
│  [View source: activity-feed/feed-load → init-started]               │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Why Prescriptive?

| Approach | Dashboard File | Aggregation Rules | Problem |
|----------|---------------|-------------------|---------|
| **Descriptive** | Documents existing metrics | Defined elsewhere | Can drift out of sync |
| **Prescriptive** | Defines desired metrics | Generated from dashboard | Single source of truth |

With prescriptive dashboards:
- **No drift**: Collector config is generated, not manually maintained
- **Validation**: Can't define a metric that the schema doesn't support
- **Traceability**: Metric → Dashboard → Workflow → Canvas → Code
- **Automation**: CI can regenerate collector config on dashboard changes

### Tooling Pipeline

```bash
# Validate dashboards against canvas schemas
principal dashboard validate

# Generate OTEL Collector config from dashboards
principal dashboard generate-collector-config > otel-collector.yaml

# Deploy collector with generated config
docker-compose up -d otel-collector
```

---

## Problem Statement

Today, there is a disconnect between:

1. **Implementation** - Code that emits spans, events, and logs (documented in workflows)
2. **Metrics** - Aggregated measurements shown on dashboards
3. **Dashboards** - Visualizations used for monitoring and alerting

When an engineer sees `checkout_error_rate = 2.3%` on a dashboard, they cannot easily answer:
- What code paths contribute to this metric?
- Which workflow steps affect this number?
- When it spikes, where should I look?

**Goal**: Create a file format that documents the relationship between workflows and metrics, enabling validation and discovery in both directions.

---

## Use Cases

### UC1: Determine if a Workflow Contributes to a Dashboard

> "Is my checkout workflow being monitored? Which dashboards would show problems with it?"

**Current state**: Unknown without tribal knowledge
**Desired state**: Query workflow → get list of associated dashboards and metrics

### UC2: Understand What a Metric Measures

> "What does `payment_latency_p99` actually measure? What code paths contribute to it?"

**Current state**: Check runbooks, grep codebase, ask someone
**Desired state**: Click metric → see workflow nodes that contribute to it

### UC3: Validate Metric Coverage

> "Do all critical workflow paths have associated metrics and alerts?"

**Current state**: Manual review
**Desired state**: Automated validation rule that checks coverage

### UC4: Detect Dashboard Drift

> "A workflow node was renamed/removed. Are any dashboards now broken?"

**Current state**: Discover when dashboard shows no data
**Desired state**: Validation catches broken references before deployment

### UC5: Onboarding and Documentation

> "I'm new to this service. How is it monitored?"

**Current state**: Read scattered docs, explore Grafana
**Desired state**: Browse workflows → see associated metrics with descriptions

### UC6: Explicit Opt-Out

> "This workflow is internal/experimental and intentionally not monitored"

**Current state**: Implicit - absence of metrics
**Desired state**: Explicit declaration that workflow has no dashboard association

---

## File Format Design

### Current Structure (for reference)

```
.principal-views/
├── library.yaml                                    # Component library
├── *.canvas / *.otel.canvas                        # Standalone canvases
├── <storyboard>/                                   # Storyboard folder
│   ├── <storyboard>.otel.canvas                   # Canvas for storyboard
│   └── <workflow>/                                # Workflow folder
│       ├── <workflow>.workflow.json               # Workflow definition
│       └── <execution>.otel.json                  # Execution traces
```

### Option A: Dashboard as Sibling to Workflow

Dashboard lives alongside workflow in the storyboard folder.

```
.principal-views/
├── library.yaml
├── checkout/                                       # Storyboard
│   ├── checkout.otel.canvas                       # Canvas
│   ├── checkout-flow/                             # Workflow folder
│   │   ├── checkout-flow.workflow.json
│   │   └── trace-001.otel.json
│   └── checkout-health.dashboard.json             # Dashboard for this storyboard
```

**Pros**:
- Dashboard is co-located with the workflows it monitors
- Clear ownership (one dashboard per storyboard)
- Easy to find related files

**Cons**:
- Limits one dashboard per storyboard
- Cross-storyboard dashboards need different approach

### Option B: Dashboard References Multiple Storyboards

Dashboard at top level, references workflows across storyboards.

```
.principal-views/
├── library.yaml
├── checkout/
│   ├── checkout.otel.canvas
│   └── checkout-flow/
│       └── checkout-flow.workflow.json
├── payments/
│   ├── payments.otel.canvas
│   └── payment-processing/
│       └── payment-processing.workflow.json
└── dashboards/                                     # Dashboard folder at top level
    ├── checkout-health.dashboard.json             # References checkout/*
    └── payments-overview.dashboard.json           # References checkout/* AND payments/*
```

**Pros**:
- Dashboards can aggregate across storyboards
- Matches real-world dashboards (often cross-cutting)
- Clear separation of concerns

**Cons**:
- More indirection
- Dashboard ownership less obvious

### Option C: Workflow Declares Dashboard Association

Workflows declare which dashboards they contribute to (reverse reference).

```
.principal-views/
├── checkout/
│   └── checkout-flow/
│       └── checkout-flow.workflow.json            # Contains: "dashboards": ["checkout-health"]
└── dashboards/
    └── checkout-health.dashboard.json             # Metrics reference workflow nodes
```

**Pros**:
- Bidirectional: workflow knows its dashboards, dashboard knows its sources
- Self-documenting workflows
- Validation can check consistency

**Cons**:
- References in two places (must stay in sync)
- More complex schema

### Recommended: Option B + C Combined

Use top-level `dashboards/` folder with bidirectional references:

```
.principal-views/
├── library.yaml
├── checkout/
│   └── checkout-flow/
│       └── checkout-flow.workflow.json    # "observability.dashboards": ["checkout-health"]
├── payments/
│   └── payment-processing/
│       └── payment-processing.workflow.json
└── dashboards/
    └── checkout-health.dashboard.json     # "sources": [{ storyboard, workflow, nodes }]
```

**Why this approach**:
1. Dashboards at top-level allows cross-storyboard aggregation (real-world pattern)
2. Workflows declare their dashboard associations (self-documenting)
3. Validation can verify bidirectional consistency
4. Clear answer to "is this workflow monitored?" (check `observability.monitored`)
5. Clear answer to "what feeds this metric?" (check `sources`)

---

## Proposed Schema: Dashboard File

```json
{
  "$schema": "https://principal.ai/schemas/dashboard.v1.json",
  "id": "checkout-health",
  "name": "Checkout Health Dashboard",
  "description": "Key metrics for monitoring the checkout flow",
  "owner": "payments-team",

  "externalLinks": {
    "grafana": "https://grafana.internal/d/checkout-health",
    "datadog": "https://app.datadoghq.com/dashboard/abc123"
  },

  "metrics": [
    {
      "id": "checkout-error-rate",
      "name": "Checkout Error Rate",
      "description": "Percentage of checkout attempts that fail at any step",
      "type": "gauge",
      "unit": "percent",

      "sources": [
        {
          "storyboard": "checkout",
          "workflow": "checkout-flow",
          "nodes": ["process-payment", "validate-inventory"],
          "derivation": "error_rate",
          "filter": "status.code = ERROR"
        }
      ],

      "thresholds": {
        "warning": 2.0,
        "critical": 5.0
      },

      "alerts": [
        {
          "name": "checkout-errors-critical",
          "condition": "value > 5.0 for 5m",
          "severity": "critical",
          "runbook": "https://wiki/runbooks/checkout-errors"
        }
      ]
    },
    {
      "id": "payment-latency-p99",
      "name": "Payment Latency (p99)",
      "description": "99th percentile time to process a payment",
      "type": "histogram",
      "unit": "milliseconds",
      "percentile": 99,

      "sources": [
        {
          "storyboard": "checkout",
          "workflow": "checkout-flow",
          "nodes": ["process-payment"],
          "derivation": "duration"
        }
      ]
    },
    {
      "id": "github-api-calls-rate",
      "name": "GitHub API Call Rate",
      "description": "Rate of GitHub API calls from checkout service",
      "type": "counter",
      "unit": "calls/minute",

      "sources": [
        {
          "storyboard": "checkout",
          "workflow": "checkout-flow",
          "nodes": ["fetch-repo-config", "validate-permissions"],
          "derivation": "rate"
        }
      ]
    }
  ],

  "layout": {
    "rows": [
      {
        "title": "Error Rates",
        "panels": ["checkout-error-rate"]
      },
      {
        "title": "Latency",
        "panels": ["payment-latency-p99"]
      },
      {
        "title": "Dependencies",
        "panels": ["github-api-calls-rate"]
      }
    ]
  }
}
```

---

## Proposed Schema: Workflow Metadata Extension

Extend existing `.workflow.json` to declare dashboard association:

```json
{
  "version": "1.0.0",
  "canvas": ".principal-views/checkout/checkout.otel.canvas",
  "name": "Checkout Flow",
  "description": "Customer checkout process",
  "spanPattern": "checkout.*",

  "observability": {
    "dashboards": ["checkout-health", "payments-overview"],
    "monitored": true
  },

  "scenarios": [
    {
      "id": "successful-checkout",
      "nodes": {
        "process-payment": {
          "metrics": {
            "contributes_to": ["checkout-error-rate", "payment-latency-p99"]
          }
        }
      }
    }
  ]
}
```

### Explicit Non-Monitoring

```json
{
  "version": "1.0.0",
  "name": "Debug Workflow",
  "description": "Internal debugging workflow",

  "observability": {
    "monitored": false,
    "reason": "Internal debugging workflow, not customer-facing"
  }
}
```

---

## Metric Types and Derivations

| Type | Description | Derivations |
|------|-------------|-------------|
| `counter` | Cumulative count | `count`, `rate` (per time unit) |
| `gauge` | Point-in-time value | `value`, `error_rate`, `success_rate` |
| `histogram` | Distribution | `duration`, `p50`, `p95`, `p99`, `max`, `avg` |

### Derivation Rules

| Derivation | Source | Calculation |
|------------|--------|-------------|
| `count` | Spans matching node | Count of spans |
| `rate` | Spans matching node | Count per time window |
| `duration` | Span duration | Histogram of `endTime - startTime` |
| `error_rate` | Span status | `count(ERROR) / count(*)` |
| `p99` | Span duration | 99th percentile from histogram |

---

## Metric Query Validation

### The Problem

A dashboard metric might query:

```json
{
  "id": "payment-by-method",
  "derivation": "count",
  "groupBy": ["payment.method"],
  "filter": "payment.amount > 100"
}
```

But if the underlying spans don't have `payment.method` or `payment.amount` attributes, this metric silently fails or returns nothing.

### Solution: Schema-Aware Validation

Canvas nodes already define expected span attributes. We validate that metric queries only reference attributes that exist in the schema.

```
┌─ Canvas Node Definition ─────────────────────────────────────────┐
│                                                                   │
│  id: "process-payment"                                           │
│  otel:                                                           │
│    span:                                                         │
│      name: "payment.process"                                     │
│      attributes:                                                 │
│        - name: "payment.method"                                  │
│          type: "string"                                          │
│          values: ["card", "bank", "wallet"]                      │
│        - name: "payment.amount"                                  │
│          type: "number"                                          │
│        - name: "payment.currency"                                │
│          type: "string"                                          │
│      status: { required: true }                                  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼ validates against
┌─ Metric Query ───────────────────────────────────────────────────┐
│                                                                   │
│  derivation: "count"                                             │
│  groupBy: ["payment.method"]        ✓ exists in schema           │
│  filter: "payment.amount > 100"     ✓ exists, type=number        │
│  filter: "customer.tier = 'gold'"   ✗ NOT IN SCHEMA              │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### What Can Be Validated

| Query Element | Validation | Example |
|---------------|------------|---------|
| `derivation: "duration"` | Node must have span with startTime/endTime | ✓ All spans have this |
| `derivation: "error_rate"` | Node must define `status` in schema | Check `otel.span.status` |
| `derivation: "count"` | Node must exist | Basic ref check |
| `groupBy: ["attr"]` | Attribute must be in node's attribute schema | Check `otel.span.attributes` |
| `filter: "attr = value"` | Attribute must exist, value must match type | Type check |
| `filter: "attr > 100"` | Attribute must be numeric type | `type: "number"` |
| `percentile: 99` | Derivation must be histogram-compatible | `derivation: "duration"` |

### Derivation Requirements

Each derivation type has implicit requirements:

```typescript
const DERIVATION_REQUIREMENTS: Record<Derivation, DerivationReq> = {
  count: {
    requires: [],  // Just needs spans to exist
  },
  rate: {
    requires: [],  // count over time
  },
  duration: {
    requires: ['span.startTime', 'span.endTime'],  // Always present
    produces: 'histogram',
  },
  error_rate: {
    requires: ['span.status'],
    schemaCheck: (node) => node.otel?.span?.status !== undefined,
  },
  success_rate: {
    requires: ['span.status'],
    schemaCheck: (node) => node.otel?.span?.status !== undefined,
  },
  p50: { requires: ['duration'], dependsOn: 'duration' },
  p95: { requires: ['duration'], dependsOn: 'duration' },
  p99: { requires: ['duration'], dependsOn: 'duration' },

  // Custom attribute-based
  sum: {
    requires: ['attribute'],
    schemaCheck: (node, attr) => hasNumericAttribute(node, attr),
  },
  avg: {
    requires: ['attribute'],
    schemaCheck: (node, attr) => hasNumericAttribute(node, attr),
  },
};
```

### Filter Expression Validation

Filters need parsing and type checking:

```typescript
interface FilterValidation {
  // Parse "payment.amount > 100 AND payment.method = 'card'"
  parse(filter: string): FilterAST;

  // Validate against node schema
  validate(ast: FilterAST, nodeSchema: NodeSchema): ValidationResult;
}

// Example validation result
{
  valid: false,
  errors: [
    {
      attribute: "customer.tier",
      error: "attribute_not_found",
      message: "Attribute 'customer.tier' not defined in node 'process-payment' schema",
      suggestion: "Available attributes: payment.method, payment.amount, payment.currency"
    },
    {
      attribute: "payment.method",
      operator: ">",
      error: "invalid_operator",
      message: "Operator '>' not valid for string attribute 'payment.method'",
      suggestion: "Use '=' or 'in' for string comparisons"
    }
  ]
}
```

### Extended Metric Schema with Query Definition

```json
{
  "id": "high-value-payments-by-method",
  "name": "High-Value Payments by Method",
  "type": "counter",

  "sources": [{
    "storyboard": "checkout",
    "workflow": "checkout-flow",
    "nodes": ["process-payment"]
  }],

  "query": {
    "derivation": "count",
    "filter": "payment.amount > 1000",
    "groupBy": ["payment.method", "payment.currency"],
    "window": "1h"
  },

  "validation": {
    "requiredAttributes": ["payment.amount", "payment.method", "payment.currency"],
    "attributeTypes": {
      "payment.amount": "number",
      "payment.method": "string",
      "payment.currency": "string"
    }
  }
}
```

The `validation` block can be auto-generated from the query, or explicitly declared for documentation.

---

## Validation Rules

### Dashboard Validation

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `dashboard/valid-workflow-refs` | All workflow references must resolve | error |
| `dashboard/valid-node-refs` | All node references must exist in workflow | error |
| `dashboard/metric-has-sources` | Every metric must have at least one source | error |
| `dashboard/unique-metric-ids` | Metric IDs must be unique within dashboard | error |

### Metric Query Validation

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `metric/valid-derivation` | Derivation type must be supported | error |
| `metric/derivation-requirements` | Node must satisfy derivation requirements (e.g., status for error_rate) | error |
| `metric/filter-attributes-exist` | All attributes in filter must exist in node schema | error |
| `metric/filter-type-compatibility` | Filter operators must match attribute types | error |
| `metric/groupby-attributes-exist` | All groupBy attributes must exist in node schema | error |
| `metric/percentile-requires-histogram` | Percentile metrics require histogram-compatible derivation | error |

### Workflow Validation

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `workflow/dashboard-coverage` | Critical workflows should have dashboard association | warning |
| `workflow/explicit-monitoring-status` | Workflows should declare `monitored: true/false` | info |
| `workflow/orphan-metrics` | Nodes claiming metric contribution should be referenced by a dashboard | warning |

### Cross-File Validation

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `cross/bidirectional-refs` | If dashboard refs workflow, workflow should ref dashboard | info |
| `cross/metric-id-consistency` | Metric IDs in workflow nodes should match dashboard metric IDs | error |

---

## Queries Enabled

With this structure, we can answer:

```typescript
// UC1: What dashboards monitor this workflow?
function getDashboardsForWorkflow(workflowId: string): Dashboard[]

// UC2: What workflow nodes contribute to this metric?
function getSourcesForMetric(dashboardId: string, metricId: string): WorkflowNodeRef[]

// UC3: Which workflows lack dashboard coverage?
function getUnmonitoredWorkflows(): Workflow[]

// UC4: Which dashboards have broken references?
function validateDashboardReferences(): ValidationResult[]

// UC5: Get full observability context for a workflow
function getObservabilityContext(workflowId: string): {
  dashboards: Dashboard[];
  metrics: MetricDefinition[];
  alerts: AlertDefinition[];
}
```

---

## Open Questions

1. **How to handle metrics not derived from workflows?**
   - Infrastructure metrics (CPU, memory)
   - External service metrics
   - Option: Allow `sources` to be empty with `external: true` flag
   - These would be descriptive-only (can't generate aggregation rules)

2. **Should we support importing from Grafana/Datadog JSON?**
   - Could parse existing dashboards and reverse-engineer our format
   - Helps with adoption for teams with existing dashboards
   - Would need mapping from their query syntax to our schema

3. **How to handle dashboard composition across services?**
   - One dashboard might aggregate metrics from multiple services/repos
   - Cross-repo workflow references?
   - Option: Remote references with URL/package syntax

4. **Collector config generation format?**
   - OTEL Collector YAML
   - Prometheus recording rules
   - Datadog metric aggregation
   - Should we support multiple backends?

---

## Implementation Considerations

### Collector Config Generation

The prescriptive model requires generating collector configurations. Supported targets:

```typescript
interface CollectorTarget {
  type: 'otel-collector' | 'prometheus' | 'datadog';
  outputPath: string;
}

// Generate for OTEL Collector
principal dashboard generate --target otel-collector --output otel-config.yaml

// Generate Prometheus recording rules
principal dashboard generate --target prometheus --output recording-rules.yaml
```

### Event vs Span Metrics

Metrics can be derived from:

| Source | Derivations Available | Example |
|--------|----------------------|---------|
| **Events** | count, rate | `activity-feed.init.started` → page views |
| **Spans** | count, rate, duration, error_rate, percentiles | `payment.process` → latency histogram |

The schema should indicate which:

```json
{
  "sources": [{
    "type": "event",           // or "span"
    "storyboard": "activity-feed",
    "workflow": "feed-load",
    "name": "activity-feed.init.started"
  }]
}
```

### Metric Naming Convention

Generated metrics follow a naming convention:

```
{dashboard_id}_{metric_id}_{derivation}

Examples:
  activity_feed_analytics_daily_home_page_views_count
  activity_feed_analytics_mobile_view_percentage_gauge
  checkout_health_payment_latency_p99_histogram
```

Or use the metric ID directly with labels:

```
principal_metric{
  dashboard="activity-feed-analytics",
  metric="daily-home-page-views",
  isMobile="true",
  day="2024-03-27"
} = 10156
```

### CI/CD Integration

```yaml
# .github/workflows/dashboards.yml
name: Dashboard Validation

on:
  push:
    paths:
      - '.principal-views/dashboards/**'
      - '.principal-views/**/**.otel.canvas'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate dashboards
        run: principal dashboard validate

      - name: Generate collector config
        run: principal dashboard generate --target otel-collector

      - name: Diff collector config
        run: git diff --exit-code otel-collector.yaml
```

### Schema Evolution

When canvas event schemas change:

1. **Adding attributes**: Safe, doesn't break existing metrics
2. **Removing attributes**: Validation fails for metrics using that attribute
3. **Renaming attributes**: Validation fails, must update metric queries
4. **Changing types**: Validation fails if query incompatible (e.g., `> 100` on string)

```
$ principal dashboard validate

✗ daily-views-by-tier
  └── Attribute "user.tier" not found in event schema
      Previously existed in canvas v1.2.0, removed in v1.3.0

  Suggestion: Update metric query or restore attribute
```

---

## Next Steps

- [ ] Finalize dashboard JSON schema based on feedback
- [ ] Implement TypeScript types in `packages/core`
  - [ ] `DashboardDefinition`, `MetricDefinition`, `MetricQuery`
  - [ ] `CollectorConfig` output types
- [ ] Add validation rules to rules engine
  - [ ] `metric/filter-attributes-exist`
  - [ ] `metric/derivation-requirements`
  - [ ] `cross/bidirectional-refs`
- [ ] Create CLI commands in `packages/cli`
  - [ ] `principal dashboard validate`
  - [ ] `principal dashboard generate --target <otel-collector|prometheus>`
  - [ ] `principal dashboard list`
- [ ] Build collector config generators
  - [ ] OTEL Collector YAML generator
  - [ ] Prometheus recording rules generator (stretch)
- [ ] Build visualization in react package
  - [ ] Dashboard preview component
  - [ ] Metric → workflow source linking UI

---

## Related Documents

- [RULES_ENGINE_DESIGN.md](./RULES_ENGINE_DESIGN.md) - Validation rule framework
- [WORKFLOW_VALIDATION.md](./WORKFLOW_VALIDATION.md) - Workflow validation patterns
- [OPENTELEMETRY_OVERVIEW.md](./OPENTELEMETRY_OVERVIEW.md) - OTEL concepts in this library
