---
name: create-otel-architecture-canvas
description: Create architecture canvases documenting OTEL resources, scopes, and span conventions. Use when users want to (1) document their service's OTEL resource attributes, (2) define instrumentation scope boundaries, (3) establish span naming conventions and valid parent-child relationships, or (4) create architectural documentation for their telemetry.
---

# Create OTEL Architecture Canvas

Create architecture canvas files that document OpenTelemetry resources, scopes, and span conventions.

## Purpose

Architecture canvases answer: **"What is the structure of our telemetry?"**

They document the foundational OTEL concepts:
- **Resources** - What services emit telemetry? (`service.name`, `deployment.environment`)
- **Scopes** - What instrumentation libraries exist? (one per resource typically)
- **Spans** - What operations are valid? (`cli.command`, `validate.*`, `file.*`)
- **Relationships** - Which spans can be parents of which?

## When to Use This Skill

Use this skill when the user wants to:
- **Document service identity** - "What resource attributes should our service emit?"
- **Define scope boundaries** - "What instrumentation scopes do we own?"
- **Establish span conventions** - "What span names should we use?"
- **Validate span hierarchy** - "Which spans can be children of which?"
- **Plan telemetry architecture** - "How should our tracing be structured?"

**Prerequisite**: Understanding of basic OTEL concepts (spans, traces, resources).

## Canvas Types

### 1. Resources Canvas (`resources.canvas` or `architecture.resources.canvas`)

Documents service resources and their instrumentation scopes.

**Structure:**
```
.principal-views/
  └── resources.canvas           # Flat structure (plain canvas)
```

**Purpose:** Show the resource → scope relationship for your services.

### 2. Spans Canvas (`architecture.spans.canvas`)

Documents span naming conventions and valid parent-child relationships.

**Structure:**
```
.principal-views/
  └── architecture.spans.canvas  # Flat structure (plain canvas)
```

**Purpose:** Define the vocabulary of operations and which can call which.

### 3. Scopes Canvas (`architecture.scopes.canvas`)

Documents instrumentation scope boundaries (validated against `library.yaml`).

**Structure:**
```
.principal-views/
  └── architecture.scopes.canvas
```

**Purpose:** Enforce that all owned scopes are documented.

## OTEL Hierarchy Overview

```
Resource (service.name: "my-api")
  └── Scope (instrumentation library: "my-api")
        └── Spans (operations: "http.request", "db.query")
              └── Events (within spans: "validation.started")
```

### Resources

Resources identify the **entity** producing telemetry:

| Attribute | Example | Description |
|-----------|---------|-------------|
| `service.name` | `checkout-api` | Logical service name |
| `service.namespace` | `ecommerce` | Service namespace |
| `service.version` | `1.2.3` | Service version |
| `deployment.environment` | `production` | Deployment environment |

### Scopes

Scopes identify the **instrumentation library** (not features):

- Typically 1:1 with resources for simple services
- Named after the instrumentation package
- Example: `@myorg/checkout-instrumentation`

### Spans

Spans represent **operations** with:

| Field | Description |
|-------|-------------|
| `spanPattern` | Name pattern (e.g., `validate.*`, `http.request`) |
| `spanKind` | `SERVER`, `CLIENT`, `INTERNAL`, `PRODUCER`, `CONSUMER` |

## Creating a Resources Canvas

### Step 1: Identify Resources

Ask: "What services/processes emit telemetry?"

For each service:
- What is its `service.name`?
- What environment attributes does it have?
- What instrumentation scopes does it use?

### Step 2: Create Canvas Structure

```json
{
  "pv": {
    "name": "Service Resources",
    "version": "1.0.0",
    "markdown": ".principal-views/resources.md"
  },
  "nodes": [
    {
      "id": "my-service-resource",
      "type": "text",
      "x": 0,
      "y": 0,
      "width": 300,
      "height": 100,
      "color": "#4A90E2",
      "text": "# my-service\n\n**service.name:** my-api\n\nMain API service"
    },
    {
      "id": "my-service-scope",
      "type": "text",
      "x": 0,
      "y": 150,
      "width": 300,
      "height": 100,
      "color": "#7ED321",
      "text": "# my-api\n\n**Scope for:** my-service\n\nAPI instrumentation"
    }
  ],
  "edges": [
    {
      "id": "resource-to-scope",
      "fromNode": "my-service-resource",
      "fromSide": "bottom",
      "toNode": "my-service-scope",
      "toSide": "top",
      "pv": { "edgeType": "data-flow" }
    }
  ]
}
```

### Step 3: Create Associated Markdown

Create `.principal-views/resources.md`:

```markdown
# Service Resources & Scopes

## Overview

This document describes the OTEL resources and instrumentation scopes
for [project name].

## Resources

| Resource | Service Name | Description |
|----------|--------------|-------------|
| `my-service` | `my-api` | Main API service |

## Scopes

Each resource has one instrumentation scope:

| Scope | Resource | Operations |
|-------|----------|------------|
| `my-api` | `my-service` | HTTP handlers, database access |

## Design Decisions

**Why one scope per resource?**

Following OTEL best practices, scopes identify instrumentation libraries,
not features. Different operations are differentiated via span names.
```

## Creating a Spans Canvas

### Step 1: Identify Span Patterns

Ask: "What operations does this service perform?"

Group by layer:
- **Entry points** - SERVER spans (HTTP, CLI, queue consumers)
- **Domain operations** - INTERNAL spans (business logic)
- **Infrastructure** - INTERNAL spans (database, file system, cache)

### Step 2: Define Span Hierarchy

Ask: "Which spans can be parents of which?"

Rules:
- Entry points are typically root spans
- Domain calls infrastructure
- Infrastructure doesn't call domain (usually)

### Step 3: Create Canvas Structure

```json
{
  "pv": {
    "name": "Span Conventions",
    "version": "1.0.0",
    "markdown": ".principal-views/architecture.spans.md",
    "nodeTypes": {
      "span-convention": {
        "label": "Span Convention",
        "description": "A span convention defining an operation type",
        "color": "#3B82F6"
      }
    }
  },
  "nodes": [
    {
      "id": "http-request",
      "type": "text",
      "x": 0,
      "y": 100,
      "width": 200,
      "height": 100,
      "text": "# http.request\n\nHTTP request handling",
      "pv": {
        "nodeType": "span-convention",
        "status": "draft",
        "otel": {
          "spanPattern": "http.request",
          "spanKind": "SERVER"
        }
      }
    },
    {
      "id": "validate",
      "type": "text",
      "x": 300,
      "y": 0,
      "width": 200,
      "height": 100,
      "text": "# validate.*\n\nValidation operations",
      "pv": {
        "nodeType": "span-convention",
        "status": "draft",
        "otel": {
          "spanPattern": "validate.*",
          "spanKind": "INTERNAL"
        }
      }
    },
    {
      "id": "db-query",
      "type": "text",
      "x": 300,
      "y": 150,
      "width": 200,
      "height": 100,
      "text": "# db.query\n\nDatabase queries",
      "pv": {
        "nodeType": "span-convention",
        "status": "draft",
        "otel": {
          "spanPattern": "db.query",
          "spanKind": "CLIENT"
        }
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "fromNode": "http-request",
      "fromSide": "right",
      "toNode": "validate",
      "toSide": "left",
      "pv": { "edgeType": "data-flow" }
    },
    {
      "id": "e2",
      "fromNode": "http-request",
      "fromSide": "right",
      "toNode": "db-query",
      "toSide": "left",
      "pv": { "edgeType": "data-flow" }
    }
  ]
}
```

### Step 4: Create Associated Markdown

Create `.principal-views/architecture.spans.md`:

```markdown
# Span Conventions

## Overview

This canvas defines the vocabulary of operations (spans) that this
service emits. Edges represent valid parent-child relationships.

## Layers

| Layer | Kind | Purpose |
|-------|------|---------|
| Entry | SERVER | HTTP/CLI entry points |
| Domain | INTERNAL | Business logic |
| Infrastructure | CLIENT/INTERNAL | External calls |

## Span Patterns

### Entry Points

| Pattern | Description |
|---------|-------------|
| `http.request` | HTTP request handling |

### Domain Operations

| Pattern | Description |
|---------|-------------|
| `validate.*` | Validation logic |
| `process.*` | Processing logic |

### Infrastructure

| Pattern | Description |
|---------|-------------|
| `db.query` | Database queries |
| `cache.*` | Cache operations |

## Valid Relationships

Edges define valid parent-child relationships:

- `http.request` → `validate.*`, `db.query`
- `validate.*` → `db.query`

**Invalid:** `db.query` → `http.request` (no reverse edge)
```

## Creating a Scopes Canvas (Validated)

Scopes canvases are validated against `library.yaml` owned-scopes.

### Step 1: Check library.yaml

```yaml
# library.yaml
name: my-library
owned-scopes:
  - my-api
  - my-worker
```

### Step 2: Create Canvas with Scope Nodes

Each owned scope needs a node with:
- `pv.nodeType: "scope"`
- `pv.otel.scope: "<scope-name>"`
- `pv.description: "<what this scope covers>"`

```json
{
  "pv": {
    "name": "Instrumentation Scopes",
    "version": "1.0.0",
    "markdown": ".principal-views/architecture.scopes.md"
  },
  "nodes": [
    {
      "id": "api-scope",
      "type": "text",
      "x": 0,
      "y": 0,
      "width": 250,
      "height": 120,
      "color": "#7ED321",
      "text": "# my-api\n\nAPI instrumentation scope",
      "pv": {
        "nodeType": "scope",
        "description": "Covers HTTP handlers and request processing",
        "otel": {
          "scope": "my-api"
        }
      }
    },
    {
      "id": "worker-scope",
      "type": "text",
      "x": 300,
      "y": 0,
      "width": 250,
      "height": 120,
      "color": "#7ED321",
      "text": "# my-worker\n\nWorker instrumentation scope",
      "pv": {
        "nodeType": "scope",
        "description": "Covers background job processing",
        "otel": {
          "scope": "my-worker"
        }
      }
    }
  ],
  "edges": []
}
```

### Step 3: Validate

```bash
npx @principal-ai/principal-view-cli validate
```

Validation checks:
- All `owned-scopes` from library.yaml have nodes
- Nodes have required `pv.nodeType: "scope"`
- Nodes have `pv.otel.scope` matching the scope name
- Nodes have `pv.description`

## PV OTEL Extension Fields

### Node-Level OTEL Metadata

```json
"pv": {
  "otel": {
    "kind": "service",           // "service", "function", "database", etc.
    "category": "api",           // "api", "worker", "storage", etc.
    "scope": "my-scope",         // For scopes canvas
    "spanPattern": "http.*",     // For spans canvas
    "spanKind": "SERVER"         // OTEL span kind
  }
}
```

### Resource Matching

For nodes that should "light up" when matching spans arrive:

```json
"pv": {
  "resourceMatch": {
    "service.name": "checkout-api",
    "deployment.environment": "production"
  }
}
```

Supports:
- Exact match: `"checkout-api"`
- Glob pattern: `{ "glob": "checkout-*" }`
- Regex: `{ "regex": "^api-.+" }`
- Existence: `{ "exists": true }`
- One of: `{ "oneOf": ["prod", "staging"] }`

### Span Matching

```json
"pv": {
  "otel": {
    "spanMatch": {
      "name": "POST /api/*",
      "kind": "SPAN_KIND_SERVER",
      "attributes": {
        "http.method": "POST"
      }
    }
  }
}
```

## Workflow

1. **Identify what to document**
   - Resources? → Create `resources.canvas`
   - Scopes? → Create `architecture.scopes.canvas`
   - Spans? → Create `architecture.spans.canvas`

2. **Gather information**
   - What services exist?
   - What operations do they perform?
   - What are the valid call hierarchies?

3. **Create canvas with proper structure**
   - Use `pv.otel` for OTEL-specific metadata
   - Connect nodes with edges for relationships
   - Use consistent node sizing (200×100 recommended)

4. **Create associated markdown**
   - Explain WHAT and WHY, not just HOW
   - Document design decisions
   - Include tables for quick reference

5. **Validate**
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

## Best Practices

1. **One canvas per concern**
   - Resources canvas for service identity
   - Spans canvas for operation conventions
   - Don't mix concepts

2. **Document relationships as edges**
   - Resource → Scope
   - Entry span → Domain span → Infrastructure span
   - Missing edge = invalid relationship

3. **Use wildcard patterns for spans**
   - `validate.*` matches `validate.input`, `validate.schema`
   - `db.*` matches `db.query`, `db.connect`

4. **Follow OTEL conventions**
   - Use standard attribute names (`service.name`, not `serviceName`)
   - Use standard span kinds (`SERVER`, `CLIENT`, `INTERNAL`)

5. **Include rationale in markdown**
   - Why one scope per resource?
   - Why certain span hierarchies are invalid?

## Examples in Codebase

See these files for working examples:

- `.principal-views/resources.canvas` - Resource/scope documentation
- `.principal-views/architecture.spans.canvas` - Span conventions
- `.principal-views/resources.md` - Resource documentation
- `.principal-views/architecture.spans.md` - Span documentation

## Validation

```bash
# Validate all canvas files
npx @principal-ai/principal-view-cli validate

# Scopes canvas is validated against library.yaml owned-scopes
# Missing scopes → error
# Extra scopes → warning
# Missing description → warning
```

## Integration with Other Skills

**Prerequisites:**
- None - this is foundational documentation

**Follow-up skills:**
- `create-otel-canvas` - Create feature-specific canvases that reference these conventions
- `setup-otel-testing` - Instrument code following the span conventions defined here

## References

- `.principal-views/OTEL-SPAN-MATCHING.md` - Span matching architecture
- `packages/core/src/types/resource-match.ts` - Resource matching types
- `packages/core/src/scopes/ScopesCanvasValidator.ts` - Scopes validation logic
- OpenTelemetry Semantic Conventions: https://opentelemetry.io/docs/concepts/semantic-conventions/
