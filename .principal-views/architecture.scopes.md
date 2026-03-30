# Principal View CLI Instrumentation Scopes

## Overview

The Principal View CLI is instrumented with OpenTelemetry to provide observability into its operations. All telemetry is emitted under a single instrumentation scope.

## Scope: principal-view.cli

This scope covers all CLI operations including:

- **Command Execution**: Entry points for CLI commands (validate, lint, etc.)
- **Validation**: Schema validation, cross-reference checking, and rules engine execution
- **Discovery**: File system scanning and pattern matching for canvas, workflow, and library files
- **Parsing**: JSON/YAML parsing and transformation of canvas and workflow definitions

## Design Decisions

### Single Scope

The CLI uses a single instrumentation scope because:
1. It runs as a single process with no sub-services
2. All operations are tightly coupled within the same execution context
3. Simplifies trace analysis - all spans belong to the same scope

### Span Naming Conventions

Spans follow a hierarchical naming pattern:
- `cli.command` - Top-level command spans
- `validate.*` - Validation operations
- `discover.*` - File discovery operations
- `parse.*` - Parsing operations
- `file.*` - Low-level file I/O
