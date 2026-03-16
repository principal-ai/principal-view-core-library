# Principal View Resources & Scopes

## Overview

Principal View CLI is a single-process tool that validates canvas files, workflows, and traces against architectural conventions.

## Resources

| Resource | Service Name | Description |
|----------|--------------|-------------|
| `pv-cli` | `principal-view.cli` | CLI validation tool |

## Scopes

Each resource has one instrumentation scope (1:1 mapping):

| Scope | Resource | Operations |
|-------|----------|------------|
| `principal-view.cli` | `pv-cli` | validate, discover, parse |

## Design Decisions

**Why one scope per resource?**

Following OTel best practices, scopes identify instrumentation libraries, not features or modules. Since the CLI is a single cohesive tool, one scope is sufficient. Different operations (validate, discover, parse) are differentiated via span names and attributes.

**No cross-process traces**

The CLI runs as a standalone process. There's no trace propagation to other services, so this is the only resource.
