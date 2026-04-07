# Scopes Validation Incorrectly Treats Resource service.name as Owned Scopes

## Problem Statement

When running `npx @principal-ai/principal-view-cli scopes validate`, the validator incorrectly treats the `service.name` values from resources as scopes that need to be documented in the scopes canvas.

In proper OTEL semantics:
- **Resources** are identified by `service.name` (e.g., `control-tower-server`, `control-tower-client`)
- **Scopes** are instrumentation boundaries within resources (e.g., `websocket-adapter`, `message-handler`)

The validator conflates these two concepts.

### Current Behavior

Given this `library.yaml`:

```yaml
resources:
  server:
    service.name: "control-tower-server"
    owned-scopes:
      - "websocket-adapter"
      - "auth-adapter"
      - "server"
      - "message-handler"

  client:
    service.name: "control-tower-client"
    owned-scopes:
      - "client-lifecycle"
      - "client-response"
```

Running `npx @principal-ai/principal-view-cli scopes validate` produces:

```
Coverage:
  • Owned scopes: 8
  • Documented: 6
  • Missing: control-tower-server, control-tower-client

error: Scopes canvas is missing 2 scope(s) from library.yaml
  Suggestion: Add nodes for the following scopes:
  - control-tower-server: Add type: "otel-scope" node with otel.scope: "control-tower-server"
  - control-tower-client: Add type: "otel-scope" node with otel.scope: "control-tower-client"
```

### Expected Behavior

The validator should only check that the items in `owned-scopes` arrays are documented:
- `websocket-adapter`
- `auth-adapter`
- `server`
- `message-handler`
- `client-lifecycle`
- `client-response`

The `service.name` values (`control-tower-server`, `control-tower-client`) are **resource identifiers**, not scopes, and should not be included in scope coverage validation.

## OTEL Semantic Model

```
Resource (service.name: "control-tower-server")
  └── Scope: websocket-adapter
  └── Scope: auth-adapter
  └── Scope: server
  └── Scope: message-handler

Resource (service.name: "control-tower-client")
  └── Scope: client-lifecycle
  └── Scope: client-response
```

Resources and scopes are different levels of the OTEL hierarchy and should not be mixed in scope validation.

## Proposed Solution

In the scopes validation logic:

1. Only collect items from `owned-scopes` arrays when computing "owned scopes"
2. Do not include `service.name` values in the scope count
3. Validate that each `owned-scopes` item has a corresponding `otel-scope` node in the canvas

```typescript
// Pseudo-code - current (buggy)
const ownedScopes = resources.flatMap(r => [r.serviceName, ...r.ownedScopes]);

// Pseudo-code - expected
const ownedScopes = resources.flatMap(r => r.ownedScopes);
```

## Context

Discovered while restructuring `control-tower-core` scopes canvas to properly represent the OTEL resource/scope hierarchy, with Server and Client as resources containing their respective scopes.
