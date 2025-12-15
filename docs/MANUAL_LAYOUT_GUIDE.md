# Manual Layout Guide

This guide explains how to create and edit graph layouts using the JSON Canvas format.

## Overview

The Visual Validation Framework uses JSON Canvas (`.canvas`) files, which provide:

- **Visual editing** in Obsidian or other canvas tools
- **Precise positioning** with pixel coordinates
- **Round-trip editing** between visual tools and code

## Creating Layouts

### Option 1: Visual Editor (Recommended)

1. **Open Obsidian** with your project as a vault
2. **Create a new canvas** in `.principal-views/` folder
3. **Add text cards** for each component
4. **Draw connections** between cards
5. **Save** - positions are automatically stored

### Option 2: Manual JSON

Create a `.canvas` file with explicit coordinates:

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
      "text": "# Client"
    },
    {
      "id": "server",
      "type": "text",
      "x": 400,
      "y": 200,
      "width": 200,
      "height": 120,
      "text": "# Server"
    }
  ],
  "edges": [
    {
      "id": "client-to-server",
      "fromNode": "client",
      "toNode": "server"
    }
  ]
}
```

## Coordinate System

```
(0,0) ────────────────────────► X
  │
  │   ┌─────────┐
  │   │  Node   │  position: (100, 100)
  │   │         │  width: 150, height: 80
  │   └─────────┘
  │
  ▼
  Y
```

- **Origin (0, 0)**: Top-left corner
- **X-axis**: Increases rightward
- **Y-axis**: Increases downward
- **Units**: Pixels

## Layout Patterns

### Horizontal Flow (Left to Right)

```json
{
  "nodes": [
    {
      "id": "input",
      "x": 100,
      "y": 200,
      "width": 120,
      "height": 80,
      "type": "text",
      "text": "# Input"
    },
    {
      "id": "process",
      "x": 300,
      "y": 200,
      "width": 150,
      "height": 80,
      "type": "text",
      "text": "# Process"
    },
    {
      "id": "output",
      "x": 530,
      "y": 200,
      "width": 120,
      "height": 80,
      "type": "text",
      "text": "# Output"
    }
  ]
}
```

```
┌─────────┐     ┌───────────┐     ┌─────────┐
│  Input  │ ──► │  Process  │ ──► │ Output  │
└─────────┘     └───────────┘     └─────────┘
```

### Vertical Flow (Top to Bottom)

```json
{
  "nodes": [
    {
      "id": "api",
      "x": 300,
      "y": 100,
      "width": 180,
      "height": 80,
      "type": "text",
      "text": "# API Layer"
    },
    {
      "id": "service",
      "x": 300,
      "y": 250,
      "width": 180,
      "height": 80,
      "type": "text",
      "text": "# Service"
    },
    {
      "id": "database",
      "x": 300,
      "y": 400,
      "width": 180,
      "height": 80,
      "type": "text",
      "text": "# Database"
    }
  ]
}
```

```
     ┌─────────────┐
     │  API Layer  │
     └──────┬──────┘
            │
            ▼
     ┌─────────────┐
     │   Service   │
     └──────┬──────┘
            │
            ▼
     ┌─────────────┐
     │  Database   │
     └─────────────┘
```

### Hub and Spoke

```json
{
  "nodes": [
    {
      "id": "hub",
      "x": 350,
      "y": 250,
      "width": 140,
      "height": 100,
      "type": "text",
      "text": "# Hub"
    },
    {
      "id": "spoke-1",
      "x": 150,
      "y": 100,
      "width": 100,
      "height": 60,
      "type": "text",
      "text": "# Spoke 1"
    },
    {
      "id": "spoke-2",
      "x": 550,
      "y": 100,
      "width": 100,
      "height": 60,
      "type": "text",
      "text": "# Spoke 2"
    },
    {
      "id": "spoke-3",
      "x": 150,
      "y": 400,
      "width": 100,
      "height": 60,
      "type": "text",
      "text": "# Spoke 3"
    },
    {
      "id": "spoke-4",
      "x": 550,
      "y": 400,
      "width": 100,
      "height": 60,
      "type": "text",
      "text": "# Spoke 4"
    }
  ]
}
```

```
┌────────┐           ┌────────┐
│Spoke 1 │           │Spoke 2 │
└────┬───┘           └───┬────┘
     │                   │
     └─────┐     ┌───────┘
           │     │
           ▼     ▼
         ┌─────────┐
         │   Hub   │
         └─────────┘
           ▲     ▲
     ┌─────┘     └───────┐
     │                   │
┌────┴───┐           ┌───┴────┐
│Spoke 3 │           │Spoke 4 │
└────────┘           └────────┘
```

### Grid Layout

```json
{
  "nodes": [
    { "id": "a1", "x": 100, "y": 100, "width": 120, "height": 80, "type": "text", "text": "# A1" },
    { "id": "a2", "x": 280, "y": 100, "width": 120, "height": 80, "type": "text", "text": "# A2" },
    { "id": "a3", "x": 460, "y": 100, "width": 120, "height": 80, "type": "text", "text": "# A3" },
    { "id": "b1", "x": 100, "y": 240, "width": 120, "height": 80, "type": "text", "text": "# B1" },
    { "id": "b2", "x": 280, "y": 240, "width": 120, "height": 80, "type": "text", "text": "# B2" },
    { "id": "b3", "x": 460, "y": 240, "width": 120, "height": 80, "type": "text", "text": "# B3" }
  ]
}
```

## Using Groups

Canvas groups help organize related nodes:

```json
{
  "nodes": [
    {
      "id": "backend-group",
      "type": "group",
      "x": 50,
      "y": 50,
      "width": 400,
      "height": 300,
      "label": "Backend Services",
      "color": 5
    },
    {
      "id": "api",
      "type": "text",
      "x": 100,
      "y": 100,
      "width": 150,
      "height": 80,
      "text": "# API Server"
    },
    {
      "id": "db",
      "type": "text",
      "x": 100,
      "y": 220,
      "width": 150,
      "height": 80,
      "text": "# Database"
    }
  ]
}
```

Groups appear as visual containers in both Obsidian and React Flow.

## Edge Routing with Sides

Control where edges connect using `fromSide` and `toSide`:

```json
{
  "edges": [
    {
      "id": "edge-1",
      "fromNode": "client",
      "toNode": "server",
      "fromSide": "right",
      "toSide": "left"
    },
    {
      "id": "edge-2",
      "fromNode": "server",
      "toNode": "database",
      "fromSide": "bottom",
      "toSide": "top"
    }
  ]
}
```

Available sides: `top`, `right`, `bottom`, `left`

## Complete Example

```json
{
  "nodes": [
    {
      "id": "client",
      "type": "text",
      "x": 100,
      "y": 100,
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
      "id": "transport",
      "type": "text",
      "x": 280,
      "y": 200,
      "width": 140,
      "height": 100,
      "text": "# Transport",
      "color": 5,
      "vv": {
        "nodeType": "transport",
        "shape": "diamond",
        "icon": "radio"
      }
    },
    {
      "id": "server",
      "type": "text",
      "x": 480,
      "y": 180,
      "width": 200,
      "height": 140,
      "text": "# Server",
      "color": 6,
      "vv": {
        "nodeType": "server",
        "shape": "rectangle",
        "icon": "server",
        "sources": ["src/server/**/*.ts"]
      }
    },
    {
      "id": "room-manager",
      "type": "text",
      "x": 740,
      "y": 80,
      "width": 150,
      "height": 80,
      "text": "# Room Manager",
      "color": 4,
      "vv": {
        "nodeType": "room-manager",
        "shape": "hexagon",
        "icon": "users"
      }
    },
    {
      "id": "lock-manager",
      "type": "text",
      "x": 740,
      "y": 200,
      "width": 150,
      "height": 80,
      "text": "# Lock Manager",
      "color": 2,
      "vv": {
        "nodeType": "lock-manager",
        "shape": "hexagon",
        "icon": "lock"
      }
    },
    {
      "id": "presence",
      "type": "text",
      "x": 740,
      "y": 320,
      "width": 150,
      "height": 80,
      "text": "# Presence",
      "color": 6,
      "vv": {
        "nodeType": "presence",
        "shape": "hexagon",
        "icon": "activity"
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "fromNode": "client",
      "toNode": "transport",
      "fromSide": "right",
      "toSide": "left"
    },
    {
      "id": "e2",
      "fromNode": "transport",
      "toNode": "server",
      "fromSide": "right",
      "toSide": "left"
    },
    {
      "id": "e3",
      "fromNode": "server",
      "toNode": "room-manager",
      "fromSide": "right",
      "toSide": "left"
    },
    {
      "id": "e4",
      "fromNode": "server",
      "toNode": "lock-manager",
      "fromSide": "right",
      "toSide": "left"
    },
    {
      "id": "e5",
      "fromNode": "server",
      "toNode": "presence",
      "fromSide": "right",
      "toSide": "left"
    }
  ],
  "vv": {
    "version": "1.0.0",
    "name": "Control Tower Core",
    "description": "Client-server messaging architecture",
    "display": {
      "layout": "manual",
      "animations": { "enabled": true }
    }
  }
}
```

## Spacing Guidelines

| Element        | Minimum Spacing |
| -------------- | --------------- |
| Horizontal gap | 50-80px         |
| Vertical gap   | 40-60px         |
| Node width     | 100-200px       |
| Node height    | 60-120px        |

## Tips

1. **Use Obsidian first** - Let it handle initial positioning, then tweak
2. **Align to grid** - Use multiples of 20px for clean layouts
3. **Leave edge room** - Don't crowd nodes; edges need space
4. **Group related items** - Use canvas groups for visual organization
5. **Standard viewport** - Target 800x600 to 1200x800px for typical graphs

## Programmatic Access

```typescript
import { CanvasConverter, ExtendedCanvas } from '@principal-ai/visual-validation-core';
import { readFileSync } from 'fs';

// Load canvas
const canvas: ExtendedCanvas = JSON.parse(
  readFileSync('.principal-views/architecture.canvas', 'utf-8')
);

// Convert to React Flow
const { nodes, edges } = CanvasConverter.canvasToReactFlow(canvas);

// Nodes include position data
console.log(nodes[0].position); // { x: 100, y: 100 }
```

## Troubleshooting

**Nodes overlap:**

- Increase spacing between nodes
- Check node dimensions (`width`, `height`)

**Edges cross unexpectedly:**

- Use `fromSide`/`toSide` to control connection points
- Reposition nodes to minimize crossings

**Layout looks different in React Flow:**

- Ensure `vv.display.layout` is set to `"manual"`
- Verify coordinates are positive numbers
