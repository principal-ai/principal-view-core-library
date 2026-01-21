# Create Narrative Scenarios Skill

Create .narrative.json files that transform OTEL execution data into human-readable narratives for debugging and validation.

## Purpose

Narrative scenarios answer the question: **"What happened when this feature ran?"**

They are **scenario-driven narrative templates** that convert raw OTEL telemetry into readable stories:
- Transform cryptic event names into plain English
- Show execution flow as a narrative timeline
- Highlight success/failure outcomes
- Surface important attribute values in context
- Make debugging accessible to non-engineers

## When to Use This Skill

Use this skill when the user wants to:
- **Make telemetry readable** - "Turn these OTEL events into a story"
- **Debug feature execution** - "What actually happened when this ran?"
- **Create execution reports** - "Generate a readable summary of this test run"
- **Document scenarios** - "Show what success/failure looks like for this feature"
- **Enable narrative views** - "Add human-readable output to this canvas"

**Prerequisite**: You should already have a .otel.canvas file for the feature. Narratives are always paired with canvases.

## What This Skill Does

This skill helps create properly structured .narrative.json files that:
1. **Define scenarios** - Different execution outcomes (success, failure, timeout, etc.)
2. **Match conditions** - Rules that determine which scenario applies to execution data
3. **Generate narratives** - Templates that render events as readable text
4. **Extract variables** - Pull attribute values from events for use in templates
5. **Show flow** - Present execution as a step-by-step narrative

## Narrative File Structure

A .narrative.json file contains scenarios with matching conditions and output templates.

### File Naming Convention

**REQUIRED**: Narrative files MUST:
- Use the `.narrative.json` extension (e.g., `order-processing.narrative.json`)
- Be co-located with their corresponding .otel.canvas file
- Have a matching base name (e.g., `order-processing.otel.canvas` ↔ `order-processing.narrative.json`)

### Basic Structure

```json
{
  "name": "Narrative Name",
  "description": "What this narrative describes",
  "version": "1.0.0",
  "canvasPath": "./relative-path-to.otel.canvas",
  "scenarios": [
    {
      "id": "success",
      "description": "Successful execution",
      "priority": 1,
      "condition": {/* matching rules */},
      "template": {/* narrative output */}
    }
  ]
}
```

## Scenario Structure

Each scenario has:

### 1. Metadata
```json
{
  "id": "success",                      // Unique scenario identifier
  "description": "Order completed successfully",  // Human-readable description
  "priority": 1                         // Lower = higher priority (1 is checked first)
}
```

### 2. Condition (What OTEL data triggers this scenario)

Conditions use logical operators to match against OTEL events:

#### Event Condition
```json
{
  "type": "event",
  "event": "order.completed"  // Matches if this event exists
}
```

#### Attribute Condition
```json
{
  "type": "attribute",
  "key": "order.status",
  "value": "completed"        // Matches if attribute equals value
}
```

#### Span Condition
```json
{
  "type": "span",
  "name": "process_order"     // Matches if span with this name exists
}
```

#### Logical Operators
```json
{
  "type": "and",
  "conditions": [
    {"type": "event", "event": "order.completed"},
    {"type": "attribute", "key": "order.status", "value": "completed"}
  ]
}
```

```json
{
  "type": "or",
  "conditions": [
    {"type": "attribute", "key": "error.type", "value": "timeout"},
    {"type": "attribute", "key": "error.type", "value": "network_error"}
  ]
}
```

### 3. Template (How to render the narrative)

Templates define the human-readable output:

```json
{
  "template": {
    "summary": "Order {{order.id}} completed successfully",
    "steps": [
      "→ Received order for {{item.name}} ({{item.quantity}} units)",
      "→ Validated inventory: {{inventory.available}} units available",
      "→ Processed payment: ${{payment.amount}}",
      "→ Generated tracking number: {{shipping.tracking}}"
    ],
    "details": {
      "Order ID": "{{order.id}}",
      "Customer": "{{customer.name}}",
      "Total": "${{order.total}}",
      "Duration": "{{duration_ms}}ms"
    }
  }
}
```

#### Template Variables

Variables are extracted from OTEL event attributes using `{{variable.name}}` syntax:

- `{{order.id}}` - Extracts attribute `order.id` from events
- `{{error.message}}` - Extracts attribute `error.message`
- `{{duration_ms}}` - Special variable for span duration

Variables are automatically populated from event attributes. If a variable isn't found, it remains as-is (e.g., `{{missing.var}}`).

## Common Scenario Types

### Success Scenario (Priority 1)
```json
{
  "id": "success",
  "description": "Successful order completion",
  "priority": 1,
  "condition": {
    "type": "and",
    "conditions": [
      {"type": "event", "event": "order.completed"},
      {"type": "attribute", "key": "order.status", "value": "completed"}
    ]
  },
  "template": {
    "summary": "✅ Order {{order.id}} completed successfully",
    "steps": [
      "→ Order received: {{order.created_at}}",
      "→ Payment processed: ${{payment.amount}}",
      "→ Shipped via {{shipping.carrier}}"
    ],
    "details": {
      "Order ID": "{{order.id}}",
      "Customer": "{{customer.email}}",
      "Total": "${{order.total}}"
    }
  }
}
```

### Failure Scenario (Priority 2)
```json
{
  "id": "failure",
  "description": "Order processing failed",
  "priority": 2,
  "condition": {
    "type": "and",
    "conditions": [
      {"type": "event", "event": "order.failed"},
      {"type": "attribute", "key": "error.type", "value": "payment_error"}
    ]
  },
  "template": {
    "summary": "❌ Order {{order.id}} failed: Payment error",
    "steps": [
      "→ Order received: {{order.created_at}}",
      "→ ❌ Payment failed: {{error.message}}",
      "→ Refund initiated: {{refund.id}}"
    ],
    "details": {
      "Order ID": "{{order.id}}",
      "Error Type": "{{error.type}}",
      "Error Message": "{{error.message}}"
    }
  }
}
```

### Timeout Scenario (Priority 3)
```json
{
  "id": "timeout",
  "description": "Order processing timed out",
  "priority": 3,
  "condition": {
    "type": "or",
    "conditions": [
      {"type": "attribute", "key": "error.type", "value": "timeout"},
      {"type": "attribute", "key": "duration_ms", "value": "> 30000"}
    ]
  },
  "template": {
    "summary": "⚠️ Order {{order.id}} timed out after {{duration_ms}}ms",
    "steps": [
      "→ Order received: {{order.created_at}}",
      "→ ⚠️ Processing exceeded timeout limit",
      "→ Marked for retry: {{retry.scheduled_at}}"
    ]
  }
}
```

### Partial Success Scenario (Priority 4)
```json
{
  "id": "partial",
  "description": "Order partially completed",
  "priority": 4,
  "condition": {
    "type": "and",
    "conditions": [
      {"type": "event", "event": "order.completed"},
      {"type": "attribute", "key": "items.failed", "value": "> 0"}
    ]
  },
  "template": {
    "summary": "⚠️ Order {{order.id}} partially completed ({{items.failed}} items failed)",
    "steps": [
      "→ Order received with {{items.total}} items",
      "→ {{items.succeeded}} items processed successfully",
      "→ ⚠️ {{items.failed}} items failed: {{failure.reason}}"
    ]
  }
}
```

### Fallback Scenario (Always Last)
```json
{
  "id": "default",
  "description": "Generic execution summary",
  "priority": 999,
  "condition": {
    "type": "event",
    "event": "*"  // Matches any event
  },
  "template": {
    "summary": "📋 Order {{order.id}} execution recorded",
    "steps": [
      "→ Execution captured with {{event.count}} events",
      "→ Duration: {{duration_ms}}ms"
    ]
  }
}
```

## Workflow

When creating a .narrative.json file:

1. **Start with the canvas** - Identify the .otel.canvas file you want to add narratives to
   - Example: `order-processing.otel.canvas`

2. **Identify execution scenarios** - What are the different outcomes?
   - Success: Order completed
   - Failure: Payment error, inventory error
   - Timeout: Processing took too long
   - Partial: Some items succeeded, some failed

3. **Map OTEL events to scenarios** - What events/attributes indicate each scenario?
   - Success: `order.completed` event + `status='completed'` attribute
   - Failure: `order.failed` event + `error.type` attribute
   - Timeout: `duration_ms > 30000` or `error.type='timeout'`

4. **Design narrative templates** - How should each scenario read?
   - Use emojis for visual cues (✅ ❌ ⚠️ 📋)
   - Use → for steps to show flow
   - Extract meaningful attribute values with {{variables}}
   - Keep it concise and scannable

5. **Set priorities correctly**:
   - Most specific scenarios = lowest priority number (1, 2, 3)
   - Fallback/generic = highest priority number (999)
   - The first matching scenario wins

6. **Create the file**:
   ```bash
   # Same directory and base name as canvas
   touch order-processing.narrative.json
   ```

7. **Validate** using the CLI:
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

8. **Test with real execution data** - Load an actual execution to verify:
   - Correct scenario matches
   - Variables populate correctly
   - Narrative is readable and helpful

## Template Best Practices

### Use Visual Indicators
- ✅ Success actions
- ❌ Failed actions
- ⚠️ Warnings, timeouts, partial failures
- 📋 Generic/informational
- → Flow steps

### Keep It Scannable
```json
// Good - Easy to scan
"steps": [
  "→ Payment processed: ${{amount}}",
  "→ Inventory reserved: {{quantity}} units",
  "→ Shipping scheduled: {{carrier}}"
]

// Bad - Wall of text
"steps": [
  "The payment was processed successfully in the amount of ${{amount}} and then the inventory was reserved for {{quantity}} units and finally shipping was scheduled via {{carrier}}"
]
```

### Extract Meaningful Values
```json
// Good - Shows actionable details
"summary": "Order {{order.id}} failed: {{error.message}}",
"details": {
  "Error Type": "{{error.type}}",
  "Failed At": "{{failed.step}}",
  "Retry Available": "{{retry.enabled}}"
}

// Bad - Generic
"summary": "Order failed",
"details": {
  "Status": "failed"
}
```

### Organize by Sections
```json
{
  "summary": "High-level outcome (1 line)",
  "steps": [
    "→ Chronological flow (3-7 steps)",
    "→ What happened in order"
  ],
  "details": {
    "Key metadata": "Values that matter",
    "For debugging": "Or auditing"
  }
}
```

## Variable Extraction

Variables are pulled from OTEL event attributes using dot notation:

### Simple Attributes
```
Event attribute: order.id = "ORD-12345"
Template: {{order.id}}
Output: ORD-12345
```

### Nested Attributes
```
Event attribute: customer.billing.address.city = "San Francisco"
Template: {{customer.billing.address.city}}
Output: San Francisco
```

### Special Variables
- `{{duration_ms}}` - Span duration in milliseconds
- `{{event.count}}` - Number of events in execution
- `{{span.count}}` - Number of spans in execution

### Missing Variables
If a variable isn't found in the event data:
```
Template: Order {{order.id}} for {{customer.name}}
Data: {order.id: "ORD-123"}
Output: Order ORD-123 for {{customer.name}}
```

The UI shows a warning banner when variables can't be resolved, allowing users to click "Raw Events" to see available data.

## Condition Matching Logic

Scenarios are evaluated in priority order (lowest number first):

```json
{
  "scenarios": [
    {
      "id": "success",
      "priority": 1,  // ← Checked first
      "condition": {"type": "attribute", "key": "status", "value": "completed"}
    },
    {
      "id": "failure",
      "priority": 2,  // ← Checked second
      "condition": {"type": "attribute", "key": "status", "value": "failed"}
    },
    {
      "id": "default",
      "priority": 999,  // ← Fallback, checked last
      "condition": {"type": "event", "event": "*"}
    }
  ]
}
```

**First match wins** - Once a scenario's condition matches, that's the one used.

## Validation

**MANDATORY STEP:** After creating or updating a .narrative.json file, you MUST validate it:

```bash
npx @principal-ai/principal-view-cli validate
```

This checks:
- JSON syntax
- Required fields (name, scenarios, conditions, templates)
- Scenario structure (id, priority, condition, template)
- Condition syntax (valid types, required fields)
- Template structure (summary, steps, details)
- Canvas path reference exists

**Do not consider the skill complete until validation passes.**

Common validation fixes:
- Ensure all scenarios have unique IDs
- Add priority to all scenarios
- Verify condition types are valid ("event", "attribute", "span", "and", "or")
- Check template has at least a summary
- Confirm canvasPath points to existing .otel.canvas file

## Testing Narratives

After creating a narrative file, test it with real execution data:

1. **Find or create execution data** (`.otel.json` files in `__executions__/`)
2. **Load in ExecutionViewerPanel** - Opens in Storybook or ADE
3. **Verify scenario matching** - Correct scenario selected for the execution
4. **Check variable population** - All {{variables}} filled with actual values
5. **Review readability** - Narrative makes sense and is helpful

If variables show as `{{missing.var}}`:
- Click "Raw Events" to see available attributes
- Update template to use correct attribute names
- Re-validate and re-test

## File Organization

Narrative files live alongside their canvases:

```
.principal-views/
├── order-processing.otel.canvas       # Canvas definition
├── order-processing.narrative.json    # Narrative scenarios
└── __executions__/
    ├── order-success.otel.json        # Success execution data
    ├── order-failure.otel.json        # Failure execution data
    └── order-timeout.otel.json        # Timeout execution data
```

This co-location makes it clear which narratives apply to which canvases.

## Integration with ExecutionViewerPanel

When narratives are available, ExecutionViewerPanel:
- Auto-selects the narrative on canvas load
- Shows scenario mapping panel (which executions match which scenarios)
- Allows clicking execution files to view rendered narratives
- Provides "Raw Events / Narrative" toggle
- Shows warning banner when template variables can't be resolved

## Examples in the Codebase

See these files for complete examples:
- `.principal-views/order-processing.narrative.json` - E-commerce order scenarios
- `.principal-views/graph-converter.narrative.json` - Canvas conversion scenarios
- `.principal-views/forge-otel-events.narrative.json` - Jira integration scenarios

## Tips

1. **Start simple**: Begin with just success and failure scenarios
2. **One outcome per scenario**: Don't try to handle multiple outcomes in one scenario
3. **Use priority wisely**: Most specific (1-3), moderate (4-10), fallback (999)
4. **Test with real data**: Don't guess at attribute names - use actual execution data
5. **Keep narratives short**: 3-7 steps is ideal, use details for more info
6. **Use emojis consistently**: Pick a set and stick with it
7. **Show the flow**: Use → to indicate progression through steps
8. **Extract key values**: Pull out IDs, amounts, timestamps that help debugging
9. **Provide context**: Don't just say "failed" - say why it failed
10. **Update with canvas**: When canvas events change, update narrative templates

## CLI Commands

### Validate narratives
```bash
npx @principal-ai/principal-view-cli validate
```

### Generate TypeScript types (future)
```bash
npx @principal-ai/principal-view-cli generate-types
```

## Common Pitfalls

### ❌ Don't: Overly complex conditions
```json
{
  "condition": {
    "type": "and",
    "conditions": [
      {"type": "and", "conditions": [
        {"type": "or", "conditions": [
          {"type": "attribute", "key": "a", "value": "1"},
          {"type": "attribute", "key": "b", "value": "2"}
        ]},
        {"type": "attribute", "key": "c", "value": "3"}
      ]},
      {"type": "event", "event": "foo"}
    ]
  }
}
```

### ✅ Do: Simple, clear conditions
```json
{
  "condition": {
    "type": "and",
    "conditions": [
      {"type": "event", "event": "order.completed"},
      {"type": "attribute", "key": "status", "value": "success"}
    ]
  }
}
```

### ❌ Don't: Hardcode values in templates
```json
{
  "summary": "Order ORD-12345 completed"  // Hardcoded ID
}
```

### ✅ Do: Use variables
```json
{
  "summary": "Order {{order.id}} completed"  // Dynamic
}
```

### ❌ Don't: Generic, unhelpful narratives
```json
{
  "summary": "Execution complete",
  "steps": ["Step 1", "Step 2", "Step 3"]
}
```

### ✅ Do: Specific, actionable narratives
```json
{
  "summary": "✅ Order {{order.id}} shipped to {{customer.city}}",
  "steps": [
    "→ Payment: ${{payment.amount}} via {{payment.method}}",
    "→ Inventory: {{items.count}} items reserved",
    "→ Shipping: {{carrier}} tracking {{tracking.number}}"
  ]
}
```

## References

- ExecutionViewerPanel - Renders narratives in the UI
- NarrativeRenderer - Component that displays narrative output
- renderNarrative() - Core function that evaluates scenarios and templates
- principal-view-core - Library with narrative rendering logic
