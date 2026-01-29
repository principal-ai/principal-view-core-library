# Understanding Storyboards, Workflows, and Scenarios

## Overview

Principal View organizes telemetry documentation using a three-level hierarchy that aligns with OpenTelemetry concepts while providing clear organizational structure.

## The Hierarchy

```
Storyboard (Feature Area)
└── Workflow (Span - Use Case Variation)
    └── Scenario (Conditional Template - Execution Outcome)
```

---

## Storyboard: Feature Area

**Purpose:** Organizational grouping of related workflows for a feature area.

**One storyboard per feature/capability.**

### Examples:
- `checkout/` - All checkout-related workflows
- `user-authentication/` - All auth-related workflows
- `data-validation/` - All validation workflows

### Structure:
```
.principal-views/
  └── checkout/                    ← Storyboard folder
      ├── checkout.otel.canvas     ← Event schemas for all workflows
      ├── workflow-1/              ← First workflow
      ├── workflow-2/              ← Second workflow
      └── workflow-3/              ← Third workflow
```

**OTEL Mapping:** NOT an OTEL concept - purely organizational.

---

## Workflow: Use Case Variation (Span)

**Purpose:** Represents ONE span in your code - a specific use case or variation of the feature.

**One workflow folder per span name.**

### When to Create Separate Workflows

Create separate workflow folders (different span names) when operations are **semantically different**:

#### ✅ Create Separate Workflows For:

**1. Different Operations with Different Events**
```
payment-processing/
├── credit-card-payment/       ← Emits: card.authorized, card.captured
├── bank-transfer-payment/     ← Emits: ach.verified, ach.settled
└── digital-wallet-payment/    ← Emits: wallet.authorized, wallet.completed
```

**2. Different Implementations/Services**
```
data-import/
├── csv-import/                ← Uses CSV parser, emits: csv.parsed, rows.validated
├── json-import/               ← Uses JSON parser, emits: json.parsed, schema.validated
└── xml-import/                ← Uses XML parser, emits: xml.parsed, dtd.validated
```

**3. Different User Journeys**
```
user-registration/
├── standard-signup/           ← Email verification flow
├── oauth-signup/              ← Third-party OAuth flow
└── enterprise-sso/            ← SAML/SSO flow
```

#### ❌ Don't Create Separate Workflows For:

**Parameter Variations** (Use attributes + scenarios instead)
```
# WRONG - Don't do this:
order-processing/
├── process-order-small/       ← Just different order size
├── process-order-medium/
└── process-order-large/

# RIGHT - Use one workflow with scenarios:
order-processing/
└── process-order/             ← One workflow, size as attribute
    └── process-order.workflow.json
        scenarios:
          - small-order-success
          - large-order-success
          - order-timeout
```

**High-Cardinality Values** (NEVER in span names)
```
# WRONG - NEVER do this:
checkout/
├── checkout-user-12345/       ← User ID = high cardinality
├── checkout-session-abc/      ← Session ID = high cardinality
└── checkout-order-98765/      ← Order ID = high cardinality

# RIGHT - Use attributes:
checkout/
└── checkout-process/
    Instrumentation:
    span.setAttribute('user.id', userId);
    span.setAttribute('order.id', orderId);
```

### OTEL Best Practice: Low-Cardinality Span Names

✅ **Good:** 5-20 workflow folders per storyboard (finite, semantic variations)
❌ **Bad:** Hundreds/thousands of workflows (indicates high-cardinality data in span names)

**If you're thinking "I need a workflow for every X":**
- Every user? ❌ Use attributes
- Every order? ❌ Use attributes
- Every payment method? ✅ If they're semantically different operations
- Every error type? ❌ Use scenarios

---

## Scenario: Execution Outcome (Conditional Template)

**Purpose:** Different outcomes within the SAME workflow, based on what events/attributes appear.

**Multiple scenarios per workflow.json file.**

### When to Use Scenarios

Use scenarios for **different execution paths within the same operation**:

#### ✅ Use Scenarios For:

**1. Success vs Failure Outcomes**
```json
{
  "scenarios": [
    {
      "id": "success",
      "condition": { "requires": ["payment.completed"] }
    },
    {
      "id": "payment-declined",
      "condition": { "requires": ["payment.failed"] }
    }
  ]
}
```

**2. Different Result Types**
```json
{
  "scenarios": [
    {
      "id": "complete-success",
      "condition": {
        "requires": ["validation.complete"],
        "assertions": { "errors.count": { "$eq": 0 } }
      }
    },
    {
      "id": "partial-success",
      "condition": {
        "requires": ["validation.complete"],
        "assertions": { "warnings.count": { "$gt": 0 } }
      }
    }
  ]
}
```

**3. Timeout/Performance Variations**
```json
{
  "scenarios": [
    {
      "id": "fast-completion",
      "condition": {
        "requires": ["processing.complete"],
        "assertions": { "duration.ms": { "$lt": 1000 } }
      }
    },
    {
      "id": "slow-completion",
      "condition": {
        "assertions": { "duration.ms": { "$gte": 5000 } }
      }
    },
    {
      "id": "timeout",
      "condition": { "requires": ["processing.timeout"] }
    }
  ]
}
```

**4. Data Volume Variations**
```json
{
  "scenarios": [
    {
      "id": "small-batch",
      "condition": {
        "assertions": { "records.count": { "$lt": 100 } }
      }
    },
    {
      "id": "large-batch",
      "condition": {
        "assertions": { "records.count": { "$gte": 10000 } }
      }
    }
  ]
}
```

---

## Complete Example

### Storyboard: Payment Processing

```
.principal-views/
  └── payment-processing/                    ← Storyboard (feature area)
      ├── payment-processing.otel.canvas     ← Event schemas
      │
      ├── credit-card-payment/               ← Workflow (use case variation)
      │   ├── credit-card-payment.workflow.json
      │   │   scenarios:                      ← Scenarios (execution outcomes)
      │   │     - authorized-and-captured (success)
      │   │     - card-declined (failure)
      │   │     - fraud-detected (failure)
      │   │     - timeout (failure)
      │   ├── execution-1.otel.json
      │   └── execution-2.otel.json
      │
      ├── ach-payment/                       ← Different workflow (different operation)
      │   ├── ach-payment.workflow.json
      │   │   scenarios:
      │   │     - verified-and-settled (success)
      │   │     - insufficient-funds (failure)
      │   │     - invalid-account (failure)
      │   └── execution-1.otel.json
      │
      └── refund-processing/                 ← Different workflow (different operation)
          ├── refund-processing.workflow.json
          │   scenarios:
          │     - refund-completed (success)
          │     - refund-failed (failure)
          │     - partial-refund (partial success)
          └── execution-1.otel.json
```

### Instrumentation

```typescript
// Workflow 1: Credit Card Payment
function processCreditCardPayment(cardDetails) {
  const span = tracer.startSpan('credit-card-payment');  // ← Workflow name
  span.setAttribute('card.type', cardDetails.type);       // ← Attributes

  span.addEvent('payment.started');

  if (authorized) {
    span.addEvent('card.authorized');
    span.addEvent('payment.captured');                    // ← Triggers "success" scenario
  } else if (declined) {
    span.addEvent('card.declined', { reason });           // ← Triggers "declined" scenario
  } else if (fraudDetected) {
    span.addEvent('fraud.detected');                      // ← Triggers "fraud" scenario
  }

  span.end();
}

// Workflow 2: ACH Payment (different operation, different events)
function processACHPayment(bankDetails) {
  const span = tracer.startSpan('ach-payment');           // ← Different workflow
  span.setAttribute('account.type', bankDetails.type);

  span.addEvent('ach.verification.started');
  span.addEvent('ach.verified');                          // ← Different events than credit card
  span.addEvent('ach.settled');

  span.end();
}
```

---

## Decision Tree

### "Should I create a new workflow folder or add a scenario?"

```
Is this a different OPERATION?
├─ YES: Different events emitted?
│  ├─ YES → Create new workflow folder
│  └─ NO → Ask: Different implementation/service?
│     ├─ YES → Create new workflow folder
│     └─ NO → Add scenario to existing workflow
│
└─ NO: Same operation, different outcome?
   └─ Add scenario to existing workflow
```

### Examples:

**Q: Credit card vs ACH payment?**
- Different events? YES (card.authorized vs ach.verified)
- **A: Separate workflows** ✅

**Q: Success vs declined payment?**
- Different events? YES (payment.completed vs payment.failed)
- Same operation? YES
- **A: Scenarios in same workflow** ✅

**Q: Small order vs large order?**
- Different events? NO (same events, different attribute values)
- **A: Scenarios in same workflow** ✅

**Q: Visa vs Mastercard?**
- Different events? NO (same card processing)
- Different operation? NO (just parameter variation)
- **A: One workflow, card type as attribute** ✅

---

## File Organization Rules

### Workflow Folder Contents

Each workflow folder MUST contain:
1. **One workflow.json file** (named to match the folder)
2. **Multiple execution files** (.otel.json)

```
credit-card-payment/                        ← Workflow folder
├── credit-card-payment.workflow.json      ← Workflow definition (required)
├── execution-success-1.otel.json          ← Captured telemetry
├── execution-declined-1.otel.json
└── execution-fraud-1.otel.json
```

### Naming Conventions

**Storyboard folder:**
- Kebab-case
- Describes feature area
- Examples: `payment-processing`, `user-authentication`, `data-validation`

**Workflow folder:**
- Kebab-case
- Matches span name (with dots/colons converted to dashes)
- Examples: `credit-card-payment`, `csv-import`, `standard-signup`

**Workflow.json file:**
- Must match folder name
- Example: `credit-card-payment/credit-card-payment.workflow.json`

**Execution files:**
- Descriptive names
- Examples: `execution-1.otel.json`, `test-success.otel.json`, `prod-trace-abc123.otel.json`

---

## OTEL Alignment Summary

| Principal View Concept | OTEL Concept | Cardinality | Examples |
|----------------------|--------------|-------------|----------|
| **Storyboard** | None (organizational) | Low (5-20) | payment-processing, user-auth |
| **Workflow** | Span name | Low (5-20 per storyboard) | credit-card-payment, ach-payment |
| **Scenario** | Conditional template | Low-Medium (3-10 per workflow) | success, declined, timeout |
| **Execution file** | Trace data | High (any number) | execution-1.otel.json, trace-abc.otel.json |

**Key Principle:** Keep span names (workflows) low-cardinality. Use attributes for high-cardinality data.

---

## Common Anti-Patterns

### ❌ Anti-Pattern 1: High-Cardinality Workflows

```
# WRONG
checkout/
├── checkout-user-12345/
├── checkout-user-12346/
├── checkout-user-12347/
└── ... (thousands more)
```

**Fix:** One workflow, user.id as attribute

### ❌ Anti-Pattern 2: Over-Splitting Workflows

```
# WRONG - These are just parameter variations
order-processing/
├── process-order-priority-high/
├── process-order-priority-medium/
├── process-order-priority-low/
├── process-order-region-us/
├── process-order-region-eu/
└── ...
```

**Fix:** One workflow, priority/region as attributes, scenarios for outcomes

### ❌ Anti-Pattern 3: Under-Splitting Workflows

```
# WRONG - These are semantically different operations
data-import/
└── import-data/
    import-data.workflow.json
      scenarios:
        - csv-import-success
        - csv-import-failure
        - json-import-success
        - json-import-failure
        - xml-import-success
        - xml-import-failure
        - api-import-success
        - api-import-failure
```

**Fix:** Split into separate workflows (csv-import, json-import, xml-import, api-import)

### ❌ Anti-Pattern 4: Scenarios for Different Operations

```json
// WRONG - These should be separate workflows
{
  "scenarios": [
    { "id": "credit-card-success" },
    { "id": "credit-card-declined" },
    { "id": "ach-success" },
    { "id": "ach-failed" },
    { "id": "paypal-success" }
  ]
}
```

**Fix:** Separate workflows for each payment method

---

## Quick Reference

### Create a Storyboard When:
- Starting documentation for a new feature area
- Grouping related operations together

### Create a Workflow When:
- Implementing a semantically different operation
- Different events are emitted
- Different services/implementations are used
- **But:** Operation has low cardinality (finite number of variations)

### Create a Scenario When:
- Same operation, different outcome
- Same span, different event combinations
- Different execution paths (success/failure/timeout)
- Different attribute values affect rendering

---

## Summary

**Storyboard** = Feature area (organizational)
**Workflow** = Span name (use case variation with low cardinality)
**Scenario** = Conditional template (execution outcome)

**Golden Rule:** If you're creating workflows for high-cardinality data (user IDs, session IDs, order numbers), you're doing it wrong. Use attributes instead.
