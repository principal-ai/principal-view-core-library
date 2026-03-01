# StoryGraphRenderer Design

> **Status**: Experimental
> **Prototype Location**: `industry-themed-principal-view-panels/src/panels/composable-explanation/`
> **Target Package**: `@principal-ai/principal-view-react`

## Overview

The `StoryGraphRenderer` is a composite graph renderer that displays canvas fragments from multiple sources in a single, focused view. Unlike the standard `GraphRenderer` which shows an entire canvas, this component extracts and composes only the nodes relevant to the current "step" of a story-driven explanation.

## Motivation

When explaining code flows or architecture, showing the entire canvas creates visual noise. Users need to focus on the specific nodes being discussed. The StoryGraphRenderer solves this by:

1. **Extracting fragments** - Pull only relevant nodes from source canvases
2. **Composing views** - Combine fragments from multiple canvases into one view
3. **Animating transitions** - Smoothly transition as nodes enter/exit between steps
4. **Auto-fitting** - Zoom to show only what matters

## Use Cases

| Use Case | Description |
|----------|-------------|
| **Code Review** | Walk through PR changes step-by-step, showing affected components |
| **Onboarding** | Guide new developers through architecture with progressive disclosure |
| **Exploration** | Answer "How does X work?" by tracing flow across canvases |
| **Incident Analysis** | Show error propagation path through the system |
| **Design Specs** | Propose changes with before/after fragment views |

## Architecture

### Core Concepts

```
┌─────────────────────────────────────────────────────────────────┐
│                        StoryGraphRenderer                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Canvas A   │    │   Canvas B   │    │   Canvas C   │      │
│  │  (full)      │    │  (full)      │    │  (full)      │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              Fragment Extraction                      │      │
│  │   extractFragment(canvas, nodeIds, alias)            │      │
│  └──────────────────────────┬───────────────────────────┘      │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              Fragment Composition                     │      │
│  │   composeFragments(fragments, bridges, config)       │      │
│  └──────────────────────────┬───────────────────────────┘      │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              Composed Canvas                          │      │
│  │   • Unified node IDs (alias:originalId)              │      │
│  │   • Adjusted positions                                │      │
│  │   • Bridge edges between canvases                     │      │
│  └──────────────────────────┬───────────────────────────┘      │
│                             │                                   │
│                             ▼                                   │
│  ┌──────────────────────────────────────────────────────┐      │
│  │              GraphRenderer                            │      │
│  │   (existing component from @principal-ai/react)      │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Types

```typescript
/**
 * A single step defining what to show
 */
interface StoryStep {
  id: string;
  /** Nodes to show, grouped by canvas alias */
  nodes: Record<string, string[]>;
  /** Bridge edges connecting canvases */
  bridges?: BridgeEdge[];
  /** Primary node to highlight */
  highlightNodeId?: string;
  /** Layout override */
  layout?: CompositionConfig;
}

/**
 * Fragment extracted from a canvas
 */
interface CanvasFragment {
  sourceAlias: string;
  nodes: ExtendedCanvasNode[];
  edges: ExtendedCanvasEdge[];
  bounds: { minX, minY, maxX, maxY, width, height };
}

/**
 * Bridge edge connecting nodes across canvases
 */
interface BridgeEdge {
  id: string;
  fromCanvas: string;
  fromNode: string;
  toCanvas: string;
  toNode: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'dotted';
}

/**
 * Composition configuration
 */
interface CompositionConfig {
  layout: 'horizontal' | 'vertical' | 'preserve' | 'auto';
  fragmentGap: number;
  padding: number;
  center: boolean;
}
```

### Component API

```typescript
interface StoryGraphRendererProps {
  /** Map of canvas alias to loaded canvas data */
  canvases: Map<string, ExtendedCanvas>;

  /** Steps defining what to show */
  steps: StoryStep[];

  /** Current step index */
  currentStepIndex: number;

  /** Node click handler */
  onNodeClick?: (
    nodeId: string,
    sourceAlias: string,
    originalId: string,
    event: React.MouseEvent
  ) => void;

  /** Animation settings */
  animateTransitions?: boolean;
  animationDuration?: number;

  /** View settings */
  fitViewOnStepChange?: boolean;
  showMinimap?: boolean;
  showControls?: boolean;
}
```

## Fragment Extraction

The extraction process takes a full canvas and a list of node IDs, returning only those nodes and the edges connecting them.

```typescript
function extractFragment(
  canvas: ExtendedCanvas,
  nodeIds: string[],
  sourceAlias: string
): CanvasFragment {
  const nodeIdSet = new Set(nodeIds);

  // Extract matching nodes
  const nodes = canvas.nodes.filter(n => nodeIdSet.has(n.id));

  // Extract edges where BOTH endpoints are in fragment
  const edges = canvas.edges.filter(e =>
    nodeIdSet.has(e.fromNode) && nodeIdSet.has(e.toNode)
  );

  // Calculate bounding box
  const bounds = calculateBounds(nodes);

  return { sourceAlias, nodes, edges, bounds };
}
```

## Fragment Composition

Multiple fragments are composed into a single canvas with unified IDs and adjusted positions.

### ID Namespacing

To avoid collisions, composed node IDs use the format `{alias}:{originalId}`:

```
Canvas A node "server"  →  "canvasA:server"
Canvas B node "server"  →  "canvasB:server"
```

### Layout Strategies

| Strategy | Description |
|----------|-------------|
| `preserve` | Keep original positions (useful for same-canvas fragments) |
| `horizontal` | Arrange fragments left-to-right |
| `vertical` | Arrange fragments top-to-bottom |
| `auto` | Choose based on fragment aspect ratios |

### Bridge Edges

Bridge edges connect nodes across canvas boundaries:

```typescript
const bridges: BridgeEdge[] = [
  {
    id: 'main-to-detail',
    fromCanvas: 'architecture',
    fromNode: 'main-process',
    toCanvas: 'mcp-bridge',
    toNode: 'express-server',
    label: 'contains',
    style: 'dashed'
  }
];
```

## Transitions

When stepping between story steps, the renderer:

1. **Calculates diff** - Determines entering, exiting, staying nodes
2. **Animates out** - Fades/scales exiting nodes
3. **Repositions** - Moves staying nodes to new positions
4. **Animates in** - Fades/scales entering nodes
5. **Fits view** - Zooms to show all visible nodes

```typescript
interface StepTransition {
  entering: string[];  // New in next step
  exiting: string[];   // Removed in next step
  staying: string[];   // Present in both
}
```

## Integration with ComposableExplanationPanel

The `ComposableExplanationPanel` (in industry-themed-principal-view-panels) wraps the StoryGraphRenderer with:

- Header with title and render mode toggle
- Step carousel for navigation
- Conversion from explanation steps to story steps

```typescript
// Explanation steps use ref format: "canvas-alias:node-id"
const explanationStep = {
  id: 'step-1',
  ref: 'mcp-bridge:express-server',
  content: 'The Express server handles requests...',
  focus: {
    existing: ['mcp-client', 'express-server']
  }
};

// Converted to story step
const storyStep = {
  id: 'step-1',
  nodes: {
    'mcp-bridge': ['mcp-client', 'express-server']
  },
  highlightNodeId: 'express-server'
};
```

## Render Modes

The panel supports two modes:

| Mode | Description |
|------|-------------|
| **Story** | Uses StoryGraphRenderer - shows only relevant fragments |
| **Full** | Uses GraphRenderer - shows entire canvas with highlights |

Users can toggle between modes to see context vs. focus.

## Future Considerations

### Node Grouping
When multiple fragments are shown, consider visual grouping (background regions) to indicate which canvas each node came from.

### Zoom Levels
Support semantic zoom levels:
- **Overview**: Show canvas labels, hide node details
- **Standard**: Show nodes with labels
- **Detail**: Show node metadata, source links

### Animation Presets
Provide animation presets for different use cases:
- `instant` - No animation
- `smooth` - Default fade/scale
- `dramatic` - Slower, more pronounced
- `presentation` - Optimized for screen sharing

### Workflow Integration
Connect to WorkflowTemplate scenarios:
- Show scenario events as they would highlight nodes
- Support playback controls (play, pause, step)
- Correlate with OTEL traces

## Experimental Implementation

The current prototype lives in:
```
industry-themed-principal-view-panels/
└── src/panels/composable-explanation/
    ├── types.ts                  # Type definitions
    ├── canvasFragments.ts        # Fragment extraction/composition
    ├── StoryGraphRenderer.tsx    # The renderer component
    ├── StepCarousel.tsx          # Navigation UI
    ├── ComposableExplanationPanel.tsx  # Panel wrapper
    └── *.stories.tsx             # Storybook demos
```

### Running the Prototype

```bash
cd industry-themed-principal-view-panels
bun run storybook
# Navigate to Panels > ComposableExplanationPanel
```

### Stories Available

- `StoryMode` - Default focused fragment view
- `FullMode` - Entire canvas with highlights
- `MultiCanvas` - Steps pulling from different canvases
- `StoryGraphRendererDemo` - Standalone renderer test

## Migration Path

When ready to promote to core library:

1. Move `canvasFragments.ts` types/utilities to `@principal-ai/core`
2. Move `StoryGraphRenderer.tsx` to `@principal-ai/react`
3. Update `GraphRenderer` to share common infrastructure
4. Keep panel-specific components in `industry-themed-principal-view-panels`
5. Update imports and publish new versions

## Related Documents

- [Composable Explanations Format](/Users/griever/Developer/desktop-app/electron-app/docs/composable-explanations.md) - The explanation document format
- [GraphRenderer](/packages/react/src/components/GraphRenderer.tsx) - Base renderer this builds upon
