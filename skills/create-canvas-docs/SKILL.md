# Create Canvas Documentation Skill

Create `.canvas` files for visual documentation, architecture diagrams, and system design documentation

## Purpose

This skill helps you create plain `.canvas` files (not `.otel.canvas`) for **static documentation purposes**. These files are based on the [JSON Canvas specification](https://jsoncanvas.org) and can be edited visually in tools like Obsidian Canvas while being rendered beautifully in the Principal View React components.

## When to Use This Skill

Use this skill when you want to:

1. **Document architecture** - Create visual architecture diagrams showing system components, services, and their relationships
2. **Design systems** - Map out data flows, API structures, or database schemas
3. **Explain concepts** - Create visual explanations of complex technical concepts
4. **Plan features** - Sketch out feature designs with visual flowcharts
5. **Create onboarding docs** - Build visual guides for new team members

## When NOT to Use This Skill

**Do NOT use this skill if you want to:**

- **Validate telemetry/events** - Use `.otel.canvas` files instead (see `create-otel-canvas` skill)
- **Test runtime behavior** - Use `.otel.canvas` with workflows (see `onboard-otel-canvas` skill)
- **Track event schemas** - Use `.otel.canvas` with event definitions (see `setup-otel-testing` skill)

## Canvas vs OTEL Canvas

| Feature | `.canvas` | `.otel.canvas` |
|---------|-----------|----------------|
| **Purpose** | Static documentation | Runtime validation |
| **Structure** | Flat (`.principal-views/file.canvas`) | Hierarchical (storyboard structure) |
| **Validation** | Not validated (flexible) | Strictly validated |
| **Event schemas** | Not supported | Required for validation |
| **Workflows** | Not applicable | Required for testing |
| **Use case** | Architecture diagrams, docs | Telemetry testing, monitoring |

## File Structure

Plain `.canvas` files use a **flat structure** directly in `.principal-views/`:

```
.principal-views/
  ├── architecture-overview.canvas       # System architecture
  ├── api-design.canvas                  # API documentation
  ├── data-flow.canvas                   # Data flow diagrams
  └── component-hierarchy.canvas         # Component relationships
```

Or within packages:

```
packages/
  └── core/
      └── .principal-views/
          ├── core-architecture.canvas
          └── module-structure.canvas
```

**Note:** `.canvas` files should be in flat structure, NOT nested in storyboard folders.

## JSON Canvas Specification

Canvas files follow the [JSON Canvas 1.0 spec](https://jsoncanvas.org/spec/1.0/):

### Basic Structure

```json
{
  "nodes": [
    {
      "id": "unique-id-1",
      "type": "text",
      "text": "# Node Content\n\nMarkdown-formatted text",
      "x": 0,
      "y": 0,
      "width": 250,
      "height": 100,
      "color": "#22c55e"
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "fromNode": "unique-id-1",
      "toNode": "unique-id-2",
      "fromSide": "right",
      "toSide": "left",
      "label": "connects to"
    }
  ]
}
```

### Node Types

1. **Text Node** - Markdown content
   ```json
   {
     "type": "text",
     "text": "## Title\n\nMarkdown content here"
   }
   ```

2. **File Node** - Links to external files
   ```json
   {
     "type": "file",
     "file": "docs/README.md",
     "subpath": "#specific-section"
   }
   ```

3. **Link Node** - External URLs
   ```json
   {
     "type": "link",
     "url": "https://example.com"
   }
   ```

4. **Group Node** - Visual container
   ```json
   {
     "type": "group",
     "label": "Group Label",
     "color": "#8b5cf6"
   }
   ```

### Colors

Use hex color strings (not numeric presets):

```json
{
  "color": "#ef4444",  // Red
  "color": "#22c55e",  // Green
  "color": "#8b5cf6"   // Purple
}
```

Common colors:
- `#ef4444` - Red (errors, critical)
- `#f97316` - Orange (warnings)
- `#eab308` - Yellow (caution)
- `#22c55e` - Green (success, active)
- `#06b6d4` - Cyan (info)
- `#8b5cf6` - Purple (special)

### Edge Properties

```json
{
  "fromSide": "right",      // "top" | "right" | "bottom" | "left"
  "toSide": "left",
  "fromEnd": "none",        // "none" | "arrow"
  "toEnd": "arrow",         // "none" | "arrow"
  "label": "Edge label",
  "color": "#06b6d4"
}
```

## Principal View Extensions

Canvas files can include optional `pv` (Principal View) extensions for enhanced rendering in React components. These extensions are **ignored by standard canvas tools** like Obsidian, allowing round-trip editing.

### Canvas-Level Extensions

```json
{
  "nodes": [...],
  "edges": [...],
  "pv": {
    "version": "1.0",
    "name": "System Architecture",
    "description": "Overview of system components",
    "markdown": ".principal-views/architecture-overview.md",
    "display": {
      "layout": "manual",
      "theme": {
        "primary": "#22c55e",
        "danger": "#ef4444"
      }
    }
  }
}
```

Key fields:
- `version` - Schema version (use "1.0")
- `name` - Display name for the canvas
- `description` - Brief description
- `markdown` - Path to associated markdown documentation (relative to repo root)
- `display.layout` - Layout algorithm: `"manual"` (use canvas positions), `"hierarchical"`, `"force-directed"`, `"circular"`

### Node Extensions

```json
{
  "id": "node-1",
  "type": "text",
  "text": "# API Gateway",
  "x": 0,
  "y": 0,
  "width": 200,
  "height": 100,
  "pv": {
    "nodeType": "service",
    "name": "API Gateway",
    "description": "Handles incoming HTTP requests",
    "icon": "server",
    "shape": "rectangle",
    "fill": "#22c55e",
    "stroke": "#16a34a"
  }
}
```

Available icons (from Lucide):
- `server`, `database`, `cloud`, `shield`, `lock`, `key`
- `zap`, `cpu`, `hard-drive`, `network`
- `user`, `users`, `user-check`
- `file`, `folder`, `package`
- `git-branch`, `git-commit`, `git-merge`

Available shapes:
- `rectangle` - Standard box
- `circle` - Circular node
- `hexagon` - Six-sided
- `diamond` - Diamond shape

### Edge Extensions

```json
{
  "id": "edge-1",
  "fromNode": "node-1",
  "toNode": "node-2",
  "label": "HTTP Request",
  "pv": {
    "edgeType": "api-call",
    "style": "solid",
    "width": 2,
    "animation": {
      "type": "flow",
      "duration": 2000,
      "color": "#22c55e"
    }
  }
}
```

Available styles:
- `solid` - Solid line
- `dashed` - Dashed line
- `dotted` - Dotted line

Animation types:
- `flow` - Flowing particles
- `pulse` - Pulsing line
- `particle` - Moving particles
- `glow` - Glowing effect

## Common Use Cases

### 1. Architecture Diagram

**File:** `.principal-views/system-architecture.canvas`

```json
{
  "nodes": [
    {
      "id": "client",
      "type": "text",
      "text": "# Web Client\n\nReact SPA",
      "x": 0,
      "y": 0,
      "width": 200,
      "height": 120,
      "color": "#06b6d4",
      "pv": {
        "nodeType": "client",
        "icon": "monitor",
        "shape": "rectangle"
      }
    },
    {
      "id": "api",
      "type": "text",
      "text": "# API Gateway\n\nNode.js + Express",
      "x": 300,
      "y": 0,
      "width": 200,
      "height": 120,
      "color": "#22c55e",
      "pv": {
        "nodeType": "service",
        "icon": "server",
        "shape": "rectangle"
      }
    },
    {
      "id": "db",
      "type": "text",
      "text": "# Database\n\nPostgreSQL",
      "x": 600,
      "y": 0,
      "width": 200,
      "height": 120,
      "color": "#8b5cf6",
      "pv": {
        "nodeType": "database",
        "icon": "database",
        "shape": "rectangle"
      }
    }
  ],
  "edges": [
    {
      "id": "client-to-api",
      "fromNode": "client",
      "toNode": "api",
      "fromSide": "right",
      "toSide": "left",
      "label": "HTTPS",
      "pv": {
        "edgeType": "api-call",
        "animation": {
          "type": "flow",
          "duration": 2000
        }
      }
    },
    {
      "id": "api-to-db",
      "fromNode": "api",
      "toNode": "db",
      "fromSide": "right",
      "toSide": "left",
      "label": "SQL",
      "pv": {
        "edgeType": "data-access"
      }
    }
  ],
  "pv": {
    "version": "1.0",
    "name": "System Architecture",
    "description": "High-level system architecture overview",
    "markdown": ".principal-views/system-architecture.md",
    "display": {
      "layout": "manual"
    }
  }
}
```

### 2. Data Flow Diagram

**File:** `.principal-views/checkout-flow.canvas`

```json
{
  "nodes": [
    {
      "id": "start",
      "type": "text",
      "text": "User clicks\nCheckout",
      "x": 0,
      "y": 100,
      "width": 150,
      "height": 80,
      "color": "#22c55e"
    },
    {
      "id": "validate",
      "type": "text",
      "text": "Validate\nCart",
      "x": 200,
      "y": 100,
      "width": 150,
      "height": 80,
      "color": "#06b6d4"
    },
    {
      "id": "payment",
      "type": "text",
      "text": "Process\nPayment",
      "x": 400,
      "y": 100,
      "width": 150,
      "height": 80,
      "color": "#8b5cf6"
    },
    {
      "id": "confirm",
      "type": "text",
      "text": "Send\nConfirmation",
      "x": 600,
      "y": 100,
      "width": 150,
      "height": 80,
      "color": "#22c55e"
    },
    {
      "id": "error",
      "type": "text",
      "text": "Error\nHandler",
      "x": 400,
      "y": 250,
      "width": 150,
      "height": 80,
      "color": "#ef4444"
    }
  ],
  "edges": [
    {
      "id": "e1",
      "fromNode": "start",
      "toNode": "validate",
      "fromSide": "right",
      "toSide": "left"
    },
    {
      "id": "e2",
      "fromNode": "validate",
      "toNode": "payment",
      "fromSide": "right",
      "toSide": "left",
      "label": "valid"
    },
    {
      "id": "e3",
      "fromNode": "payment",
      "toNode": "confirm",
      "fromSide": "right",
      "toSide": "left",
      "label": "success"
    },
    {
      "id": "e4",
      "fromNode": "validate",
      "toNode": "error",
      "fromSide": "bottom",
      "toSide": "left",
      "label": "invalid"
    },
    {
      "id": "e5",
      "fromNode": "payment",
      "toNode": "error",
      "fromSide": "bottom",
      "toSide": "top",
      "label": "failed"
    }
  ],
  "pv": {
    "version": "1.0",
    "name": "Checkout Flow",
    "description": "User checkout process flow",
    "display": {
      "layout": "manual"
    }
  }
}
```

### 3. Component Hierarchy

**File:** `packages/react/.principal-views/component-structure.canvas`

```json
{
  "nodes": [
    {
      "id": "app",
      "type": "text",
      "text": "# App\n\nRoot component",
      "x": 300,
      "y": 0,
      "width": 200,
      "height": 100,
      "color": "#22c55e"
    },
    {
      "id": "header",
      "type": "text",
      "text": "# Header\n\nNavigation",
      "x": 100,
      "y": 150,
      "width": 150,
      "height": 80,
      "color": "#06b6d4"
    },
    {
      "id": "content",
      "type": "text",
      "text": "# Content\n\nMain area",
      "x": 300,
      "y": 150,
      "width": 150,
      "height": 80,
      "color": "#06b6d4"
    },
    {
      "id": "footer",
      "type": "text",
      "text": "# Footer\n\nLinks",
      "x": 500,
      "y": 150,
      "width": 150,
      "height": 80,
      "color": "#06b6d4"
    }
  ],
  "edges": [
    {
      "id": "app-header",
      "fromNode": "app",
      "toNode": "header",
      "fromSide": "bottom",
      "toSide": "top",
      "label": "contains"
    },
    {
      "id": "app-content",
      "fromNode": "app",
      "toNode": "content",
      "fromSide": "bottom",
      "toSide": "top",
      "label": "contains"
    },
    {
      "id": "app-footer",
      "fromNode": "app",
      "toNode": "footer",
      "fromSide": "bottom",
      "toSide": "top",
      "label": "contains"
    }
  ],
  "pv": {
    "version": "1.0",
    "name": "Component Structure",
    "description": "React component hierarchy",
    "display": {
      "layout": "hierarchical"
    }
  }
}
```

## Associated Markdown Documentation

It's recommended to create a markdown file alongside your canvas for detailed documentation:

**File:** `.principal-views/system-architecture.md`

```markdown
# System Architecture

This diagram shows the high-level architecture of our system.

## Components

### Web Client
- Built with React 18
- Hosted on Vercel
- Communicates via REST API

### API Gateway
- Node.js + Express
- Handles authentication
- Routes to microservices

### Database
- PostgreSQL 15
- Primary data store
- Replication enabled

## Security

All communication uses TLS 1.3...
```

Reference the markdown file in the canvas:

```json
{
  "pv": {
    "markdown": ".principal-views/system-architecture.md"
  }
}
```

## Workflow Summary

1. **Identify the documentation need** - What are you trying to visualize?
2. **Create the canvas file** - Place in `.principal-views/filename.canvas`
3. **Design the layout** - Add nodes and edges following JSON Canvas spec
4. **Add PV extensions (optional)** - Enhance with icons, shapes, animations
5. **Create markdown docs (optional)** - Add detailed documentation
6. **Validate syntax** - Ensure valid JSON structure
7. **Test rendering** - View in React component or Obsidian

## CLI Commands

While `.canvas` files are not validated, you can still list them:

```bash
# List all discovered canvas files
npx @principal-ai/principal-view-cli list

# Check file formats
npx @principal-ai/principal-view-cli formats
```

## Visual Editing

Canvas files can be edited in **Obsidian Canvas**:

1. Install [Obsidian](https://obsidian.md)
2. Open your repository as a vault
3. Navigate to `.principal-views/`
4. Open `.canvas` files visually
5. Drag, resize, connect nodes
6. Save - maintains JSON format

The Principal View extensions (`pv` field) are ignored by Obsidian, allowing round-trip editing.

## Best Practices

### 1. Use Descriptive Names
```
✅ .principal-views/api-architecture.canvas
✅ .principal-views/checkout-flow.canvas
❌ .principal-views/diagram1.canvas
❌ .principal-views/temp.canvas
```

### 2. Keep It Simple
- Focus on one concept per canvas
- Don't overcrowd with too many nodes
- Use groups to organize related nodes

### 3. Use Consistent Colors
- Green (#22c55e) - Success, active, primary
- Red (#ef4444) - Error, critical
- Blue (#06b6d4) - Info, secondary
- Purple (#8b5cf6) - Special, tertiary

### 4. Add Documentation
- Always create an associated `.md` file
- Reference it in `pv.markdown`
- Explain what the diagram shows

### 5. Maintain Flat Structure
```
✅ .principal-views/file.canvas
❌ .principal-views/folder/file.canvas  (use this only for .otel.canvas)
```

### 6. Use Manual Layout
For documentation, manual layout gives you precise control:

```json
{
  "pv": {
    "display": {
      "layout": "manual"
    }
  }
}
```

## Migration from .otel.canvas

If you have `.otel.canvas` files that are actually just documentation (not used for validation):

1. **Rename the file**
   ```bash
   mv .principal-views/arch/arch.otel.canvas .principal-views/architecture.canvas
   ```

2. **Remove event schemas**
   - Remove `pv.event` from nodes
   - Remove `pv.eventRef` from nodes
   - Keep other `pv` fields (name, description, icon, etc.)

3. **Move to flat structure**
   - Move from storyboard folders to root `.principal-views/`

4. **Remove validation requirements**
   - No need for workflows or test traces

## Troubleshooting

### Canvas not discovered
- Ensure file is in `.principal-views/` directory
- Check file extension is exactly `.canvas`
- Verify JSON syntax is valid

### PV extensions not working
- Check `pv` field is at correct level (canvas or node)
- Verify JSON structure matches examples
- Ensure using valid values (e.g., valid Lucide icon names)

### Colors not showing
- Use hex strings, not numeric presets
- Format: `"#rrggbb"` (lowercase or uppercase)
- Example: `"#22c55e"` not `"22c55e"` or `3`

## Related Skills

- **create-otel-canvas** - Create .otel.canvas files for telemetry validation
- **onboard-otel-canvas** - Set up OTEL workflows with canvas files
- **setup-otel-testing** - Add OTEL testing infrastructure

## Resources

- [JSON Canvas Specification](https://jsoncanvas.org/spec/1.0/)
- [Lucide Icons](https://lucide.dev/icons/)
- [Obsidian Canvas](https://obsidian.md/canvas)
