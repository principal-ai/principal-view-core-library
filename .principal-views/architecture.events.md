# Principal View CLI Event Conventions

## Overview

This canvas defines the vocabulary of events that the Principal View CLI emits. Unlike spans (which represent operations and user workflows), events are point-in-time markers that map directly to code-level implementation details.

Edges represent **adjacency in scenarios** — if two events appear next to each other in any workflow scenario, they have an edge in the canvas.

## Events vs Spans

| Aspect | Spans | Events |
|--------|-------|--------|
| Temporal | Duration-based operations | Point-in-time occurrences |
| Abstraction | User stories / workflows | Code implementation details |
| Relationships | Parent-child hierarchy | Sequential adjacency |
| Example | `validate.workflow` | `validation.error`, `file.read.complete` |

## Event Namespaces

Events follow a hierarchical namespace convention:

```
{namespace}.{action}
```

Where:
- **Namespace**: All segments except the last (e.g., `validation`, `file.read`)
- **Action**: The final segment (e.g., `started`, `complete`, `error`)

Examples:
- `validation.started` → namespace: `validation`, action: `started`
- `validation.error` → namespace: `validation`, action: `error`
- `file.parsed` → namespace: `file`, action: `parsed`
- `canvas.validated` → namespace: `canvas`, action: `validated`

### Namespace Nodes

Each unique namespace **must have a corresponding node** in the events canvas with:
- `type: "event-namespace"`
- `namespace.name`: The namespace identifier
- `namespace.description`: What this namespace represents
- `namespace.events`: Array of all events in this namespace

This structure ensures:
1. Events are grouped by their functional domain
2. Each namespace is documented with its purpose
3. All events in a namespace are discoverable
4. Validation can verify namespace coverage

## Event Attributes

Each event should document:
- **Namespace**: The event identifier
- **Severity**: INFO, WARN, ERROR
- **Attributes**: Required and optional event attributes
- **Description**: When/why this event is emitted

## Adjacency Edges

Edges in the canvas represent sequential relationships found in workflow scenarios:

- **Direct adjacency only**: If scenario shows `A → B → C`, canvas gets edges `A → B` and `B → C`, NOT `A → C`
- **Cross-scenario consolidation**: Edge exists if events are adjacent in ANY scenario
- **Bidirectional possible**: `A → B` and `B → A` can both exist if scenarios show both flows

### Example

Given scenarios:
1. `file.read.complete → parse.started → parse.error`
2. `file.read.complete → parse.started → parse.complete`

Canvas edges:
- `file.read.complete → parse.started`
- `parse.started → parse.error`
- `parse.started → parse.complete`

## Validation

The events canvas is validated at multiple levels:

### 1. Namespace Structure Validation

- **Namespace node required**: Every unique namespace extracted from event names must have a corresponding `event-namespace` node
- **Event registration**: Every event must be listed in its namespace node's `events` array
- **Event name format**: Event names must have at least 2 segments (`{namespace}.{action}`)
- **Namespace consistency**: The namespace extracted from an event name must match the namespace node it's defined in

Example:
```json
{
  "id": "validation",
  "type": "event-namespace",
  "namespace": {
    "name": "validation",
    "events": [
      { "name": "validation.started", ... },
      { "name": "validation.complete", ... },
      { "name": "validation.error", ... }
    ]
  }
}
```

All three events share the `validation` namespace, which has a dedicated node.

### 2. Workflow Scenario Validation

The canvas is validated against all `.workflow.json` scenario files:

- **Edge completeness**: Every adjacent event pair in scenarios must have a corresponding canvas edge
- **No orphaned edges**: Canvas edges must exist in at least one scenario's adjacency
- **Event coverage**: All events referenced in scenarios must be documented in the canvas

**Validation ensures** the canvas is a living, accurate representation of actual event flows, not theoretical documentation.

## Usage

- **For developers**: Check which events to emit in code and what attributes they require
- **For architects**: See how events flow through the system at a structural level
- **For debugging**: Understand which events typically precede/follow others
