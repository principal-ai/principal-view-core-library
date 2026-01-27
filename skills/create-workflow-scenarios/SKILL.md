# Create Workflow Scenarios Skill

Create .workflow.json files that transform OTEL execution data into human-readable workflows for debugging and validation.

## Purpose

Workflow scenarios answer the question: **"What happened when this feature ran?"**

They are **scenario-driven workflow templates** that convert raw OTEL telemetry into readable stories:
- Transform cryptic event names into plain English
- Show execution flow as a workflow timeline
- Highlight success/failure outcomes
- Surface important attribute values in context
- Make debugging accessible to non-engineers

## When to Use This Skill

Use this skill when the user wants to:
- **Make telemetry readable** - "Turn these OTEL events into a story"
- **Debug feature execution** - "What actually happened when this ran?"
- **Create execution reports** - "Generate a readable summary of this test run"
- **Document scenarios** - "Show what success/failure looks like for this feature"
- **Enable workflow views** - "Add human-readable output to this canvas"

**Prerequisite**: You should already have a .otel.canvas file for the feature. Workflows are always paired with canvases.

## What This Skill Does

This skill helps create properly structured .workflow.json files that:
1. **Define scenarios** - Different execution outcomes (success, failure, timeout, etc.)
2. **Match conditions** - Rules that determine which scenario applies to execution data
3. **Generate workflows** - Templates that render events as readable text
4. **Extract variables** - Pull attribute values from events for use in templates
5. **Show flow** - Present execution as a step-by-step workflow

## File Structure

A .workflow.json file contains metadata, rendering configuration, and multiple scenarios.

### File Naming Convention

**REQUIRED**: Workflow files MUST:
- Use the `.workflow.json` extension (e.g., `order-processing.workflow.json`)
- Be co-located with their corresponding .otel.canvas file
- Have a matching base name (e.g., `order-processing.otel.canvas` ↔ `order-processing.workflow.json`)

### Complete Structure

```json
{
  "version": "1.0.0",
  "canvas": "order-processing.otel.canvas",
  "name": "Order Processing",
  "description": "Order processing execution scenarios",
  "mode": "span-tree",
  "scenarioSelection": "first-match",
  "showLogsPerSpan": true,
  "scenarios": [
    {
      "id": "success",
      "priority": 1,
      "description": "Successful order completion",
      "condition": {
        "requires": ["order.completed"],
        "assertions": {
          "order.status": { "$eq": "completed" }
        }
      },
      "template": {
        "introduction": "✅ Order Processing Complete",
        "events": {
          "order.started": "📦 Order {{order.id}} received",
          "payment.completed": "💳 Payment processed: ${{payment.amount}}",
          "order.completed": "✅ Order completed successfully"
        },
        "summary": "Order {{order.id}} completed in {{duration.ms}}ms"
      }
    }
  ]
}
```

## Required Top-Level Fields

### Metadata
- `version` (string, required) - Semver version (e.g., "1.0.0")
- `canvas` (string, required) - Relative path to .otel.canvas file
- `name` (string, required) - Human-readable name
- `description` (string, required) - What this workflow describes

### Rendering Configuration
- `mode` (string, required) - Either `"span-tree"` or `"timeline"`
  - `"span-tree"` - Follow OTEL span hierarchy (parent-child relationships)
  - `"timeline"` - Chronological order (sorted by timestamp)
- `scenarioSelection` (string, optional) - Either `"first-match"` (default) or `"manual"`

### Optional Configuration
- `showLogsPerSpan` (boolean) - Show logs grouped by span (span-tree mode)
- `interleaveSignals` (boolean) - Mix spans/logs by timestamp (timeline mode)
- `formatting` (object) - Display formatting options

### Scenarios
- `scenarios` (array, required) - List of scenario definitions (see below)

## Scenario Structure

Each scenario consists of four parts:

### 1. Identification
```json
{
  "id": "success",                           // Required: Unique identifier (kebab-case)
  "priority": 1,                             // Required: Lower = higher priority
  "description": "Successful order completion" // Optional: Human-readable description
}
```

**Priority Rules:**
- Lower numbers = higher priority (checked first)
- First matching scenario wins
- Use 1-10 for specific scenarios, 999 for fallback
- Each priority must be unique

### 2. Condition - What triggers this scenario

Conditions use three types of checks:

#### Event Requirements (`requires`)
Array of event name patterns (supports wildcards):
```json
{
  "condition": {
    "requires": ["order.completed"]  // Must have this event
  }
}
```

Wildcard patterns:
```json
{
  "requires": ["order.*"]      // Matches order.started, order.completed, etc.
  "requires": ["*.error"]      // Matches any error event
  "requires": ["conversion.*"] // Matches conversion.started, conversion.complete
}
```

#### Event Exclusions (`excludes`)
Array of event patterns that must NOT be present:
```json
{
  "condition": {
    "requires": ["order.completed"],
    "excludes": ["*.error"]  // No error events allowed
  }
}
```

#### Attribute Assertions (`assertions`)
MongoDB-style operators on aggregated attributes:
```json
{
  "condition": {
    "requires": ["order.completed"],
    "assertions": {
      "order.status": { "$eq": "completed" },
      "order.total": { "$gt": 0 },
      "error.count": { "$eq": 0 }
    }
  }
}
```

**Assertion Operators:**
- `$eq` - Equal to (string, number, boolean)
- `$ne` - Not equal to
- `$gt` - Greater than (number)
- `$gte` - Greater than or equal (number)
- `$lt` - Less than (number)
- `$lte` - Less than or equal (number)
- `$in` - Value in array
- `$nin` - Value not in array
- `$exists` - Attribute exists (boolean)

Examples:
```json
{
  "assertions": {
    "result.errors": { "$eq": 0 },           // No errors
    "result.warnings": { "$gt": 0 },         // Has warnings
    "order.status": { "$in": ["pending", "processing"] },
    "payment.verified": { "$exists": true }
  }
}
```

#### Logical Operators
Use `any: true` for OR logic on `requires`:
```json
{
  "condition": {
    "requires": ["timeout.error", "network.error"],
    "any": true  // Matches if ANY event is present
  }
}
```

Default (without `any`) is AND - all `requires` must be present.

#### Default/Fallback Condition
```json
{
  "condition": {
    "default": true  // Always matches (use for fallback scenario)
  }
}
```

### 3. Template - How to render the workflow

Templates consist of three optional parts:

#### Introduction (optional)
Opening text shown before events:
```json
{
  "template": {
    "introduction": "✅ Order Processing Complete\n━━━━━━━━━━━━━━━━━━━━━━"
  }
}
```

Use `\n` for line breaks, emojis for visual cues.

#### Events (required for meaningful output)
Map event names to template strings:
```json
{
  "template": {
    "events": {
      "order.started": "📦 Order {{order.id}} received from {{customer.name}}",
      "payment.initiated": "💳 Processing payment: ${{payment.amount}}",
      "payment.completed": "✅ Payment confirmed: {{payment.method}}",
      "shipping.scheduled": "🚚 Shipping via {{shipping.carrier}} - tracking: {{tracking.number}}",
      "order.completed": "✅ Order completed successfully"
    }
  }
}
```

Events are rendered in chronological order based on their timestamps.

#### Summary (optional)
Closing text shown after all events:
```json
{
  "template": {
    "summary": "━━━━━━━━━━━━━━━━━━━━━━\n\n✅ SUCCESS\n\nOrder {{order.id}} completed in {{duration.ms}}ms"
  }
}
```

### 4. Template Variables

Use Handlebars syntax `{{variable}}` to insert values from event attributes:

```json
{
  "events": {
    "order.completed": "Order {{order.id}} total: ${{order.total}}"
  }
}
```

**Variable Sources:**
1. **Event attributes** - Extracted from the specific event
2. **Aggregated values** - Computed from all events (see below)

**Special Aggregated Variables:**
- `{{events.count}}` - Total number of events
- `{{events.length}}` - Same as events.count
- `{{spans.count}}` - Number of spans
- `{{logs.count}}` - Number of log records
- `{{errorLogs.count}}` - Number of error-level logs
- `{{warnLogs.count}}` - Number of warning logs
- `{{debugLogs.count}}` - Number of debug logs

**Handling Missing Variables:**
If a variable isn't found, it remains as-is: `{{missing.var}}`

A warning banner appears in the UI when variables can't be resolved.

### Span-Tree Mode Specific Fields

When using `"mode": "span-tree"`, you can add:

#### Span Template
How to render span nodes:
```json
{
  "template": {
    "span": "→ {{span.name}}"
  }
}
```

#### Children Handling
```json
{
  "template": {
    "span": "→ {{span.name}}",
    "children": "recurse"  // or "ignore"
  }
}
```

#### Log Templates by Severity
```json
{
  "template": {
    "logs": {
      "trace": "🔍 {{log.body}}",
      "debug": "🔍 {{log.body}}",
      "info": "ℹ️  {{log.body}}",
      "warn": "⚠️  {{log.body}}",
      "error": "❌ {{log.body}}",
      "fatal": "💀 {{log.body}}",
      "default": "📝 {{log.body}}"
    }
  }
}
```

## Complete Examples

### Success Scenario
```json
{
  "id": "success",
  "priority": 1,
  "description": "Successful order completion",
  "condition": {
    "requires": ["order.completed"],
    "assertions": {
      "order.status": { "$eq": "completed" },
      "error.count": { "$eq": 0 }
    }
  },
  "template": {
    "introduction": "✅ Order Processing Complete\n━━━━━━━━━━━━━━━━━━━━━━",
    "events": {
      "order.started": "📦 Order {{order.id}} received",
      "inventory.checked": "📊 Inventory verified: {{inventory.available}} units",
      "payment.completed": "💳 Payment processed: ${{payment.amount}}",
      "shipping.scheduled": "🚚 Shipping via {{shipping.carrier}}",
      "order.completed": "✅ Order completed successfully"
    },
    "summary": "━━━━━━━━━━━━━━━━━━━━━━\n\n✅ SUCCESS\n\nOrder {{order.id}} completed\nTotal: ${{order.total}}\nDuration: {{duration.ms}}ms"
  }
}
```

### Failure Scenario
```json
{
  "id": "failure",
  "priority": 2,
  "description": "Order failed due to payment error",
  "condition": {
    "requires": ["order.failed"],
    "assertions": {
      "error.type": { "$eq": "payment_error" }
    }
  },
  "template": {
    "introduction": "❌ Order Processing Failed\n━━━━━━━━━━━━━━━━━━━━━━",
    "events": {
      "order.started": "📦 Order {{order.id}} received",
      "payment.failed": "❌ Payment failed: {{error.message}}",
      "order.failed": "❌ Order processing failed"
    },
    "summary": "━━━━━━━━━━━━━━━━━━━━━━\n\n❌ FAILED\n\nOrder {{order.id}}\nError: {{error.message}}\nType: {{error.type}}"
  }
}
```

### Timeout Scenario
```json
{
  "id": "timeout",
  "priority": 3,
  "description": "Processing exceeded timeout limit",
  "condition": {
    "requires": ["order.*"],
    "excludes": ["order.completed"],
    "assertions": {
      "duration.ms": { "$gt": 30000 }
    }
  },
  "template": {
    "introduction": "⚠️ Order Processing Timeout\n━━━━━━━━━━━━━━━━━━━━━━",
    "events": {
      "order.started": "📦 Order {{order.id}} received",
      "timeout.exceeded": "⚠️ Processing exceeded 30s timeout"
    },
    "summary": "━━━━━━━━━━━━━━━━━━━━━━\n\n⚠️ TIMEOUT\n\nOrder {{order.id}}\nDuration: {{duration.ms}}ms\nStatus: Pending retry"
  }
}
```

### Partial Success Scenario
```json
{
  "id": "partial",
  "priority": 4,
  "description": "Order partially completed",
  "condition": {
    "requires": ["order.completed"],
    "assertions": {
      "items.failed": { "$gt": 0 }
    }
  },
  "template": {
    "introduction": "⚠️ Order Partially Completed\n━━━━━━━━━━━━━━━━━━━━━━",
    "events": {
      "order.started": "📦 Order {{order.id}} with {{items.total}} items",
      "items.processed": "✅ {{items.succeeded}} items succeeded",
      "items.failed": "❌ {{items.failed}} items failed",
      "order.completed": "⚠️ Order completed with failures"
    },
    "summary": "━━━━━━━━━━━━━━━━━━━━━━\n\n⚠️ PARTIAL SUCCESS\n\nSucceeded: {{items.succeeded}}\nFailed: {{items.failed}}\nReason: {{failure.reason}}"
  }
}
```

### Default Fallback Scenario
```json
{
  "id": "default",
  "priority": 999,
  "description": "Generic execution summary",
  "condition": {
    "default": true
  },
  "template": {
    "introduction": "📋 Execution Summary\n━━━━━━━━━━━━━━━━━━━━━━",
    "summary": "━━━━━━━━━━━━━━━━━━━━━━\n\nCaptured {{events.count}} events\nSpans: {{spans.count}}\nLogs: {{logs.count}}"
  }
}
```

## Workflow

When creating a .workflow.json file:

1. **Start with the canvas** - Identify the .otel.canvas file
   - Example: `order-processing.otel.canvas`

2. **Inspect execution data** - Look at actual .otel.json files to see:
   - What events are emitted
   - What attributes are available
   - Use CLI: `privu workflow inspect execution.otel.json`

3. **Identify scenarios** - What are the different outcomes?
   - Success: Order completed
   - Failure: Payment error, inventory error
   - Timeout: Processing took too long
   - Partial: Some items succeeded, some failed

4. **Map events to scenarios** - Define conditions:
   - Success: `requires: ["order.completed"]` + `order.status == "completed"`
   - Failure: `requires: ["order.failed"]` + `error.type` exists
   - Timeout: `duration.ms > 30000`

5. **Design workflow templates** - How should each read?
   - Use emojis for visual cues (✅ ❌ ⚠️ 📋 →)
   - Extract meaningful values with `{{variables}}`
   - Keep it concise and scannable

6. **Set priorities correctly**:
   - Most specific scenarios = lowest number (1, 2, 3)
   - Fallback/generic = highest number (999)
   - Must be unique

7. **Create the file**:
   ```bash
   # Same directory and base name as canvas
   touch order-processing.workflow.json
   ```

8. **Validate** using the CLI:
   ```bash
   privu workflow validate order-processing.workflow.json
   ```

9. **Test with real data**:
   ```bash
   privu workflow render order-processing.workflow.json execution.otel.json
   ```

## Template Best Practices

### Use Visual Indicators
- ✅ Success actions
- ❌ Failed actions
- ⚠️ Warnings, timeouts, partial failures
- 📋 Generic/informational
- 📦 Order/item operations
- 💳 Payment operations
- 🚚 Shipping operations
- → Flow arrows (for span-tree templates)

### Keep It Scannable
```json
// Good - Clear event-based flow
"events": {
  "payment.completed": "💳 Payment: ${{amount}}",
  "inventory.reserved": "📊 Reserved: {{quantity}} units",
  "shipping.scheduled": "🚚 Carrier: {{carrier}}"
}

// Bad - Long template strings
"events": {
  "order.completed": "The payment was processed successfully for ${{amount}} and inventory was reserved for {{quantity}} units and shipping was scheduled"
}
```

### Use Meaningful Event Names
```json
// Good - Maps to actual OTEL events
"events": {
  "order.started": "...",
  "payment.initiated": "...",
  "payment.completed": "..."
}

// Bad - Generic or non-existent events
"events": {
  "step1": "...",
  "step2": "...",
  "step3": "..."
}
```

### Extract Key Values
```json
// Good - Shows actionable details
"events": {
  "order.failed": "❌ Failed: {{error.message}} ({{error.code}})"
}

// Bad - Generic
"events": {
  "order.failed": "Order failed"
}
```

## Validation

**MANDATORY STEP:** After creating or updating a .workflow.json file, you MUST validate it:

```bash
privu workflow validate path/to/workflow.json
```

The validator checks:
- ✅ JSON syntax is valid
- ✅ Required fields present (`version`, `canvas`, `name`, `description`, `mode`, `scenarios`)
- ✅ Canvas file exists
- ✅ Scenario structure valid (`id`, `priority`, `condition`, `template`)
- ✅ **No invalid fields** (rejects `steps`, `details`, `event`, `attributes`)
- ✅ Condition uses valid fields (`requires`, `excludes`, `assertions`, `default`, `any`)
- ✅ Template uses valid fields (`introduction`, `events`, `logs`, `summary`, `span`, `children`)
- ✅ Priorities are unique
- ✅ At least one default scenario exists
- ✅ Template syntax valid (balanced braces)

**Common Validation Errors:**

### ❌ Invalid condition field "event"
```json
// Wrong - Legacy format
"condition": {
  "event": "order.completed"
}

// Correct
"condition": {
  "requires": ["order.completed"]
}
```

### ❌ Invalid condition field "attributes"
```json
// Wrong - Legacy format
"condition": {
  "attributes": {
    "order.status": "completed"
  }
}

// Correct
"condition": {
  "assertions": {
    "order.status": { "$eq": "completed" }
  }
}
```

### ❌ Invalid template field "steps"
```json
// Wrong - Legacy format
"template": {
  "steps": [
    "Step 1",
    "Step 2"
  ]
}

// Correct
"template": {
  "events": {
    "event.name": "Step 1",
    "other.event": "Step 2"
  }
}
```

### ❌ Invalid template field "details"
```json
// Wrong - Legacy format
"template": {
  "details": {
    "Order ID": "{{order.id}}"
  }
}

// Correct - Use summary with variables
"template": {
  "summary": "Order ID: {{order.id}}\nCustomer: {{customer.name}}"
}
```

## Testing Workflows

After validation passes, test with actual execution data:

```bash
# Inspect execution to see available attributes
privu workflow inspect execution.otel.json

# Render workflow with execution data
privu workflow render workflow.json execution.otel.json

# Test scenario matching
privu workflow test workflow.json execution.otel.json
```

**Verification checklist:**
- ✅ Correct scenario selected
- ✅ All `{{variables}}` populated
- ✅ No `{{missing.vars}}` shown
- ✅ Workflow is readable and helpful
- ✅ Events appear in logical order

If variables show as `{{missing.var}}`:
1. Run `privu workflow inspect execution.otel.json`
2. Check available attributes
3. Update template to use correct names
4. Re-validate and re-test

## File Organization

```
.principal-views/
├── order-processing.otel.canvas       # Canvas definition
├── order-processing.workflow.json    # Workflow scenarios
└── __executions__/
    ├── order-success.otel.json        # Test execution data
    ├── order-failure.otel.json
    └── order-timeout.otel.json
```

## CLI Commands Reference

```bash
# Validate workflow structure
privu workflow validate <workflow.json>

# Inspect execution data (see available attributes)
privu workflow inspect <execution.otel.json>

# Render workflow with execution data
privu workflow render <workflow.json> <execution.otel.json>

# Test scenario matching (see which scenario matches and why)
privu workflow test <workflow.json> <execution.otel.json>

# List all workflows in project
privu workflow list
```

## Integration with ExecutionViewerPanel

When workflows are available, ExecutionViewerPanel:
- Auto-loads workflow on canvas load
- Shows workflow text with event highlighting
- Provides "Workflow / Raw Events" toggle
- Syncs event selection between canvas and workflow
- Shows warning when variables can't be resolved
- Allows clicking events to see source data

## Real Examples in Codebase

See working examples at:
- `.principal-views/graph-converter.workflow.json` - Canvas conversion scenarios
- Look for `.workflow.json` files in other projects

## Common Pitfalls

### ❌ Don't: Use legacy format
The old format with `steps`, `details`, `event`, `attributes` is no longer supported.

### ❌ Don't: Hardcode values
```json
{
  "events": {
    "order.completed": "Order ORD-12345 completed"
  }
}
```

### ✅ Do: Use variables
```json
{
  "events": {
    "order.completed": "Order {{order.id}} completed"
  }
}
```

### ❌ Don't: Forget mode and scenarioSelection
These are required fields.

### ❌ Don't: Use duplicate priorities
Each scenario must have a unique priority value.

### ❌ Don't: Forget default scenario
Always include a fallback with `"condition": { "default": true }` at priority 999.

## Type Definitions Reference

For complete type definitions, see:
- `packages/core/src/workflow/types.ts` - All TypeScript types
- `packages/core/src/workflow/example.ts` - Working code examples
- `packages/core/src/workflow/validator.ts` - Validation rules
