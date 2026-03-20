# Unused Attribute Validation

This document describes the validation rule that ensures all defined event attributes are used in scenario templates.

## Overview

When defining event schemas (either inline on canvas nodes or in `library.yaml`), all attributes must be used in templates. This validation ensures:

1. Every attribute defined in an event schema is referenced in at least one template
2. Typos in template references are caught early
3. Stale attribute definitions are identified after template changes

## Validation Rule

### Rule ID

`workflow-attribute-unused`

### Severity

ERROR

### Behavior

For each event schema (inline or library reference):

1. Collect all attributes defined in the schema
2. Extract all attribute references from scenario templates that use this event
3. Report any attributes not referenced in any template

### Error Message Format

```
Event "user.login" defines attribute "loginMethod" that is not used in any template.
Use {{loginMethod}} in a template for event "user.login", or remove the attribute if it's not needed.
```

### Template Scope

The rule checks attribute usage across:

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

### Invalid: Unused attribute

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

## Implementation Notes

### Location

Validation is in `packages/core/src/workflow/validator.ts`:

1. Method: `checkEventAttributeRequirements(context: ValidationContext)`
2. Called from `validate()` after existing attribute checks

### Algorithm

```
for each event schema in canvas:
  definedAttrs = all attributes in schema

  usedAttrs = set()

  for each scenario referencing this event:
    extract attribute references from all templates
    add to usedAttrs

  unusedAttrs = definedAttrs - usedAttrs

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
   - Remove it if it's not needed

## Related Rules

| Rule ID | Description |
|---------|-------------|
| `workflow-attribute-unused` | Attribute not used in any template |
| `workflow-attribute-undefined` | Template references attribute not in execution data |
| `workflow-attribute-object` | Object attribute used directly without property access |
| `workflow-attribute-path-conflict` | Conflicting attribute paths in template |
| `canvas-event-attribute-conflict` | Conflicting paths in canvas event schema |
