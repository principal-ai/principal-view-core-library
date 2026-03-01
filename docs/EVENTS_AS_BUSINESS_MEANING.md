# Events as Business Meaning: Scenario Matching Design

**Status:** Proposal
**Created:** 2026-02-26
**Author:** Claude (with human review)
**Related:** [SCENARIO_MATCHING_CONSTRAINTS.md](./SCENARIO_MATCHING_CONSTRAINTS.md), [OPENTELEMETRY_OVERVIEW.md](./OPENTELEMETRY_OVERVIEW.md)

## Executive Summary

This document proposes that Principal View's scenario matching system should treat **event names as carriers of business meaning**, rather than adopting standard OpenTelemetry conventions designed for query-based observability backends.

The core insight: Standard OTel practices (stable event names + rich attributes) are optimized for **querying stored telemetry**. Principal View does something different - it **assigns traces to predefined scenarios** for visualization. This distinction changes what "good instrumentation" looks like.

---

## Two Different Worlds

### Traditional Observability Infrastructure

```
Instrument → Collect → Store → Query Later
```

In this model:
- Millions of traces are stored in a backend (Jaeger, Honeycomb, Tempo)
- Engineers query by filtering on attributes: `status_code = 500 AND user.tier = "premium"`
- Low-cardinality event names enable aggregation; high-cardinality attributes enable drill-down
- You don't know what questions you'll ask, so you capture everything

**Attributes are essential** because filtering happens after the fact on stored data.

### Principal View's Model

```
Instrument → Match to Scenario → Visualize
```

In this model:
- Scenarios are predefined by the author
- A trace matches exactly ONE scenario based on which events are present
- The match happens once, at ingest time
- You know exactly what paths exist because you authored them

**Event names are sufficient** because matching happens against a known, bounded set of scenarios.

---

## The Case for Events as Business Meaning

### Scenarios ARE the Business Interpretation

In Principal View, scenarios represent distinct business-meaningful paths through a system:

- "OAuth login succeeded"
- "Password login succeeded"
- "Login failed - invalid credentials"
- "Login failed - account locked"

These aren't just different attribute values on the same event - they're **fundamentally different stories** about what happened. The event names should reflect that.

### Instrumentation as Authoring

When you create a Principal View canvas and workflows, you're not passively observing arbitrary telemetry. You're **designing a visualization system**. The instrumentation is part of that design:

```typescript
// These events are authored to match specific scenarios
span.addEvent('auth.login.success.oauth');      // → matches "OAuth Login" scenario
span.addEvent('auth.login.success.password');   // → matches "Password Login" scenario
span.addEvent('auth.login.failed.credentials'); // → matches "Invalid Credentials" scenario
span.addEvent('auth.login.failed.locked');      // → matches "Account Locked" scenario
```

This is not "event name proliferation" - it's **completeness**. Each scenario has a corresponding event.

### Deterministic Templates

When events encode business meaning, templates become simple and predictable:

```json
{
  "id": "oauth-login-success",
  "description": "User authenticated via OAuth provider",
  "priority": 1,
  "template": {
    "summary": "✅ OAuth login successful",
    "events": {
      "auth.login.success.oauth": "OAuth authentication completed via {{provider}}",
      "session.created": "Session established for user {{userId}}"
    }
  }
}
```

No conditionals needed. The events listed in `template.events` define what this scenario matches - a trace must contain all these events. The event names themselves tell us which scenario we're in.

---

## Why Standard OTel Practices Don't Directly Apply

### Different Infrastructure, Different Needs

| Aspect | Query-Based Backends | Principal View |
|--------|---------------------|----------------|
| **Primary operation** | Filter stored traces | Match to predefined scenario |
| **When matching happens** | After storage, on demand | At ingest, once |
| **Cardinality concern** | Event names must be low-cardinality for aggregation | Event names bounded by scenario count |
| **Attribute role** | Essential for filtering | Contextual data for display |
| **Unknown questions** | Must support arbitrary queries | Scenarios are known upfront |

### The "Queryability" Argument Doesn't Apply

Standard OTel guidance says:
> "Use stable event names so you can aggregate. Use attributes so you can filter."

But Principal View doesn't aggregate events or filter by attributes. It matches traces to scenarios. The querying infrastructure that makes attributes valuable **doesn't exist in this context**.

### Cardinality is Bounded

"Event name proliferation" is a concern when:
- You might have thousands of variations
- Names are generated dynamically
- Aggregation becomes impossible

In Principal View:
- Variations are bounded by authored scenario count
- Names are intentionally designed
- There is no aggregation layer to break

---

## Recommended Approach: Event-Driven Scenario Design

### Principle: One Scenario = One Unique Event Set

Design your instrumentation so that each scenario is uniquely identified by the combination of events that fire:

```typescript
// Token validation - emit different events for different business outcomes
function validateToken(token: Token): ValidationResult {
  const span = tracer.startSpan('token.validate');

  try {
    const decoded = jwt.verify(token);
    const expiresIn = decoded.exp - Date.now();

    if (expiresIn < REFRESH_THRESHOLD) {
      // This IS a different business outcome - emit a different event
      span.addEvent('token.valid.expiring', { expiresIn });
      return { valid: true, shouldRefresh: true };
    } else {
      span.addEvent('token.valid.fresh', { expiresIn });
      return { valid: true, shouldRefresh: false };
    }
  } catch (error) {
    span.addEvent('token.invalid', { reason: error.message });
    return { valid: false };
  }
}
```

### Corresponding Workflow

```json
{
  "version": "1.0.0",
  "canvas": ".principal-views/token-validation.otel.canvas",
  "mode": "span-tree",
  "spanPattern": "api.auth.token-validate",
  "name": "Token Validation",
  "description": "JWT token validation with expiry checking",
  "scenarios": [
    {
      "id": "token-fresh",
      "description": "Token is valid with plenty of time remaining",
      "priority": 1,
      "template": {
        "summary": "✅ Token validated",
        "events": {
          "token.valid.fresh": "Token is valid ({{expiresIn}}ms remaining)"
        }
      }
    },
    {
      "id": "token-expiring",
      "description": "Token is valid but should be refreshed soon",
      "priority": 2,
      "template": {
        "summary": "⚠️ Token expiring soon",
        "events": {
          "token.valid.expiring": "Token is valid but expiring ({{expiresIn}}ms) - refresh recommended"
        }
      }
    },
    {
      "id": "token-invalid",
      "description": "Token validation failed",
      "priority": 3,
      "template": {
        "summary": "❌ Invalid token",
        "events": {
          "token.invalid": "Token validation failed: {{reason}}"
        }
      }
    }
  ]
}
```

Each scenario is matched when all the events in its `template.events` are present in the trace. Priority determines which scenario wins if multiple could match.

### Benefits of This Approach

1. **Clean mapping**: Each unique event set maps to one scenario
2. **Deterministic templates**: No conditionals needed
3. **Self-documenting instrumentation**: Reading the code shows what scenarios exist
4. **Testable through execution**: Run the code path, capture the events, verify scenario match

---

## The Role of Attributes

Attributes still have an important role, but it's **contextual data for display**, not scenario routing:

### Good Use of Attributes

```typescript
span.addEvent('order.completed', {
  orderId: order.id,
  total: order.total,
  itemCount: order.items.length,
  customerTier: customer.tier
});
```

```json
{
  "template": {
    "events": {
      "order.completed": "Order {{orderId}} completed: {{itemCount}} items, ${{total}}"
    }
  }
}
```

The attributes provide **details to display**, not routing decisions.

### When Attributes MIGHT Drive Scenarios

There are edge cases where attribute-based matching could be valuable:

**1. Instrumenting code you don't control:**
```typescript
// Third-party library emits generic events
thirdPartyLib.on('request', (data) => {
  span.addEvent('http.request', { method: data.method, status: data.status });
});
```

If you can't change the event names, attribute matching becomes necessary.

**2. Very high cardinality that would explode event names:**
```typescript
// 50 countries × 3 tiers = 150 event names? Probably too many.
span.addEvent('user.signup', { country: user.country, tier: user.tier });
```

**3. Continuous values where thresholds define scenarios:**
```typescript
// Order total is continuous - you don't want order.completed.42.50
span.addEvent('order.completed', { total: order.total });
```

These are legitimate cases for attribute-based matching. See [Future: Attribute Matching](#future-attribute-matching-for-edge-cases) below.

---

## Guidance: When to Emit Different Events

### Emit Different Events When:

**The outcomes represent different user stories:**
```typescript
// These are different stories worth telling separately
span.addEvent('payment.succeeded');
span.addEvent('payment.declined');
span.addEvent('payment.requires_action'); // 3D Secure
```

**The code paths are structurally different:**
```typescript
// OAuth and password auth have different steps
span.addEvent('auth.oauth.started');
span.addEvent('auth.oauth.callback');
// vs
span.addEvent('auth.password.submitted');
span.addEvent('auth.password.verified');
```

**You would show them differently in documentation:**
```typescript
// A cache hit and cache miss are documented separately
span.addEvent('cache.hit');
// vs
span.addEvent('cache.miss');
span.addEvent('origin.fetch');
```

### Use Same Event + Attributes When:

**The outcome is the same, just with different context:**
```typescript
// Still a successful order, just different details
span.addEvent('order.completed', {
  total: order.total,
  paymentMethod: order.payment.type
});
```

**The variation is purely informational:**
```typescript
// Token is valid either way, expiry is just metadata
span.addEvent('token.validated', {
  expiresIn: token.exp - Date.now(),
  issuer: token.iss
});
```

**Cardinality would be unmanageable:**
```typescript
// Don't create events for every HTTP status code
span.addEvent('http.response', { statusCode: res.status });
```

---

## Validator Recommendations

### Current Behavior (Strict Mode)

The validator rejects all template conditionals:
```
✗ Conditional syntax detected: {{#if shouldRefresh}}
```

### Recommended Adjustment

Keep strict mode as the default, but improve the error message to guide users:

```
✗ Conditional syntax detected: {{#if shouldRefresh}}

  This suggests two different scenarios are being merged into one.

  Recommended fix: Emit different events for different outcomes.

  Instead of:
    span.addEvent('token.authenticated', { shouldRefresh });

  Consider:
    if (shouldRefresh) {
      span.addEvent('token.authenticated.expiring');
    } else {
      span.addEvent('token.authenticated.fresh');
    }

  Then create separate scenarios for each event.

  If you cannot modify the instrumentation, see:
  docs/EVENTS_AS_BUSINESS_MEANING.md#future-attribute-matching-for-edge-cases
```

### Minor Conditionals (Optional Relaxation)

Consider allowing "decorative" conditionals that don't change the scenario's meaning:

```json
// Acceptable: null-safe display
"events": {
  "request.complete": "Request finished{{#if cached}} (from cache){{/if}}"
}
```

Detection heuristic: If the conditional output is ≤ N characters (e.g., 15), treat it as decorative.

---

## Future: Attribute Matching for Edge Cases

While event-driven scenarios should be the default, there are legitimate cases where attribute-based matching adds value. This section outlines a potential future enhancement.

### When Attribute Matching Would Help

**1. Third-party instrumentation you can't modify:**

A third-party library emits `http.request` with status codes as attributes. You want separate scenarios for success vs failure but can't change the event names.

**2. Continuous values with threshold-based scenarios:**

Order totals are continuous values. You want a "high-value order" scenario for orders over $10,000 but can't emit `order.completed.high-value` without knowing the threshold at instrumentation time.

**3. Feature flags or experimental paths:**

The same code path emits the same events, but a feature flag attribute determines which experience the user saw.

### Potential Implementation

If attribute matching is added, it should be co-located with the event template since attributes belong to events. The event template becomes an array of conditional renderings:

```json
{
  "id": "order-completed",
  "description": "Order processing completed",
  "priority": 1,
  "template": {
    "summary": "Order {{orderId}} completed",
    "events": {
      "order.completed": [
        {
          "match": { "total": { "$gte": 10000 } },
          "text": "💎 High-value order {{orderId}} (${{total}}) - flagged for review"
        },
        {
          "match": { "total": { "$lt": 10000 } },
          "text": "Order {{orderId}} completed (${{total}})"
        }
      ]
    }
  }
}
```

Or with a default case (entry without `match` catches unmatched):

```json
{
  "events": {
    "order.completed": [
      {
        "match": { "total": { "$gte": 10000 } },
        "text": "💎 High-value order {{orderId}} - flagged for review"
      },
      {
        "text": "Order {{orderId}} completed"
      }
    ]
  }
}
```

**Attribute Schema Definition**

To enable validation and UI generation, attributes used in matching should be defined at the event level with their bounds:

```json
{
  "events": {
    "order.completed": {
      "attributes": {
        "total": {
          "type": "number",
          "description": "Order total in dollars"
        },
        "paymentMethod": {
          "type": "enum",
          "values": ["credit_card", "bank_transfer", "crypto"],
          "description": "Payment method used"
        },
        "isFirstOrder": {
          "type": "boolean",
          "description": "Whether this is the customer's first order"
        }
      },
      "template": [
        {
          "match": { "total": { "$gte": 10000 } },
          "text": "💎 High-value order {{orderId}}"
        },
        {
          "text": "Order {{orderId}} completed"
        }
      ]
    }
  }
}
```

This serves multiple purposes:

1. **Validation**: The validator can check that match conditions are exhaustive against the defined bounds. For enums, it can verify all values are covered. For booleans, both `true` and `false` must be handled.

2. **UI Generation**: The visual validation UI can derive controls from the schema - dropdowns for enums, toggles for booleans, sliders for bounded numbers - allowing testers to explore all attribute combinations.

3. **Documentation**: The schema documents what attributes an event carries and what values are valid.

**Exhaustiveness Requirement**

When using attribute matching, conditions must be **exhaustive** - every possible value must match exactly one case. The validator enforces this by:

1. For **enums**: All defined values must be covered by match conditions
2. For **booleans**: Both `true` and `false` must be handled
3. For **numbers**: Either use complementary ranges or include a default case
4. **Default case**: An entry without `match` catches any unmatched values

This prevents scenarios from silently failing to render an event because no condition matched.

Key design principles:
- **Schema-driven**: Attribute bounds defined at event level
- **Exhaustive**: All possible attribute values must be handled (validated against schema)
- **UI-friendly**: Schema enables visual validation tooling
- **Co-located**: Attribute matching lives with the event template
- **Opt-in**: Simple string form still works when no matching needed

### When NOT to Use Attribute Matching

Even if available, prefer event-driven scenarios when:
- You control the instrumentation
- The variations represent different user stories
- The scenario count is manageable (< 20 variations)

---

## Migration Examples

### Before: Conditional Template

```json
{
  "id": "authenticated",
  "description": "User token is valid",
  "priority": 1,
  "template": {
    "summary": "✅ Authenticated",
    "events": {
      "token.check.authenticated": "Token valid{{#if shouldRefresh}} - refresh recommended{{/if}}"
    }
  }
}
```

**Validator Error:** Conditional syntax detected

### After: Event-Driven (Recommended)

**Step 1: Update instrumentation**
```typescript
// Before
span.addEvent('token.check.authenticated', { shouldRefresh });

// After
if (shouldRefresh) {
  span.addEvent('token.check.authenticated.expiring', { expiresIn });
} else {
  span.addEvent('token.check.authenticated.fresh', { expiresIn });
}
```

**Step 2: Create separate scenarios**
```json
{
  "scenarios": [
    {
      "id": "token-fresh",
      "description": "Token is valid with plenty of time remaining",
      "priority": 1,
      "template": {
        "summary": "✅ Token validated",
        "events": {
          "token.check.authenticated.fresh": "Token valid ({{expiresIn}}ms remaining)"
        }
      }
    },
    {
      "id": "token-expiring",
      "description": "Token is valid but expiring soon",
      "priority": 2,
      "template": {
        "summary": "⚠️ Token expiring",
        "events": {
          "token.check.authenticated.expiring": "Token expiring ({{expiresIn}}ms) - refresh recommended"
        }
      }
    }
  ]
}
```

### Alternative: Attribute Matching (Future - When Instrumentation Can't Change)

If attribute matching were implemented and you cannot modify the instrumentation, you would keep a single scenario but use conditional rendering within the event template:

```json
{
  "scenarios": [
    {
      "id": "token-authenticated",
      "description": "Token validation succeeded",
      "priority": 1,
      "template": {
        "summary": "Token validated",
        "events": {
          "token.check.authenticated": [
            {
              "match": { "shouldRefresh": true },
              "text": "⚠️ Token valid but expiring ({{expiresIn}}ms) - refresh recommended"
            },
            {
              "text": "✅ Token valid ({{expiresIn}}ms remaining)"
            }
          ]
        }
      }
    }
  ]
}
```

This keeps it as one scenario (same event set = same scenario) while allowing the display to vary based on attributes. The final entry without `match` acts as the default case, ensuring exhaustiveness.

---

## Summary

### Key Principles

1. **Events encode business meaning**: Different outcomes = different events
2. **Scenarios map to event sets**: Each scenario is identified by a unique combination of events
3. **Attributes provide context**: Used for display, not routing (by default)
4. **Instrumentation is authoring**: You're designing the visualization, not passively observing

### Decision Tree

```
Is this a different business outcome?
├── Yes → Emit a different event → Create a separate scenario
└── No → Same event, different context
         ├── Can you modify instrumentation?
         │   └── Yes → Consider if it's really the same outcome
         └── Need different scenarios anyway?
             └── Use attribute matching (future feature)
```

### Why This Differs from Standard OTel

| Standard OTel | Principal View |
|---------------|----------------|
| Optimized for query backends | Optimized for scenario matching |
| Attributes essential for filtering | Attributes supplementary for display |
| Event names must be low-cardinality | Event names bounded by scenario count |
| Unknown questions at query time | Scenarios known at authoring time |

We're not rejecting OTel practices - we're recognizing they were designed for different infrastructure and adapting appropriately.

---

## Conclusion

Principal View's scenario matching system should embrace **events as carriers of business meaning**. This approach:

1. **Keeps templates deterministic** - No conditional logic needed
2. **Makes instrumentation intentional** - Events are designed, not discovered
3. **Simplifies matching** - Event presence is sufficient for most cases
4. **Aligns with our use case** - We're not a query backend

Attribute matching remains valuable for edge cases (third-party code, continuous values), but should be the exception rather than the rule.

**Recommended Actions:**

1. Keep the validator strict on conditionals
2. Improve error messages to guide toward event-driven design
3. Document the "events as business meaning" principle
4. Consider attribute matching as a future enhancement for edge cases
5. Update existing workflows to use event-driven patterns

---

## References

- [SCENARIO_MATCHING_CONSTRAINTS.md](./SCENARIO_MATCHING_CONSTRAINTS.md) - Scenario design principles
- [WORKFLOW_TEMPLATES_DESIGN.md](./WORKFLOW_TEMPLATES_DESIGN.md) - Template system architecture
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/) - For comparison, not direct adoption
