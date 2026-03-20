# External Events Should Be Excluded from Workflow Coverage Validation

## Problem Statement

When a canvas documents a flow that spans multiple packages (some local, some external), the workflow validation requires ALL events to be covered by workflows. However, events that are emitted by external packages cannot be instrumented in the current codebase.

Adding `"external": true` to `pv` should exclude the event from the "all events must be covered by workflows" validation, but currently this flag is ignored.

### Current Behavior

```json
{
  "id": "emit-open-canvas",
  "type": "otel-event",
  "pv": {
    "status": "approved",
    "external": true,
    "references": [
      "packages/principal-ai/principal-view-panels/src/storyboard-list-panel/StoryboardListPanel.tsx"
    ]
  },
  "event": {
    "name": "stories.event.openCanvas"
  }
}
```

Validation error:
```
error: Canvas defines event "stories.event.openCanvas" which is not used in any workflow for this canvas
  → Add event "stories.event.openCanvas" to a scenario's template.events or condition.requires
```

### Expected Behavior

Events with `pv.external: true` should be excluded from workflow coverage validation since they cannot be instrumented in the current codebase.

## Use Cases

1. **Event emitters in npm packages** - The event is emitted by an external panel, but received/handled in local code
2. **Cross-package flows** - Documenting a complete flow where some events happen in external packages
3. **Boundary events** - Events that represent the interface between local and external code

## Example: Stories Layout

The stories layout canvas documents a flow spanning:

| Event | Location | Instrumentable locally? |
|-------|----------|------------------------|
| `stories.editor.receive.openCanvas` | src/components/EditorLayout.tsx | ✓ Yes |
| `stories.event.openCanvas` | @industry-theme/principal-view-panels | ✗ No (external) |
| `stories.file-city.receive.context` | @industry-theme/file-city-panel | ✗ No (external) |

Workflows should only need to cover the locally instrumentable events.

## Proposed Solution

In workflow validation (`packages/principal-view-cli/src/commands/validate.ts`):

1. When collecting events from canvas, check for `pv.external: true`
2. Exclude external events from the "uncovered events" check
3. Optionally: warn if an external event IS included in a workflow (since it can't be instrumented anyway)

```typescript
// Pseudo-code
const localEvents = canvasEvents.filter(e => !e.pv?.external);
const uncoveredEvents = localEvents.filter(e => !workflowEvents.has(e.name));
```

## Related

- `backlog/external-source-references.md` - Related issue about external source file validation
- Canvas validation logic in `packages/principal-view-cli/src/commands/validate.ts`

## Context

Discovered while splitting `stories-layout` workflows in web-ade. The canvas documents the complete storyboard→file-city flow, but only some events are instrumentable in the local codebase.
