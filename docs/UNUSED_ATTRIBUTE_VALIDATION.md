# Unused Attribute Validation

This document describes the validation rule that ensures all defined event/span attributes are used in scenario templates.

## Overview

When defining event schemas (either inline on canvas nodes or in `library.yaml`), all attributes should have a purpose. This validation ensures:

1. Every attribute defined in an event schema is referenced in at least one template
2. Typos in template references are caught early
3. Stale attribute definitions are identified after template changes

## Schema Changes

### `display` Property

Add an optional `display` property to `PVEventFieldSchema`:

```typescript
export interface PVEventFieldSchema {
  /** Field data type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Whether this field is required */
  required?: boolean;
  /** Description of what this field represents */
  description?: string;
  /**
   * Whether this attribute is intended for template display.
   * Set to false for telemetry/analytics-only attributes.
   * Defaults to true.
   */
  display?: boolean;
}
```

### Usage

```yaml
# library.yaml
eventSchemas:
  user.login:
    description: User authentication event
    attributes:
      username:
        type: string
        required: true
        description: The authenticated username
      loginMethod:
        type: string
        description: Authentication method used (password, sso, etc.)
      # Analytics-only attributes
      requestId:
        type: string
        display: false
        description: Internal correlation ID for debugging
      sessionFingerprint:
        type: string
        display: false
        description: Device fingerprint for analytics
```

## Validation Rules

### Rule 1: Minimum Displayable Attributes

#### Rule ID

`canvas-event-no-displayable-attributes`

#### Severity

ERROR

#### Behavior

Every event schema must define at least one displayable attribute (`display !== false`). Events are meant to convey meaningful information - if there's nothing to display, the event schema is incomplete.

#### Error Message Format

```
Event "system.ready" has no displayable attributes.
Add at least one attribute without display: false, or remove the event schema if no data is needed.
```

### Rule 2: Unused Attributes

#### Rule ID

`workflow-attribute-unused`

#### Severity

ERROR

#### Behavior

For each event schema (inline or library reference):

1. Collect all attributes where `display !== false`
2. Extract all attribute references from scenario templates that use this event
3. Report any displayable attributes not referenced in any template

#### Error Message Format

```
Event "user.login" defines attribute "loginMethod" that is not used in any template.
Either use {{loginMethod}} in a template or mark it as display: false if it's for telemetry only.
```

### Template Scope

Both rules check attribute usage across:

- `scenarios[].template.introduction`
- `scenarios[].template.events[eventName]`
- `scenarios[].template.summary`
- `scenarios[].template.flow[].template`

## Examples

### Valid: All attributes used

```yaml
# Canvas event schema
event:
  name: order.completed
  attributes:
    orderId: { type: string }
    total: { type: number }

# Workflow template
template:
  events:
    order.completed: "Order {{orderId}} completed for {{total}}"
```

### Valid: Telemetry attribute marked

```yaml
# Canvas event schema
event:
  name: order.completed
  attributes:
    orderId: { type: string }
    total: { type: number }
    traceId: { type: string, display: false }

# Workflow template - traceId not used, but that's OK
template:
  events:
    order.completed: "Order {{orderId}} completed for {{total}}"
```

### Invalid: Unused displayable attribute

```yaml
# Canvas event schema
event:
  name: order.completed
  attributes:
    orderId: { type: string }
    total: { type: number }
    customerName: { type: string }  # ERROR: not used

# Workflow template
template:
  events:
    order.completed: "Order {{orderId}} completed for {{total}}"
```

### Invalid: No displayable attributes

```yaml
# Canvas event schema
event:
  name: system.heartbeat
  attributes:
    timestamp: { type: number, display: false }
    traceId: { type: string, display: false }
    # ERROR: no displayable attributes - all are marked display: false
```

## Implementation Notes

### Location

Add validation in `packages/core/src/workflow/validator.ts`:

1. New method: `checkEventAttributeRequirements(context: ValidationContext)`
2. Call from `validate()` after existing attribute checks
3. Add both rule IDs to `ValidationRuleId` union type

### Algorithm

```
for each event schema in canvas:
  displayableAttrs = attributes where display !== false

  # Rule 1: Require at least one displayable attribute
  if displayableAttrs is empty:
    emit error with rule 'canvas-event-no-displayable-attributes'
    continue  # skip unused check for this event

  # Rule 2: All displayable attributes must be used
  usedAttrs = set()

  for each scenario referencing this event:
    extract attribute references from all templates
    add to usedAttrs

  unusedAttrs = displayableAttrs - usedAttrs

  for each unused attribute:
    emit error with rule 'workflow-attribute-unused'
```

### Nested Attributes

For object-type attributes, consider the attribute "used" if any nested path is referenced:

- Attribute `config` with type `object`
- Template uses `{{config.timeout}}`
- Attribute `config` is considered used

## Migration

Existing canvases may have attributes that aren't used in templates. To migrate:

1. Run validation to identify unused attributes
2. For each unused attribute, either:
   - Add it to a template if it should be displayed
   - Add `display: false` if it's for telemetry only
   - Remove it if it's truly unnecessary

## Related Rules

| Rule ID | Description |
|---------|-------------|
| `canvas-event-no-displayable-attributes` | Event schema has no displayable attributes |
| `workflow-attribute-unused` | Displayable attribute not used in any template |
| `workflow-attribute-undefined` | Template references attribute not in execution data |
| `workflow-attribute-object` | Object attribute used directly without property access |
| `workflow-attribute-path-conflict` | Conflicting attribute paths in template |
| `canvas-event-attribute-conflict` | Conflicting paths in canvas event schema |
