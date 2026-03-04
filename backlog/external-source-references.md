# External Source References in OTEL Canvas

## Problem Statement

When creating OTEL canvas files, the validator requires `pv.sources` to point to files that exist relative to the repository root. However, real-world architectures often span multiple packages or repositories.

### Example: Terminal Activity Tracking

In the electron-app, we're documenting a flow that involves:

```
Terminal Panel (npm package)  →  Dev Workspace (electron-app)  →  Main Process
```

The `ThemedTerminal.tsx` and `TabbedTerminalPanel.tsx` components live in an **external npm package** (`@industry-theme/xterm-terminal-panel`), not in the electron-app repository.

**Current validation error:**
```
✗ Node "themed-terminal" references non-existent source file:
  packages/industry-themed-xterm-terminal-panel/src/components/ThemedTerminal.tsx
→ Verify the file path is correct relative to repository root
```

## Use Cases

1. **npm dependencies** - Documenting integration with installed packages
2. **Monorepo siblings** - Cross-package flows in a monorepo
3. **External repositories** - Flows spanning multiple git repos
4. **Draft implementations** - Planned code that doesn't exist yet
5. **Third-party APIs** - External services with no local source

## Potential Solutions

### Option A: External Prefix

```json
{
  "sources": ["external:@industry-theme/terminal-panel/src/ThemedTerminal.tsx"]
}
```

- Simple syntax, clear intent
- Validator skips existence check for `external:` prefix
- Could optionally resolve to npm package location

### Option B: URL-Based Sources

```json
{
  "sources": [
    "npm:@industry-theme/terminal-panel@1.2.0/src/ThemedTerminal.tsx",
    "github:org/repo/src/file.tsx",
    "file:../sibling-repo/src/file.tsx"
  ]
}
```

- More explicit about source location
- Could enable linking to specific versions
- More complex to parse

### Option C: Source Object with Type

```json
{
  "sources": [
    { "type": "local", "path": "src/services/MyService.ts" },
    { "type": "external", "package": "@industry-theme/terminal-panel", "path": "src/ThemedTerminal.tsx" },
    { "type": "planned", "path": "src/services/FutureService.ts" }
  ]
}
```

- Most explicit and extensible
- Breaking change from string array
- Could support both formats

### Option D: Status-Based Validation Skip

When `"status": "draft"`, don't validate sources exist since the code is planned but not yet implemented.

```json
{
  "pv": {
    "status": "draft",
    "sources": ["src/services/PlannedService.ts"]
  }
}
```

- Leverages existing field
- Doesn't help with external packages in production code

### Option E: Per-Node Validation Override

```json
{
  "pv": {
    "sources": ["packages/external-pkg/src/File.tsx"],
    "validateSources": false
  }
}
```

- Explicit opt-out
- Could be abused to skip all validation

## Recommendation

Consider a combination:

1. **External prefix** for npm/external packages (Option A)
2. **Status-based skip** for draft implementations (Option D)

This keeps the simple string array format while supporting the main use cases.

## Context

This came up while creating the terminal-activity-tracking OTEL canvas in electron-app. The architecture spans:

- `industry-themed-xterm-terminal-panel` (external npm package)
- `electron-app` (local repository)

Canvas file: `.principal-views/terminal-activity-tracking/terminal-activity-tracking.otel.canvas`

## Related

- Canvas validation logic in `packages/principal-view-cli/src/commands/validate.ts`
- Source resolution in validator
