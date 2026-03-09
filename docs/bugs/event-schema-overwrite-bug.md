# Bug: Event Schema Overwrites When Mixing Inline and eventRef

## Summary

When a canvas has multiple nodes referencing the same event name - one with an inline `event` definition and others with `eventRef` - the workflow validator incorrectly reports that template attributes are not defined in the schema.

## Severity

**High** - Causes false positive validation errors that block valid workflows from passing validation.

## Location

`packages/core/src/workflow/validator.ts` - `checkTemplateAttributesDefinedInSchema()` method (lines ~1834-1876)

## Root Cause

The validator iterates through canvas nodes and builds a map of event names to their schema attributes. The problem is that `Map.set()` **overwrites** existing entries:

```typescript
for (const node of canvas.nodes) {
  let eventName: string | undefined;
  let eventSchema: { attributes?: Record<string, unknown> } | undefined;

  if (node.pv.event && typeof node.pv.event === 'object' && node.pv.event.name) {
    eventName = node.pv.event.name;
    eventSchema = node.pv.event;  // Has attributes
  } else if (node.pv.eventRef && typeof node.pv.eventRef === 'string') {
    eventName = node.pv.eventRef;
    // Try to get schema from registry (library.yaml)
    const sources = context.eventRegistry?.findEvent(eventName) ?? [];
    const librarySource = sources.find((s) => s.type === 'library' && s.eventSchema);
    if (librarySource?.eventSchema) {
      eventSchema = librarySource.eventSchema;
    }
    // If not in library, eventSchema is undefined → empty attributes
  }

  const schemaAttrs = new Set<string>();
  if (eventSchema?.attributes) {
    for (const attrName of Object.keys(eventSchema.attributes)) {
      schemaAttrs.add(attrName);
    }
  }

  eventSchemaAttributes.set(eventName, schemaAttrs);  // BUG: Overwrites!
}
```

## Reproduction

Given this canvas structure:

```json
{
  "nodes": [
    {
      "id": "node-a",
      "pv": {
        "event": {
          "name": "my.event",
          "attributes": {
            "user.id": { "type": "string" },
            "action": { "type": "string" }
          }
        }
      }
    },
    {
      "id": "node-b",
      "pv": {
        "eventRef": "my.event"
      }
    }
  ]
}
```

And this workflow:

```json
{
  "scenarios": [{
    "template": {
      "events": {
        "my.event": "User {{user.id}} performed {{action}}"
      }
    }
  }]
}
```

**Expected:** Validation passes (attributes are defined in node-a's inline schema)

**Actual:** Validation fails with:
```
Template references "{{user.id}}" but it is not defined in the event schema for "my.event"
Template references "{{action}}" but it is not defined in the event schema for "my.event"
```

## Why It Happens

1. Validator processes `node-a` first → `eventSchemaAttributes.set("my.event", {"user.id", "action"})`
2. Validator processes `node-b` with `eventRef: "my.event"`
3. Event not found in library.yaml → `eventSchema` is undefined
4. `schemaAttrs` is empty set
5. `eventSchemaAttributes.set("my.event", {})` **overwrites** the valid schema!
6. Later validation checks find empty attribute set → reports errors

## Suggested Fix

Option 1: Only overwrite if we have a non-empty schema:

```typescript
// Only update if we found attributes, or if no entry exists yet
if (schemaAttrs.size > 0 || !eventSchemaAttributes.has(eventName)) {
  eventSchemaAttributes.set(eventName, schemaAttrs);
}
```

Option 2: Merge attributes from all sources:

```typescript
const existing = eventSchemaAttributes.get(eventName) ?? new Set<string>();
for (const attr of schemaAttrs) {
  existing.add(attr);
}
eventSchemaAttributes.set(eventName, existing);
```

Option 3: Prioritize inline definitions over eventRef:

```typescript
// Skip eventRef if we already have an inline definition
if (eventSchemaAttributes.has(eventName) && node.pv.eventRef) {
  continue;
}
```

## Current Workaround

Users must either:

1. **Use inline `event` on ALL nodes** that reference the same event (duplicating the schema)
2. **Define the event in library.yaml** and use `eventRef` everywhere (but library.yaml doesn't support `eventSchemas` field currently)
3. **Only have ONE node per event** in the canvas

## Related

- The `library.yaml` schema doesn't currently allow an `eventSchemas` field at root level, which would be the proper place to define shared event schemas
- Consider adding `eventSchemas` support to library.yaml as part of fixing this issue

## Discovered

2024-03-08 while debugging validation errors in `terminal-activity-tracking` canvas where `window-a` had inline event definition and `window-b`/`window-c` used `eventRef` to the same event.
