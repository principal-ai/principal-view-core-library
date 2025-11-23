# Manual Layout Guide

This guide explains how to use manual positioning in the Visual Validation Framework to create custom 2D graph layouts.

## Overview

The VVF supports four layout algorithms:
- **`hierarchical`** - Automatic layered layout based on dependencies
- **`circular`** - Arranges nodes in a circle
- **`force-directed`** - Physics-based layout (planned)
- **`manual`** - Custom positions specified in the configuration

## Using Manual Layout

### 1. Add Position Data to Node Types

In your `vvf.config.yaml`, add a `position` property to each node type:

```yaml
nodeTypes:
  server:
    shape: rectangle
    icon: server
    color: "#8b5cf6"
    size:
      width: 200
      height: 120
    position:        # Add custom position
      x: 400
      y: 250
    dataSchema: {}
    sources:
      - "src/server/**/*.ts"

  client:
    shape: circle
    icon: user
    color: "#3b82f6"
    size:
      width: 120
      height: 120
    position:        # Add custom position
      x: 100
      y: 100
    dataSchema: {}
    sources:
      - "src/client/**/*.ts"
```

### 2. Set Display Layout to Manual

Update the `display` configuration to use manual layout:

```yaml
display:
  layout: manual    # Use manual positioning
  theme:
    primary: "#3b82f6"
    success: "#22c55e"
    warning: "#f59e0b"
    danger: "#ef4444"
    info: "#06b6d4"
  animations:
    enabled: true
    speed: 1.0
```

### 3. Position Coordinate System

The coordinate system uses:
- **Origin (0, 0)**: Top-left corner
- **X-axis**: Increases to the right
- **Y-axis**: Increases downward
- **Units**: Pixels

### 4. Layout Tips

**Spacing Recommendations:**
- Minimum 150-200px between nodes vertically
- Minimum 200-250px between nodes horizontally
- Consider node sizes when positioning (use `size.width` and `size.height`)

**Common Patterns:**

**Horizontal Flow (Left to Right):**
```yaml
client:
  position: { x: 100, y: 250 }
transport:
  position: { x: 300, y: 250 }
server:
  position: { x: 500, y: 250 }
```

**Vertical Flow (Top to Bottom):**
```yaml
api:
  position: { x: 400, y: 100 }
middleware:
  position: { x: 400, y: 300 }
database:
  position: { x: 400, y: 500 }
```

**Hub and Spoke:**
```yaml
hub:
  position: { x: 400, y: 300 }
spoke-1:
  position: { x: 200, y: 150 }
spoke-2:
  position: { x: 600, y: 150 }
spoke-3:
  position: { x: 200, y: 450 }
spoke-4:
  position: { x: 600, y: 450 }
```

**Grid Layout:**
```yaml
# Row 1
node-a: { position: { x: 100, y: 100 } }
node-b: { position: { x: 300, y: 100 } }
node-c: { position: { x: 500, y: 100 } }

# Row 2
node-d: { position: { x: 100, y: 300 } }
node-e: { position: { x: 300, y: 300 } }
node-f: { position: { x: 500, y: 300 } }
```

## Example: Control Tower Architecture

Here's a complete example showing a messaging server architecture:

```yaml
metadata:
  name: "Control Tower Core"
  version: "0.1.19"
  description: "Client-server messaging architecture"

nodeTypes:
  # Client (top-left)
  client-a:
    shape: circle
    icon: user
    color: "#3b82f6"
    size:
      width: 120
      height: 120
    position:
      x: 100
      y: 100

  # Transport layer (middle-left)
  transport:
    shape: diamond
    icon: radio
    color: "#06b6d4"
    size:
      width: 140
      height: 140
    position:
      x: 250
      y: 250

  # Server (center)
  server:
    shape: rectangle
    icon: server
    color: "#8b5cf6"
    size:
      width: 200
      height: 120
    position:
      x: 400
      y: 250

  # Managers (right column)
  room-manager:
    shape: hexagon
    icon: users
    color: "#22c55e"
    position:
      x: 600
      y: 100

  lock-manager:
    shape: hexagon
    icon: lock
    color: "#f59e0b"
    position:
      x: 600
      y: 250

  presence-manager:
    shape: hexagon
    icon: activity
    color: "#ec4899"
    position:
      x: 600
      y: 400

  # Auth (bottom-center)
  auth:
    shape: rectangle
    icon: shield
    color: "#ef4444"
    position:
      x: 400
      y: 450

display:
  layout: manual
  animations:
    enabled: true
    speed: 1.0
```

## Programmatic Access

The `GraphConverter` utility in `@principal-ai/visual-validation-core` automatically extracts positions from the configuration:

```typescript
import { GraphConverter } from '@principal-ai/visual-validation-core';
import type { PathBasedGraphConfiguration } from '@principal-ai/visual-validation-core';

const config: PathBasedGraphConfiguration = {
  // ... your configuration
};

const { nodes, edges } = GraphConverter.configToGraph(config);

// nodes will include position data:
// nodes[0].position = { x: 100, y: 100 }
```

## Migration from Automatic Layouts

To migrate from `hierarchical` or `circular` layouts to manual:

1. **Start with automatic layout** - Use `hierarchical` first to see the default positions
2. **Take a screenshot** - Capture the current layout
3. **Extract approximate positions** - Note where each node appears
4. **Add positions to config** - Add `position` properties to each node type
5. **Switch to manual** - Change `display.layout` to `manual`
6. **Refine positions** - Adjust coordinates to improve the layout

## TypeScript Type Definitions

```typescript
interface PathBasedNodeTypeDefinition {
  shape: 'circle' | 'rectangle' | 'hexagon' | 'diamond' | 'custom';
  icon?: string;
  color?: string;
  size?: { width: number; height: number };

  // Manual position for 'manual' layout mode
  position?: { x: number; y: number };

  // ... other properties
}

interface DisplayConfiguration {
  layout: 'hierarchical' | 'force-directed' | 'circular' | 'manual';
  // ... other properties
}
```

## Best Practices

1. **Use a grid** - Align nodes to a virtual grid (e.g., multiples of 50px)
2. **Consider viewport** - Most graphs fit well in 800x600 to 1200x800px
3. **Leave room for edges** - Don't place nodes too close together
4. **Account for node sizes** - Remember that position is typically the node center
5. **Test on different screens** - Verify layout looks good on various resolutions
6. **Document your layout** - Add comments to explain the positioning strategy

## Troubleshooting

**Nodes appear in a line:**
- Check that `display.layout` is set to `manual`
- Verify each node type has a `position` property
- Ensure position values are numbers, not strings

**Nodes overlap:**
- Increase spacing between nodes (minimum 150-200px)
- Account for node sizes when positioning

**Nodes appear off-screen:**
- Use positive coordinates
- Keep x and y values reasonable (e.g., < 2000px)
- Consider the typical viewport size

## Future Enhancements

Planned features for manual layouts:
- **Interactive positioning** - Drag and drop in the UI
- **Position export** - Save current positions back to config
- **Layout templates** - Pre-defined patterns for common architectures
- **Auto-spacing** - Automatically adjust spacing while preserving relative positions
