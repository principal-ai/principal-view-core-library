# Sequence Diagram Visualization Design

## Overview

A sequence diagram view for workflow scenarios that uses **namespaces as swimlanes** to represent actors/components, with events positioned vertically by order and edges drawn as arrows between lanes.

## Core Concepts

### Swimlanes = Namespaces (Actors)

Namespaces serve as actor identifiers rather than purely technical groupings. Users are encouraged to define span/event namespaces that represent meaningful actors in their system.

Examples:
- `auth.validation` - Authentication validation component
- `database.query` - Database layer
- `user.session` - User session management

### Vertical Position = Event Order

Events are positioned vertically based on their order in the scenario. The implicit ordering provides the time axis without requiring explicit timestamps.

### Arrows = Edges Between Events

Existing edges in the workflow/canvas define the arrows connecting events across swimlanes. This provides explicit causality without inference.

## Namespace Hierarchy and Drill-down

### The Problem

Events may exist at different levels of a namespace hierarchy:
- `auth` (top-level)
- `auth.validation` (sub-namespace)
- `auth.token` (sub-namespace)

### Proposed Solution: Collapsible Swimlanes

**Collapsed State:**
- Top-level namespace shown as single swimlane
- Sub-namespace events visually grouped/stacked within the lane
- Provides high-level overview with less visual noise

**Expanded State:**
- Swimlane splits into sub-lanes for each sub-namespace
- Shows detailed activity within a component
- Detail on demand when users want to understand internal flow

## Open Questions

### Q1: Mixed Depth Events

What happens when `auth` has direct events AND `auth.validation` has events?

Options:
- [ ] A. Parent namespace gets its own implicit sub-lane when expanded (e.g., `auth` becomes `auth._root` + `auth.validation`)
- [ ] B. Direct parent events shown at the top of the expanded lane, visually distinct
- [ ] C. Encourage users to always use leaf namespaces (lint warning for mixed depths)

**Decision:** _TBD_

### Q2: Cross-Level Edge Rendering

An edge from `auth.validation` → `database` when `auth` is collapsed:

Options:
- [ ] A. Arrow originates from collapsed `auth` lane (loses specificity but cleaner)
- [ ] B. Show a "peek" indicator that there's internal detail
- [ ] C. Auto-expand source lane when hovering over the edge

**Decision:** _TBD_

### Q3: Default Collapse Level

How do we determine the initial collapse state?

Options:
- [ ] A. Infer from data (collapse if sub-namespaces exist, otherwise flat)
- [ ] B. User-configurable default in canvas/workflow settings
- [ ] C. Always start fully collapsed, let user expand
- [ ] D. Smart default based on number of events (collapse if > N events would show)

**Decision:** _TBD_

### Q4: Same-Namespace Edge Rendering

When an edge connects two events in the same namespace:

Options:
- [ ] A. Draw vertical arrow within the lane
- [ ] B. Let vertical ordering imply the flow (no arrow)
- [ ] C. Show as a subtle connector/dot on the lane's timeline

**Decision:** _TBD_

### Q5: Namespace Extraction Strategy

How do we determine the namespace from an event name like `auth.validation.started`?

Options:
- [ ] A. First segment only (`auth`)
- [ ] B. All but last segment (`auth.validation`)
- [ ] C. User-defined depth per canvas/workflow
- [ ] D. Infer from event schema groupings

**Decision:** _TBD_

## Data Model Mapping

### From Current Schema

```typescript
// Event with namespace derived from name
interface OtelEvent {
  name: string;  // e.g., 'auth.validation.started'
  // namespace: derived from name segments
}

// Edges from canvas
interface CanvasEdge {
  fromNode: string;  // event node id
  toNode: string;    // event node id
}

// Scope context (optional grouping)
interface OtelScopeNode {
  otel: {
    scope: string;  // e.g., 'principal-view.cli'
  }
}
```

### Proposed Sequence Diagram Model

```typescript
interface SequenceDiagramConfig {
  // Namespace extraction strategy
  namespaceDepth: 'first' | 'all-but-last' | number | 'custom';

  // Initial collapse state
  defaultCollapseLevel: number | 'all' | 'none';

  // Same-namespace edge rendering
  intraNamespaceEdges: 'arrow' | 'implicit' | 'subtle';
}

interface SequenceLane {
  namespace: string;
  parentNamespace?: string;
  events: SequenceEvent[];
  isCollapsed: boolean;
  subLanes?: SequenceLane[];
}

interface SequenceEvent {
  id: string;
  name: string;
  fullNamespace: string;
  order: number;
}

interface SequenceArrow {
  fromEventId: string;
  toEventId: string;
  crossesLanes: boolean;
}
```

## Implementation Approach

### Phase 1: React Flow Prototype

Start with React Flow (`@xyflow/react`) to leverage existing infrastructure:
- Reuse pan/zoom, selection, edge rendering, tooltips from GraphRenderer
- Implement custom layout logic to position nodes in swimlane columns
- Swimlanes as visual groupings (background decorations or group nodes)
- Consistent look/feel with existing canvas views

Benefits:
- Faster iteration on UX behavior
- Can toggle between "canvas view" and "sequence view" of same data
- Leverage existing node/edge components

### Phase 2: SVG Migration (If Needed)

Once UI behavior is nailed down, may migrate to purpose-built SVG component for:
- Performance optimization (lighter weight, no React Flow overhead)
- Full control over swimlane rendering and collapse/expand animations
- Simpler mental model for sequence-specific interactions

Decision criteria for migration:
- Performance issues with large scenarios (>50 events)
- Need for custom interactions that fight React Flow's model
- Desire for pixel-perfect sequence diagram aesthetics

## UI Exploration Tasks

- [ ] Prototype basic swimlane layout with mock data
- [ ] Test collapse/expand interaction
- [ ] Explore edge rendering for cross-lane vs same-lane
- [ ] Test with real workflow scenarios to find edge cases
- [ ] Determine visual treatment for grouped events in collapsed state

## References

- Existing workflow types: `/packages/core/src/workflow/types.ts`
- Canvas node types: `/packages/core/src/types/canvas.ts`
- Event schema patterns: `.principal-views/CODE-GENERATION-GUIDE.md`
