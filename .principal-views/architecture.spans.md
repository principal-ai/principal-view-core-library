# Principal View CLI Span Conventions

## Overview

This canvas defines the vocabulary of operations (spans) that the Principal View CLI emits. Edges represent valid parent-child relationships — if there's no edge, that span relationship is invalid.

## Layers

| Layer | Kind | Purpose |
|-------|------|---------|
| Entry | SERVER | CLI command invocation |
| Domain | INTERNAL | Business logic operations |
| Infrastructure | INTERNAL | File system access |

## Span Patterns

### Entry Points

| Pattern | Description |
|---------|-------------|
| `cli.command` | Top-level CLI invocation (e.g., `pv validate`) |

### Domain Operations

| Pattern | Description |
|---------|-------------|
| `validate.*` | Validation of canvas, workflow, trace files |
| `discover.*` | Discovery of libraries, canvases, workflows |
| `parse.*` | Parsing of canvas, YAML, JSON files |

### Infrastructure

| Pattern | Description |
|---------|-------------|
| `file.*` | File system read/write operations |

## Valid Relationships

The canvas edges define which spans can be parents of which:

- `cli.command` → `validate.*`, `discover.*`, `parse.*`
- `validate.*` → `discover.*`, `parse.*`
- `discover.*` → `file.*`
- `parse.*` → `file.*`

**Invalid example:** `cli.command` → `file.*` (no direct edge — must go through domain layer)

## Validation

At runtime, traces are validated against this canvas:
- All observed spans must match a defined pattern
- Parent-child relationships must have a corresponding edge
- Spans without edges to their parent are flagged as architectural violations
