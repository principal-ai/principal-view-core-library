# @principal-ai/visual-validation-react

React UI **component library** for the Visual Validation Framework.

This library provides **building blocks** for creating graph visualization applications. The actual "panel" application should be built separately using these components.

## Features

- 🎨 `GraphRenderer` - Graph visualization component (xyflow integration coming soon)
- 📝 `EventLog` - Event log component (coming soon)
- 📊 `MetricsDashboard` - Metrics dashboard component (coming soon)
- 🎭 `GenericNode` / `GenericEdge` - Configurable renderers (coming soon)

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

## Status

**Alpha** - Core placeholder implemented. Full visualization features coming soon.

### TODO
- 🔲 Integrate xyflow for graph visualization
- 🔲 Implement node renderers
- 🔲 Implement edge renderers
- 🔲 Build event log panel
- 🔲 Build metrics dashboard
- 🔲 Add Storybook stories
- 🔲 Add animation support

## License

MIT
