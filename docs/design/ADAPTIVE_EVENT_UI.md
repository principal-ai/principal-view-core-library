# Adaptive Event UI: Intelligent Visualization for Workflow Events

This document outlines a design for integrating AI-driven UI generation into Principal View's workflow event rendering system, enabling context-aware, data-adaptive visualizations within workflow scenarios.

**Key Principle**: The agent acts as an intelligent presentation layer—it understands the telemetry data and selects the best way to communicate what's happening, using a guardrailed component library you maintain.

---

## Overview

### The Problem

Currently, workflow events are rendered through template-based narratives:

```
Event: payment.authorized
Payload: { amount: 149.99, card: "****4242", risk_score: 0.87, retries: 3 }

Template Output: "Payment of $149.99 authorized on card ending 4242"
```

This approach is:
- **Static**: Same template regardless of what's interesting in the data
- **Text-only**: No visual cues for anomalies, patterns, or relationships
- **One-size-fits-all**: A routine event looks the same as a critical one

### The Solution

Introduce an AI agent that:
1. Examines the actual event payload data
2. Identifies what's notable (anomalies, patterns, edge cases)
3. Selects and composes UI components from a maintained library
4. Renders rich, contextually appropriate visualizations

```
Same Event, Adaptive Output:

Low-risk payment:              High-risk payment:
┌───────────────┐              ┌────────────────────┐
│ ✓ $149.99     │              │ ⚠️  RISK: HIGH     │
│   ****4242    │              │ [████████████░░]   │
└───────────────┘              │ $149.99 · ****4242 │
                               │ Retries: ●●●○○     │
                               │ [Review Required]  │
                               └────────────────────┘
```

---

## Architecture

### System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Adaptive Event UI                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │ Event Data   │───►│ AI Agent     │───►│ Component Selection  │   │
│  │              │    │              │    │                      │   │
│  │ - payload    │    │ Analyzes:    │    │ From your library:   │   │
│  │ - type       │    │ - Anomalies  │    │ - RiskGauge          │   │
│  │ - context    │    │ - Patterns   │    │ - TimelineBar        │   │
│  │ - history    │    │ - Severity   │    │ - AlertCard          │   │
│  └──────────────┘    └──────────────┘    └──────────────────────┘   │
│                                                     │                │
│                                                     ▼                │
│                                          ┌──────────────────────┐   │
│                                          │ Rendered UI          │   │
│                                          │                      │   │
│                                          │ Guardrailed output   │   │
│                                          │ using only defined   │   │
│                                          │ components           │   │
│                                          └──────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Integration with Existing System

```
Workflow Scenario Render
│
├── Template narrative (existing)
│   "User initiated checkout for 3 items..."
│
├── Event: cart.validated ──────────► [Adaptive UI: Cart Summary Widget]
│
├── Template continues...
│   "Payment processing began..."
│
├── Event: payment.authorized ─────► [Adaptive UI: Payment + Risk Widget]
│
├── Event: fraud.checked ──────────► [Adaptive UI: Fraud Analysis Widget]
│
└── Event: order.confirmed ────────► [Adaptive UI: Confirmation Widget]
```

The adaptive UI augments—not replaces—the existing template system.

---

## Component Library Design

### Catalog Structure

You maintain a library of safe, pre-defined UI components. The AI can only select from these—no arbitrary HTML or hallucinated components.

```typescript
interface EventUIComponent {
  // Identity
  id: string;
  name: string;
  description: string;

  // Matching rules - which events can use this component
  applicableTo: EventMatcher[];

  // Props schema - what data this component accepts
  props: PropDefinition[];

  // Rendering
  render: (props: Record<string, unknown>) => ReactNode;
}

interface EventMatcher {
  // Match by event type pattern
  eventType?: string | RegExp;  // e.g., "payment.*" or /^fraud\./

  // Match by payload conditions
  payloadConditions?: PayloadCondition[];
}

interface PayloadCondition {
  path: string;           // JSONPath to value
  operator: ConditionOp;  // $gt, $lt, $exists, $in, etc.
  value?: unknown;
}
```

### Example Component Definitions

```typescript
const eventUILibrary: EventUIComponent[] = [
  {
    id: 'risk-gauge',
    name: 'Risk Gauge',
    description: 'Visual gauge showing risk score with threshold indicators',
    applicableTo: [
      { eventType: /^(payment|fraud|auth)\./ },
      { payloadConditions: [{ path: '$.risk_score', operator: '$exists' }] }
    ],
    props: [
      { name: 'score', type: 'number', required: true, path: '$.risk_score' },
      { name: 'threshold', type: 'number', default: 0.7 },
      { name: 'label', type: 'string', default: 'Risk Score' }
    ],
    render: ({ score, threshold, label }) => <RiskGauge ... />
  },

  {
    id: 'retry-timeline',
    name: 'Retry Timeline',
    description: 'Shows retry attempts with timing',
    applicableTo: [
      { payloadConditions: [{ path: '$.retry_count', operator: '$gt', value: 0 }] },
      { payloadConditions: [{ path: '$.attempts', operator: '$exists' }] }
    ],
    props: [
      { name: 'attempts', type: 'number', required: true },
      { name: 'maxAttempts', type: 'number', default: 5 },
      { name: 'delays', type: 'array', path: '$.retry_delays' }
    ],
    render: ({ attempts, maxAttempts, delays }) => <RetryTimeline ... />
  },

  {
    id: 'alert-card',
    name: 'Alert Card',
    description: 'Highlighted card for warnings and errors',
    applicableTo: [
      { eventType: /\.(error|warning|failed|timeout)$/ },
      { payloadConditions: [{ path: '$.severity', operator: '$in', value: ['error', 'critical'] }] }
    ],
    props: [
      { name: 'severity', type: 'enum', values: ['info', 'warning', 'error', 'critical'] },
      { name: 'title', type: 'string', required: true },
      { name: 'message', type: 'string' },
      { name: 'expandable', type: 'boolean', default: true }
    ],
    render: ({ severity, title, message, expandable }) => <AlertCard ... />
  },

  {
    id: 'diff-viewer',
    name: 'Diff Viewer',
    description: 'Shows before/after state changes',
    applicableTo: [
      { eventType: /^state\./ },
      { payloadConditions: [
        { path: '$.before', operator: '$exists' },
        { path: '$.after', operator: '$exists' }
      ]}
    ],
    props: [
      { name: 'before', type: 'object', required: true },
      { name: 'after', type: 'object', required: true },
      { name: 'highlightChanges', type: 'boolean', default: true }
    ],
    render: ({ before, after, highlightChanges }) => <DiffViewer ... />
  },

  {
    id: 'metric-sparkline',
    name: 'Metric Sparkline',
    description: 'Compact time-series visualization',
    applicableTo: [
      { payloadConditions: [{ path: '$.duration_ms', operator: '$exists' }] },
      { payloadConditions: [{ path: '$.latency', operator: '$exists' }] }
    ],
    props: [
      { name: 'value', type: 'number', required: true },
      { name: 'history', type: 'array', description: 'Historical values for context' },
      { name: 'unit', type: 'string', default: 'ms' },
      { name: 'thresholds', type: 'object', description: '{ warning: number, critical: number }' }
    ],
    render: ({ value, history, unit, thresholds }) => <MetricSparkline ... />
  }
];
```

---

## AI Agent Behavior

### Decision Process

The agent follows a structured decision process for each event:

```
1. ANALYZE the event payload
   - What data fields are present?
   - Are any values anomalous? (outside normal ranges)
   - What's the severity/importance?

2. MATCH applicable components
   - Filter library by eventType patterns
   - Filter by payloadCondition matches
   - Rank by specificity and relevance

3. SELECT components to use
   - Primary component (most relevant)
   - Supporting components (additional context)
   - Consider composition and layout

4. COMPOSE the output
   - Map payload data to component props
   - Arrange components coherently
   - Generate json-render compatible output

5. RENDER via json-render
   - Streaming/progressive display
   - Guardrailed to catalog schema
```

### Example Agent Reasoning

```
Event: payment.authorized
Payload: {
  amount: 2499.99,
  card_last4: "4242",
  risk_score: 0.87,
  retry_count: 3,
  latency_ms: 12340,
  fraud_signals: ["velocity", "new_device"]
}

Agent Analysis:
├── risk_score: 0.87 is HIGH (threshold: 0.7) → Use RiskGauge
├── retry_count: 3 indicates issues → Use RetryTimeline
├── latency_ms: 12340 is slow → Use MetricSparkline with warning
├── fraud_signals present → Include in AlertCard
└── amount: 2499.99 is notable → Highlight in display

Selected Components:
1. AlertCard (primary) - severity: warning, title: "High-Risk Payment"
2. RiskGauge (embedded) - score: 0.87
3. RetryTimeline (embedded) - attempts: 3
4. MetricSparkline (supporting) - value: 12340, unit: "ms"

Composition:
┌─────────────────────────────────────────┐
│ ⚠️  HIGH-RISK PAYMENT                   │
│                                         │
│  $2,499.99 · ****4242                   │
│                                         │
│  Risk Score          Latency            │
│  [████████░░] 87%    12.3s ▲ slow       │
│                                         │
│  Retries: ●●●○○      Signals:           │
│                      velocity, new_device│
│                                         │
│  [Expand Details]                       │
└─────────────────────────────────────────┘
```

---

## Interactivity

### User-Driven Adjustments

Users can request different views of the same data:

```
User: "Show this as a timeline instead"
→ Agent recomposes using TimelineBar as primary

User: "Expand the fraud analysis"
→ Agent adds detailed FraudSignalBreakdown component

User: "Compare this to the previous payment"
→ Agent adds DiffViewer showing delta between events

User: "Just show me the summary"
→ Agent collapses to minimal StatusBadge + amount
```

### Drill-Down Capability

Components can support expansion for detailed investigation:

```
Collapsed (default):
┌─────────────────┐
│ ⚠️ Risk: 0.87   │
└─────────────────┘
        │
        ▼ (user clicks)

Expanded:
┌─────────────────────────────────────────┐
│ ⚠️ Risk Analysis                        │
│                                         │
│ Score Breakdown:                        │
│ ├── Velocity check: +0.30               │
│ ├── New device:     +0.25               │
│ ├── Amount tier:    +0.20               │
│ └── Time of day:    +0.12               │
│                                         │
│ Historical Context:                     │
│ [Sparkline of last 10 transactions]     │
│                                         │
│ Similar Cases: 3 flagged this week      │
└─────────────────────────────────────────┘
```

---

## Integration with json-render

### Catalog Generation

Your `EventUIComponent[]` library maps directly to a json-render catalog:

```typescript
function toJsonRenderCatalog(library: EventUIComponent[]): JsonRenderCatalog {
  return {
    components: library.map(component => ({
      name: component.id,
      description: component.description,
      props: component.props.map(prop => ({
        name: prop.name,
        type: prop.type,
        required: prop.required ?? false,
        default: prop.default,
        description: prop.description
      })),
      // Actions if interactive
      actions: component.actions?.map(action => ({
        name: action.name,
        description: action.description,
        payload: action.payloadSchema
      }))
    }))
  };
}
```

### Output Schema

The agent produces json-render compatible JSON:

```json
{
  "type": "alert-card",
  "props": {
    "severity": "warning",
    "title": "High-Risk Payment"
  },
  "children": [
    {
      "type": "layout-row",
      "children": [
        {
          "type": "risk-gauge",
          "props": { "score": 0.87, "threshold": 0.7 }
        },
        {
          "type": "metric-sparkline",
          "props": { "value": 12340, "unit": "ms" }
        }
      ]
    },
    {
      "type": "retry-timeline",
      "props": { "attempts": 3, "maxAttempts": 5 }
    }
  ]
}
```

---

## Use Cases

### 1. Payment Processing Events

| Scenario | Agent Selects | Rationale |
|----------|--------------|-----------|
| Low-risk, fast payment | Simple confirmation badge | Nothing notable to highlight |
| High risk score | AlertCard + RiskGauge | Anomaly needs attention |
| Multiple retries | RetryTimeline + latency info | Pattern indicates issues |
| Large amount | Highlighted amount display | Business significance |

### 2. Error/Exception Events

| Scenario | Agent Selects | Rationale |
|----------|--------------|-----------|
| Timeout | AlertCard + MetricSparkline | Show duration context |
| Rate limited | RetryTimeline + backoff visualization | Help understand retry behavior |
| Validation failure | DiffViewer (expected vs actual) | Show what was wrong |
| Cascading failure | Dependency graph highlighting | Show failure propagation |

### 3. State Transition Events

| Scenario | Agent Selects | Rationale |
|----------|--------------|-----------|
| Config change | DiffViewer | Show before/after |
| Feature flag toggle | StatusBadge + affected users | Show impact |
| Deployment | Timeline + version badges | Show progression |

### 4. Performance Events

| Scenario | Agent Selects | Rationale |
|----------|--------------|-----------|
| Slow span | MetricSparkline with percentile context | Show vs historical |
| N+1 query detected | DataTable with query counts | Highlight inefficiency |
| Cache miss spike | Ratio gauge + trend line | Show degradation |

### 5. User Journey Events

| Scenario | Agent Selects | Rationale |
|----------|--------------|-----------|
| Cart update | Mini cart preview with item count | Quick visual summary |
| A/B assignment | Variant badge + experiment info | Show which path |
| Conversion | Success celebration + metrics | Highlight achievement |

---

## Implementation Phases

### Phase 1: Foundation

- Define `EventUIComponent` interface and catalog schema
- Build core component library (8-10 essential components)
- Create json-render catalog generator
- Implement basic agent selection logic (rule-based)

### Phase 2: AI Integration

- Integrate json-render for constrained generation
- Implement agent reasoning for component selection
- Add anomaly detection for payload analysis
- Enable streaming/progressive rendering

### Phase 3: Interactivity

- Add user commands for view adjustment
- Implement drill-down/expansion
- Enable cross-event comparisons
- Add natural language requests ("show as timeline")

### Phase 4: Learning & Refinement

- Collect feedback on component selections
- Refine agent heuristics based on usage
- Add domain-specific component variants
- Enable custom component definitions per-project

---

## Relationship to Existing Systems

### Complements Templates

Templates provide the narrative flow; Adaptive UI provides the visual richness:

```
┌─────────────────────────────────────────────────────────────┐
│ Workflow Scenario: checkout-happy-path                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ User initiated checkout at 14:32:01                         │  ← Template
│                                                             │
│ ┌─────────────────────────────────────────┐                 │
│ │ 🛒 Cart Validated                       │                 │  ← Adaptive UI
│ │    3 items · $149.97 · Free shipping    │                 │
│ └─────────────────────────────────────────┘                 │
│                                                             │
│ Payment processing started with Stripe                      │  ← Template
│                                                             │
│ ┌─────────────────────────────────────────┐                 │
│ │ ✓ Payment Authorized                    │                 │  ← Adaptive UI
│ │   $149.97 · ****4242 · Risk: Low        │                 │
│ └─────────────────────────────────────────┘                 │
│                                                             │
│ Order confirmed and fulfillment initiated                   │  ← Template
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Extends Canvas Visualization

Canvas shows architecture; Adaptive UI shows event details:

```
Canvas View                    Event Detail (Adaptive UI)
┌────────────────────┐         ┌─────────────────────────────┐
│                    │         │                             │
│  [API] ──► [Pay]   │  ─────► │  Detailed payment widget    │
│    │         │     │  click  │  with risk, timing, etc.    │
│    ▼         ▼     │         │                             │
│  [Cart]   [Order]  │         └─────────────────────────────┘
│                    │
└────────────────────┘
```

### Honors Graph Configuration

The component library respects your existing type system:

```typescript
// Your GraphConfiguration already defines:
nodeTypes: {
  payment_service: { ... },
  fraud_checker: { ... }
}

// Adaptive UI components can be scoped to node types:
{
  id: 'fraud-analysis-widget',
  applicableTo: [
    { nodeType: 'fraud_checker' }  // Only for events from this node type
  ]
}
```

---

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Event Display** | Text-only templates | Rich, contextual widgets |
| **Anomaly Visibility** | Manual inspection | Automatically highlighted |
| **Customization** | Edit templates | Natural language requests |
| **Consistency** | Varies by template author | Guardrailed component library |
| **Interactivity** | Static output | Expandable, adjustable views |
| **Maintenance** | Template per event type | Reusable component catalog |

---

## Open Questions

1. **Component Granularity**: How fine-grained should components be? Full widgets vs. atomic primitives?

2. **Agent Autonomy**: How much should the agent decide vs. follow explicit rules?

3. **Performance**: Streaming render latency acceptable for inline event display?

4. **Customization Scope**: Per-project component libraries? Or shared ecosystem?

5. **Fallback Behavior**: When AI is unavailable, render templates? Basic JSON dump?

---

## References

- [json-render.dev](https://json-render.dev/docs) - Vercel Labs' constrained UI generation framework
- Principal View Workflow Templates - Existing template expression system
- Principal View Event System - Event types and payload schemas
