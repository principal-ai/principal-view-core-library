# Visual Validation Framework

A configuration-driven, event-based graph visualization framework for real-time system monitoring and test validation.

## Architecture

This is a monorepo containing two packages:

### 📦 Packages

#### `@principal-ai/visual-validation-core`
Core logic library - **framework-agnostic**
- Type definitions for graph configurations, events, and validation
- Event processing engine
- Validation engine with rule checking
- Graph state management
- Test instrumentation helpers

**Zero UI dependencies** - can be used in Node.js, tests, or any JavaScript environment.

#### `@principal-ai/visual-validation-react`
React UI **component library** (building blocks)
- `GraphRenderer` - Graph visualization component
- `EventLog` - Event log component
- `MetricsDashboard` - Metrics display component
- `GenericNode` / `GenericEdge` - Configurable renderers

**Note:** This is a component library. The actual "panel" application should be built separately using these components (e.g., using a panel starter project).

Depends on `@principal-ai/visual-validation-core`.

## Project Structure

```
visual-validation-core-library/
├── package.json                    # Workspace root
├── tsconfig.base.json              # Shared TypeScript config
├── packages/
│   ├── core/                       # Logic library
│   │   ├── src/
│   │   │   ├── types/              # TypeScript type definitions
│   │   │   ├── helpers/            # GraphInstrumentationHelper
│   │   │   ├── EventProcessor.ts   # Event processing engine
│   │   │   ├── ValidationEngine.ts # Validation & anomaly detection
│   │   │   └── index.ts            # Public API exports
│   │   └── package.json
│   └── react/                      # React UI library
│       ├── src/
│       │   ├── components/         # React components
│       │   ├── nodes/              # Node renderers (TODO)
│       │   ├── edges/              # Edge renderers (TODO)
│       │   ├── hooks/              # React hooks (TODO)
│       │   └── index.ts            # Public API exports
│       └── package.json
└── README.md
```

## Getting Started

### Installation

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Or build individually
bun run build:core
bun run build:react
```

### Development

```bash
# Watch mode for development
bun run dev:core
bun run dev:react

# Testing
bun run test              # Run all tests
bun run test:core         # Run core package tests only
bun run test:react        # Run react package tests only
bun run test:watch        # Run tests in watch mode
bun run test:coverage     # Run tests with coverage

# Type checking
bun run typecheck

# Linting
bun run lint
bun run lint:fix

# Formatting
bun run format
bun run format:check
```

## Usage

### Core Package (Logic Only)

```typescript
import {
  EventProcessor,
  ValidationEngine,
  GraphInstrumentationHelper,
  type GraphConfiguration,
} from '@principal-ai/visual-validation-core';

// Define your system configuration
const config: GraphConfiguration = {
  metadata: { name: 'My System', version: '1.0.0' },
  nodeTypes: {
    server: { shape: 'hexagon', color: '#9C27B0', dataSchema: {} },
    user: { shape: 'circle', color: '#4CAF50', dataSchema: {} },
  },
  edgeTypes: {
    connection: { style: 'solid', directed: true },
  },
  allowedConnections: [
    { from: 'user', to: 'server', via: 'connection' },
  ],
};

// Create event processor
const processor = new EventProcessor(config);

// Use instrumentation helper in tests
const helper = new GraphInstrumentationHelper(config, (event) => {
  const result = processor.processEvent(event);
  console.log('Validation:', result.validation);
});

// Emit events from your tests
helper.emitNodeCreated('server-1', 'server', { uptime: 0 });
helper.emitNodeCreated('user-alice', 'user', { status: 'online' });
helper.emitEdgeCreated('conn-1', 'connection', 'user-alice', 'server-1');
```

### React Package (UI Building Blocks)

```typescript
import {
  GraphRenderer,
  EventLog,
  MetricsDashboard,
} from '@principal-ai/visual-validation-react';
import { EventProcessor } from '@principal-ai/visual-validation-core';

function MyPanel() {
  const processor = new EventProcessor(config);
  const state = processor.getGraphState();
  const events = processor.getEventHistory();

  return (
    <div>
      <GraphRenderer
        configuration={config}
        nodes={Array.from(state.nodes.values())}
        edges={Array.from(state.edges.values())}
      />
      <EventLog events={events} />
      <MetricsDashboard metrics={currentMetrics} />
    </div>
  );
}
```

**Note:** The above is an example of composing the components. In practice, you would build a complete "panel" application in a separate project that uses these components.

## Documentation

📚 **[Complete Documentation with Mermaid Diagrams](./docs/README.md)**

- **[Configuration Guide](./docs/CONFIGURATION.md)** - Define graph structure, node/edge types, validation rules
- **[Event System Guide](./docs/EVENT_SYSTEM.md)** - Stream events to update graphs in real-time
- **[Usage Guide](./docs/USAGE.md)** - Build complete panels with React components

Includes complete examples for e-commerce, data pipelines, and microservices with visual diagrams.

## Storybook

Interactive component examples:

```bash
bun run storybook
```

## Design Document

For full design details, see [GENERIC_GRAPH_PANEL_DESIGN.md](../control-tower-core/GENERIC_GRAPH_PANEL_DESIGN.md)

## Key Features

- ✅ Configuration-driven graph definition
- ✅ Event-based state changes
- ✅ Validation engine with rule checking
- ✅ Test instrumentation helpers
- ✅ Real-time graph visualization with xyflow
- ✅ Interactive nodes with custom shapes and states
- ✅ Styled and animated edges
- ✅ Auto-layout algorithms (hierarchical, circular)
- ✅ Anomaly detection & violation highlighting
- ⏳ Event log panel with filtering
- ⏳ Metrics dashboard with charts
- ⏳ Timeline/replay controls
- ⏳ Export/import event streams

## Status

**Beta** - Core logic and graph visualization complete with test coverage.

### Completed
- ✅ Monorepo structure
- ✅ Type definitions
- ✅ EventProcessor with tests
- ✅ ValidationEngine with tests
- ✅ GraphInstrumentationHelper with tests
- ✅ Package configuration
- ✅ Test infrastructure (bun test)
- ✅ Interactive graph visualization with xyflow
- ✅ Custom node shapes (circle, rectangle, hexagon, diamond)
- ✅ Custom edge styles (solid, dashed, dotted, animated)
- ✅ Auto-layout algorithms
- ✅ Storybook examples
- ✅ Comprehensive documentation with Mermaid diagrams

### TODO
- 🔲 Complete event log panel with filtering and search
- 🔲 Complete metrics dashboard with visual charts
- 🔲 Add timeline/replay controls
- 🔲 Increase test coverage for React components

## License

MIT
