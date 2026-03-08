# Hierarchical Workflow Composition

## Overview

This document describes Principal View's approach to telemetry across library boundaries and hierarchical workflow composition using OpenTelemetry span hierarchies. This design enables composable, reusable workflows that map directly to production traces.

## Table of Contents

- [Background: Telemetry Across Library Boundaries](#background-telemetry-across-library-boundaries)
- [The Span-to-Workflow Convention](#the-span-to-workflow-convention)
- [Architecture](#architecture)
- [Implementation Guide](#implementation-guide)
- [Benefits](#benefits)
- [Examples](#examples)
- [Migration Path](#migration-path)

---

## Background: Telemetry Across Library Boundaries

### The Challenge

In a deployed system with multiple libraries (e.g., `@principal-ai/react` for UI and `@principal-ai/core` for business logic), telemetry events are emitted from different layers:

```
Application
├── React Library (UI layer)
│   └── Emits: component renders, user interactions
├── Core Library (business logic)
│   └── Emits: validation events, processing steps
└── Other Libraries (networking, persistence, etc.)
    └── Emits: API calls, database queries
```

**Key Question**: How do we correlate events from different libraries and visualize them as a unified workflow?

### The OpenTelemetry Solution

OpenTelemetry solves this through **automatic context propagation**:

1. **Shared Trace Context**: All libraries share the same `traceId` and active span context
2. **Independent Tracers**: Each library gets its own tracer but writes to the same trace
3. **Parent-Child Relationships**: Child spans automatically link to parent spans via `parentSpanId`

```typescript
// In React Library
const reactTracer = trace.getTracer('@principal-ai/react');
const parentSpan = reactTracer.startActiveSpan('ui.render', (span) => {
  // This span is now the active context

  // When calling Core library...
  processCoreLogic(); // Core inherits this context!

  span.end();
});

// In Core Library
const coreTracer = trace.getTracer('@principal-ai/core');
const childSpan = coreTracer.startActiveSpan('core.process', (span) => {
  // This automatically becomes a CHILD span of ui.render
  span.addEvent('validation.started');
  span.end();
});
```

**Result in production trace:**
```
Trace ID: abc123
├─ Span: ui.render (@principal-ai/react)
   └─ Span: core.process (@principal-ai/core)
      └─ Event: validation.started
```

### Key Insight

**The span hierarchy naturally represents workflow composition.** Each span represents a logical unit of work that can have its own workflow definition.

---

## The Span-to-Workflow Convention

### Core Principle

**One span = One workflow file**

Events within a span belong to that span's workflow. Child spans represent sub-workflows that can be composed and reused.

### Visual Representation

```
Root Span: checkout-flow
├─ Events: cart.validated, shipping.calculated
│  → Workflow: checkout-flow.workflow.json
│
└─ Child Span: payment-processing
   ├─ Events: card.authorized, fraud.checked
   │  → Workflow: payment-processing.workflow.json
   │
   └─ Child Span: fraud-analysis
      └─ Events: risk.scored, rules.evaluated
         → Workflow: fraud-analysis.workflow.json
```

### Why This Works

1. **Natural Composability**: Mirrors how code actually executes
2. **Reusability**: `payment-processing` can be called from multiple parent workflows
3. **Testability**: Each workflow can be tested independently with its own span
4. **Scalability**: Deep hierarchies are naturally supported
5. **Clarity**: Clear boundaries between logical units of work

### Convention Rules

1. **Event Scope**: Events belong to the span they're emitted within (via `spanId`)
2. **Workflow Naming**: Span name determines workflow file name
3. **Composition**: Child spans reference child workflow files
4. **Independence**: Each workflow validates its own span's events

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│ Production System                                        │
│  ├─ React UI (@principal-ai/react)                     │
│  │  └─ Span: ui.checkout                               │
│  └─ Core Logic (@principal-ai/core)                    │
│     └─ Span: checkout-flow                             │
│        └─ Span: payment-processing                     │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Trace Export (OTLP)
                    ▼
┌─────────────────────────────────────────────────────────┐
│ OTEL Collector / Backend                                 │
└─────────────────────────────────────────────────────────┘
                    │
                    │ Trace Fetch
                    ▼
┌─────────────────────────────────────────────────────────┐
│ Principal View System                                    │
│  ├─ TraceToCanvasMapper                                 │
│  │  └─ Maps spans to canvas nodes                      │
│  ├─ HierarchicalWorkflowProcessor                      │
│  │  └─ Validates each span against workflow            │
│  └─ GraphRenderer                                       │
│     └─ Visualizes activated nodes + validations        │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Production Execution**: Application emits spans and events
2. **Collection**: OTEL collector receives and stores trace
3. **Retrieval**: Principal View fetches trace by `traceId`
4. **Mapping**: Each span is mapped to its workflow file
5. **Validation**: Each span's events validated against its workflow
6. **Visualization**: Canvas nodes highlighted, validation results shown

---

## Implementation Guide

### Phase 1: Span Name Conventions

#### Naming Strategy

Establish a clear mapping from span name to workflow file:

```typescript
/**
 * Convert span name to workflow filename
 *
 * Examples:
 * - "checkout-flow" → "checkout-flow.workflow.json"
 * - "payment.process" → "payment-process.workflow.json"
 * - "fraud:analysis" → "fraud-analysis.workflow.json"
 */
function spanNameToWorkflow(spanName: string): string {
  return spanName
    .toLowerCase()
    .replace(/[.:]/g, '-')  // Convert dots/colons to dashes
    .replace(/\s+/g, '-')    // Convert spaces to dashes
    + '.workflow.json';
}
```

#### Explicit Workflow Attributes

Alternatively, use span attributes for explicit mapping:

```typescript
const span = tracer.startSpan('checkout-flow');
span.setAttribute('workflow.name', 'checkout-flow');
span.setAttribute('canvas.file', 'checkout-flow.otel.canvas');
```

### Phase 2: Canvas Node Extensions

Update canvas nodes to reference span names and child workflows:

```json
{
  "nodes": [
    {
      "id": "checkout",
      "type": "custom",
      "pv": {
        "spanName": "checkout-flow",
        "sources": ["src/checkout/index.ts"],
        "event": {
          "name": "cart.validated",
          "attributes": {
            "cart.items": { "type": "number", "required": true }
          }
        }
      }
    },
    {
      "id": "payment",
      "type": "custom",
      "pv": {
        "spanName": "payment-processing",
        "sources": ["src/payment/process.ts"],
        "childWorkflows": ["payment-processing.workflow.json"],
        "event": {
          "name": "card.authorized",
          "attributes": {
            "payment.amount": { "type": "number", "required": true }
          }
        }
      }
    }
  ],
  "edges": [
    {
      "fromNode": "checkout",
      "toNode": "payment",
      "label": "initiates payment"
    }
  ]
}
```

### Phase 3: Hierarchical Workflow Processor

Create a processor that validates each span against its workflow:

```typescript
export interface SpanWorkflowValidation {
  spanId: string;
  spanName: string;
  workflowFile: string;
  validation: {
    matched: boolean;
    scenarioId?: string;
    errors: string[];
  };
  children: SpanWorkflowValidation[];
}

export class HierarchicalWorkflowProcessor {
  constructor(
    private workflowLoader: (fileName: string) => Promise<WorkflowTemplate>
  ) {}

  /**
   * Process a trace with nested spans, validating each span
   * against its corresponding workflow file
   */
  async processTrace(
    traceId: string,
    spans: OtelSpan[],
    events: OtelEvent[]
  ): Promise<SpanWorkflowValidation[]> {
    // Build span tree from flat span list
    const spanTree = this.buildSpanTree(spans, events);

    // Process each root span
    const results: SpanWorkflowValidation[] = [];
    for (const node of spanTree) {
      results.push(await this.processSpanNode(node));
    }

    return results;
  }

  /**
   * Recursively process a span node and its children
   */
  private async processSpanNode(
    node: SpanTreeNode
  ): Promise<SpanWorkflowValidation> {
    const spanName = node.span.name || 'unknown';
    const workflowFile = this.getWorkflowFile(node.span);

    try {
      // Load workflow template for this span
      const template = await this.workflowLoader(workflowFile);

      // Get events for THIS span only (not children)
      const spanEvents = this.getEventsForSpan(node);

      // Validate events against workflow
      const result = renderWorkflow(template, spanEvents);

      // Recursively process children
      const childValidations: SpanWorkflowValidation[] = [];
      for (const child of node.children) {
        childValidations.push(await this.processSpanNode(child));
      }

      return {
        spanId: node.span.spanId || '',
        spanName,
        workflowFile,
        validation: {
          matched: true,
          scenarioId: result.scenarioId,
          errors: result.metadata.errors || [],
        },
        children: childValidations,
      };
    } catch (error) {
      return {
        spanId: node.span.spanId || '',
        spanName,
        workflowFile,
        validation: {
          matched: false,
          errors: [(error as Error).message],
        },
        children: [],
      };
    }
  }

  /**
   * Determine workflow file from span
   */
  private getWorkflowFile(span: OtelEvent): string {
    // Option 1: Explicit attribute
    if (span.attributes?.['workflow.name']) {
      return `${span.attributes['workflow.name']}.workflow.json`;
    }

    // Option 2: Derive from span name
    return spanNameToWorkflow(span.name || 'unknown');
  }

  /**
   * Get events that belong to this span only
   * Events are associated via spanId
   */
  private getEventsForSpan(node: SpanTreeNode): OtelEvent[] {
    return node.logs || [];
  }
}
```

### Phase 4: Trace-to-Canvas Mapping

Map production traces back to canvas visualizations:

```typescript
export class TraceToCanvasMapper {
  constructor(
    private canvasLoader: (path: string) => Promise<ExtendedCanvas>,
    private workflowProcessor: HierarchicalWorkflowProcessor
  ) {}

  /**
   * Map a production trace to canvas visualization
   */
  async mapTraceToCanvas(
    traceId: string,
    spans: OtelSpan[],
    events: OtelEvent[]
  ): Promise<{
    canvas: ExtendedCanvas;
    activatedNodes: string[];
    workflowValidations: SpanWorkflowValidation[];
  }> {
    // Find root span (no parent)
    const rootSpan = spans.find(s => !s.parentSpanId);
    if (!rootSpan) {
      throw new Error('No root span found in trace');
    }

    // Find canvas by root span name
    const canvasFile = this.findCanvasForSpan(rootSpan.name);
    const canvas = await this.canvasLoader(canvasFile);

    // Validate entire span hierarchy
    const validations = await this.workflowProcessor.processTrace(
      traceId,
      spans,
      events
    );

    // Identify activated nodes
    const activatedNodes = this.findActivatedNodes(canvas, spans);

    return {
      canvas,
      activatedNodes,
      workflowValidations: validations,
    };
  }

  private findCanvasForSpan(spanName: string): string {
    // checkout-flow → checkout-flow.otel.canvas
    return `${spanNameToWorkflow(spanName)
      .replace('.workflow.json', '.otel.canvas')}`;
  }

  private findActivatedNodes(
    canvas: ExtendedCanvas,
    spans: OtelSpan[]
  ): string[] {
    const spanNames = new Set(spans.map(s => s.name));
    const activated: string[] = [];

    for (const node of canvas.nodes || []) {
      if (node.pv?.spanName && spanNames.has(node.pv.spanName)) {
        activated.push(node.id);
      }
    }

    return activated;
  }
}
```

---

## Benefits

### 1. Composability

Workflows can reference child workflows:

```json
{
  "version": "1.0.0",
  "canvas": "checkout-flow.otel.canvas",
  "name": "Checkout Flow",
  "scenarios": [
    {
      "id": "happy-path",
      "template": {
        "flow": [
          "Cart validated with {{cart.items}} items",
          "Shipping address confirmed",
          "→ Payment initiated (see payment-processing.workflow.json)",
          "Order confirmed with ID {{order.id}}"
        ]
      }
    }
  ]
}
```

### 2. Reusability

The same workflow can be composed into multiple parent workflows:

```
checkout-flow
└─ payment-processing

subscription-renewal
└─ payment-processing

refund-flow
└─ payment-processing
```

### 3. Independent Testing

Test each workflow in isolation:

```typescript
describe('payment-processing workflow', () => {
  it('validates successful payment', async () => {
    const span = createTestSpan('payment-processing');
    const events = [
      createEvent('card.authorized', { amount: 99.99 }),
      createEvent('fraud.checked', { risk: 'low' })
    ];

    const result = await processor.processSpanNode({
      span,
      logs: events,
      children: [],
      depth: 0
    });

    expect(result.validation.matched).toBe(true);
    expect(result.validation.scenarioId).toBe('happy-path');
  });
});
```

### 4. Production Trace Mapping

Automatically map production traces to visualizations:

```typescript
// Fetch production trace
const trace = await fetchTraceFromBackend('abc123');

// Map to canvas
const mapped = await traceMapper.mapTraceToCanvas(
  trace.traceId,
  trace.spans,
  trace.events
);

// Render in React
<GraphRenderer
  canvas={mapped.canvas}
  activatedNodes={mapped.activatedNodes}
  validations={mapped.workflowValidations}
/>
```

### 5. Multi-Library Support

Each library instruments itself with its own tracer, but all telemetry is automatically correlated:

```typescript
// In @principal-ai/react
const reactTracer = trace.getTracer('@principal-ai/react', '0.16.0');
const uiSpan = reactTracer.startActiveSpan('ui.checkout', (span) => {
  span.setAttribute('component.name', 'CheckoutPage');
  // Call core...
});

// In @principal-ai/core
const coreTracer = trace.getTracer('@principal-ai/core', '0.16.0');
const workflowSpan = coreTracer.startActiveSpan('checkout-flow', (span) => {
  span.setAttribute('workflow.name', 'checkout-flow');
  // Process...
});

// Result: ui.checkout → checkout-flow (parent-child relationship)
```

---

## Examples

### Example 1: Simple E-commerce Checkout

**Trace Structure:**
```
Trace: abc123
└─ Span: checkout-flow (id: span-1)
   ├─ Event: cart.validated
   ├─ Event: shipping.calculated
   └─ Child Span: payment-processing (id: span-2, parent: span-1)
      ├─ Event: card.authorized
      └─ Event: fraud.checked
```

**File Structure:**
```
.principal-views/
├─ checkout/
│  ├─ checkout-flow.otel.canvas
│  ├─ happy-path/
│  │  ├─ happy-path.workflow.json
│  │  └─ success-1.otel.json
│  └─ payment-failures/
│     └─ payment-failures.workflow.json
└─ payment/
   ├─ payment-processing.otel.canvas
   └─ standard-auth/
      └─ standard-auth.workflow.json
```

**checkout-flow.workflow.json:**
```json
{
  "version": "1.0.0",
  "canvas": "checkout-flow.otel.canvas",
  "name": "Checkout Flow",
  "mode": "span-tree",
  "scenarioSelection": "first-match",
  "showLogsPerSpan": true,
  "scenarios": [
    {
      "id": "happy-path",
      "priority": 1,
      "condition": {
        "requires": ["cart.validated", "shipping.calculated"],
        "excludes": ["*.error"]
      },
      "template": {
        "introduction": "Successful checkout with {{cart.items}} items",
        "events": {
          "cart.validated": "✓ Cart validated",
          "shipping.calculated": "✓ Shipping calculated: ${{shipping.cost}}"
        },
        "span": "→ Payment processing (see payment-processing workflow)",
        "children": "recurse"
      }
    }
  ]
}
```

**payment-processing.workflow.json:**
```json
{
  "version": "1.0.0",
  "canvas": "payment-processing.otel.canvas",
  "name": "Payment Processing",
  "mode": "span-tree",
  "scenarios": [
    {
      "id": "standard-auth",
      "priority": 1,
      "condition": {
        "requires": ["card.authorized"],
        "assertions": {
          "fraud.risk": { "$eq": "low" }
        }
      },
      "template": {
        "events": {
          "card.authorized": "✓ Card authorized: ${{payment.amount}}",
          "fraud.checked": "✓ Fraud check passed (risk: {{fraud.risk}})"
        }
      }
    }
  ]
}
```

### Example 2: Nested Service Calls

**Trace Structure:**
```
Trace: def456
└─ Span: api.handle-request (span-1)
   ├─ Event: request.validated
   └─ Child Span: db.query-user (span-2, parent: span-1)
      ├─ Event: query.prepared
      ├─ Event: query.executed
      └─ Child Span: cache.check (span-3, parent: span-2)
         └─ Event: cache.miss
```

**Workflow Validation Output:**
```typescript
{
  spanId: 'span-1',
  spanName: 'api.handle-request',
  workflowFile: 'api-handle-request.workflow.json',
  validation: { matched: true, scenarioId: 'with-cache-miss' },
  children: [
    {
      spanId: 'span-2',
      spanName: 'db.query-user',
      workflowFile: 'db-query-user.workflow.json',
      validation: { matched: true, scenarioId: 'cache-miss-path' },
      children: [
        {
          spanId: 'span-3',
          spanName: 'cache.check',
          workflowFile: 'cache-check.workflow.json',
          validation: { matched: true, scenarioId: 'miss' },
          children: []
        }
      ]
    }
  ]
}
```

### Example 3: Panel Initialization with Child Workflows

This real-world example from `@industry-theme/backlogmd-kanban-panel` demonstrates a panel initialization flow with parent-child span relationships.

**Trace Structure:**
```
Trace: abc123
└─ Span: board.session (span-1)
   ├─ Event: board.session.started
   ├─ Event: panel.initialized
   ├─ Child Span: backlog.core.init (span-2, parent: span-1)
   │  ├─ Event: backlog.core.init.started
   │  └─ Event: backlog.core.init.complete (or .skipped/.error)
   ├─ Child Span: kanban.load (span-3, parent: span-1)
   │  ├─ Event: kanban.loading
   │  └─ Event: kanban.loaded
   └─ Event: board.session.complete
```

**File Structure:**
```
.principal-views/
└─ task-workflow-lifecycle/
   ├─ task-workflow-lifecycle.otel.canvas
   ├─ board-session/
   │  └─ board-session.workflow.json      (spanPattern: "board.session")
   ├─ backlog-core-init/
   │  └─ backlog-core-init.workflow.json  (spanPattern: "backlog.core.init")
   └─ board-load/
      └─ board-load.workflow.json         (spanPattern: "kanban.load")
```

**board-session.workflow.json (parent span):**
```json
{
  "version": "1.0.0",
  "name": "Board Session",
  "spanPattern": "board.session",
  "mode": "span-tree",
  "scenarios": [
    {
      "id": "success-with-tasks",
      "priority": 1,
      "template": {
        "events": {
          "board.session.started": "Board session started",
          "panel.initialized": "Panel {{panel.id}} initialized",
          "backlog.core.init.started": "Initializing Core library",
          "backlog.core.init.complete": "Core initialized ({{fileCount}} files)",
          "kanban.loading": "Loading tasks from backlog",
          "kanban.loaded": "Loaded {{tasks.count}} tasks",
          "board.session.complete": "Session complete"
        },
        "summary": "Board ready: {{tasks.count}} tasks loaded"
      }
    }
  ]
}
```

> **Note:** The parent workflow lists events from child spans (`backlog.core.init.*`, `kanban.*`) for scenario matching purposes. This allows the parent to understand the full lifecycle even though the events are emitted in child spans.

**backlog-core-init.workflow.json (child span):**
```json
{
  "version": "1.0.0",
  "name": "Backlog Core Init",
  "spanPattern": "backlog.core.init",
  "mode": "span-tree",
  "scenarios": [
    {
      "id": "success",
      "priority": 1,
      "template": {
        "events": {
          "backlog.core.init.started": "Initializing Core library",
          "backlog.core.init.complete": "Core initialized ({{fileCount}} files, {{duration.ms}}ms)"
        },
        "summary": "Core ready: {{fileCount}} files"
      }
    },
    {
      "id": "skipped-already-initialized",
      "priority": 2,
      "template": {
        "events": {
          "backlog.core.init.started": "Checking Core status",
          "backlog.core.init.skipped": "Skipped: {{reason}}"
        },
        "summary": "Already initialized"
      }
    }
  ]
}
```

**board-load.workflow.json (child span):**
```json
{
  "version": "1.0.0",
  "name": "Board Load",
  "spanPattern": "kanban.load",
  "mode": "span-tree",
  "scenarios": [
    {
      "id": "success-with-tasks",
      "priority": 1,
      "template": {
        "events": {
          "kanban.loading": "Loading backlog (is backlog: {{is.backlog.project}})",
          "kanban.loaded": "Loaded {{tasks.count}} tasks (has more: {{has.more}})"
        },
        "summary": "Board loaded: {{tasks.count}} tasks"
      }
    }
  ]
}
```

**Key Implementation Details:**

1. **Parent span creates context:** The `board.session` span is created first and passed to child hooks via `parentSpan` prop
2. **Child spans link via context:** Child spans use `otelContext.with(parentContext, ...)` to establish parent-child relationship
3. **Each span validates independently:** The workflow system matches each span by `spanPattern` and validates its events
4. **Warning for missing workflows:** Without a workflow file, the system shows `(No workflow spanPattern matched span "X")` - this is the signal to create a workflow file for that span

**Code Pattern for Child Span Creation:**
```typescript
// In parent component
const boardSessionSpanRef = useRef<Span | null>(null);
boardSessionSpanRef.current = tracer.startSpan('board.session');

// Pass to child hook
useKanbanData({ parentSpan: boardSessionSpanRef.current });

// In child hook
const parentContext = parentSpan
  ? trace.setSpan(otelContext.active(), parentSpan)
  : otelContext.active();

return otelContext.with(parentContext, () =>
  tracer.startActiveSpan('kanban.load', async (span) => {
    span.addEvent('kanban.loading', { 'is.backlog.project': true });
    // ... load data ...
    span.addEvent('kanban.loaded', { 'tasks.count': tasks.length });
    span.end();
  })
);
```

---

## Migration Path

### Step 1: Add Span Names to Existing Instrumentation

Update existing code to use consistent span naming:

```typescript
// Before
const span = tracer.startSpan('process');

// After
const span = tracer.startSpan('payment-processing');
span.setAttribute('workflow.name', 'payment-processing');
```

### Step 2: Update Canvas Files

Add `pv.spanName` to canvas nodes:

```json
{
  "id": "payment",
  "pv": {
    "spanName": "payment-processing",
    "sources": ["src/payment/process.ts"]
  }
}
```

### Step 3: Implement HierarchicalWorkflowProcessor

Add to `packages/core/src/workflow/`:
- `hierarchical-processor.ts`
- `trace-mapper.ts`

### Step 4: Update React Components

Add support for visualizing nested workflow validations:

```typescript
<GraphRenderer
  canvas={canvas}
  activatedNodes={activatedNodes}
  workflowValidations={validations}
  onNodeClick={(nodeId) => {
    // Show nested workflow validation details
    const validation = findValidationForNode(nodeId, validations);
    setSelectedValidation(validation);
  }}
/>
```

### Step 5: CLI Support

Add CLI command to validate traces against workflows:

```bash
# Validate a trace from production
privu validate-trace --trace-id abc123 --backend http://jaeger:16686

# Output shows hierarchical validation results
✓ checkout-flow (scenario: happy-path)
  ✓ payment-processing (scenario: standard-auth)
    ✓ fraud-analysis (scenario: low-risk)
```

---

## Related Documentation

- [Workflow Templates Design](./WORKFLOW_TEMPLATES_DESIGN.md) - Base workflow template system
- [Storyboard Discovery Design](./STORYBOARD_DISCOVERY_DESIGN.md) - File organization
- [OpenTelemetry Overview](./OPENTELEMETRY_OVERVIEW.md) - OTEL integration basics
- [Event Recording System](./EVENT_RECORDING_SYSTEM.md) - Event capture and sessions

---

## Open Questions

1. **Cross-Repository Workflows**: How do we handle workflows that span multiple services/repos?
   - Option A: Reference external workflows by URL
   - Option B: Publish workflow packages to npm
   - Option C: Centralized workflow registry

2. **Workflow Versioning**: How do we version workflows alongside code?
   - Should workflows be versioned independently?
   - Should span attributes specify workflow version?

3. **Circular Dependencies**: How do we prevent circular workflow references?
   - Detect cycles during validation?
   - Enforce maximum recursion depth?

4. **Dynamic Workflows**: How do we handle workflows that vary by configuration?
   - Use scenario conditions to handle variations?
   - Multiple workflow files for different configs?

---

## Next Steps

- [ ] Implement `HierarchicalWorkflowProcessor`
- [ ] Add `TraceToCanvasMapper`
- [ ] Update canvas schema to include `pv.spanName`
- [ ] Add CLI command for trace validation
- [ ] Write integration tests for nested workflows
- [ ] Document span naming conventions
- [ ] Create example project demonstrating composition
