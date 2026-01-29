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

An .otel.canvas file is a JSON Canvas file with special "pv" metadata extensions for OTEL features.

### File Naming Convention

**REQUIRED**: Files with OTEL features MUST use the `.otel.canvas` extension (e.g., `my-feature.otel.canvas`).

The CLI validates this naming convention. Canvas files with OTEL features that don't use `.otel.canvas` will produce validation errors.

### OTEL Features

A canvas is considered an "OTEL canvas" if it contains ANY of:
- **pv.otel**: Node-level OTEL metadata (kind, category, isNew)
- **pv.event**: Event schema with attributes and validation rules
- **pv.scope**: Canvas-level scope for log routing
- **pv.audit**: Canvas-level audit configuration
- **resourceMatch**: Node-level resource matching for OTEL logs

### Basic Structure

```json
{
  "nodes": [/* array of nodes with pv metadata */],
  "edges": [/* array of edges with pv metadata */],
  "pv": {
    "version": "1.0.0",
    "name": "Canvas Name",
    "description": "Canvas description",
    "nodeTypes": {/* custom node type definitions */},
    "edgeTypes": {/* custom edge type definitions */}
  }
}
```

## Node Structure with OTEL Features

### Standard Node Fields (JSON Canvas)
- **id**: Unique identifier for the node
- **type**: Canvas type (usually "text")
- **text**: Display text (markdown supported)
- **x, y**: Position coordinates
- **width, height**: Dimensions

### PrincipalView Extensions (pv)

#### Basic Node Metadata
```json
"pv": {
  "nodeType": "service",
  "name": "Service Name",
  "description": "Service description",
  "shape": "rectangle",
  "icon": "Box",
  "fill": "#4A90E2"
}
```

#### OTEL Metadata
```json
"pv": {
  "otel": {
    "kind": "service",      // "type", "service", "function", etc.
    "category": "router",   // "router", "collector", "validator", etc.
    "isNew": true          // true if this is a new OTEL concept
  }
}
```

#### Event Schema
```json
"pv": {
  "event": {
    "name": "event.name",
    "description": "What this event represents",
    "attributes": {
      "attribute.name": {
        "type": "string",        // "string" | "number" | "boolean" | "object" | "array"
        "required": true,        // true | false
        "description": "What this attribute represents"
      }
    }
  }
}
```

#### Resource Matching (for Log Routing)
```json
"pv": {
  "resourceMatch": {
    "service.name": "my-service",
    "deployment.environment": "production"
  }
}
```

## Node Sizing Guidelines

**IMPORTANT:** Use consistent, standardized sizes for all nodes:

- **Standard Node (most common):** `150 × 100`
  - Use for: Events, services, components, most nodes
  - Fits concise event names, key attributes, brief descriptions

- **Larger Concept Node:** `200 × 200`
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
  "type": "text",
  "text": "Event: forge.function.invocation\n\nSeverity: INFO | ERROR\nWhen: Every button click\n\nKey Attributes:\n• forge.function.name: breakIntoTasks\n• forge.issue.key: SHIP-10\n• duration_ms: 234.5\n• success: true | false\n• error.message: (if failed)",
  "x": 50,
  "y": 200,
  "width": 150,
  "height": 100,
  "color": "#FFE4B5",
  "pv": {
    "nodeType": "integration",
    "name": "forge.function.invocation",
    "description": "Tracks Forge function executions with performance and outcome",
    "event": {
      "name": "forge.function.invocation",
      "description": "Tracks Forge function executions with performance and outcome",
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
      "kind": "event",
      "category": "integration",
      "isNew": true
    },
    "sources": [
      "src/forge-function.ts"
    ]
  }
}
```

### Success Validation Node
```json
{
  "id": "success-validation",
  "type": "text",
  "text": "Feature Success Validation\n\nConfirms feature worked:\n✓ forge.function.invocation exists\n✓ success = 'true'\n✓ duration_ms < 5000\n✓ forge.claude.correlation exists\n✓ SessionId matches between events\n\nQuery:\nSELECT count(*) FROM otel_logs\nWHERE LogAttributes['forge.issue.key'] = 'SHIP-10'\n  AND LogAttributes['success'] = 'true'",
  "x": 900,
  "y": 200,
  "width": 200,
  "height": 200,
  "color": "#D4EDDA",
  "pv": {
    "nodeType": "integration",
    "name": "Success Validation Signals",
    "description": "Telemetry signals that confirm the feature executed successfully"
  }
}
```

### Error Telemetry Node
```json
{
  "id": "error-telemetry",
  "type": "text",
  "text": "Error Telemetry\n\nEvent: forge.function.invocation\nSeverity: ERROR\n\nError Attributes:\n• success = 'false'\n• error.type: TypeError, NetworkError\n• error.message: Detailed error\n\nCommon Errors:\n• API timeout\n• Permission denied\n• Resource not found",
  "x": 900,
  "y": 530,
  "width": 200,
  "height": 200,
  "color": "#F8D7DA",
  "pv": {
    "nodeType": "integration",
    "name": "Error Event Telemetry",
    "description": "Events emitted when the feature fails"
  }
}
```

### Correlation Mechanism Node
```json
{
  "id": "correlation-join",
  "type": "text",
  "text": "Event Correlation\n\nJOIN Key: gen_ai.session.id\n\nExample:\nForge: session_1704067200_abc\nClaude: session_1704067200_abc\n\nResult:\nIssue SHIP-10 → $0.42 cost",
  "x": 500,
  "y": 380,
  "width": 150,
  "height": 100,
  "color": "#F0FFF0",
  "pv": {
    "nodeType": "clickhouse",
    "name": "Session-based Correlation",
    "description": "How Forge and Claude events are linked via session_id"
  }
}
```

### Resource/Enrichment Attributes Node
```json
{
  "id": "enrichment-attributes",
  "type": "text",
  "text": "Shiprail API Enrichment\n(Auto-added by API)\n\n• shiprail.organization.id: org_123\n• shiprail.team.id: team_456\n• shiprail.user.id: user_789",
  "x": 500,
  "y": 20,
  "width": 150,
  "height": 100,
  "color": "#E6F3FF",
  "pv": {
    "nodeType": "fastifyApi",
    "name": "Shiprail Enrichment Attributes",
    "description": "Multi-tenant metadata injected by shiprail API"
  }
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

```json
"pv": {
  "version": "1.0.0",
  "name": "Canvas Display Name",
  "description": "Description of what this canvas shows",
  "nodeTypes": {
    "service": {
      "label": "Service",
      "description": "System service component",
      "shape": "hexagon"
    },
    "otel-service": {
      "label": "OTEL Service",
      "description": "Runtime service for OTEL processing",
      "shape": "hexagon"
    }
  },
  "edgeTypes": {
    "http-request": {
      "label": "Flow",
      "style": "solid",
      "color": "#4A90E2",
      "directed": true
    }
  }
}
```

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
          ├── <workflow-name>.workflow.json
          └── <execution>.otel.json
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

## Integration with Code

### Type Generation
Event schemas in .otel.canvas files can generate TypeScript types:

```typescript
// Generated from canvas event schema (pv.event)
type ConversionStartedAttributes = {
  'config.nodeTypes': number;
  'config.edgeTypes': number;
};
```

### Runtime Validation
Use event schemas for type-safe event emission:

```typescript
import { createValidatedSpanEmitter } from '@principal-ai/principal-view-core';

const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span);

// Validates against schema at runtime
emit('conversion.started', {
  'config.nodeTypes': 2,
  'config.edgeTypes': 1
});
```

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

## Shape Reference

Common shapes for nodes:
- `rectangle`: Default, general purpose
- `hexagon`: Services, processors
- `diamond`: Decision points, matchers
- `ellipse`: Start/end points

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

## Color Reference

Suggested color palette:
- `#4A90E2`: Blue - Types, data structures
- `#7ED321`: Green - Services, processors
- `#3b82f6`: Blue - Converters, transformers
- `#9B59B6`: Purple - Filters, scopes
- `#10b981`: Green - Validators
- `#8b5cf6`: Purple - Outputs, results
- `#F5A623`: Orange - Operators, logic
- `#00BCD4`: Cyan - Canvas nodes
- `#D0021B`: Red - Errors, warnings

## References

- JSON Canvas spec: https://jsoncanvas.org/
- EVENT-SCHEMA-VALIDATION-GUIDE.md in codebase
- CODE-GENERATION-GUIDE.md for TypeScript codegen
