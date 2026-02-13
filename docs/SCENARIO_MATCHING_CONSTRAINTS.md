# Scenario Matching Constraints and Design Principles

**Status:** Design Guide
**Created:** 2026-02-13
**Related:** [WORKFLOW_TEMPLATES_DESIGN.md](./WORKFLOW_TEMPLATES_DESIGN.md), [STORYBOARDS_WORKFLOWS_SCENARIOS_GUIDE.md](./STORYBOARDS_WORKFLOWS_SCENARIOS_GUIDE.md)

## Overview

This document defines the mathematical and logical constraints that ensure scenario matching is unambiguous and maintainable. It provides design principles for authoring workflow scenarios that avoid ambiguity and implementation guidance for validation.

## Core Principle

**A trace must match at most one scenario within a workflow.**

This requires that scenarios within the same workflow be **mutually exclusive** based on their required events. The matching system uses first-match-wins priority ordering, but well-designed scenarios should not rely heavily on priority to resolve ambiguity.

---

## The Mathematical Constraint

For any two scenarios A and B within the same workflow:

```
A ⊄ B  AND  B ⊄ A
```

Where:
- **A ⊄ B** means A is NOT a strict subset of B
- **B ⊄ A** means B is NOT a strict subset of A

### Definition: Strict Subset

Set A is a **strict subset** of set B if:
1. All elements of A are in B: `∀x ∈ A, x ∈ B`
2. A has fewer elements than B: `|A| < |B|`

### What This Allows

✅ **Scenarios can overlap** (share common events)
✅ **Scenarios can intersect** (some events in both)
✅ **All scenarios are subsets of the canvas** (draw from the same event vocabulary)

### What This Prohibits

❌ **One scenario cannot be entirely contained within another**
❌ **Subset/superset relationships between scenarios**

---

## Examples

### ✅ VALID: Overlapping but Mutually Exclusive

```yaml
# Canvas defines: {oauth.google, oauth.github, oauth.complete,
#                  email.sent, email.verified, password.set,
#                  user.created, session.started}

scenarios:
  - id: "oauth-google-signup"
    priority: 10
    condition:
      requires: ["oauth.google", "oauth.complete", "user.created", "session.started"]

  - id: "email-password-signup"
    priority: 20
    condition:
      requires: ["email.verified", "password.set", "user.created", "session.started"]
```

**Analysis:**
- **Shared events:** `{user.created, session.started}`
- **Distinguishing events:** `oauth.google + oauth.complete` vs `email.verified + password.set`
- **Set relationship:** Neither is a subset of the other ✓
- **Result:** A trace with all 4 events from scenario 1 will match ONLY scenario 1

### ❌ INVALID: Subset Relationship

```yaml
scenarios:
  - id: "basic-checkout"
    priority: 10
    condition:
      requires: ["cart.viewed", "checkout.started"]

  - id: "complete-checkout"
    priority: 20
    condition:
      requires: ["cart.viewed", "checkout.started", "payment.complete"]
```

**Analysis:**
- **Set relationship:** `{cart.viewed, checkout.started} ⊂ {cart.viewed, checkout.started, payment.complete}` ✗
- **Problem:** A trace with all 3 events matches BOTH scenarios
- **Root cause:** "basic-checkout" is a strict subset of "complete-checkout"
- **Fix required:** These should not be separate scenarios

### ✅ VALID: Multiple Execution Paths

```yaml
scenarios:
  - id: "successful-payment"
    priority: 10
    condition:
      requires: ["payment.authorized", "order.confirmed", "email.sent"]

  - id: "failed-payment"
    priority: 20
    condition:
      requires: ["payment.declined", "error.logged", "email.sent"]

  - id: "pending-review"
    priority: 30
    condition:
      requires: ["payment.flagged", "review.queued", "email.sent"]
```

**Analysis:**
- **Shared events:** `{email.sent}`
- **Distinguishing events:** Each has mutually exclusive payment outcomes
  - `payment.authorized` vs `payment.declined` vs `payment.flagged` (only one can occur)
- **Set relationship:** None is a subset of another ✓
- **Result:** Clearly distinguishable execution paths

---

## Design Principles

### 1. Same Events = Same Scenario

**If two scenarios have the same required events, they are the same scenario.**

Use attributes or template conditionals to differentiate behavior, not separate scenarios.

#### ❌ Anti-Pattern: Splitting on Attributes
```yaml
# WRONG - Don't create multiple scenarios for same events:
scenarios:
  - id: "express-checkout"
    condition:
      requires: ["checkout.complete"]
      assertions:
        checkout.type: { $eq: "express" }

  - id: "standard-checkout"
    condition:
      requires: ["checkout.complete"]
      assertions:
        checkout.type: { $eq: "standard" }
```

#### ✅ Better: Single Scenario with Templates
```yaml
# RIGHT - Use ONE scenario with template conditionals:
scenarios:
  - id: "checkout-complete"
    condition:
      requires: ["checkout.complete"]
    template:
      introduction: "{{checkout.type}} checkout completed"
      flow:
        - "Cart total: {{cart.total}}"
        - if: "checkout.type === 'express'"
          then: "Express checkout: {{payment.method}}"
          else: "Standard checkout: Address validation + Payment"
```

### 2. Different Events = Different Execution Paths

**Create separate scenarios when fundamentally different events indicate different execution paths.**

#### ✅ Good Example: Mutually Exclusive Flows
```yaml
scenarios:
  - id: "oauth-google"
    condition:
      requires: ["oauth.google.complete", "user.created"]

  - id: "oauth-github"
    condition:
      requires: ["oauth.github.complete", "user.created"]

  - id: "email-password"
    condition:
      requires: ["email.verified", "password.set", "user.created"]
```

**Why this works:**
- `oauth.google.complete`, `oauth.github.complete`, and `email.verified + password.set` are mutually exclusive
- Each represents a fundamentally different authentication method
- No subset relationships

### 3. Progressive Steps vs Different Paths

**Distinguish between "incomplete execution" and "different execution path".**

#### ❌ Anti-Pattern: Treating Incomplete as a Scenario
```yaml
# WRONG - These are just different completion levels:
scenarios:
  - id: "full-onboarding"
    requires: ["user.created", "email.verified", "profile.completed", "preferences.set"]

  - id: "partial-onboarding"
    requires: ["user.created", "email.verified", "profile.completed"]

  - id: "minimal-onboarding"
    requires: ["user.created", "email.verified"]
```

**Problem:** If a user completes all 4 steps, is that "full onboarding" or is it the same flow that just got further?

#### ✅ Better: Single Scenario with Optional Steps
```yaml
# RIGHT - One scenario, template shows progress:
scenarios:
  - id: "user-onboarding"
    condition:
      requires: ["user.created", "email.verified"]  # Minimum required
    template:
      introduction: "User onboarding for {{user.email}}"
      flow:
        - "✓ User created"
        - "✓ Email verified"
        - if: "profile.completed"
          then: "✓ Profile completed"
        - if: "preferences.set"
          then: "✓ Preferences configured"
```

### 4. When to Use `requires`

Use `condition.requires` to distinguish between:

✅ **Mutually exclusive execution paths:**
- OAuth vs email/password authentication
- Credit card vs bank transfer payment
- Success vs error vs timeout outcomes

❌ **Do NOT use for:**
- Incomplete vs complete executions (use template conditionals)
- Optional features (use template conditionals)
- Attribute-based variations (use template conditionals or assertions)

### 5. When to Use `assertions`

Use `condition.assertions` for:

✅ **Genuine execution path variations based on values:**
```yaml
scenarios:
  - id: "high-value-order"
    condition:
      requires: ["order.placed"]
      assertions:
        order.total: { $gte: 10000 }  # Triggers different workflow
```

✅ **Feature flags or modes:**
```yaml
scenarios:
  - id: "experimental-feature-enabled"
    condition:
      requires: ["feature.used"]
      assertions:
        feature.experimental: { $eq: true }
```

❌ **Do NOT use for:**
- Simple display variations (use template variables instead)
- Event presence checks (use `requires` instead)

---

## Validation Algorithm

### Runtime Validation

Validate scenarios when loading workflow templates to catch design errors early.

```typescript
function validateScenarios(scenarios: WorkflowScenario[]): void {
  for (let i = 0; i < scenarios.length; i++) {
    for (let j = i + 1; j < scenarios.length; j++) {
      const A = new Set(scenarios[i].condition.requires || []);
      const B = new Set(scenarios[j].condition.requires || []);

      // Check if A is a strict subset of B
      if (isStrictSubset(A, B)) {
        throw new ValidationError(
          `Scenario "${scenarios[i].id}" is a strict subset of "${scenarios[j].id}". ` +
          `This creates ambiguous matching. Either:\n` +
          `  1. Merge these into a single scenario with template conditionals\n` +
          `  2. Add distinguishing required events to make them mutually exclusive\n` +
          `  3. Move subset detection to template conditionals instead of separate scenarios`
        );
      }

      // Check if B is a strict subset of A
      if (isStrictSubset(B, A)) {
        throw new ValidationError(
          `Scenario "${scenarios[j].id}" is a strict subset of "${scenarios[i].id}". ` +
          `This creates ambiguous matching. Either:\n` +
          `  1. Merge these into a single scenario with template conditionals\n` +
          `  2. Add distinguishing required events to make them mutually exclusive\n` +
          `  3. Move subset detection to template conditionals instead of separate scenarios`
        );
      }
    }
  }
}

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
```

### Error Messages

Provide clear, actionable error messages:

```
❌ Validation Error: Ambiguous scenario matching

Scenario "basic-checkout" is a strict subset of "complete-checkout":
  basic-checkout requires: ["cart.viewed", "checkout.started"]
  complete-checkout requires: ["cart.viewed", "checkout.started", "payment.complete"]

A trace with all 3 events will match both scenarios.

Recommended fixes:
  1. Merge into one scenario and use template conditionals:

     scenario: "checkout"
       requires: ["cart.viewed", "checkout.started"]
       template:
         flow:
           - "Cart viewed"
           - "Checkout started"
           - if: "payment.complete"
             then: "✓ Payment completed"
             else: "⏸ Awaiting payment"

  2. Make them truly different by adding distinguishing events:

     scenario: "abandoned-checkout"
       requires: ["cart.viewed", "checkout.started", "session.timeout"]

     scenario: "complete-checkout"
       requires: ["cart.viewed", "checkout.started", "payment.complete"]
```

---

## Implementation Considerations

### Current State (web-ade workflow-matcher.ts)

The current implementation in `web-ade/src/lib/workflow-matcher.ts`:

1. ✅ Uses priority-based first-match algorithm
2. ✅ Checks if ALL required events are present (`Array.every()`)
3. ✅ Falls back to default scenarios
4. ❌ Does NOT validate subset relationships
5. ❌ Does NOT support `excludes` yet
6. ❌ Does NOT support `assertions` yet
7. ❌ Does NOT support glob patterns yet

### Recommended Enhancements

#### 1. Add Scenario Validation (High Priority)
```typescript
// In workflow-matcher.ts or a new validator module
export function validateWorkflowScenarios(
  workflows: (DiscoveredWorkflow | DiscoveredWorkflowWithContent)[]
): ValidationResult {
  const errors: string[] = [];

  for (const workflow of workflows) {
    if (!('content' in workflow)) continue;

    const scenarios = workflow.content.scenarios || [];

    try {
      validateScenarios(scenarios);
    } catch (error) {
      errors.push(`Workflow "${workflow.name}": ${error.message}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

#### 2. Improve Matching Logic (Medium Priority)

Add support for:
- `excludes` - Events that must NOT be present
- `assertions` - Attribute-based routing
- `any` - Match if ANY required event is present (vs ALL)

#### 3. Add Authoring-Time Validation (Medium Priority)

Create a CLI tool or IDE integration that validates workflow files on save:

```bash
$ npx principal-view validate .principal-views/

✓ checkout-flow.workflow.json
  ✓ Scenario "successful-checkout" is valid
  ✓ Scenario "failed-checkout" is valid
  ✓ Scenario "timeout" is valid
  ✓ No subset relationships detected

✗ user-registration.workflow.json
  ✗ Scenario "partial-signup" is a subset of "full-signup"

2 files validated, 1 error found
```

---

## FAQ

### Q: Can scenarios overlap in their required events?

**A: Yes!** Scenarios can share common events as long as they have distinguishing events that prevent subset relationships.

```yaml
# Both scenarios share "user.created" but have different auth events
- id: "oauth"
  requires: ["oauth.complete", "user.created"]

- id: "password"
  requires: ["email.verified", "password.set", "user.created"]
```

### Q: What if my instrumentation is inconsistent and events are sometimes missing?

**A: Fix the instrumentation.** Don't use scenarios to work around instrumentation problems. If an event is sometimes missing:

1. **Investigate why** - Is it a bug? A timing issue?
2. **Make instrumentation consistent** - Ensure events always fire when they should
3. **Use attributes for variations** - If the absence is intentional (feature flag, conditional path), use attributes

### Q: What about optional features or steps?

**A: Use template conditionals, not separate scenarios.**

```yaml
# WRONG - Don't create scenarios for optional steps
scenarios:
  - id: "with-profile-photo"
    requires: ["user.created", "photo.uploaded"]
  - id: "without-profile-photo"
    requires: ["user.created"]

# RIGHT - Use template conditionals
scenarios:
  - id: "user-onboarding"
    requires: ["user.created"]
    template:
      flow:
        - "User created: {{user.email}}"
        - if: "photo.uploaded"
          then: "Profile photo: {{photo.url}}"
```

### Q: Should I use priority to resolve subset scenarios?

**A: No.** Priority is a tiebreaker for edge cases, not a solution for poor scenario design. If you find yourself relying on priority to distinguish scenarios, that's a sign they should be redesigned.

### Q: What about progressive workflows where steps build on each other?

**A: That's ONE scenario with progressive steps, not multiple scenarios.**

Use template conditionals to show which steps were completed:

```yaml
scenario: "checkout-flow"
  requires: ["checkout.started"]  # Minimum entry point
  template:
    flow:
      - "✓ Checkout started"
      - if: "address.validated"
        then: "✓ Address validated"
      - if: "payment.processed"
        then: "✓ Payment processed"
      - if: "order.confirmed"
        then: "✓ Order confirmed"
```

### Q: Can I use `excludes` to create mutually exclusive scenarios?

**A: Yes, but use with caution.** The `excludes` feature (when implemented) can help enforce mutual exclusion:

```yaml
scenarios:
  - id: "successful-flow"
    condition:
      requires: ["operation.complete"]
      excludes: ["*.error", "*.timeout"]

  - id: "error-flow"
    condition:
      requires: ["operation.started", "*.error"]
```

However, it's often clearer to rely on the presence of distinguishing events rather than the absence of events.

---

## Summary

**Key Takeaways:**

1. **Scenarios must be mutually exclusive** - No scenario can be a strict subset of another
2. **Same events = same scenario** - Use template conditionals for variations
3. **Different events = different scenarios** - Only when representing fundamentally different execution paths
4. **Proper instrumentation is essential** - Don't use scenarios to work around instrumentation issues
5. **Validate early** - Catch subset relationships at authoring time, not runtime
6. **Attributes for data variations** - Use assertions for genuine routing based on values
7. **Templates for optional steps** - Use conditionals within templates, not separate scenarios

**This design ensures:**
- ✅ Unambiguous trace matching
- ✅ Maintainable workflow definitions
- ✅ Clear mental model for authors
- ✅ Predictable behavior for users
- ✅ Easier debugging and validation

---

## Related Documentation

- [WORKFLOW_TEMPLATES_DESIGN.md](./WORKFLOW_TEMPLATES_DESIGN.md) - Overall workflow template architecture
- [STORYBOARDS_WORKFLOWS_SCENARIOS_GUIDE.md](./STORYBOARDS_WORKFLOWS_SCENARIOS_GUIDE.md) - When to create workflows vs scenarios
- [SCENARIO_SPECIFIC_EXECUTIONS.md](./SCENARIO_SPECIFIC_EXECUTIONS.md) - Saved test runs per scenario
- [WORKFLOW_VALIDATION.md](./WORKFLOW_VALIDATION.md) - Validation system design
