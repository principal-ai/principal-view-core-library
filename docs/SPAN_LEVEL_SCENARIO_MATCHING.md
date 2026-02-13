# Span-Level Scenario Matching Design

**Status:** Design Proposal
**Created:** 2026-02-13
**Related:** [SCENARIO_MATCHING_CONSTRAINTS.md](./SCENARIO_MATCHING_CONSTRAINTS.md)

## Overview

This document describes a fundamental redesign of how workflows match scenarios, moving from trace-level matching with explicit `condition.requires` arrays to span-level matching with events derived from template definitions.

## The Problem

### Current Approach (Trace-Level)

```json
{
  "version": "1.0.0",
  "canvas": "payment.otel.canvas",
  "scenarios": [
    {
      "id": "successful-payment",
      "priority": 10,
      "condition": {
        "requires": ["payment.authorized", "order.confirmed"]
      },
      "template": {
        "events": {
          "payment.authorized": "Payment authorized: {{amount}}",
          "order.confirmed": "Order confirmed: {{orderId}}"
        }
      }
    }
  ]
}
```

**Issues:**

1. **Duplication** - `condition.requires` and `template.events` contain the same information
2. **Drift** - They can get out of sync
3. **Trace-level matching** - One workflow per trace, can't handle multiple concerns
4. **Ambiguous scoping** - Unclear which spans a workflow applies to

### Example Trace

```
Trace: E-commerce Order
├── Span: http.server.request
│   ├── Event: payment.authorized
│   ├── Event: inventory.reserved
│   └── Event: order.confirmed
```

**Current behavior:**
- Entire trace matches ONE workflow scenario
- Can't separately describe payment, inventory, and order concerns
- All events treated equally regardless of which part of execution they came from

---

## The New Design

### 1. Remove `condition.requires`

Events required for matching are **automatically derived** from `template.events` keys.

**Before:**
```json
{
  "condition": {
    "requires": ["payment.authorized", "order.confirmed"]
  },
  "template": {
    "events": {
      "payment.authorized": "...",
      "order.confirmed": "..."
    }
  }
}
```

**After:**
```json
{
  "template": {
    "events": {
      "payment.authorized": "...",
      "order.confirmed": "..."
    }
  }
}
```

A scenario matches when **ALL** events in `template.events` are present.

### 2. Add `spanPattern` to Workflow

Workflows explicitly declare which spans they apply to:

```json
{
  "version": "1.0.0",
  "canvas": "payment.otel.canvas",
  "spanPattern": "payment.*",
  "scenarios": [...]
}
```

**Pattern Syntax:**
- Glob-style patterns: `payment.*`, `*.authorize`, `checkout.process`
- Matched against span names

### 3. Span-Level Matching

Workflows match individual spans, not entire traces:

```typescript
function matchWorkflows(trace: Trace): WorkflowMatch[] {
  const matches: WorkflowMatch[] = [];

  for (const span of trace.allSpans) {
    for (const workflow of workflows) {
      // Check if span name matches workflow pattern
      if (matchesPattern(span.name, workflow.spanPattern)) {
        // Get events within this span subtree
        const spanEvents = getEventsInSpanSubtree(span);

        // Try to match a scenario
        const scenario = selectScenario(workflow, spanEvents);
        if (scenario) {
          matches.push({ workflow, span, scenario });
        }
      }
    }
  }

  return matches;
}
```

---

## Complete Example

### Instrumented Code

```typescript
// Custom domain span
const span = tracer.startSpan('payment.authorize');

try {
  // Events within the span
  span.addEvent('payment.started', { amount: 99.99, method: 'card' });

  const result = await stripeClient.charge(card, amount);

  span.addEvent('payment.authorized', {
    transactionId: result.id,
    amount: result.amount
  });

  span.addEvent('order.confirmed', { orderId: order.id });

} finally {
  span.end();
}
```

### Resulting Trace Structure

```
Trace: E-commerce Order [traceId: abc123]
├── Span: http.server.request [duration: 450ms]
│   ├── Span: payment.authorize [duration: 120ms]  ← Workflow matches HERE
│   │   ├── Event: payment.started
│   │   ├── Event: payment.authorized
│   │   └── Event: order.confirmed
│   │
│   ├── Span: inventory.reserve [duration: 80ms]  ← Different workflow
│   │   ├── Event: stock.checked
│   │   └── Event: items.reserved
│   │
│   └── Span: notification.send [duration: 50ms]  ← Another workflow
│       ├── Event: email.queued
│       └── Event: email.sent
```

### Workflow Definition

```json
{
  "version": "1.0.0",
  "canvas": "payment.otel.canvas",
  "name": "Payment Processing",
  "description": "Workflow for payment authorization scenarios",
  "spanPattern": "payment.*",
  "mode": "timeline",
  "scenarioSelection": "first-match",
  "scenarios": [
    {
      "id": "successful-payment",
      "priority": 10,
      "description": "Payment successfully authorized",
      "template": {
        "introduction": "Payment processing for {{amount}}",
        "events": {
          "payment.started": "Started payment: {{method}}",
          "payment.authorized": "✓ Authorized transaction {{transactionId}}",
          "order.confirmed": "✓ Order confirmed: {{orderId}}"
        },
        "summary": "Payment completed successfully"
      }
    },
    {
      "id": "failed-payment",
      "priority": 20,
      "description": "Payment authorization failed",
      "template": {
        "introduction": "Payment processing for {{amount}}",
        "events": {
          "payment.started": "Started payment: {{method}}",
          "payment.declined": "✗ Payment declined: {{reason}}",
          "error.logged": "Error logged: {{errorCode}}"
        },
        "summary": "Payment failed"
      }
    }
  ]
}
```

**Matching Logic:**
1. Find span with name matching `"payment.*"` → `payment.authorize`
2. Get events in that span → `{payment.started, payment.authorized, order.confirmed}`
3. Check scenarios:
   - `successful-payment` requires `{payment.started, payment.authorized, order.confirmed}` ✓ **MATCH**
   - `failed-payment` requires `{payment.started, payment.declined, error.logged}` ✗ missing events
4. Render using `successful-payment` template

---

## Benefits

### 1. Single Source of Truth

No duplication - the events you template are the events you require.

```json
// Before: maintained in two places
"condition": { "requires": ["a", "b", "c"] },
"template": { "events": { "a": "...", "b": "...", "c": "..." }}

// After: one place
"template": { "events": { "a": "...", "b": "...", "c": "..." }}
```

### 2. Multiple Workflows Per Trace

Each workflow describes a focused concern:

```
payment.authorize span → Payment Workflow
inventory.reserve span → Inventory Workflow
notification.send span → Notification Workflow
```

One trace can have multiple workflow views, each describing a different aspect.

### 3. Clear Boundaries

`spanPattern` explicitly declares scope:

```json
{ "spanPattern": "payment.*" }  // Only payment spans
{ "spanPattern": "inventory.*" } // Only inventory spans
```

No ambiguity about which workflow applies where.

### 4. Better Instrumentation Incentives

Requiring custom domain spans drives better observability:

**Without custom spans:**
```
Span: http.server.request [duration: 450ms]
├── Event: payment.authorized
└── Event: inventory.reserved
```
❌ Can't tell how long payment took
❌ Can't tell if operations were parallel or sequential
❌ Can't identify which subsystem is slow

**With custom spans:**
```
Span: http.server.request [duration: 450ms]
├── Span: payment.authorize [duration: 120ms]
│   └── Event: payment.authorized
└── Span: inventory.reserve [duration: 80ms]
    └── Event: inventory.reserved
```
✓ Payment took 120ms
✓ Operations ran sequentially
✓ Payment is the bottleneck
✓ Each subsystem has measurable boundaries

### 5. Simplified Mental Model

**One concept instead of two:**
- Events you template = Events required for matching
- No cognitive overhead maintaining `requires` array

---

## Validation Rules

### 1. Mutual Exclusivity (No Subsets)

Within a workflow, no scenario's event set can be a strict subset of another's.

#### ❌ Invalid

```json
{
  "scenarios": [
    {
      "id": "basic-checkout",
      "template": {
        "events": {
          "cart.viewed": "...",
          "checkout.started": "..."
        }
      }
    },
    {
      "id": "complete-checkout",
      "template": {
        "events": {
          "cart.viewed": "...",
          "checkout.started": "...",
          "payment.complete": "..."
        }
      }
    }
  ]
}
```

**Problem:** `{cart.viewed, checkout.started} ⊂ {cart.viewed, checkout.started, payment.complete}`

A span with all 3 events would match BOTH scenarios.

**Error Message:**
```
❌ Validation Error: Ambiguous scenario matching

Scenario "basic-checkout" is a strict subset of "complete-checkout":
  basic-checkout events: ["cart.viewed", "checkout.started"]
  complete-checkout events: ["cart.viewed", "checkout.started", "payment.complete"]

A span with all 3 events will match both scenarios.

Recommended fixes:
  1. Merge into one scenario and use template conditionals:

     {
       "template": {
         "events": {
           "cart.viewed": "...",
           "checkout.started": "..."
         },
         "flow": [
           "Cart viewed",
           "Checkout started",
           "{{#if payment.complete}}✓ Payment completed{{/if}}"
         ]
       }
     }

  2. Make them mutually exclusive by adding distinguishing events:

     Scenario: "abandoned-checkout"
       events: ["cart.viewed", "checkout.started", "session.timeout"]

     Scenario: "complete-checkout"
       events: ["cart.viewed", "checkout.started", "payment.complete"]
```

#### ✓ Valid

```json
{
  "scenarios": [
    {
      "id": "successful-payment",
      "template": {
        "events": {
          "payment.authorized": "...",
          "order.confirmed": "..."
        }
      }
    },
    {
      "id": "failed-payment",
      "template": {
        "events": {
          "payment.declined": "...",
          "error.logged": "..."
        }
      }
    }
  ]
}
```

**Why valid:** Neither event set is a subset of the other. They're mutually exclusive because `payment.authorized` and `payment.declined` don't occur together.

### 2. No Overlapping Span Patterns

No two workflows can have overlapping `spanPattern` values.

#### ❌ Invalid

```json
// workflow-1.json
{ "spanPattern": "payment.*" }

// workflow-2.json
{ "spanPattern": "payment.authorize" }
```

**Problem:** `payment.authorize` matches both patterns.

#### ✓ Valid

```json
// workflow-1.json
{ "spanPattern": "payment.authorize.*" }

// workflow-2.json
{ "spanPattern": "payment.refund.*" }
```

### 3. Template Must Have Events

Every scenario must define at least one event template.

#### ❌ Invalid

```json
{
  "template": {
    "introduction": "Payment processing",
    "events": {}
  }
}
```

#### ✓ Valid

```json
{
  "template": {
    "introduction": "Payment processing",
    "events": {
      "payment.authorized": "Payment authorized"
    }
  }
}
```

### 4. Deprecated: condition.requires

If `condition.requires` is present, validation fails with migration guidance.

**Error Message:**
```
❌ Deprecated Field: condition.requires is no longer supported

The "condition.requires" field has been removed. Required events are now
automatically derived from "template.events" keys.

Migration:
  Before:
    {
      "condition": { "requires": ["payment.authorized", "order.confirmed"] },
      "template": { "events": { "payment.authorized": "...", "order.confirmed": "..." }}
    }

  After:
    {
      "template": { "events": { "payment.authorized": "...", "order.confirmed": "..." }}
    }

Simply remove the "condition.requires" field - the same events are already
defined in "template.events".
```

---

## Fallback Behavior

### Spans Without Matching Workflows

For spans that don't match any workflow's `spanPattern`, we provide **canvas highlighting**:

```typescript
function getCanvasHighlighting(span: Span): Canvas[] {
  const canvases: Canvas[] = [];
  const spanEvents = getEventsInSpan(span);

  for (const canvas of allCanvases) {
    const canvasEvents = getCanvasEvents(canvas);
    const overlap = intersection(spanEvents, canvasEvents);

    if (overlap.length > 0) {
      canvases.push({
        canvas,
        highlightedEvents: overlap
      });
    }
  }

  return canvases;
}
```

**Example:**
```
Span: http.server.request
├── Event: payment.authorized
└── Event: inventory.reserved

No workflow matches this span (no spanPattern: "http.server.request")
But we can show:
  - payment.otel.canvas (highlights: payment.authorized)
  - inventory.otel.canvas (highlights: inventory.reserved)
```

This provides value even without curated workflows.

---

## Implementation Changes

### 1. Type Changes

**packages/core/src/workflow/types.ts:**

```typescript
export interface WorkflowTemplate {
  version: string;
  canvas: string;
  name: string;
  description: string;

  // NEW: Required field
  spanPattern: string;

  mode: WorkflowMode;
  scenarioSelection: 'first-match' | 'manual';
  scenarios: WorkflowScenario[];
  formatting?: FormattingOptions;
}

export interface WorkflowScenario {
  id: string;
  priority: number;
  description: string;

  // REMOVED: condition field
  // condition: ScenarioCondition;

  template: ScenarioTemplate;
}
```

### 2. Matching Logic

**packages/core/src/workflow/scenario-matcher.ts:**

```typescript
/**
 * Get required events for a scenario (derived from template)
 */
export function getRequiredEvents(scenario: WorkflowScenario): string[] {
  return Object.keys(scenario.template?.events || {});
}

/**
 * Select scenario for a specific span
 */
export function selectScenarioForSpan(
  template: WorkflowTemplate,
  span: OtelSpan,
  spanEvents: OtelEvent[]
): ScenarioMatchResult {
  // Sort scenarios by priority
  const sorted = [...template.scenarios].sort((a, b) => a.priority - b.priority);

  for (const scenario of sorted) {
    const requiredEvents = getRequiredEvents(scenario);

    // Check if ALL required events are present in span
    const hasAllEvents = requiredEvents.every(eventName =>
      spanEvents.some(e => e.name === eventName)
    );

    if (hasAllEvents) {
      return { scenario, span };
    }
  }

  throw new Error(
    `No scenario matched for span "${span.name}". ` +
    `Events in span: ${spanEvents.map(e => e.name).join(', ')}`
  );
}

/**
 * Check if span name matches pattern (glob-style)
 */
export function matchesSpanPattern(spanName: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\*/g, '.*');  // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(spanName);
}
```

### 3. Validation Logic

**packages/core/src/workflow/validator.ts:**

Add new validation checks:

```typescript
/**
 * Check for deprecated condition.requires field
 */
private checkDeprecatedFields(context: WorkflowValidationContext): WorkflowViolation[] {
  const violations: WorkflowViolation[] = [];
  const { workflow, workflowPath } = context;

  workflow.scenarios.forEach((scenario, idx) => {
    if ((scenario as any).condition?.requires) {
      violations.push({
        ruleId: 'workflow-deprecated-condition-requires',
        severity: 'error',
        file: workflowPath,
        path: `scenarios[${idx}].condition.requires`,
        message: 'condition.requires is no longer supported',
        impact: 'Required events are now automatically derived from template.events',
        suggestion: 'Remove condition.requires field - events are inferred from template.events keys',
        fixable: true,
      });
    }
  });

  return violations;
}

/**
 * Check for subset relationships between scenarios
 */
private checkScenarioSubsets(context: WorkflowValidationContext): WorkflowViolation[] {
  const violations: WorkflowViolation[] = [];
  const { workflow, workflowPath } = context;

  const scenarios = workflow.scenarios;

  for (let i = 0; i < scenarios.length; i++) {
    for (let j = i + 1; j < scenarios.length; j++) {
      const eventsA = new Set(Object.keys(scenarios[i].template?.events || {}));
      const eventsB = new Set(Object.keys(scenarios[j].template?.events || {}));

      // Check if A is a strict subset of B
      if (isStrictSubset(eventsA, eventsB)) {
        violations.push({
          ruleId: 'workflow-scenario-subset',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${i}]`,
          message: `Scenario "${scenarios[i].id}" is a strict subset of "${scenarios[j].id}"`,
          impact: 'A span with all events from both scenarios will match both, causing ambiguity',
          suggestion: this.generateSubsetFixSuggestion(scenarios[i], scenarios[j]),
          fixable: false,
        });
      }

      // Check if B is a strict subset of A
      if (isStrictSubset(eventsB, eventsA)) {
        violations.push({
          ruleId: 'workflow-scenario-subset',
          severity: 'error',
          file: workflowPath,
          path: `scenarios[${j}]`,
          message: `Scenario "${scenarios[j].id}" is a strict subset of "${scenarios[i].id}"`,
          impact: 'A span with all events from both scenarios will match both, causing ambiguity',
          suggestion: this.generateSubsetFixSuggestion(scenarios[j], scenarios[i]),
          fixable: false,
        });
      }
    }
  }

  return violations;
}

/**
 * Check if set A is a strict subset of set B
 */
function isStrictSubset(A: Set<string>, B: Set<string>): boolean {
  // A is a strict subset of B if:
  // 1. All elements of A are in B
  // 2. A has fewer elements than B
  if (A.size >= B.size) return false;

  for (const item of A) {
    if (!B.has(item)) return false;
  }

  return true;
}

/**
 * Check that spanPattern is valid
 */
private checkSpanPattern(context: WorkflowValidationContext): WorkflowViolation[] {
  const violations: WorkflowViolation[] = [];
  const { workflow, workflowPath } = context;

  if (!workflow.spanPattern) {
    violations.push({
      ruleId: 'workflow-span-pattern-required',
      severity: 'error',
      file: workflowPath,
      path: 'spanPattern',
      message: 'Missing required field "spanPattern"',
      impact: 'Cannot determine which spans this workflow applies to',
      suggestion: 'Add spanPattern field (e.g., "payment.*", "checkout.process")',
      fixable: false,
    });
  }

  return violations;
}
```

---

## Migration Guide

### For Existing Workflows

**Step 1: Add `spanPattern`**

Identify which spans your workflow should apply to:

```json
{
  "canvas": "payment.otel.canvas",
  "spanPattern": "payment.*"  // ADD THIS
}
```

**Step 2: Remove `condition.requires`**

The events are already in `template.events`:

```diff
  {
    "id": "successful-payment",
-   "condition": {
-     "requires": ["payment.authorized", "order.confirmed"]
-   },
    "template": {
      "events": {
        "payment.authorized": "...",
        "order.confirmed": "..."
      }
    }
  }
```

**Step 3: Run Validation**

```bash
npx @principal-ai/cli workflow validate
```

Fix any subset relationship errors.

### For Instrumentation

**Add custom domain spans:**

```typescript
// Before: flat events
async function processCheckout(order) {
  span.addEvent('payment.started');
  await chargeCard();
  span.addEvent('payment.authorized');
  span.addEvent('inventory.reserved');
}

// After: structured spans
async function processCheckout(order) {
  const paymentSpan = tracer.startSpan('payment.authorize');
  paymentSpan.addEvent('payment.started');
  await chargeCard();
  paymentSpan.addEvent('payment.authorized');
  paymentSpan.end();

  const inventorySpan = tracer.startSpan('inventory.reserve');
  inventorySpan.addEvent('stock.checked');
  inventorySpan.addEvent('items.reserved');
  inventorySpan.end();
}
```

---

## Complementarity with Auto-Instrumentation

This design works **alongside** auto-instrumentation:

```
Span: http.server.request (auto-instrumented by framework)
├── Span: db.query (auto-instrumented by ORM)
├── Span: payment.authorize (custom domain span)  ← Workflow matches here
│   ├── Span: http.client.request (auto-instrumented)
│   │   └── to Stripe API
│   └── Event: payment.authorized (custom)
└── Span: db.query (auto-instrumented)
```

**Benefits:**
- Auto-instrumentation: Framework/library observability for free
- Custom spans: Business domain structure
- Workflows: Human-readable narratives for domain spans

You get all three layers working together.

---

## Open Questions

1. **Span subtree events**: Should matching consider events in child spans, or only direct events?
   - Option A: Only direct span events
   - Option B: Include entire subtree (current assumption)

2. **Pattern syntax**: Glob or regex?
   - Current: Glob (`payment.*`)
   - Alternative: Full regex (`^payment\.(authorize|refund)$`)

3. **Multiple patterns**: Should a workflow support multiple patterns?
   ```json
   { "spanPattern": ["payment.*", "billing.*"] }
   ```

4. **Wildcard patterns**: Should we support `"*"` to match all spans?
   - Use case: Generic error workflow that applies everywhere

---

## Summary

**Key Changes:**
1. ✅ Remove `condition.requires` - derive from `template.events`
2. ✅ Add `spanPattern` - explicit span-to-workflow association
3. ✅ Span-level matching - multiple workflows per trace
4. ✅ Subset validation - enforce mutual exclusivity
5. ✅ Canvas fallback - highlight canvases for unmatched spans

**Benefits:**
- Single source of truth (no duplication)
- Clear boundaries (explicit spanPattern)
- Multiple concerns per trace (span-level matching)
- Better instrumentation practices (custom span incentive)
- Simpler mental model (events = templates)

**Trade-offs:**
- Requires custom domain spans (more upfront work)
- But drives better observability overall
- And provides immediate value through workflows
