# Event Template Example Values

## Overview

Add required `example` fields to event attribute schemas, enabling preview rendering of templates with realistic placeholder values instead of raw handlebars syntax.

**Current behavior:**
```
Template: "User {{user.name}} completed {{action}}"
Preview:  "User {{user.name}} completed {{action}}"
```

**Proposed behavior:**
```
Template: "User {{user.name}} completed {{action}}"
Preview:  "User Jane Smith completed checkout"
```

## Motivation

- Templates with raw `{{handlebars}}` are hard to visualize
- Authors can't see what their templates will look like until runtime
- Documentation and UI previews would benefit from realistic examples
- Ensures schema authors think about realistic attribute values upfront

## Schema Changes

### `PVEventFieldSchema` (packages/core/src/types/canvas.ts)

```typescript
interface PVEventFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  required?: boolean
  description?: string
  example: PVExampleValue  // NEW - required for all attributes
}

// Support complex nested structures
type PVExampleValue =
  | string
  | number
  | boolean
  | PVExampleValue[]
  | { [key: string]: PVExampleValue }
```

### Example Schema

```yaml
events:
  user.checkout:
    description: User completed checkout
    attributes:
      user.name:
        type: string
        example: "Jane Smith"
      cart.items:
        type: array
        example:
          - name: "Widget"
            price: 29.99
          - name: "Gadget"
            price: 49.99
      cart.total:
        type: number
        example: 79.98
      payment.success:
        type: boolean
        example: true
```

## New API

### `previewEventTemplate()`

New function separate from `renderEventTemplate()`:

```typescript
// packages/core/src/workflow/template-renderer.ts

export function previewEventTemplate(
  template: string,
  schema: PVEventSchema
): ParsedTemplate
```

**Parameters:**
- `template` - The handlebars template string
- `schema` - Event schema containing attribute definitions with examples

**Returns:**
- `ParsedTemplate` with all variables resolved using example values

**Usage:**
```typescript
import { previewEventTemplate } from '@anthropic-ai/core'

const schema: PVEventSchema = {
  name: 'user.checkout',
  attributes: {
    'user.name': { type: 'string', example: 'Jane Smith' },
    'cart.total': { type: 'number', example: 79.98 }
  }
}

const preview = previewEventTemplate(
  'User {{user.name}} spent ${{cart.total}}',
  schema
)

console.log(preview.toString())
// "User Jane Smith spent $79.98"
```

### Comparison with `renderEventTemplate()`

| Aspect | `renderEventTemplate()` | `previewEventTemplate()` |
|--------|------------------------|-------------------------|
| Input | Event with real attributes | Schema with examples |
| Use case | Runtime rendering | Design-time preview |
| Unresolved vars | Remain as `{{var}}` | Error (schema incomplete) |
| Segment metadata | `resolved: boolean` | All resolved |

## Validation Rules

### 1. Example Required for All Attributes

**Rule:** All attributes must have an `example` field.

**Error:**
```
error[missing-example]: Attribute "user.name" has no example value
  --> workflow.yaml:15:7
   |
15 |       user.name:
   |       ^^^^^^^^^ add 'example' field with a representative value
```

### 2. Example Type Must Match Declared Type

**Rule:** The `example` value must be compatible with the declared `type`.

**Error:**
```
error[example-type-mismatch]: Example value "hello" is not compatible with type "number"
  --> workflow.yaml:18:9
   |
18 |         example: "hello"
   |                  ^^^^^^^ expected number, got string
```

### 3. Complex Examples Must Match Structure

**Rule:** For `object` and `array` types, example structure should support all template references.

**Warning:**
```
warning[incomplete-example]: Template references "cart.items.0.sku" but example doesn't include "sku"
  --> workflow.yaml:25:9
   |
25 |         example:
   |         ^^^^^^^ add "sku" field to array item examples
```

## Implementation Plan

### Phase 1: Schema Extension
1. Add `example` field to `PVEventFieldSchema` type
2. Add `PVExampleValue` type for complex structures
3. Update JSON schema for validation

### Phase 2: Preview Function
1. Create `previewEventTemplate()` in template-renderer.ts
2. Add `buildContextFromExamples()` helper to convert schema examples to template context
3. Export from workflow/index.ts

### Phase 3: Validation
1. Add `missing-example` validation rule
2. Add `example-type-mismatch` validation rule
3. Add `incomplete-example` warning for partial object/array examples

### Phase 4: Integration
1. Update CLI to show previews in validation output
2. Update any UI components that render templates

## Open Questions

1. **Span attribute examples** - Should `@span.*` references also require examples in some parent schema, or are those always resolved at runtime?

2. **Conditional blocks** - How should `{{#if condition}}` blocks render in preview? Options:
   - Render the "true" branch always
   - Render both branches with visual separation
   - Use example value to determine branch

3. **Loops** - For `{{#each items}}`, should we:
   - Render with all example array items
   - Render with just first item + "..." indicator
   - Make this configurable

## Migration

Existing schemas without `example` fields will fail validation. Migration path:

1. Run validator to identify all missing examples
2. Add example values based on attribute names/types
3. Optionally: provide a CLI command to generate stub examples from types
