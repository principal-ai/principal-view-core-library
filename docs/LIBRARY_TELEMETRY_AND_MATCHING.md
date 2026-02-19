# Library Telemetry and Scenario Matching

**Date**: February 18, 2026
**Status**: 🚧 Design Phase
**Related**: REGISTERED_TRACE_REDESIGN.md (in electron-app repo)

---

## Overview

This document explains how telemetry from instrumented libraries appears in traces and how the system matches spans and events to workflows and scenarios.

---

## How Library Telemetry Appears in Traces

### Standard OpenTelemetry Structure

When a service uses an instrumented library, both appear in the **same resourceSpan** (same process) but as **different scopeSpans** (different instrumentation libraries).

#### Example: web-ade Server Using auth-library

```json
{
  "resourceSpans": [
    {
      // ONE resource = the running process (web-ade server)
      "resource": {
        "attributes": [
          { "key": "service.name", "value": "web-ade" },
          { "key": "service.version", "value": "1.0.0" },
          { "key": "host.name", "value": "localhost" }
        ]
      },

      // MULTIPLE scopes = different instrumentation libraries
      "scopeSpans": [

        // Server's own instrumentation
        {
          "scope": {
            "name": "web-ade-instrumentation",
            "version": "1.0.0"
          },
          "spans": [
            { "spanId": "span1", "name": "handleRequest" },
            { "spanId": "span2", "name": "processCheckout" }
          ]
        },

        // Library's instrumentation (same process, different scope)
        {
          "scope": {
            "name": "auth-library",
            "version": "2.1.0"
          },
          "spans": [
            { "spanId": "span3", "name": "checkPermissions" },
            { "spanId": "span4", "name": "validateToken" }
          ]
        }
      ]
    }
  ]
}
```

### Key Points

1. **One resourceSpan** - because it's one running process
2. **Multiple scopeSpans** - one per instrumentation library
3. **Scope name + version identifies the library** - used for registry lookup
4. **All under same service** - `service.name` is still the server's name

---

## Registry Lookup: Scope → Schematics

The **scope name and version** serves as the **lookup key** to find which schematics package to match against.

### Lookup Flow

```
Scope in OTLP Trace → Registry Lookup → Schematics Package
```

#### Example:

**OTLP Trace arrives with:**
```json
{
  "scope": {
    "name": "auth-library",
    "version": "2.1.0"
  },
  "spans": [...]
}
```

**Registry lookup:**
```
Query: "auth-library@2.1.0"
Returns: Schematics package containing:
  - Storyboards (collections of workflows)
    - auth-login.otel.canvas
    - auth-permissions.otel.canvas
  - Workflows (sets of spans with expected events)
```

**Key Insight**: No need for explicit `pv.storyboard.id` attributes in the trace data - the scope identity itself tells you which schematics package to use.

---

## Matching Hierarchy

### Overall Flow

```
1. Scope (name@version)
     ↓
2. Registry → Schematics Package (storyboards containing workflows)
     ↓
3. Match Spans → Workflow Span Definitions
     ↓ (for matched spans)
4. Match Events Within Span → Scenarios
```

### Terminology

- **Workflow**: A set of expected spans and their event definitions
- **Storyboard**: A collection of workflows (no direct telemetry association)
- **Scenario**: A specific sequence of events within a workflow span
- **Events**: Timestamped annotations within a single span's lifetime

---

## Understanding Spans vs Events

### Child Spans (Hierarchical Relationships)

Spans form a tree structure with parent-child relationships:

```
Root Span: handleRequest (spanId: "1")
  ├─ Child Span: checkAuth (spanId: "2", parentSpanId: "1")
  │    └─ Child Span: queryUserDB (spanId: "3", parentSpanId: "2")
  └─ Child Span: processPayment (spanId: "4", parentSpanId: "1")
       └─ Child Span: callPaymentAPI (spanId: "5", parentSpanId: "4")
```

Each child span is a **separate span** with its own ID, duration, attributes, etc.

### Span Events (Annotations Within a Span)

Events are **timestamped annotations** that occur **within a single span's lifetime**:

```json
{
  "spanId": "1",
  "name": "processPayment",
  "startTime": "T0",
  "endTime": "T100",
  "events": [
    {
      "time": "T10",
      "name": "validation.started",
      "attributes": { ... }
    },
    {
      "time": "T20",
      "name": "validation.passed",
      "attributes": { ... }
    },
    {
      "time": "T50",
      "name": "payment.submitted",
      "attributes": { ... }
    },
    {
      "time": "T90",
      "name": "payment.confirmed",
      "attributes": { ... }
    }
  ]
}
```

Events are **points in time** within the span, not separate operations.

---

## Event Matching Scope: Single Span Only

**Design Decision**: When matching events to scenarios, we only consider events **within the matched span itself**, not events from child spans.

### Rationale

```
Span: processPayment (matched workflow span)
  events: [
    "validation.started",
    "validation.passed",
    "payment.submitted",
    "payment.confirmed"
  ]
  ↓
  Match ONLY these events → Scenario
  ↓
  Result: "successful-payment" scenario

Child Span: callPaymentAPI (separately evaluated)
  events: [
    "api.request.sent",
    "api.response.received"
  ]
  ↓
  Match independently if this span matches a workflow span
```

### Benefits

- **Clean, isolated matching** - each span is self-contained
- **Composable** - scenarios at each level of the hierarchy
- **Clear boundaries** - events from different spans don't intermix
- **Independent evaluation** - child spans match their own workflows/scenarios

### Alternative Considered

Matching events from span + all descendants was considered but rejected because:
- More complex matching logic
- Events from different spans intermixed
- Harder to reason about
- Workflows already define span structure/hierarchy

---

## Matching Result Categories

After processing a trace through scope-based matching, spans fall into these categories:

### 1. **Workflow + Scenario Match** ✅

- Span matched a workflow span definition
- Events within that span matched a scenario
- **Status**: Fully matched
- **Example**: `processPayment` span with events matching "successful-payment" scenario

### 2. **Workflow Match, No Scenario** (Workflow-Orphaned)

- Span matched a workflow span definition
- BUT events didn't match any scenario in that workflow
- **Status**: Workflow-orphaned spans
- **Example**: `processPayment` span with unexpected event sequence
- **Why**: Events occurred in wrong order, missing events, extra unexpected events

### 3. **No Workflow Match** (Unmatched)

- Span didn't match any workflow span definition in the schematics
- **Status**: Unmatched spans
- **Example**: Ad-hoc spans not defined in any workflow
- **Why**: Not part of registered workflows, instrumentation added outside workflows

---

## Mapping to RegisteredTrace Structure

These matching results map to the `RegisteredTrace` structure defined in REGISTERED_TRACE_REDESIGN.md (electron-app repo):

```typescript
{
  resources: [
    {
      serviceIdentifier: "http://localhost:3000",
      serviceName: "web-ade",
      scopes: [
        {
          scope: { name: "web-ade-instrumentation", version: "1.0.0" },
          // Scope-level matching determines which schematics to use
          spanIds: ["span1", "span2"]
        },
        {
          scope: { name: "auth-library", version: "2.1.0" },
          // Different scope → different schematics package
          spanIds: ["span3", "span4"]
        }
      ]
    }
  ],

  // Category 1: Workflow + Scenario matches
  scenarioMatches: [
    {
      storyboardId: "auth-permissions",
      scenarioId: "check-permissions-success",
      scopeName: "auth-library",  // Which scope matched
      matchedSpans: [...]
    }
  ],

  // Category 2: Workflow-orphaned spans
  storyboardMatches: [
    {
      storyboardId: "auth-permissions",
      scopeName: "auth-library",
      orphanedSpans: [
        {
          spanId: "span4",
          reason: "no-scenario-match"  // Events didn't match any scenario
        }
      ]
    }
  ],

  // Category 3: Unmatched spans
  unmatchedSpans: {
    spans: [
      {
        spanId: "span5",
        reason: "no-workflow-match"  // Didn't match any workflow span definition
      }
    ]
  }
}
```

---

## Future Concept: Multi-Span Workflows

### Current Limitation

Currently, scenario matching is limited to events **within a single span**. However, some scenarios may need to match events across multiple related spans.

### Example Use Case

**User Registration Flow** that spans multiple operations:

```
Parent Span: registerUser
  events: [
    "registration.started",
    "registration.completed"  // ← Want to match this
  ]

  Child Span: validateEmail
    events: [
      "email.validated"  // ← AND this
    ]

  Child Span: createUserRecord
    events: [
      "user.created"  // ← AND this
    ]
```

To match the complete "successful-registration" scenario, we need events from **all three spans**.

### Proposed Solutions

#### Option 1: New Workflow Type - "Composite Workflows"

Define workflows that explicitly declare multi-span event matching:

```yaml
workflow:
  type: composite  # New type
  spans:
    - name: registerUser
      events: [registration.started, registration.completed]
    - name: validateEmail
      events: [email.validated]
    - name: createUserRecord
      events: [user.created]

  scenarios:
    - id: successful-registration
      events:
        - span: registerUser
          event: registration.started
        - span: validateEmail
          event: email.validated
        - span: createUserRecord
          event: user.created
        - span: registerUser
          event: registration.completed
```

**Pros**:
- Explicit about multi-span intent
- Backward compatible (existing workflows unchanged)
- Clear scenario definitions reference specific spans

**Cons**:
- New workflow type to implement
- More complex matching logic

#### Option 2: Workflow Span Groups

Allow workflows to define "span groups" where scenarios can access events from multiple spans:

```yaml
workflow:
  spanGroups:
    - id: registration-group
      rootSpan: registerUser
      childSpans: [validateEmail, createUserRecord]

  scenarios:
    - id: successful-registration
      spanGroup: registration-group
      events: [
        registration.started,
        email.validated,
        user.created,
        registration.completed
      ]
```

**Pros**:
- Less radical change
- Groups spans logically
- Reusable groups

**Cons**:
- Less explicit about which event comes from which span
- Potential ambiguity if events have same name

#### Option 3: Hierarchical Scenarios

Scenarios that compose child span scenarios:

```yaml
workflow:
  spans:
    - name: registerUser
      scenarios:
        - id: registration-lifecycle
          events: [registration.started, registration.completed]
          requiresChildScenarios:
            - validateEmail: email-validation-success
            - createUserRecord: user-creation-success
```

**Pros**:
- Hierarchical composition matches span hierarchy
- Child scenarios reusable
- Clear parent-child relationship

**Cons**:
- Doesn't solve accessing child events directly
- More complex scenario definitions

### Decision Required

This is a **future enhancement**. Current system uses single-span event matching only.

Before implementing, we need to:
1. Identify real use cases requiring multi-span scenarios
2. Evaluate complexity vs benefit tradeoff
3. Design schema extensions
4. Consider performance implications (matching across span trees)

---

## Example: Complete Flow

### Setup

- Service: `web-ade @ localhost:3000`
- Uses library: `auth-library@2.1.0`
- Registry has schematics for both

### OTLP Trace Arrives

```json
{
  "resourceSpans": [{
    "resource": {
      "attributes": [
        { "key": "service.name", "value": "web-ade" }
      ]
    },
    "scopeSpans": [
      {
        "scope": { "name": "web-ade-instrumentation", "version": "1.0.0" },
        "spans": [
          {
            "spanId": "span1",
            "name": "handleCheckout",
            "events": [
              { "name": "checkout.started" },
              { "name": "checkout.validated" },
              { "name": "checkout.completed" }
            ]
          }
        ]
      },
      {
        "scope": { "name": "auth-library", "version": "2.1.0" },
        "spans": [
          {
            "spanId": "span2",
            "name": "checkPermissions",
            "events": [
              { "name": "permissions.requested" },
              { "name": "permissions.granted" }
            ]
          },
          {
            "spanId": "span3",
            "name": "validateToken",
            "events": [
              { "name": "token.validated" },
              { "name": "unexpected.error" }  // Not in any scenario
            ]
          }
        ]
      }
    ]
  }]
}
```

### Processing

1. **Extract scopes**:
   - `web-ade-instrumentation@1.0.0`
   - `auth-library@2.1.0`

2. **Registry lookup**:
   - `web-ade-instrumentation@1.0.0` → web-ade schematics
   - `auth-library@2.1.0` → auth-library schematics

3. **Match spans to workflows**:
   - `span1: handleCheckout` → matches web-ade workflow
   - `span2: checkPermissions` → matches auth-library workflow
   - `span3: validateToken` → matches auth-library workflow

4. **Match events to scenarios** (within each span):
   - `span1` events → matches "successful-checkout" scenario ✅
   - `span2` events → matches "permissions-granted" scenario ✅
   - `span3` events → NO scenario match (unexpected error) ⚠️

### Result

```typescript
{
  resources: [
    {
      serviceIdentifier: "http://localhost:3000",
      scopes: [
        { scope: { name: "web-ade-instrumentation", version: "1.0.0" } },
        { scope: { name: "auth-library", version: "2.1.0" } }
      ]
    }
  ],

  scenarioMatches: [
    {
      storyboardId: "checkout-flows",
      scenarioId: "successful-checkout",
      scopeName: "web-ade-instrumentation",
      matchedSpans: [{ spanId: "span1", ... }]
    },
    {
      storyboardId: "auth-flows",
      scenarioId: "permissions-granted",
      scopeName: "auth-library",
      matchedSpans: [{ spanId: "span2", ... }]
    }
  ],

  storyboardMatches: [
    {
      storyboardId: "auth-flows",
      scopeName: "auth-library",
      orphanedSpans: [
        {
          spanId: "span3",
          spanName: "validateToken",
          reason: "no-scenario-match"  // Events didn't match any scenario
        }
      ]
    }
  ],

  unmatchedSpans: {
    spans: []
  }
}
```

---

## Summary

1. **Library telemetry** appears as separate `scopeSpans` within the same `resourceSpan`
2. **Scope name + version** is the lookup key for schematics in the registry
3. **Workflows** define expected spans; **scenarios** define expected event sequences
4. **Event matching** is scoped to events within a single span only
5. **Three categories**: workflow+scenario match, workflow-orphaned, unmatched
6. **Future enhancement**: Multi-span workflows for scenarios spanning multiple operations
