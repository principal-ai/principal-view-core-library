# Legacy Path-Based Action Patterns (Removed)

**Status:** Deprecated and removed as of 2026-01-20
**Reason:** Superseded by OTEL-based event schemas
**Commit:** [Reference this commit hash after committing]

## Historical Context

Prior to the introduction of `.otel.canvas` files, the Principal View framework used a **path-based log association system** with regex pattern matching for extracting structured events from raw log strings.

## What Was Removed

### 1. `PVActionPattern` (from `types/canvas.ts`)

```typescript
interface PVActionPattern {
  /** Regex pattern with named capture groups */
  pattern: string;
  /** Event type to emit */
  event: string;
  /** State to transition to */
  state?: string;
  /** Metadata template using $captureGroup syntax */
  metadata?: Record<string, string>;
  /** Edge IDs to trigger animations on */
  triggerEdges?: string[];
}
```

**Purpose:** Parse unstructured log messages to extract events and trigger state changes.

**Example:**
```typescript
{
  pattern: "Payment (?<amount>\\d+) processed for order (?<orderId>\\w+)",
  event: "payment.processed",
  state: "success",
  metadata: {
    amount: "$amount",
    orderId: "$orderId"
  },
  triggerEdges: ["payment-to-fulfillment"]
}
```

When a log line matched this pattern, it would:
1. Emit a `payment.processed` event
2. Transition the node to `success` state
3. Extract capture groups into metadata
4. Trigger animations on specified edges

### 2. `PVEdgeActivation` (from `types/canvas.ts`)

```typescript
interface PVEdgeActivation {
  /** Action that triggers this animation */
  action: string;
  /** Animation type */
  animation: PVAnimationType;
  /** Animation direction */
  direction?: PVAnimationDirection;
  /** Duration in milliseconds */
  duration?: number;
}
```

**Purpose:** Define edge animations triggered by action pattern matches.

**Example:**
```typescript
{
  action: "payment.processed",
  animation: "flow",
  direction: "forward",
  duration: 1000
}
```

### 3. `ActionPattern` (from `types/path-based-config.ts`)

Similar to `PVActionPattern` but for the older path-based configuration system (Milestone 2).

## How It Worked

### Path-Based System

```typescript
// In canvas node PV extension
{
  nodeType: "payment-service",
  sources: ["src/payment/*.ts"],  // File path globs
  actions: [                       // Pattern matchers
    {
      pattern: "Payment (\\d+) processed",
      event: "payment.processed",
      state: "success"
    }
  ]
}
```

**Process:**
1. Logs matched by file path (`sources`)
2. Log messages parsed with regex patterns (`actions`)
3. Capture groups extracted to metadata
4. Events emitted, states transitioned
5. Edge animations triggered

### Modern OTEL-Based System

```typescript
// In .otel.canvas node PV extension
{
  nodeType: "payment-service",
  resourceMatch: {                    // OTEL resource attributes
    "service.name": "payment-api"
  },
  events: {                           // Structured event schemas
    "payment.processed": {
      description: "Payment processed successfully",
      attributes: {
        "payment.amount": { type: "number", required: true },
        "payment.orderId": { type: "string", required: true }
      }
    }
  }
}
```

**Process:**
1. OTEL telemetry matched by resource attributes
2. Events already structured (no parsing needed)
3. Schema validation ensures type safety
4. EventValidator validates at runtime

## Why We Removed It

1. **Not Used:** Modern `.otel.canvas` files use `events` and `resourceMatch`
2. **Type Conflicts:** Index signatures conflicted with `JsonValue` constraints
3. **Technical Debt:** Maintaining unused code created complexity
4. **Better Alternative:** OTEL provides structured, schema-validated telemetry

## Migration Path (If Needed in Future)

If you need regex-based log parsing in the future:

### Option 1: Preprocessing Layer
Parse logs into OTEL events before they reach Principal View:
```typescript
// Log parser service
const logParser = {
  pattern: /Payment (?<amount>\d+) processed/,
  transform: (match) => ({
    name: "payment.processed",
    attributes: {
      "payment.amount": parseInt(match.groups.amount)
    }
  })
};
```

### Option 2: OTEL Processor
Use OpenTelemetry Collector processors to transform logs:
```yaml
# otel-collector-config.yaml
processors:
  transform:
    log_statements:
      - context: log
        statements:
          - set(attributes["payment.amount"], ExtractPatterns(body, "Payment (\\d+)"))
```

### Option 3: Restore from Git History
If absolutely necessary, restore from this commit:
- `PVActionPattern` definition
- `PVEdgeActivation` definition
- Pattern matching logic (if it existed in `PathBasedEventProcessor`)

## References

- **Replacement:** `packages/core/src/telemetry/event-validator.ts` - Type-safe OTEL event validation
- **OTEL Types:** `packages/core/src/types/otel.ts` - OpenTelemetry data model
- **Event Schemas:** `.otel.canvas` files `pv.events` - Structured event definitions
- **Resource Matching:** `packages/core/src/types/resource-match.ts` - OTEL resource matching

## Timeline

- **Milestone 2:** Path-based log matching introduced
- **2025:** OTEL integration added with `events` and `resourceMatch`
- **2026-01-20:** Legacy action patterns removed (this commit)

## Notes for Future Development

If you're considering log pattern matching:

1. **First:** Try to emit structured telemetry at the source
2. **Second:** Use OTEL Collector transformations
3. **Last Resort:** Consider if pattern matching is truly needed

The modern approach emphasizes **instrumentation at the source** rather than **parsing after the fact**.
