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
| **Validation** | Structure & syntax validated | Strictly validated (structure + events) |
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

## Node Sizing Guidelines

**IMPORTANT:** Use consistent, standardized sizes for all nodes:

- **Standard Node (most common):** `200 × 120`
  - Use for: Components, services, processes, most documentation nodes
  - Fits concise titles, brief descriptions, key details

- **Large Node (detailed content):** `250 × 150`
  - Use for: Complex concepts, detailed explanations, code snippets
  - Fits: Extended bullet lists, multi-paragraph descriptions

- **Small Node (labels/markers):** `150 × 80`
  - Use for: Simple labels, flow markers, decision points
  - Fits: Short text, single-line descriptions

**Benefits:**
- Consistent visual hierarchy across all canvases
- Easier to scan and understand
- Professional appearance
- Predictable spacing and layout

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
      "width": 200,
      "height": 120,
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
  "name": "System Architecture",
  "markdown": ".principal-views/architecture-overview.md",
  "nodes": [...],
  "edges": [...],
  "pv": {
    "description": "Overview of system components",
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
- `name` - **REQUIRED**: Display name for the canvas (top-level)
- `markdown` - **REQUIRED**: Path to associated markdown documentation (top-level, relative to repo root)
- `pv.description` - Brief description
- `pv.display.layout` - Layout algorithm: `"manual"` (use canvas positions), `"hierarchical"`, `"force-directed"`, `"circular"`

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
    "icon": "Server",
    "shape": "rectangle",
    "fill": "#22c55e",
    "stroke": "#16a34a"
  }
}
```

Available icons (from Lucide, PascalCase):
- `Server`, `Database`, `Cloud`, `Shield`, `Lock`, `Key`
- `Zap`, `Cpu`, `HardDrive`, `Network`
- `User`, `Users`, `UserCheck`
- `File`, `Folder`, `Package`
- `GitBranch`, `GitCommit`, `GitMerge`
- `Circle`, `Square`, `Triangle`, `Pentagon`, `Hexagon`
- `Settings`, `Wrench`, `Tool`, `Hammer`

See [Lucide Icons](https://lucide.dev/icons/) for the full list. Use PascalCase names (e.g., `HardDrive` not `hard-drive`).

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
  "fromSide": "right",
  "toSide": "left",
  "label": "HTTP Request",
  "edgeType": "api-call"
}
```

The `edgeType` field is at the top level of the edge object. Edge types should be defined in `pv.edgeTypes` at the canvas level.

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
  "name": "System Architecture",
  "markdown": ".principal-views/system-architecture.md",
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
        "icon": "Monitor",
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
        "icon": "Server",
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
        "icon": "Database",
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
      "edgeType": "api-call"
    },
    {
      "id": "api-to-db",
      "fromNode": "api",
      "toNode": "db",
      "fromSide": "right",
      "toSide": "left",
      "label": "SQL",
      "edgeType": "data-access"
    }
  ],
  "pv": {
    "description": "High-level system architecture overview",
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
  "name": "Checkout Flow",
  "markdown": ".principal-views/checkout-flow.md",
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
  "name": "Component Structure",
  "markdown": "packages/react/.principal-views/component-structure.md",
  "nodes": [
    {
      "id": "app",
      "type": "text",
      "text": "# App\n\nRoot component",
      "x": 300,
      "y": 0,
      "width": 200,
      "height": 120,
      "color": "#22c55e"
    },
    {
      "id": "header",
      "type": "text",
      "text": "# Header\n\nNavigation",
      "x": 100,
      "y": 150,
      "width": 200,
      "height": 120,
      "color": "#06b6d4"
    },
    {
      "id": "content",
      "type": "text",
      "text": "# Content\n\nMain area",
      "x": 350,
      "y": 150,
      "width": 200,
      "height": 120,
      "color": "#06b6d4"
    },
    {
      "id": "footer",
      "type": "text",
      "text": "# Footer\n\nLinks",
      "x": 600,
      "y": 150,
      "width": 200,
      "height": 120,
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
    "description": "React component hierarchy",
    "display": {
      "layout": "hierarchical"
    }
  }
}
```

## Associated Markdown Documentation

**REQUIRED:** Every canvas file must have an associated markdown file that explains the FEATURE, not the canvas itself.

**File:** `.principal-views/system-architecture.md`

```markdown
# System Architecture

## What Problem Does This Solve?

Our system needs to handle thousands of concurrent users while maintaining
sub-second response times. This architecture separates concerns between
presentation, business logic, and data storage to enable independent scaling.

## What Operations Are Available?

Users can:
- Browse and search product catalog
- Manage shopping cart
- Complete purchases with payment processing
- Track order status

## Design Choices and Why

### Why React SPA?
We chose a single-page application to provide instant navigation and
rich interactions without page reloads. This improves user experience
for our catalog browsing workflow.

### Why API Gateway Pattern?
The gateway centralizes authentication, rate limiting, and routing.
This lets us add new microservices without changing client code.

### Why PostgreSQL?
We need ACID transactions for payment processing and complex queries
for product search. PostgreSQL provides both with excellent performance.

## Common Workflow Patterns

1. **Product Discovery**: User searches → API queries database → Results cached
2. **Checkout Flow**: Cart validation → Payment processing → Order creation
3. **Order Tracking**: Status updates via webhooks → Real-time notifications

## Error Scenarios and Recovery

- **Payment Failure**: Transaction rolled back, user notified, cart preserved
- **Database Unavailable**: API returns cached data, queues writes
- **Service Timeout**: Circuit breaker trips, fallback to degraded mode
```

Reference the markdown file at the top level of the canvas:

```json
{
  "name": "System Architecture",
  "markdown": ".principal-views/system-architecture.md",
  "nodes": [...],
  "edges": [...]
}
```

**Key Principle:** The canvas shows HOW we build it. The markdown explains WHAT it does and WHY.

**Good markdown:**
- "Task management lets users create, edit, and archive tasks. Tasks move through a lifecycle from draft → active → archive..."

**Bad markdown:**
- "This canvas shows components. The API Gateway node connects to the Database node..."

The markdown should answer:
- What problem does this feature solve?
- What operations are available?
- What design choices were made and why?
- Common workflow patterns
- Error scenarios and recovery

## Workflow Summary

1. **Identify the documentation need** - What are you trying to visualize?
2. **Create the markdown file first** - Write WHAT the feature does and WHY (see markdown guidance above)
3. **Create the canvas file** - Place in `.principal-views/filename.canvas`
4. **Design the layout** - Add nodes and edges following JSON Canvas spec
5. **Add PV extensions (optional)** - Enhance with icons, shapes, animations
6. **Reference the markdown** - Add top-level `markdown` field pointing to your markdown file
7. **Validate the canvas** - Run `pv validate` to check structure, syntax, and markdown
8. **Test rendering** - View in React component or Obsidian

## CLI Commands

Canvas files are validated to ensure proper structure and syntax:

```bash
# Validate canvas file structure and syntax
npx @principal-ai/principal-view-cli validate

# Validate specific canvas files
npx @principal-ai/principal-view-cli validate ".principal-views/*.canvas"

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

### 2. Use Consistent Node Sizes
- **Standard nodes:** 200 × 120 for most documentation nodes
- **Large nodes:** 250 × 150 for detailed content
- **Small nodes:** 150 × 80 for labels and markers
- Consistency improves visual clarity and professionalism

### 3. Keep It Simple
- Focus on one concept per canvas
- Don't overcrowd with too many nodes
- Use groups to organize related nodes

### 4. Use Consistent Colors
- Green (#22c55e) - Success, active, primary
- Red (#ef4444) - Error, critical
- Blue (#06b6d4) - Info, secondary
- Purple (#8b5cf6) - Special, tertiary

### 5. Add Documentation (REQUIRED)
- **Always create an associated `.md` file** - This is mandatory, not optional
- Reference it in the top-level `markdown` field
- Explain WHAT the feature does and WHY, not HOW the canvas is structured
- Focus on: problem solved, operations available, design choices, workflows, error handling

### 6. Maintain Flat Structure
```
✅ .principal-views/file.canvas
❌ .principal-views/folder/file.canvas  (use this only for .otel.canvas)
```

### 7. Use Manual Layout
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
