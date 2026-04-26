# Agents Made OpenTelemetry Accessible

The observability community got it right. OpenTelemetry is the correct standard. Structured events, distributed tracing, semantic conventions—it's all sound engineering.

The problem was never the approach. It was the cost.

## The Implementation Gap

Proper instrumentation requires two scarce resources:

1. **Engineering expertise** - Someone who understands both your business logic and OpenTelemetry's semantic conventions
2. **Backend infrastructure** - Data pipelines, storage, querying systems to make sense of the telemetry

Most teams have neither. So instrumentation becomes something you bolt on after the fact, if at all.

```mermaid
graph TB
    subgraph Where["Where Instrumentation Should Be"]
        W1[Design Phase] --> W2[Define expected behavior]
        W2 --> W3[Implement with instrumentation]
        W3 --> W4[Deploy code + observability together]

        style W1 fill:#E8F5E8
        style W2 fill:#E8F5E8
        style W3 fill:#E8F5E8
    end

    subgraph Reality["Where Instrumentation Actually Happens"]
        R1[Design Phase] --> R2[Implement code]
        R2 --> R3[Deploy]
        R3 --> R4[Something breaks]
        R4 --> R5[Add logging]
        R5 --> R6[Add metrics]
        R6 --> R7[Maybe add tracing]
        R7 --> R8[Configure backend]
        R8 --> R9[Write queries]

        style R4 fill:#FFB6C6
        style R5 fill:#FFE4E1
        style R6 fill:#FFE4E1
        style R7 fill:#FFE4E1
    end
```

The cost pushes instrumentation to the right. It becomes reactive instead of proactive.

## What Agents Change

Agents don't change how observability should work. They remove the barriers that prevented teams from doing it properly.

### Before: High-Cost Instrumentation

```typescript
// PM requirement:
// "Build a checkout flow with fraud detection"

// Developer implements:
async function handleCheckout(cartId: string) {
  const cart = await validateCart(cartId);
  const fraudResult = await fraudService.check(cartId);
  const payment = await paymentService.authorize(cartId);
  await inventoryService.reserve(cartId);
  return completeCheckout(cartId);
}

// Deployed without instrumentation (too expensive to add upfront)

// Later, after production issues:
// - Observability team adds tracing (3 days)
// - Backend team configures data pipeline (2 days)
// - DevOps writes queries and dashboards (1 day)
// - Total: 6 days of specialized engineering
```

**Cost:** High expertise required, delayed value, reactive implementation

### After: Accessible Instrumentation

```typescript
// Same PM requirement:
// "Build a checkout flow with fraud detection"

// Agent generates properly instrumented code:
async function handleCheckout(cartId: string) {
  const span = tracer.startSpan('handleCheckout');

  span.addEvent('checkout.started', { cartId });

  const cart = await validateCart(cartId);
  span.addEvent('cart.validated', { items: cart.items.length });

  const fraudResult = await fraudService.check(cartId);
  span.addEvent('fraud.check.passed', {
    score: fraudResult.score,
    riskLevel: fraudResult.riskLevel
  });

  const payment = await paymentService.authorize(cartId);
  span.addEvent('payment.authorized', {
    amount: payment.total,
    method: payment.method
  });

  await inventoryService.reserve(cartId);
  span.addEvent('inventory.reserved');

  span.addEvent('checkout.complete', { orderId: payment.orderId });
  span.end();

  return completeCheckout(cartId);
}

// Agent also generates expected behavior definition:
{
  "scenarios": [{
    "id": "successful-checkout",
    "events": {
      "checkout.started": "Cart validation began",
      "cart.validated": "Cart validated successfully",
      "fraud.check.passed": "Fraud check completed",
      "payment.authorized": "Payment processed",
      "inventory.reserved": "Items reserved",
      "checkout.complete": "Order confirmed"
    }
  }]
}

// Deployed together, day one
// Backend automatically validates observed vs expected events
```

**Cost:** Near zero. Generated from the same requirements that produce the code.

## The Natural Fit

Instrumentation always belonged in the development phase. You design a feature, you implement it, you define what successful execution looks like—these are the same activity.

But there's another natural fit: **visualization**.

When you design a system, you draw boxes and arrows. "Checkout service calls payment service calls fraud detection." That diagram is how you communicate the design.

That same diagram is the natural representation of your telemetry structure.

```mermaid
graph LR
    subgraph DesignPhase["Design Phase: You Draw This"]
        D1[API] --> D2[Checkout]
        D2 --> D3[Fraud]
        D2 --> D4[Payment]
        D2 --> D5[Inventory]
    end

    subgraph CodePhase["Code Phase: Agent Implements This"]
        C1[checkout.ts] --> C2[span.addEvent 'fraud.check']
        C1 --> C3[span.addEvent 'payment.auth']
        C1 --> C4[span.addEvent 'inventory.reserve']
    end

    subgraph TelemetryPhase["Telemetry Phase: You See This"]
        T1[API Node] --> T2[Checkout Node]
        T2 --> T3[Fraud Node ✅]
        T2 --> T4[Payment Node ✅]
        T2 --> T5[Inventory Node ⚠️]
    end

    Note1[Same structure,<br/>three different phases]
```

The visualization isn't a "nice-to-have" dashboard feature. It's the architectural blueprint. The telemetry flows through the structure you designed. Showing that structure visually is just showing what already exists.

The only reason it didn't happen there was cost.

```mermaid
graph LR
    subgraph Before["Before Agents: Cost Barrier"]
        B1[Requirements] --> B2[Code Implementation]
        B2 --> B3[Deploy]

        B1 -.->|Too expensive| B4[Instrumentation Design]
        B4 -.->|Specialized expertise| B5[Instrumentation Implementation]
        B5 -.->|Backend complexity| B6[Observability Infrastructure]

        style B4 fill:#FFE4E1
        style B5 fill:#FFE4E1
        style B6 fill:#FFE4E1
    end

    subgraph After["With Agents: Cost Removed"]
        A1[Requirements] --> A2[Agent Generates:<br/>Code + Instrumentation + Scenarios]
        A2 --> A3[Deploy All Together]
        A3 --> A4[Backend Validates Automatically]

        style A2 fill:#90EE90
        style A4 fill:#90EE90
    end
```

| Barrier | Before Agents | With Agents |
|---------|--------------|-------------|
| **OpenTelemetry expertise** | Required specialized knowledge | Agent handles semantic conventions |
| **Instrumentation design** | Manual effort, easy to defer | Generated from requirements |
| **Implementation cost** | Hours per feature | Seconds (part of code generation) |
| **Backend data wrangling** | Complex queries, custom dashboards | Structured validation against scenarios |
| **When it happens** | After problems occur (reactive) | During development (proactive) |
| **Coverage** | Spotty (only critical paths) | Complete (every feature) |

## It's Still OpenTelemetry

Nothing about the underlying approach changes:

- ✅ Standard OTLP protocol
- ✅ Spans, events, attributes following semantic conventions
- ✅ Distributed tracing across services
- ✅ Compatible with existing backends (Jaeger, Tempo, etc.)

What changes is **who does the work** and **when it happens**.

**Before:** Specialized engineers add instrumentation reactively, after deployment.

**After:** Agents generate instrumentation proactively, during development.

And what changes is **how you see it**.

**Before:** Flat lists, nested trees, query results that require translation from "what the backend shows me" to "what my system is doing."

**After:** Visual architecture that matches how you designed the system, with telemetry flowing through it.

## The Visualization Problem

Your code has structure. Services talk to other services. Operations call other operations. You design systems with architecture diagrams because that's how you think about them.

But when you open a traditional observability backend, that structure disappears:

```mermaid
graph TB
    subgraph Design["How You Design the System"]
        D1[API Gateway] --> D2[Checkout Service]
        D2 --> D3[Fraud Service]
        D2 --> D4[Payment Service]
        D2 --> D5[Inventory Service]

        Note1[Visual, architectural, matches mental model]
        style Note1 fill:#E8F5E8
    end

    subgraph Traditional["Traditional Telemetry View"]
        T1[Flat list of spans:<br/>- handleCheckout<br/>- checkFraud<br/>- authorizePayment<br/>- reserveInventory<br/>...<br/>- 847 more spans]

        Note2[Linear, disconnected from architecture]
        style Note2 fill:#FFE4E1
    end
```

The telemetry **follows** your code structure. A span for the checkout service. A span for the fraud check. A span for payment processing. But the visualization doesn't.

You end up translating between two representations:
- **How you think about the system** (visual, architectural)
- **How you see telemetry** (lists, trees, queries)

That translation is manual work.

## Canvas: Structure as Visualization

Your code's architecture is the natural way to represent telemetry structure. Not because it's prettier, but because they're the same thing.

```mermaid
graph TB
    subgraph Code["Your Code Structure"]
        C1[CheckoutService] --> C2[handleCheckout method]
        C2 --> C3[Calls: FraudService.check]
        C2 --> C4[Calls: PaymentService.authorize]
        C2 --> C5[Calls: InventoryService.reserve]
    end

    subgraph Telemetry["Your Telemetry Structure"]
        T1[Span: handleCheckout] --> T2[Event: checkout.started]
        T1 --> T3[Event: fraud.check.passed]
        T1 --> T4[Event: payment.authorized]
        T1 --> T5[Event: inventory.reserved]
    end

    subgraph Canvas["Canvas Representation"]
        V1[Node: Checkout Service<br/>Matches: span name = handleCheckout]
        V2[Node: Fraud Check<br/>Matches: event name = fraud.check.passed]
        V3[Node: Payment<br/>Matches: event name = payment.authorized]
        V4[Node: Inventory<br/>Matches: event name = inventory.reserved]

        V1 --> V2
        V1 --> V3
        V1 --> V4
    end

    Note1[Same structure, different representations]
```

A canvas is just a visual map of your system where each node knows how to match incoming telemetry. When a trace arrives:

1. **Spans match to nodes** - "This span is the Checkout Service"
2. **Events light up the flow** - "Fraud check happened, payment happened"
3. **Missing events are visible** - "Inventory node didn't light up—why?"

The visualization isn't decoration. It's the architectural blueprint that telemetry validates against.

### Canvas Example

```json
{
  "nodes": [
    {
      "id": "checkout-service",
      "label": "Checkout Service",
      "position": { "x": 100, "y": 100 },
      "spanMatch": {
        "name": "handleCheckout",
        "kind": "SPAN_KIND_SERVER"
      }
    },
    {
      "id": "fraud-check",
      "label": "Fraud Detection",
      "position": { "x": 300, "y": 100 },
      "spanMatch": {
        "event": { "name": "fraud.check.passed" }
      }
    },
    {
      "id": "payment",
      "label": "Payment Processing",
      "position": { "x": 300, "y": 200 },
      "spanMatch": {
        "event": { "name": "payment.authorized" }
      }
    }
  ],
  "edges": [
    { "from": "checkout-service", "to": "fraud-check" },
    { "from": "checkout-service", "to": "payment" }
  ]
}
```

This is your system's architecture, expressed in a format that telemetry can be matched against.

### What You See

**Traditional trace view:**
```
Trace ID: 8b3f9a2c
├─ Span: handleCheckout (245ms)
│  ├─ Event: checkout.started (t=0ms)
│  ├─ Event: payment.authorized (t=89ms)
│  ├─ Event: inventory.reserved (t=112ms)
│  └─ Event: checkout.complete (t=203ms)
```

You have to notice `fraud.check.passed` is missing. You have to remember it should be there.

**Canvas view:**
```
┌─────────────────────┐
│  Checkout Service   │ ✅ Matched
│  handleCheckout     │
└──────┬───────┬──────┘
       │       │
       v       v
┌──────────┐ ┌──────────┐
│  Fraud   │ │ Payment  │
│  Check   │ │ Service  │
└──────────┘ └──────────┘
     ⚠️            ✅
  Missing!     Matched
```

The architecture shows you what's missing. The canvas is both the design document and the validation framework.

### How Canvas + Telemetry Works Together

```mermaid
graph TB
    subgraph Canvas["Canvas Definition (Static)"]
        C1[Node: Checkout Service<br/>Matches: span.name = 'handleCheckout']
        C2[Node: Fraud Check<br/>Matches: event.name = 'fraud.check.passed']
        C3[Node: Payment<br/>Matches: event.name = 'payment.authorized']
        C4[Node: Inventory<br/>Matches: event.name = 'inventory.reserved']

        C1 --> C2
        C1 --> C3
        C1 --> C4
    end

    subgraph Telemetry["Incoming OTLP Trace"]
        T1[Span: handleCheckout<br/>Events:<br/>- checkout.started<br/>- payment.authorized<br/>- inventory.reserved<br/>- checkout.complete]

        Note1[⚠️ fraud.check.passed missing]
        style Note1 fill:#FFB6C6
    end

    subgraph Result["Visual Result"]
        R1[Checkout Service ✅<br/>Span matched]
        R2[Fraud Check ⚠️<br/>Event not found in trace]
        R3[Payment ✅<br/>Event matched]
        R4[Inventory ✅<br/>Event matched]

        R1 --> R2
        R1 --> R3
        R1 --> R4

        style R2 fill:#FFD700
    end

    Canvas --> Result
    Telemetry --> Result
```

Your canvas is your architecture. Your telemetry validates whether the architecture executed as designed. The visual representation is just showing what's actually happening.

## The Backend Simplification

The second cost was backend complexity. Even with perfect instrumentation, you still needed to:

1. Ingest massive volumes of trace data
2. Build queries to correlate events
3. Create dashboards to visualize patterns
4. Write alert rules for anomalies
5. Maintain all of the above as the system evolves

Story-based monitoring simplifies this by adding structure to how you consume the telemetry—both through scenarios (expected behavior) and canvas (architectural visualization):

```mermaid
graph TB
    subgraph Traditional["Traditional Backend"]
        T1[OTLP Traces] --> T2[Storage<br/>Millions of spans]
        T2 --> T3[Query Engine]
        T3 --> T4[Custom Queries]
        T4 --> T5[Dashboards]
        T4 --> T6[Alert Rules]

        Note1[Engineer writes queries,<br/>tunes alerts,<br/>maintains dashboards]

        style Note1 fill:#FFE4E1
    end

    subgraph Story["Story-Based Backend"]
        S1[OTLP Traces] --> S2[Orchestrator]
        S2 --> S3{Match Scenario?}

        S4[Scenario Definitions] --> S3

        S3 -->|100%| S5[✅ Expected Behavior]
        S3 -->|Partial| S6[⚠️ Missing Events]
        S3 -->|None| S7[❌ Unknown Behavior]

        S6 --> S8[Show: Expected vs Observed]

        Note2[System automatically categorizes,<br/>no queries needed]

        style S4 fill:#90EE90
        style Note2 fill:#E8F5E8
    end
```

The instrumentation is the same. The backend just has a blueprint (scenarios) to validate against, instead of requiring manual query construction.

## Agents Generate the Visual Structure Too

Here's where it gets interesting. The same agent that generates your code can generate the canvas.

When you describe your system's requirements, you're implicitly describing its architecture:
- "Checkout service calls fraud detection"
- "Then it processes payment"
- "Then it reserves inventory"

That description contains the visual structure.

```mermaid
graph TB
    subgraph Input["PM Describes System"]
        I1["Build a checkout flow.<br/>It should validate the cart,<br/>check for fraud,<br/>authorize payment,<br/>and reserve inventory."]
    end

    subgraph Generated["Agent Generates Three Artifacts"]
        G1[Code Implementation<br/>with OTLP instrumentation]
        G2[Scenario Definitions<br/>expected events]
        G3[Canvas Visualization<br/>architectural nodes]
    end

    subgraph Result["What You Deploy"]
        R1[Application] --> R2[Emits standard OTLP]
        R3[Scenarios] --> R4[Expected behavior]
        R5[Canvas] --> R6[Visual structure]

        R2 --> R7[Backend]
        R4 --> R7
        R6 --> R7

        R7 --> R8[Validates telemetry against<br/>scenarios and architecture]
    end

    I1 --> G1
    I1 --> G2
    I1 --> G3

    G1 --> R1
    G2 --> R3
    G3 --> R5

    style G1 fill:#90EE90
    style G2 fill:#90EE90
    style G3 fill:#90EE90
```

**Code** tells the system what to do.
**Scenarios** tell the system what should happen.
**Canvas** tells the system how it's structured.

All three from the same requirements. All three generated automatically. All three deployed together.

## The Complete Picture

```mermaid
sequenceDiagram
    participant PM as Product Manager
    participant Agent as AI Agent
    participant Code as Application Code
    participant OTEL as OpenTelemetry
    participant Backend as Story Backend

    PM->>Agent: "Build checkout with fraud detection"

    rect rgb(240, 255, 240)
        Note over Agent: Generates from single requirements
        Agent->>Code: 1. Implements checkout with OTLP events
        Agent->>Backend: 2. Defines expected event scenarios
        Agent->>Backend: 3. Creates canvas visualization
    end

    Code->>OTEL: Emits spans and events (standard OTLP)
    OTEL->>Backend: Sends trace data

    Backend->>Backend: Match spans to canvas nodes
    Backend->>Backend: Match events to scenarios

    alt All expected events present
        Backend->>PM: ✅ Canvas shows all nodes active<br/>Checkout working as designed
    else Some events missing
        Backend->>PM: ⚠️ Canvas shows Fraud Check node inactive<br/>Missing: fraud.check.passed<br/>Expected in successful-checkout scenario
    end

    Note over PM,Backend: No queries written<br/>No dashboards configured<br/>No alert tuning<br/>Architecture visualized automatically<br/>Just validation against intent
```

The canvas isn't something you draw by hand. It's a byproduct of describing what you want to build.

## What This Means for Teams

**For teams already using OpenTelemetry:**
You don't need to change your approach. Story-based monitoring consumes standard OTLP data. The difference is having scenario definitions and visual canvas that make the data self-documenting. Your telemetry structure becomes visible as architecture, not just queryable as data.

**For teams not using OpenTelemetry:**
The cost barrier just dropped to near-zero. Agents can generate properly instrumented code from your requirements. You get observability by default, not as an afterthought. And you get it represented the way you designed it—visually.

**For teams shipping agent-written code:**
Instrumentation becomes automatic. The agent that writes your code can instrument it correctly at the same time. The agent can also generate the architectural canvas from the same requirements. No specialized expertise needed. No manual diagram maintenance.

**For teams struggling with observability adoption:**
The gap between "we should instrument this" and "we actually instrumented this" was always about cost and accessibility. Visualization makes telemetry readable. Agents make instrumentation effortless. Both together make OpenTelemetry practical for every team, every feature, from day one.

## The Three Pieces That Make It Work

This approach rests on three complementary pieces, all generated from the same requirements:

```mermaid
graph TB
    subgraph Req["Requirements"]
        R1["Build a checkout flow with fraud detection,<br/>payment processing, and inventory reservation"]
    end

    subgraph Generated["Agent Generates"]
        G1[1. Code with OTLP Instrumentation]
        G2[2. Scenario Definitions]
        G3[3. Canvas Visualization]
    end

    subgraph Deploy["What Gets Deployed"]
        D1[Code emits standard OTLP events]
        D2[Scenarios define expected behavior]
        D3[Canvas shows architectural structure]
    end

    subgraph Value["Value in Production"]
        V1[Telemetry follows OpenTelemetry standard]
        V2[Validation happens automatically]
        V3[Visualization matches design]

        V4[Observable by default<br/>Self-documenting<br/>Architecturally visible]
    end

    R1 --> G1
    R1 --> G2
    R1 --> G3

    G1 --> D1
    G2 --> D2
    G3 --> D3

    D1 --> V1
    D2 --> V2
    D3 --> V3

    V1 --> V4
    V2 --> V4
    V3 --> V4

    style G1 fill:#90EE90
    style G2 fill:#90EE90
    style G3 fill:#90EE90
    style V4 fill:#E8F5E8
```

**Code with instrumentation** - Standard OpenTelemetry events at the right places
**Scenario definitions** - What should happen (expected event patterns)
**Canvas visualization** - How the system is structured (architectural map)

All three from one set of requirements. All three making OpenTelemetry accessible.

## The Shift

This isn't about changing how observability works. It's about making the right way accessible.

OpenTelemetry gave us the standard—proper instrumentation with structured events. But the cost was too high for most teams.

**Agents remove the cost** by generating instrumentation from requirements.

**Scenarios remove the query complexity** by defining expected behavior upfront.

**Canvas removes the translation burden** by showing telemetry in the same visual structure you designed.

Together, they make it practical to implement the OpenTelemetry standard from day one, for every feature, without specialized expertise or backend complexity.

Instrumentation finally fits where it always should have been: part of development, not a specialized discipline that happens later. And telemetry finally looks how it always should have: like your architecture, not like a database dump.

---

**We're building this.** If you're shipping code (agent-written or not) and want instrumentation to be as automatic as the code itself, let's talk.

principal-ade.com
