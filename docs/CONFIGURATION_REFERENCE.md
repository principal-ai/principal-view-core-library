# Configuration Reference

The Visual Validation Framework uses **JSON Canvas** (`.canvas`) files as its primary configuration format. This extends the [JSON Canvas spec](https://jsoncanvas.org/spec/1.0/) with visualization extensions.

## Table of Contents

- [File Format](#file-format)
- [Canvas Nodes](#canvas-nodes)
- [Canvas Edges](#canvas-edges)
- [Visual Validation Extensions](#visual-validation-extensions)
- [Complete Examples](#complete-examples)
- [Obsidian Workflow](#obsidian-workflow)

---

## File Format

### Location

Place `.canvas` files in the `.principal-views/` directory at your project root:

```
your-project/
  .principal-views/
    ├── architecture.canvas    ← System architecture
    ├── data-flow.canvas       ← Data flow visualization
    └── deployment.canvas      ← Deployment topology
  src/
  package.json
```

### Basic Structure

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "text",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 100,
      "text": "# My Component"
    }
  ],
  "edges": [{ "id": "edge-1", "fromNode": "node-1", "toNode": "node-2" }],
  "vv": {
    "version": "1.0.0",
    "name": "My System",
    "edgeTypes": {},
    "pathConfig": {},
    "display": {}
  }
}
```

The `vv` (Visual Validation) field contains all framework-specific extensions. Standard canvas tools like Obsidian ignore this field, allowing seamless visual editing.

---

## Canvas Nodes

### Standard Canvas Node Types

All nodes share these base properties:

| Property | Type          | Required | Description                        |
| -------- | ------------- | -------- | ---------------------------------- |
| `id`     | string        | ✓        | Unique identifier                  |
| `type`   | string        | ✓        | `text`, `file`, `link`, or `group` |
| `x`      | number        | ✓        | X position (pixels)                |
| `y`      | number        | ✓        | Y position (pixels)                |
| `width`  | number        | ✓        | Width (pixels)                     |
| `height` | number        | ✓        | Height (pixels)                    |
| `color`  | string \| 1-6 |          | Color (hex or preset)              |

#### Color Presets

| Preset | Color            |
| ------ | ---------------- |
| 1      | Red (#ef4444)    |
| 2      | Orange (#f97316) |
| 3      | Yellow (#eab308) |
| 4      | Green (#22c55e)  |
| 5      | Cyan (#06b6d4)   |
| 6      | Purple (#8b5cf6) |

### Text Node

Stores markdown-formatted content.

```json
{
  "id": "api-server",
  "type": "text",
  "x": 400,
  "y": 200,
  "width": 200,
  "height": 120,
  "color": 6,
  "text": "# API Server\n\nHandles REST endpoints"
}
```

### File Node

References an external file.

```json
{
  "id": "config-file",
  "type": "file",
  "x": 100,
  "y": 100,
  "width": 150,
  "height": 80,
  "file": "src/config.ts",
  "subpath": "#DatabaseConfig"
}
```

### Link Node

References a URL.

```json
{
  "id": "docs-link",
  "type": "link",
  "x": 600,
  "y": 100,
  "width": 150,
  "height": 80,
  "url": "https://api.example.com/docs"
}
```

### Group Node

Visual container for organizing nodes.

```json
{
  "id": "backend-group",
  "type": "group",
  "x": 50,
  "y": 50,
  "width": 500,
  "height": 400,
  "label": "Backend Services",
  "color": 5
}
```

---

## Canvas Edges

Edges connect nodes:

```json
{
  "id": "api-to-db",
  "fromNode": "api-server",
  "toNode": "database",
  "fromSide": "right",
  "toSide": "left",
  "fromEnd": "none",
  "toEnd": "arrow",
  "color": "#3b82f6",
  "label": "queries"
}
```

| Property   | Type   | Required | Description                          |
| ---------- | ------ | -------- | ------------------------------------ |
| `id`       | string | ✓        | Unique identifier                    |
| `fromNode` | string | ✓        | Source node ID                       |
| `toNode`   | string | ✓        | Target node ID                       |
| `fromSide` | string |          | `top`, `right`, `bottom`, `left`     |
| `toSide`   | string |          | `top`, `right`, `bottom`, `left`     |
| `fromEnd`  | string |          | `none` or `arrow` (default: `none`)  |
| `toEnd`    | string |          | `none` or `arrow` (default: `arrow`) |
| `color`    | string |          | Hex color                            |
| `label`    | string |          | Edge label                           |

---

## Visual Validation Extensions

### Node Extensions (`vv`)

Add a `vv` object to any node for rich visualization:

```json
{
  "id": "lock-manager",
  "type": "text",
  "x": 400,
  "y": 250,
  "width": 200,
  "height": 120,
  "text": "# Lock Manager",
  "color": 6,
  "vv": {
    "nodeType": "lock-manager",
    "shape": "hexagon",
    "icon": "lock",
    "sources": ["lib/lock-manager.ts", "lib/locks/**/*.ts"],
    "states": {
      "idle": { "color": "#94a3b8", "icon": "unlock" },
      "acquired": { "color": "#22c55e", "icon": "lock" },
      "waiting": { "color": "#eab308", "icon": "clock" },
      "error": { "color": "#ef4444", "icon": "alert-circle" }
    },
    "actions": [
      {
        "pattern": "Lock acquired for (?<lockId>\\S+)",
        "event": "lock_acquired",
        "state": "acquired",
        "metadata": { "lockId": "$lockId" }
      },
      {
        "pattern": "Lock released",
        "event": "lock_released",
        "state": "idle"
      }
    ]
  }
}
```

#### Node Extension Properties

| Property     | Type     | Description                                           |
| ------------ | -------- | ----------------------------------------------------- |
| `nodeType`   | string   | Semantic type identifier                              |
| `shape`      | string   | `circle`, `rectangle`, `hexagon`, `diamond`, `custom` |
| `icon`       | string   | Lucide icon name                                      |
| `sources`    | string[] | Glob patterns for log association                     |
| `states`     | object   | State definitions with visual properties              |
| `actions`    | object[] | Regex patterns for event extraction                   |
| `dataSchema` | object   | Typed data field definitions                          |
| `layout`     | object   | Layout hints (`layer`, `cluster`)                     |

### Edge Extensions (`vv`)

Add a `vv` object to edges for animation and activation:

```json
{
  "id": "lock-request-edge",
  "fromNode": "api-server",
  "toNode": "lock-manager",
  "vv": {
    "edgeType": "lock-request",
    "style": "dashed",
    "width": 2,
    "animation": {
      "type": "flow",
      "duration": 2000,
      "color": "#60a5fa"
    },
    "activatedBy": [
      { "action": "lock_acquired", "animation": "flow", "direction": "forward" },
      { "action": "lock_released", "animation": "particle", "direction": "backward" }
    ]
  }
}
```

#### Edge Extension Properties

| Property      | Type     | Description                                 |
| ------------- | -------- | ------------------------------------------- |
| `edgeType`    | string   | Type identifier (references `vv.edgeTypes`) |
| `style`       | string   | `solid`, `dashed`, `dotted`, `animated`     |
| `width`       | number   | Line width in pixels                        |
| `animation`   | object   | Default animation config                    |
| `activatedBy` | object[] | Event-triggered animations                  |

### Canvas-Level Extensions (`vv`)

The root `vv` object configures the entire canvas:

```json
{
  "nodes": [...],
  "edges": [...],
  "vv": {
    "version": "1.0.0",
    "name": "Repository Traffic Controller",
    "description": "GitHub webhook processing with lock management",

    "edgeTypes": {
      "api-call": {
        "style": "solid",
        "color": "#22c55e",
        "width": 2,
        "directed": true,
        "animation": { "type": "particle", "duration": 1500 }
      },
      "lock-request": {
        "style": "dashed",
        "color": "#8b5cf6",
        "activatedBy": [
          { "action": "lock_acquired", "animation": "flow" }
        ]
      }
    },

    "pathConfig": {
      "projectRoot": "/path/to/project",
      "captureSource": true,
      "enableActionPatterns": true,
      "logLevel": "info",
      "ignoreUnsourced": false
    },

    "display": {
      "layout": "manual",
      "theme": {
        "primary": "#3b82f6",
        "success": "#22c55e",
        "warning": "#f59e0b",
        "danger": "#ef4444",
        "info": "#06b6d4"
      },
      "animations": {
        "enabled": true,
        "speed": 1.0
      }
    }
  }
}
```

---

## Complete Examples

### Simple Service Architecture

```json
{
  "nodes": [
    {
      "id": "client",
      "type": "text",
      "x": 100,
      "y": 200,
      "width": 120,
      "height": 120,
      "text": "# Client",
      "color": 5,
      "vv": {
        "nodeType": "client",
        "shape": "circle",
        "icon": "user",
        "sources": ["src/client/**/*.ts"]
      }
    },
    {
      "id": "api-server",
      "type": "text",
      "x": 350,
      "y": 200,
      "width": 200,
      "height": 120,
      "text": "# API Server",
      "color": 6,
      "vv": {
        "nodeType": "api-server",
        "shape": "rectangle",
        "icon": "server",
        "sources": ["src/api/**/*.ts"],
        "states": {
          "idle": { "color": "#94a3b8" },
          "processing": { "color": "#3b82f6" },
          "error": { "color": "#ef4444" }
        }
      }
    },
    {
      "id": "database",
      "type": "text",
      "x": 600,
      "y": 200,
      "width": 150,
      "height": 100,
      "text": "# Database",
      "color": 4,
      "vv": {
        "nodeType": "database",
        "shape": "hexagon",
        "icon": "database",
        "sources": ["src/db/**/*.ts"]
      }
    }
  ],
  "edges": [
    {
      "id": "client-to-api",
      "fromNode": "client",
      "toNode": "api-server",
      "fromSide": "right",
      "toSide": "left",
      "label": "HTTP",
      "vv": { "edgeType": "http-request" }
    },
    {
      "id": "api-to-db",
      "fromNode": "api-server",
      "toNode": "database",
      "fromSide": "right",
      "toSide": "left",
      "label": "SQL",
      "vv": { "edgeType": "db-query" }
    }
  ],
  "vv": {
    "version": "1.0.0",
    "name": "Simple Service",
    "edgeTypes": {
      "http-request": {
        "style": "solid",
        "color": "#3b82f6",
        "width": 3,
        "animation": { "type": "flow", "duration": 1500 }
      },
      "db-query": {
        "style": "dashed",
        "color": "#22c55e",
        "width": 2
      }
    },
    "display": {
      "layout": "manual",
      "animations": { "enabled": true }
    }
  }
}
```

### With Action Patterns (Event Extraction)

```json
{
  "nodes": [
    {
      "id": "lock-manager",
      "type": "text",
      "x": 400,
      "y": 200,
      "width": 180,
      "height": 100,
      "text": "# Lock Manager",
      "color": 6,
      "vv": {
        "nodeType": "lock-manager",
        "shape": "rectangle",
        "icon": "lock",
        "sources": ["lib/lock-manager.ts", "lib/branch-aware-lock-manager.ts"],
        "states": {
          "idle": { "color": "#94a3b8", "icon": "unlock", "label": "Idle" },
          "acquired": { "color": "#22c55e", "icon": "lock", "label": "Lock Held" },
          "waiting": { "color": "#eab308", "icon": "clock", "label": "Waiting" },
          "error": { "color": "#ef4444", "icon": "alert-circle", "label": "Error" }
        },
        "actions": [
          {
            "pattern": "Lock acquired for (?<lockId>\\S+)",
            "event": "lock_acquired",
            "state": "acquired",
            "metadata": { "lockId": "$lockId" }
          },
          {
            "pattern": "Lock released for (?<lockId>\\S+)",
            "event": "lock_released",
            "state": "idle",
            "metadata": { "lockId": "$lockId" }
          },
          {
            "pattern": "Lock acquisition failed: (?<reason>.*)",
            "event": "lock_failed",
            "state": "error",
            "metadata": { "reason": "$reason" }
          }
        ]
      }
    }
  ],
  "edges": [],
  "vv": {
    "version": "1.0.0",
    "name": "Lock Manager Demo",
    "pathConfig": {
      "enableActionPatterns": true,
      "logLevel": "debug"
    }
  }
}
```

---

## Obsidian Workflow

The JSON Canvas format enables a powerful visual editing workflow:

### 1. Create Layout in Obsidian

1. Create a new canvas file in `.principal-views/`
2. Add text cards for each component
3. Draw connections between cards
4. Arrange visually using drag-and-drop

### 2. Add VV Extensions

Edit the `.canvas` file in a text editor to add `vv` properties:

```json
{
  "id": "my-component",
  "type": "text",
  "x": 100,
  "y": 100,
  "width": 150,
  "height": 80,
  "text": "# My Component",
  "vv": {
    "nodeType": "my-component",
    "shape": "rectangle",
    "icon": "server",
    "sources": ["src/my-component.ts"]
  }
}
```

### 3. Render in React Flow

```typescript
import { CanvasConverter } from '@principal-ai/visual-validation-core';
import { readFileSync } from 'fs';

// Load canvas file
const canvasJson = readFileSync('.principal-views/architecture.canvas', 'utf-8');
const canvas = JSON.parse(canvasJson);

// Convert to React Flow format
const { nodes, edges } = CanvasConverter.canvasToReactFlow(canvas);

// Use in your React Flow component
<ReactFlow nodes={nodes} edges={edges} />;
```

### 4. Round-Trip Editing

Changes in either Obsidian or your React app can be saved back:

```typescript
// Save React Flow state back to canvas
const updatedCanvas = CanvasConverter.reactFlowToCanvas(nodes, edges, {
  name: 'My Architecture',
  version: '1.0.0',
});

writeFileSync('.principal-views/architecture.canvas', JSON.stringify(updatedCanvas, null, 2));
```

---

## TypeScript API

### Loading Canvas Files

```typescript
import { CanvasConverter, ExtendedCanvas } from '@principal-ai/visual-validation-core';
import { readFileSync } from 'fs';

const canvas: ExtendedCanvas = JSON.parse(
  readFileSync('.principal-views/architecture.canvas', 'utf-8')
);

// Convert to React Flow
const { nodes, edges } = CanvasConverter.canvasToReactFlow(canvas);

// Or convert to internal graph state
const { nodes: nodeStates, edges: edgeStates } = CanvasConverter.canvasToGraph(canvas);
```

### Saving Canvas Files

```typescript
import { CanvasConverter } from '@principal-ai/visual-validation-core';
import { writeFileSync } from 'fs';

// Convert React Flow state back to canvas
const canvas = CanvasConverter.reactFlowToCanvas(nodes, edges, {
  name: 'My Architecture',
  version: '1.0.0',
});

// Save
writeFileSync('.principal-views/architecture.canvas', JSON.stringify(canvas, null, 2));
```
