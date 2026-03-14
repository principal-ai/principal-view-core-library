# OTEL-Powered Apps: Telemetry-Driven Activity Visualization

This document outlines the design for a system that enables developers to create minimal, animatable applications powered by OpenTelemetry data. Rather than traditional monitoring dashboards, this approach treats telemetry as the primary data source for visual activity representation.

## Overview

**Core Concept**: Shift from "observe telemetry in dashboards" to "telemetry powers the UI."

Traditional approach:
```
Code → Instrument → Deploy → Monitor (passive observation)
```

OTEL-powered apps:
```
Design telemetry → Code with intent → Telemetry drives UI (active consumption)
```

**Key Insight**: Well-structured telemetry (which Principal View encourages through canvas-based design) becomes a reliable data source for building activity visualizations—not trace-level debugging views, but abstract, animatable representations of system activity.

---

## Goals

1. **Activity visualization, not trace visualization** - Abstract representations of "what's happening" rather than span/trace details
2. **Animatable components** - Visual elements that respond to telemetry with animations (pulse, glow, flow, ripple)
3. **Development-time design** - Craft visualizations alongside instrumentation, not as an afterthought
4. **Embeddable** - Minimal widgets that can be dropped into any application
5. **Common patterns** - Pre-built components for typical system patterns (services, queues, pipelines)

---

## Architecture

### High-Level Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  .otel.canvas   │ ──▶ │  json-render     │ ──▶ │  Renderer       │
│  (design)       │     │  spec            │     │  (React, etc)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               ▲
                               │ state updates
                               │
                        ┌──────────────────┐
                        │  OTEL Bridge     │
                        │  (aggregate →    │
                        │   state)         │
                        └──────────────────┘
                               ▲
                               │ spans, metrics, logs
                               │
                        ┌──────────────────┐
                        │  OpenTelemetry   │
                        │  Collector       │
                        └──────────────────┘
```

### Core Components

| Component | Responsibility |
|-----------|----------------|
| Canvas Definition | Defines visual structure, components, and telemetry mappings |
| Canvas → Spec Compiler | Transforms `.otel.canvas` to json-render spec |
| OTEL Bridge | Aggregates telemetry signals into state updates |
| Activity Components | Animatable visualization primitives |
| Renderer | Platform-specific rendering (React, Vue, etc.) |

---

## json-render Integration

[json-render](https://github.com/vercel-labs/json-render) provides:

1. **Flat spec format** - JSON tree of elements with props, children, visibility
2. **Expression system** - `$state`, `$cond`, `$computed` for dynamic values
3. **State-driven rendering** - UI reacts to state changes
4. **Multi-platform** - Same spec renders to React, Vue, video, etc.
5. **Streaming** - Progressive rendering via JSON patches

### Why json-render?

- Proven spec format for declarative UI
- State management with expressions built-in
- Platform agnostic - one spec, many renderers
- No need to invent a new format

### Spec Structure for Activity Visualization

```typescript
interface ActivitySpec {
  root: string;
  state: {
    // Component activity states driven by OTEL
    [componentId: string]: {
      activity: number;      // 0-1 normalized activity level
      errorRate: number;     // 0-1 error percentage
      latency: number;       // ms, for latency-based animations
      status: ComponentStatus;
      lastEvent?: string;
    };
  };
  elements: Record<string, UIElement>;
}

type ComponentStatus = 'idle' | 'active' | 'busy' | 'degraded' | 'error';
```

### Example: Service Activity Node

```typescript
{
  root: "system-view",
  state: {
    "auth-service": { activity: 0, errorRate: 0, latency: 0, status: "idle" },
    "database": { activity: 0, errorRate: 0, latency: 0, status: "idle" },
  },
  elements: {
    "system-view": {
      type: "ActivityCanvas",
      props: { width: 800, height: 600 },
      children: ["auth-node", "db-node", "auth-to-db-flow"],
    },
    "auth-node": {
      type: "ServiceNode",
      props: {
        label: "Auth Service",
        x: 100, y: 200,
        status: { $state: "/auth-service/status" },
        pulseIntensity: { $state: "/auth-service/activity" },
        errorGlow: { $computed: "errorToGlow", args: { rate: { $state: "/auth-service/errorRate" } } },
      },
    },
    "db-node": {
      type: "DatabaseNode",
      props: {
        label: "Users DB",
        x: 400, y: 200,
        status: { $state: "/database/status" },
        pulseIntensity: { $state: "/database/activity" },
      },
    },
    "auth-to-db-flow": {
      type: "DataFlow",
      props: {
        from: "auth-node",
        to: "db-node",
        flowRate: { $state: "/auth-service/activity" },
        hasError: { $cond: { $state: "/database/errorRate", gt: 0.1 }, $then: true, $else: false },
      },
    },
  },
}
```

---

## OTEL Bridge

The bridge aggregates raw telemetry into state updates.

### Signal Aggregation

```typescript
interface OtelBridgeConfig {
  // Map telemetry patterns to state paths
  mappings: SignalMapping[];

  // Aggregation window
  windowMs: number;  // e.g., 1000 for 1-second rolling window

  // Update frequency
  updateIntervalMs: number;  // e.g., 100 for 10 updates/sec
}

interface SignalMapping {
  // What to match
  match: {
    spanName?: string | RegExp;
    serviceName?: string;
    scopeName?: string;
    attributes?: Record<string, unknown>;
  };

  // Where to write
  statePath: string;

  // How to aggregate
  aggregation: 'count' | 'rate' | 'latency_avg' | 'latency_p99' | 'error_rate';
}
```

### Example Configuration

```typescript
const bridgeConfig: OtelBridgeConfig = {
  windowMs: 5000,
  updateIntervalMs: 100,
  mappings: [
    {
      match: { serviceName: "auth-service" },
      statePath: "/auth-service/activity",
      aggregation: "rate",  // requests per second, normalized to 0-1
    },
    {
      match: { serviceName: "auth-service", attributes: { "error": true } },
      statePath: "/auth-service/errorRate",
      aggregation: "error_rate",
    },
    {
      match: { spanName: /database\.query/ },
      statePath: "/database/latency",
      aggregation: "latency_avg",
    },
  ],
};
```

### Status Derivation

Status is computed from aggregated metrics:

```typescript
function deriveStatus(state: ComponentState): ComponentStatus {
  if (state.errorRate > 0.5) return 'error';
  if (state.errorRate > 0.1) return 'degraded';
  if (state.activity > 0.8) return 'busy';
  if (state.activity > 0.1) return 'active';
  return 'idle';
}
```

---

## Activity Component Catalog

Pre-built components for common visualization patterns.

### Node Types

| Component | Description | Animation Properties |
|-----------|-------------|---------------------|
| `ServiceNode` | Generic service/microservice | pulse, glow, status color |
| `DatabaseNode` | Database or data store | pulse, query ripple |
| `QueueNode` | Message queue | fill level, flow animation |
| `GatewayNode` | API gateway/load balancer | request ripple, throughput |
| `CacheNode` | Cache layer | hit/miss indicators |
| `ExternalNode` | External service/API | availability indicator |

### Connection Types

| Component | Description | Animation Properties |
|-----------|-------------|---------------------|
| `DataFlow` | Data moving between nodes | particle flow, speed, color |
| `RequestFlow` | Request/response pattern | bidirectional pulses |
| `EventFlow` | Event stream | continuous flow with density |
| `ErrorFlow` | Error propagation | red pulse, lightning effect |

### Aggregate Visualizations

| Component | Description | Use Case |
|-----------|-------------|----------|
| `ActivityHeatmap` | Grid of activity intensity | Multi-service overview |
| `FlowDiagram` | Animated system diagram | Architecture visualization |
| `PulseRing` | Concentric activity rings | Single metric focus |
| `StatusBar` | Compact status indicator | Embeddable widget |

---

## Canvas Integration

### Canvas as Design Surface

The `.otel.canvas` format already defines:
- Nodes (services, components)
- Edges (connections, flows)
- Groups (subsystems)
- Principal View extensions (`pv` field)

### Extended `pv` Field for Activity Visualization

```typescript
interface PrincipalViewExtension {
  // Existing fields...

  // New: Activity visualization config
  activity?: {
    // Component type from catalog
    componentType: string;

    // Telemetry mapping
    telemetry: {
      // Which spans/metrics drive this component
      match: SignalMatch;

      // What metric to display
      metric: 'rate' | 'latency' | 'error_rate' | 'count';
    };

    // Animation settings
    animation?: {
      style: 'pulse' | 'glow' | 'ripple' | 'flow';
      speed?: number;
      intensity?: number;
    };
  };
}
```

### Example Canvas Node

```json
{
  "id": "auth-service",
  "type": "text",
  "text": "Auth Service",
  "x": 100,
  "y": 200,
  "pv": {
    "nodeType": "service",
    "activity": {
      "componentType": "ServiceNode",
      "telemetry": {
        "match": { "serviceName": "auth-service" },
        "metric": "rate"
      },
      "animation": {
        "style": "pulse",
        "speed": 1.0
      }
    }
  }
}
```

---

## Compilation Pipeline

```
.otel.canvas → Parse → Extract Activity Config → Generate json-render Spec
                                                          │
                                                          ▼
                                                   Generate Bridge Config
```

### Compiler Output

Given an `.otel.canvas` file, the compiler produces:

1. **json-render spec** - UI structure with state bindings
2. **Bridge config** - Telemetry → state mappings
3. **Component registry** - Required activity components

```typescript
interface CompilationResult {
  spec: ActivitySpec;
  bridgeConfig: OtelBridgeConfig;
  requiredComponents: string[];
}

function compileCanvas(canvas: Canvas): CompilationResult {
  // Extract nodes with activity config
  // Generate state paths
  // Create element tree
  // Build telemetry mappings
}
```

---

## Runtime Architecture

### Browser Runtime

```typescript
// 1. Load compiled spec and config
const { spec, bridgeConfig } = await loadActivityApp('system.otel.canvas');

// 2. Create OTEL bridge (connects to collector or local exporter)
const bridge = new OtelBridge(bridgeConfig, {
  source: 'websocket',  // or 'http-polling', 'local'
  endpoint: 'ws://localhost:4318/v1/traces',
});

// 3. Create state store
const store = createStateStore(spec.state);
bridge.connect(store);

// 4. Render
<ActivityRenderer spec={spec} store={store} />
```

### State Flow

```
OTEL Collector
      │
      ▼
  WebSocket/HTTP
      │
      ▼
  OtelBridge (aggregates spans → state updates)
      │
      ▼
  StateStore (json-render compatible)
      │
      ▼
  Renderer (subscribes to state, animates components)
```

---

## Common Patterns Library

### Pattern: Microservices Overview

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│    ┌─────┐      ┌─────┐      ┌─────┐              │
│    │ API │ ───▶ │Auth │ ───▶ │Users│              │
│    │ GW  │      │ Svc │      │ DB  │              │
│    └─────┘      └─────┘      └─────┘              │
│        │                                           │
│        ▼                                           │
│    ┌─────┐      ┌─────┐                           │
│    │Order│ ───▶ │Order│                           │
│    │ Svc │      │ DB  │                           │
│    └─────┘      └─────┘                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

All nodes pulse with activity, connections show data flow.

### Pattern: Queue Consumer

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Producer │ ──▶ │  Queue   │ ──▶ │ Consumer │
│  ████░░  │     │ ████████ │     │  ██░░░░  │
│  active  │     │   full   │     │  active  │
└──────────┘     └──────────┘     └──────────┘
```

Queue shows fill level, producer/consumer show processing rate.

### Pattern: Request Latency

```
┌─────────┐
│ Service │
│         │
│  ┌───┐  │    latency:
│  │ ● │  │    ▓▓▓▓▓░░░░░ 45ms
│  └───┘  │
└─────────┘
```

Central indicator pulses with requests, latency bar shows response time.

---

## Open Questions

1. **Canvas compatibility** - How much do we extend `.otel.canvas` vs create a new format (`.activity.canvas`)?

2. **Real-time requirements** - What's the acceptable latency from span emission to animation? 100ms? 500ms?

3. **Offline/replay mode** - Should we support replaying recorded traces through the visualization?

4. **Customization depth** - How much should users be able to customize component animations vs using presets?

5. **Component styling** - CSS-based? Props-based? Theme system?

6. **Collector integration** - Direct OTLP receiver? Proxy through existing collector? Local SDK export?

7. **State persistence** - Should visualizations remember state across page reloads?

8. **Multi-tenant** - How to scope visualizations to specific traces/services in a shared environment?

---

## Implementation Phases

### Phase 1: Core Infrastructure

- [ ] Define Activity component interfaces
- [ ] Create basic json-render spec generator
- [ ] Implement OTEL Bridge with WebSocket source
- [ ] Build 2-3 basic components (ServiceNode, DataFlow, StatusBar)

### Phase 2: Canvas Integration

- [ ] Extend `pv` schema for activity config
- [ ] Build canvas → spec compiler
- [ ] Integrate with existing CanvasDiscovery

### Phase 3: Component Library

- [ ] Full set of node components
- [ ] Connection/flow components
- [ ] Aggregate visualizations
- [ ] Animation system

### Phase 4: Developer Experience

- [ ] CLI command to preview activity visualization
- [ ] Hot-reload during development
- [ ] Storybook integration for component development

### Phase 5: Embedding & Distribution

- [ ] Embeddable widget builds
- [ ] React/Vue/Svelte packages
- [ ] CDN distribution for script-tag embedding

---

## References

- [json-render](https://github.com/vercel-labs/json-render) - Generative UI framework
- Existing Canvas types: `packages/core/src/types/canvas.ts`
- Workflow templates: `packages/core/src/workflow/`
- OTEL types: `packages/core/src/types/otel.ts`
