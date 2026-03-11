# Flow Directives (Deferred Feature)

**Status**: Deferred
**Removed in**: v0.x.x (pending)
**Reason**: Implementation incomplete; simplifying to strings-only for now

## Overview

Flow directives were designed to support loops and conditionals within workflow `flow` arrays. This feature has been deferred until proper support can be implemented.

## Original Design

The `flow` array in `ScenarioTemplate` could contain either plain strings or `FlowDirective` objects:

```typescript
interface FlowDirective {
  /** Iterate over collection (e.g., "violations") */
  forEach?: string;

  /** Template for each item in iteration */
  template?: string;

  /** Conditional expression */
  if?: string;

  /** Template if condition true */
  then?: string;

  /** Template if condition false */
  else?: string;
}
```

### forEach Example

```json
{
  "flow": [
    "Found {{violations.length}} violations:",
    { "forEach": "violations", "template": "  - {{message}} at {{location}}" }
  ]
}
```

This would iterate over the `violations` array in the context and render a line for each item. The iteration context included:
- All properties from the current item (spread into context)
- `{{index}}` - the zero-based index of the current item

### Conditional Example

```json
{
  "flow": [
    {
      "if": "{{hasErrors}}",
      "then": "Process failed with errors",
      "else": "Process completed successfully"
    }
  ]
}
```

## Implementation Notes

The original implementation (in `template-renderer.ts`) had these limitations:

1. **Naive condition evaluation**: Only checked for literal `"true"` or `"1"` strings
2. **No nested directives**: Couldn't nest `forEach` inside conditionals or vice versa
3. **Limited collection access**: Only supported top-level context properties for `forEach`

## Current Behavior

The `flow` field now only accepts an array of strings:

```typescript
flow?: string[];
```

Each string is rendered as a Handlebars template with access to the full event context.

## Future Considerations

When re-implementing this feature, consider:

1. **Better condition evaluation**: Support truthy/falsy checks, comparisons
2. **Nested directives**: Allow combining loops and conditionals
3. **Array access syntax**: Support `forEach: "result.violations"` with dot notation
4. **Error handling**: Graceful handling of missing collections or invalid templates
5. **Type safety**: Generate TypeScript types from workflow schemas

## Related Files

- `packages/core/src/workflow/types.ts` - Type definitions
- `packages/core/src/workflow/template-renderer.ts` - Rendering logic
- `docs/WORKFLOW_TEMPLATES_DESIGN.md` - Overall workflow design
