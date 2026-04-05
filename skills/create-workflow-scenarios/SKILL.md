# Create Workflow Scenarios Skill

Create .workflow.json files that transform OTEL execution data into human-readable workflows for debugging and validation

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
- Use the `.workflow.json` extension (e.g., `success-path.workflow.json`)
- Be placed in a workflow folder within the storyboard structure
- The workflow folder should be inside the storyboard folder that contains the canvas

**Example:**
- Canvas: `.principal-views/order-processing/order-processing.otel.canvas`
- Workflow: `.principal-views/order-processing/success-path/success-path.workflow.json`

**DEPRECATED:** The flat structure where workflow files are siblings to canvas files is no longer supported.

### Complete Structure

```json
{
  "version": "1.0.0",
  "canvas": "order-processing.otel.canvas",
  "name": "Order Processing",
  "description": "Order processing execution scenarios",
  "spanPattern": "order.processing",
  "scenarios": [
    {
      "id": "success",
      "priority": 1,
      "description": "Successful order completion",
      "template": {
        "introduction": "Order Processing Complete",
        "events": {
          "order.started": "Order {{order.id}} received",
          "payment.completed": "Payment processed: ${{payment.amount}}",
          "order.completed": "Order completed successfully"
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

### Span Matching
- `spanPattern` (string, required) - Exact span name this workflow applies to (e.g., "order.processing", "payment.authorize")
  - Must be unique across all workflow files
  - Used to match workflows to spans in OTEL traces

### Scenarios
- `scenarios` (array, required) - List of scenario definitions (see below)

## Scenario Structure

Each scenario consists of three parts:

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
- Use 1-10 for specific scenarios
- Each priority must be unique

### 2. How Scenarios Are Matched

**NEW (v0.23.0+):** Scenarios are matched based on which events are present in the trace.

**Required events are automatically derived from `template.events` keys:**
```json
{
  "template": {
    "events": {
      "order.started": "Order started",
      "order.completed": "Order completed"
    }
  }
}
```
This scenario matches when BOTH `order.started` AND `order.completed` events are present.

**Scenarios must be mutually exclusive:**
Validation enforces that no scenario's events can be a strict subset of another scenario's events.

**Invalid** (subset violation):
```json
{
  "scenarios": [
    {
      "id": "partial",
      "template": {
        "events": {
          "order.started": "Started"
        }
      }
    },
    {
      "id": "complete",
      "template": {
        "events": {
          "order.started": "Started",
          "order.completed": "Completed"
        }
      }
    }
  ]
}
```
The `partial` scenario is a strict subset of `complete` - both would match when `order.started` and `order.completed` are present.

**Valid** (mutually exclusive):
```json
{
  "scenarios": [
    {
      "id": "success",
      "template": {
        "events": {
          "order.started": "Started",
          "order.completed": "Completed"
        }
      }
    },
    {
      "id": "failure",
      "template": {
        "events": {
          "order.started": "Started",
          "order.failed": "Failed"
        }
      }
    }
  ]
}
```
Different distinguishing events (`order.completed` vs `order.failed`) make these mutually exclusive.

### 3. Template - How to render the workflow

Templates consist of three optional parts:

#### Introduction (optional)
Opening text shown before events:
```json
{
  "template": {
    "introduction": "Order Processing Complete"
  }
}
```

Use `\n` for line breaks.

#### Events (required for meaningful output)
Map event names to template strings:
```json
{
  "template": {
    "events": {
      "order.started": "Order {{order.id}} received from {{customer.name}}",
      "payment.initiated": "Processing payment: ${{payment.amount}}",
      "payment.completed": "Payment confirmed: {{payment.method}}",
      "shipping.scheduled": "Shipping via {{shipping.carrier}} - tracking: {{tracking.number}}",
      "order.completed": "Order completed successfully"
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
    "summary": "Order {{order.id}} completed in {{duration.ms}}ms"
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

## Complete Examples

### Success Scenario
```json
{
  "id": "success",
  "priority": 1,
  "description": "Successful order completion",
  "template": {
    "introduction": "Order Processing Complete",
    "events": {
      "order.started": "Order {{order.id}} received",
      "inventory.checked": "Inventory verified: {{inventory.available}} units",
      "payment.completed": "Payment processed: ${{payment.amount}}",
      "shipping.scheduled": "Shipping via {{shipping.carrier}}",
      "order.completed": "Order completed successfully"
    },
    "summary": "Order {{order.id}} completed\nTotal: ${{order.total}}\nDuration: {{duration.ms}}ms"
  }
}
```
**Matches when:** All 5 events are present (order.started, inventory.checked, payment.completed, shipping.scheduled, order.completed)

### Failure Scenario
```json
{
  "id": "failure",
  "priority": 2,
  "description": "Order failed due to payment error",
  "template": {
    "introduction": "Order Processing Failed",
    "events": {
      "order.started": "Order {{order.id}} received",
      "payment.failed": "Payment failed: {{error.message}}",
      "order.failed": "Order processing failed"
    },
    "summary": "Order {{order.id}}\nError: {{error.message}}\nType: {{error.type}}"
  }
}
```
**Matches when:** All 3 events are present (order.started, payment.failed, order.failed)
**Note:** Mutually exclusive with success scenario because they have different distinguishing events (payment.completed vs payment.failed)

### Timeout Scenario
```json
{
  "id": "timeout",
  "priority": 3,
  "description": "Processing exceeded timeout limit",
  "template": {
    "introduction": "Order Processing Timeout",
    "events": {
      "order.started": "Order {{order.id}} received",
      "timeout.exceeded": "Processing exceeded 30s timeout"
    },
    "summary": "Order {{order.id}}\nDuration: {{duration.ms}}ms\nStatus: Pending retry"
  }
}
```
**Matches when:** Both events are present (order.started, timeout.exceeded)
**Note:** Mutually exclusive with other scenarios due to unique timeout.exceeded event

### Partial Success Scenario
```json
{
  "id": "partial",
  "priority": 4,
  "description": "Order partially completed",
  "template": {
    "introduction": "Order Partially Completed",
    "events": {
      "order.started": "Order {{order.id}} with {{items.total}} items",
      "items.processed": "{{items.succeeded}} items succeeded",
      "items.failed": "{{items.failed}} items failed",
      "order.completed": "Order completed with failures"
    },
    "summary": "Succeeded: {{items.succeeded}}\nFailed: {{items.failed}}\nReason: {{failure.reason}}"
  }
}
```
**Matches when:** All 4 events are present (order.started, items.processed, items.failed, order.completed)
**Note:** Different from success scenario because it requires items.failed event

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
   - Use visual indicators for status (SUCCESS, FAILED, WARNING, etc.)
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
- [SUCCESS] for successful actions
- [FAILED] for failed actions
- [WARNING] for warnings, timeouts, partial failures
- [INFO] for generic/informational
- Descriptive prefixes for domain operations (Order:, Payment:, Shipping:)

### Keep It Scannable
```json
// Good - Clear event-based flow
"events": {
  "payment.completed": "Payment: ${{amount}}",
  "inventory.reserved": "Reserved: {{quantity}} units",
  "shipping.scheduled": "Carrier: {{carrier}}"
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
  "order.failed": "[FAILED] {{error.message}} ({{error.code}})"
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
- JSON syntax is valid
- Required fields present (`version`, `canvas`, `name`, `description`, `spanPattern`, `scenarios`)
- Canvas file exists
- `spanPattern` is unique (no duplicate spanPatterns across workflows)
- Scenario structure valid (`id`, `priority`, `template`)
- **No deprecated fields** (`condition` is no longer supported)
- Template uses valid fields (`introduction`, `events`, `logs`, `summary`, `span`, `children`)
- Priorities are unique
- Scenarios are mutually exclusive (no scenario's events are a strict subset of another's)
- Template syntax valid (balanced braces)

**Common Validation Errors:**

### Missing spanPattern field
```json
// Wrong - Missing required field
{
  "version": "1.0.0",
  "canvas": "order.otel.canvas",
  "name": "Order Processing"
}

// Correct - Include spanPattern
{
  "version": "1.0.0",
  "canvas": "order.otel.canvas",
  "name": "Order Processing",
  "spanPattern": "order.processing"
}
```

### Deprecated condition field
```json
// Wrong - condition field is no longer supported
{
  "id": "success",
  "priority": 1,
  "condition": {
    "requires": ["order.completed"]
  },
  "template": {
    "events": {
      "order.completed": "Completed"
    }
  }
}

// Correct - Events are derived from template.events
{
  "id": "success",
  "priority": 1,
  "template": {
    "events": {
      "order.completed": "Completed"
    }
  }
}
```

### Scenario subset violation
```json
// Wrong - "started" is a strict subset of "complete"
{
  "scenarios": [
    {
      "id": "started",
      "template": {
        "events": {
          "order.started": "Started"
        }
      }
    },
    {
      "id": "complete",
      "template": {
        "events": {
          "order.started": "Started",
          "order.completed": "Completed"
        }
      }
    }
  ]
}

// Correct - Mutually exclusive scenarios
{
  "scenarios": [
    {
      "id": "success",
      "template": {
        "events": {
          "order.started": "Started",
          "order.completed": "Completed"
        }
      }
    },
    {
      "id": "failure",
      "template": {
        "events": {
          "order.started": "Started",
          "order.failed": "Failed"
        }
      }
    }
  ]
}
```

### Duplicate spanPattern
```json
// Wrong - Multiple workflows with same spanPattern
// File: payment-success.workflow.json
{
  "spanPattern": "payment.process"
}

// File: payment-failure.workflow.json
{
  "spanPattern": "payment.process"  // ERROR: Duplicate!
}

// Correct - Use one workflow with multiple scenarios
// File: payment-processing.workflow.json
{
  "spanPattern": "payment.process",
  "scenarios": [
    { "id": "success", ... },
    { "id": "failure", ... }
  ]
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
- Correct scenario selected
- All `{{variables}}` populated
- No `{{missing.vars}}` shown
- Workflow is readable and helpful
- Events appear in logical order

If variables show as `{{missing.var}}`:
1. Run `privu workflow inspect execution.otel.json`
2. Check available attributes
3. Update template to use correct names
4. Re-validate and re-test

## File Organization

**IMPORTANT: Must use storyboard structure:**

```
.principal-views/
└── order-processing/                          # Storyboard folder
    ├── order-processing.otel.canvas          # Canvas at storyboard root
    ├── success-path/                          # Workflow folder
    │   ├── success-path.workflow.json        # Workflow definition
    │   ├── order-success-1.otel.json         # Execution data
    │   └── order-success-2.otel.json
    ├── failure-scenarios/                     # Another workflow
    │   ├── failure-scenarios.workflow.json
    │   ├── order-failure.otel.json
    │   └── order-timeout.otel.json
    └── ...                                    # More workflows as needed
```

**DEPRECATED:** The flat structure with `__executions__/` directory is no longer supported.

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
- `.principal-views/validation/validation-workflow/validation-workflow.workflow.json` - Real storyboard structure example
- This follows the correct hierarchical organization pattern
- Look for other `.workflow.json` files in `.principal-views/*/*/` directories

**Note:** Legacy flat structure examples may exist but are deprecated.

## Common Pitfalls

### Don't: Use legacy format
The old format with `steps`, `details`, `event`, `attributes` is no longer supported.

### Don't: Hardcode values
```json
{
  "events": {
    "order.completed": "Order ORD-12345 completed"
  }
}
```

### Do: Use variables
```json
{
  "events": {
    "order.completed": "Order {{order.id}} completed"
  }
}
```

### Don't: Use duplicate priorities
Each scenario must have a unique priority value.

### Don't: Create subset scenarios
Ensure each scenario has at least one unique event that distinguishes it from others.

## Type Definitions Reference

For complete type definitions, see:
- `packages/core/src/workflow/types.ts` - All TypeScript types
- `packages/core/src/workflow/example.ts` - Working code examples
- `packages/core/src/workflow/validator.ts` - Validation rules
