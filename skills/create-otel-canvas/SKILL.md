# Create OTEL Canvas Skill

Create .otel.canvas files that map all telemetry involved in a feature to enable validation and debugging

## Purpose

OTEL canvases answer the question: **"What telemetry proves this feature worked (or failed)?"**

They are **feature-centric telemetry maps** that group ALL observability signals for a single feature:
- Events emitted when the feature executes
- Events from downstream services triggered by the feature
- Correlation mechanisms between events
- Success validation signals
- Error telemetry paths

## When to Use This Skill

Use this skill when the user wants to:
- **Plan telemetry for a new feature** - "What events should we emit to validate this works?"
- **Map existing telemetry** - "What telemetry is involved when this feature runs?"
- **Debug a feature** - "What telemetry shows where this failed?"
- **Validate feature execution** - "How do we confirm this feature worked end-to-end?"
- **Document cross-service correlation** - "How do events from different services relate?"

## What This Skill Does

This skill helps create properly structured .otel.canvas files that:
1. **Map all telemetry for a feature** - Show events across multiple services involved in one user action
2. **Define success criteria** - Document what telemetry signals confirm the feature worked
3. **Document error paths** - Show what events appear when the feature fails
4. **Show correlation mechanisms** - How events from different services link together (e.g., via session_id)
5. **Enable validation** - Provide queries to check if feature executed correctly

## What to Include vs Exclude

### ✅ INCLUDE (Execution Telemetry):
- **Events** - All OTLP events emitted when the feature runs
- **Event attributes** - Key attributes in each event (function names, issue keys, durations, success flags)
- **Resource attributes** - Common attributes in all events (service.name, environment)
- **Enrichment attributes** - Attributes added by downstream systems (org_id, team_id)
- **Downstream events** - Events from other services triggered by this feature
- **Correlation** - How events link together (session_id, trace_id)
- **Success validation** - What telemetry proves the feature worked
- **Error telemetry** - Events/attributes when feature fails
- **Validation queries** - Sample queries to check if feature executed

### ❌ EXCLUDE (Not Execution-Related):
- **Storage systems** - ClickHouse, PostgreSQL, databases (not telemetry)
- **Event timelines** - Chronological sequences (implementation detail)
- **Infrastructure diagrams** - APIs, collectors, services (not events)
- **Architecture** - How systems are connected (focus on what telemetry they emit, not how they're built)
- **Materialized views** - Database schemas (storage detail, not telemetry)
- **Indexes** - Database optimizations (not execution-related)

**Rule of thumb**: If a node isn't an event, an attribute, correlation, or validation - reconsider if it belongs.

## OTEL Canvas Structure

An .otel.canvas file is a JSON Canvas file with dedicated OTEL node types for telemetry features.

### File Naming Convention

**REQUIRED**: Files with OTEL features MUST use the `.otel.canvas` extension (e.g., `my-feature.otel.canvas`).

The CLI validates this naming convention. Canvas files with OTEL features that don't use `.otel.canvas` will produce validation errors.

### OTEL Node Types

A canvas is considered an "OTEL canvas" if it contains ANY of these dedicated node types:
- **`otel-event`**: Event nodes with `event` schema
- **`otel-span-convention`**: Span naming convention nodes
- **`otel-scope`**: Instrumentation scope nodes
- **`otel-resource`**: Resource matching nodes
- **`otel-boundary`**: External system boundary nodes

### Basic Structure

```json
{
  "nodes": [/* array of otel-event and other nodes */],
  "edges": [/* array of edges with pv metadata */],
  "pv": {
    "version": "1.0.0",
    "name": "Canvas Name",
    "description": "Canvas description",
    "markdown": ".principal-views/my-feature.md"
  }
}
```

## Node Structure with OTEL Features

### OTEL Event Node Type

For telemetry events, use the dedicated `otel-event` node type with top-level fields:

- **id**: Unique identifier for the node
- **type**: `"otel-event"` for telemetry event nodes
- **label**: Display label for the node
- **description**: What this event represents
- **x, y**: Position coordinates
- **width, height**: Dimensions (recommended: 200×100)
- **color**: **REQUIRED** - Hex color (e.g., "#4CAF50")
- **icon**: Lucide icon name in PascalCase (e.g., "Play", "CheckCircle")
- **shape**: Node shape (e.g., "roundedRect", "rectangle")

### Required Fields for OTEL Event Nodes

- **event**: **REQUIRED** - Event schema as an object:
  ```json
  "event": {
    "name": "event.name",
    "attributes": { ... }
  }
  ```
- **otel.status**: **REQUIRED** - Implementation status: `"draft"`, `"approved"`, or `"implemented"`
- **references**: Source file paths (array of strings)

### OTEL Event Node Structure

```json
{
  "id": "my-event",
  "type": "otel-event",
  "x": 100,
  "y": 100,
  "width": 200,
  "height": 100,
  "color": "#4CAF50",
  "label": "My Event",
  "icon": "Activity",
  "shape": "roundedRect",
  "description": "Description of what this event represents",
  "event": {
    "name": "my.event.name",
    "attributes": {
      "attribute.name": {
        "type": "string",
        "required": true,
        "description": "What this attribute represents"
      }
    }
  },
  "otel": {
    "status": "draft",
    "kind": "event",
    "category": "processing"
  },
  "references": ["src/my-component.ts"]
}
```

### OTEL Metadata (otel field)

```json
"otel": {
  "status": "draft",        // "draft", "approved", "implemented"
  "kind": "event",          // "event", "service", "function", etc.
  "category": "processing"  // "processing", "validation", "integration", etc.
}
```

### Resource Matching (for otel-resource nodes)

For resource nodes that should match based on OTEL resource attributes:

```json
{
  "type": "otel-resource",
  "otel": {
    "resourceMatch": {
      "service.name": "my-service",
      "deployment.environment": "production"
    }
  }
}
```

## Node Sizing Guidelines

**IMPORTANT:** Use consistent, standardized sizes for all nodes:

- **Standard Node (most common):** `200 × 100`
  - Use for: Events, services, components, most nodes
  - Fits concise event names, key attributes, brief descriptions

- **Larger Concept Node:** `250 × 150`
  - Use for: Complex validation logic, detailed correlations, error scenarios with multiple paths
  - Fits: Extended bullet lists, code snippets, multi-step explanations

**Benefits:**
- Consistent visual hierarchy across all canvases
- Easier to scan and understand
- More nodes fit on screen
- Cleaner, more professional appearance

## Common Node Types for Feature Telemetry

### Event Node (shows event schema and key attributes)
```json
{
  "id": "event-function-invocation",
  "type": "otel-event",
  "x": 50,
  "y": 200,
  "width": 200,
  "height": 100,
  "color": "#FFE4B5",
  "label": "Function Invocation",
  "icon": "Zap",
  "shape": "roundedRect",
  "description": "Tracks Forge function executions with performance and outcome",
  "event": {
    "name": "forge.function.invocation",
    "attributes": {
      "forge.function.name": {
        "type": "string",
        "required": true,
        "description": "Name of the Forge function being invoked"
      },
      "forge.issue.key": {
        "type": "string",
        "required": true,
        "description": "Jira issue key"
      },
      "duration_ms": {
        "type": "number",
        "required": true,
        "description": "Execution duration in milliseconds"
      },
      "success": {
        "type": "boolean",
        "required": true,
        "description": "Whether the function execution succeeded"
      },
      "error.message": {
        "type": "string",
        "required": false,
        "description": "Error message if execution failed"
      }
    }
  },
  "otel": {
    "status": "draft",
    "kind": "event",
    "category": "integration"
  },
  "references": [
    "src/forge-function.ts"
  ]
}
```

## Edge Structure

```json
{
  "id": "unique-edge-id",
  "fromNode": "source-node-id",
  "toNode": "target-node-id",
  "fromSide": "right",        // "top" | "right" | "bottom" | "left"
  "toSide": "left",
  "label": "data flow",
  "pv": {
    "edgeType": "data-flow",
    "style": "solid"           // or "dashed"
  }
}
```

### Common Edge Types
- **http-request**: Service calls, API requests
- **data-flow**: Data transformation flows
- **db-query**: Database or data access
- **event-emission**: Event publication

## Canvas-Level Metadata (pv)

**REQUIRED Fields:**
- **pv.name**: Canvas display name
- **pv.version**: Schema version (e.g., "1.0.0")
- **pv.markdown**: Path to documentation file (e.g., ".principal-views/feature.md")

**Optional Fields:**
- **pv.description**: Description of what this canvas shows
- **pv.nodeTypes**: Custom node type definitions
- **pv.edgeTypes**: Custom edge type definitions (required if edges use custom types)

```json
"pv": {
  "version": "1.0.0",
  "name": "Canvas Display Name",
  "markdown": ".principal-views/my-feature.md",
  "description": "Description of what this canvas shows",
  "nodeTypes": {
    "service": {
      "label": "Service",
      "description": "System service component",
      "shape": "hexagon"
    }
  },
  "edgeTypes": {
    "sequence": {
      "label": "Flow",
      "style": "solid",
      "color": "#666",
      "directed": true
    }
  }
}
```

**IMPORTANT:** Edges must have `pv.edgeType` that references a type defined in `pv.edgeTypes`.

## Event Schema Best Practices

### Event Naming Convention
Use `phase.action` pattern:
- `conversion.started`
- `validation.complete`
- `processing.error`
- `export.progress`

### Attribute Naming
Use dot notation for namespacing:
- `config.nodeTypes`
- `result.nodes.count`
- `error.message`
- `duration.ms`

### Always-Allowed Metadata Fields
These fields don't need to be in the schema:
- `code.filepath` - Source file path
- `code.lineno` - Line number
- `description` - Event description

### Required vs Optional
- Use `required: true` for essential data
- Use `required: false` for supplementary data (like timing, debug info)

## Workflow

When creating an .otel.canvas file:

1. **Identify the feature** - What user action or system behavior are you mapping?
   - Example: "User clicks 'Break into tasks' button in Jira"

2. **List ALL telemetry involved** - What events fire across all services?
   - Events from the originating service (e.g., forge.function.invocation)
   - Events from downstream services (e.g., gen_ai.api.request)
   - Correlation events that link them (e.g., forge.claude.correlation)
   - Resource/enrichment attributes added along the way

3. **Define success validation** - What telemetry signals confirm it worked?
   - Which events must exist?
   - What attribute values indicate success?
   - How do you correlate events to verify end-to-end execution?
   - Include sample validation queries

4. **Document error paths** - What telemetry appears when it fails?
   - Error event attributes (error.type, error.message)
   - Common failure scenarios
   - How to identify where in the flow it failed

5. **Show correlation mechanisms** - How do events link together?
   - Session IDs, trace IDs, request IDs
   - JOIN keys for queries

6. **EXCLUDE implementation details** that aren't execution-related:
   - ❌ Storage systems (ClickHouse, databases) - not telemetry
   - ❌ Event timelines - implementation detail
   - ❌ Infrastructure components - focus on events, not architecture
   - ✅ Include: Events, attributes, correlation, validation, errors

7. **Position nodes** logically (left-to-right flow typically)

8. **Save with .otel.canvas extension**

9. **REQUIRED: Validate** using the CLI: `npx @principal-ai/principal-view-cli validate`
   - This is a MANDATORY step - always run validation after creating/updating canvases
   - Fix any validation errors before completing the skill
   - Common fixes: add fromSide/toSide to edges, capitalize icon names

## Examples in the Codebase

See these files for complete examples:
- `.principal-views/validation/validation.otel.canvas` - Real storyboard structure example
  - Shows proper hierarchical organization
  - Demonstrates event schemas and validation
  - Includes workflow folder structure

**IMPORTANT: File Organization**
All .otel.canvas files must use the storyboard structure:
```
.principal-views/
  └── <storyboard-name>/
      ├── <storyboard-name>.otel.canvas     ← Canvas at storyboard root
      └── <workflow-name>/                   ← Workflow folders
          └── <workflow-name>.workflow.json
```

The flat structure (files directly in `.principal-views/`) is deprecated.

## Validation

**MANDATORY STEP:** After creating or updating an .otel.canvas file, you MUST validate it:

```bash
npx @principal-ai/principal-view-cli validate
```

This checks:
- JSON syntax
- Required fields (fromSide, toSide on edges)
- OTEL naming convention (.otel.canvas extension)
- Schema structure
- Unknown fields
- Icon name capitalization (must start with uppercase)

**Do not consider the skill complete until validation passes.**

Common validation fixes:
- Add `fromSide` and `toSide` to all edges (e.g., "right", "left", "top", "bottom")
- Capitalize icon names (e.g., "GitBranch" not "gitBranch")
- Use .otel.canvas extension for files with OTEL features

## Tips

1. **Start with the user action**: "When a user does X, what telemetry fires?"
2. **One canvas per feature**: Each canvas maps one end-to-end user action or system behavior
3. **Include all services**: Don't just show one service - show ALL telemetry involved
4. **Always add validation nodes**: Show what confirms the feature worked
5. **Always add error nodes**: Show what appears when it fails
6. **Show correlation mechanisms**: How do events from different services link?
7. **Exclude infrastructure**: No storage systems, no event timelines - focus on execution telemetry
8. **Use consistent colors**:
   - Green (#D4EDDA) for success validation
   - Red (#F8D7DA) for error telemetry
   - Pastel colors for events (e.g., #FFE4B5, #E0FFE0)
9. **Document as you code**: Create canvas before implementing telemetry
10. **Validate early**: Use CLI validation to catch issues
11. **Use markdown in text**: Format node text with headers, lists, bullet points

## Icon Reference

Common Lucide icons:
- `Box`: Containers, resources
- `FileText`: Logs, documents, types
- `GitBranch`: Routers, branching logic
- `BarChart2`: Collectors, metrics
- `Activity`: Activity tracking
- `AlertTriangle`: Errors, warnings, orphaned items
- `Settings`: Configuration
- `Layout`: Extensions, layouts
- `Radio`: Event emitters, broadcasters
- `Search`: Matchers, filters
- `Target`: Match criteria
- `Code`: Operators, code
- `CheckCircle`: Results, success

## References

- JSON Canvas spec: https://jsoncanvas.org/
- EVENT-SCHEMA-VALIDATION-GUIDE.md in codebase
- CODE-GENERATION-GUIDE.md for TypeScript codegen
