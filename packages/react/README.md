# @principal-ai/visual-validation-react

React UI **component library** for the Visual Validation Framework.

This library provides **building blocks** for creating graph visualization applications. The actual "panel" application should be built separately using these components.

## Features

- 🎨 `GraphRenderer` - Interactive graph visualization with @xyflow/react
  - Custom node shapes (circle, rectangle, hexagon, diamond)
  - State-based node styling
  - Animated and styled edges
  - Auto-layout algorithms (hierarchical, circular)
  - Zoom, pan, drag interactions
  - Minimap and controls
- 📝 `EventLog` - Event log component (coming soon)
- 📊 `MetricsDashboard` - Metrics dashboard component (coming soon)
- 🎭 `CustomNode` / `CustomEdge` - Configurable xyflow renderers

## Installation

```bash
npm install @principal-ai/visual-validation-react
# or
bun add @principal-ai/visual-validation-react
```

## Peer Dependencies

```json
{
  "react": "^18.0.0 || ^19.0.0",
  "react-dom": "^18.0.0 || ^19.0.0"
}
```

## Usage

These are **building block components**. You compose them to build your panel application:

```typescript
import {
  GraphRenderer,
  EventLog,
  MetricsDashboard,
} from '@principal-ai/visual-validation-react';
import { EventProcessor } from '@principal-ai/visual-validation-core';
import type { GraphConfiguration } from '@principal-ai/visual-validation-core';

const config: GraphConfiguration = {
  // ... your configuration
};

function MyPanel() {
  const processor = new EventProcessor(config);
  const state = processor.getGraphState();
  const events = processor.getEventHistory();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>
      <GraphRenderer
        configuration={config}
        nodes={Array.from(state.nodes.values())}
        edges={Array.from(state.edges.values())}
      />
      <div>
        <MetricsDashboard metrics={/* ... */} />
        <EventLog events={events} />
      </div>
    </div>
  );
}
```

**Building a Complete Panel:**
For a complete panel application with all features (playback controls, filters, etc.), you should create a separate project using a panel starter template and compose these components together.

## Documentation

Comprehensive guides with Mermaid diagrams:

- **[Configuration Guide](../../docs/CONFIGURATION.md)** - Define your graph structure, node/edge types, and validation rules
- **[Event System Guide](../../docs/EVENT_SYSTEM.md)** - Stream events to update your graph in real-time
- **[Usage Guide](../../docs/USAGE.md)** - Build complete panels with React components

Or browse the [full documentation index](../../docs/README.md).

## Storybook

Interactive component examples:

```bash
bun run storybook
```

## Status

**Alpha** - Core placeholder implemented. Full visualization features coming soon.

### TODO
- ✅ Integrate xyflow for graph visualization
- ✅ Implement node renderers with shapes and states
- ✅ Implement edge renderers with styles and animations
- ✅ Add auto-layout algorithms
- 🔲 Build event log panel with filtering
- 🔲 Build metrics dashboard with charts
- ✅ Add Storybook stories

## License

MIT
