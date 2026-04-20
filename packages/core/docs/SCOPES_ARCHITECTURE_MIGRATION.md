# Scopes Architecture Migration

**Status**: Planning
**Created**: 2026-04-20
**Target**: v0.28.0

## Problem Statement

Currently, scope information exists in **two separate places**, creating redundancy and confusion:

1. **`library.yaml` → `scopes:` section** - Defines scope colors for event node rendering
2. **`.scopes.canvas`** - Architectural diagram showing scope nodes as visual elements

This dual representation creates several issues:

### Issues with Current Architecture

1. **Data Duplication**: Scope names and colors defined in both places
2. **Maintenance Burden**: When adding a scope, must update both `library.yaml` and `.scopes.canvas`
3. **Inconsistency Risk**: Colors can drift between the two sources
4. **Unclear Source of Truth**: Which file owns the scope definition?
5. **Validation Complexity**: CLI must validate both files are in sync

### Example of Current Duplication

**library.yaml**:
```yaml
scopes:
  auth-service:
    color: "#3B82F6"
    description: "Authentication service scope"
  payment-service:
    color: "#10B981"
    description: "Payment service scope"
```

**architecture.scopes.canvas**:
```json
{
  "nodes": [
    {
      "id": "auth-scope",
      "type": "otel-scope",
      "label": "Authentication Service",
      "otel": { "scope": "auth-service" }
    },
    {
      "id": "payment-scope",
      "type": "otel-scope",
      "label": "Payment Service",
      "otel": { "scope": "payment-service" }
    }
  ]
}
```

**Problem**: Scope name and metadata duplicated across two files!

---

## Proposed Architecture

**Single Source of Truth**: `.scopes.canvas` file

All scope information (colors, descriptions, icons) lives in the `.scopes.canvas` file as node properties. The `library.yaml` file no longer contains a `scopes:` section.

### New Structure

**architecture.scopes.canvas** (source of truth):
```json
{
  "pv": {
    "name": "Instrumentation Scopes",
    "description": "Defines instrumentation scopes for the application"
  },
  "nodes": [
    {
      "id": "auth-scope",
      "type": "otel-scope",
      "label": "Authentication Service",
      "color": "#3B82F6",
      "description": "Handles user authentication and session management",
      "otel": {
        "scope": "auth-service"
      },
      "data": {
        "icon": "shield"
      }
    },
    {
      "id": "payment-scope",
      "type": "otel-scope",
      "label": "Payment Service",
      "color": "#10B981",
      "description": "Processes payments and transactions",
      "otel": {
        "scope": "payment-service"
      },
      "data": {
        "icon": "credit-card"
      }
    }
  ]
}
```

**library.yaml** (no scopes section):
```yaml
version: "1.0.0"
name: "My Library"

resources:
  my-service:
    service.name: "my-service"
    owned-scopes:
      - auth-service
      - payment-service

nodeComponents:
  otel-scope:
    shape: circle
    color: "#8b5cf6"  # Default color for scope nodes
    description: "OTEL instrumentation scope"

edgeComponents:
  # ... edge definitions
```

### Benefits

1. **Single Source of Truth**: Scope metadata lives in one place
2. **Visual First**: Scopes are architectural elements, naturally belong in canvas
3. **Richer Metadata**: Can include visual position, relationships, groupings
4. **Simpler Validation**: Only validate that `owned-scopes` references exist in `.scopes.canvas`
5. **Better UX**: Edit scope colors directly in the canvas visual editor

---

## Current Implementation Details

### Where `library.yaml` → `scopes:` is Used

#### 1. Core Library - Scope Color Mapping

**File**: `packages/core/src/scopes/utils.ts:94-106`

```typescript
export function buildScopeColorMap(
  library: { scopes?: Record<string, ScopeDefinition> } | undefined
): Record<string, string> {
  const colorMap: Record<string, string> = {};

  if (library?.scopes) {
    for (const [name, def] of Object.entries(library.scopes)) {
      colorMap[name] = def.color ?? DEFAULT_SCOPE_COLOR;
    }
  }

  return colorMap;
}
```

**Purpose**: Creates `{ "auth-service": "#3B82F6", ... }` map for fast color lookups
**Used by**: `GraphRenderer` to color event nodes based on `otel.scope` field

#### 2. React - GraphRenderer Color Injection

**File**: `packages/react/src/components/GraphRenderer.tsx:2584`

```typescript
const scopeColorMap = buildScopeColorMap(library);

for (const node of nodes) {
  const scope = node.data?.otel?.scope;
  if (scope) {
    node.data.scopeColor = scopeColorMap[scope] ?? DRAFT_NODE_COLOR;
  }
}
```

**Purpose**: Injects `scopeColor` into node data for rendering
**Result**: Event nodes get colored based on their scope

#### 3. CLI - Scope Validation

**File**: `packages/cli/src/commands/validate.ts:1495-1506`

```typescript
if (library && library.scopes) {
  if (!library.scopes[scope]) {
    const availableScopes = Object.keys(library.scopes);
    issues.push({
      level: 'error',
      message: `Scope "${scope}" is not defined in library.yaml. Available scopes: ${availableScopes.join(', ')}`
    });
  }
}
```

**Purpose**: Validates that `otel.scope` values in canvas nodes exist in `library.scopes`
**Error**: Prevents typos and undefined scope references

#### 4. CLI - Library Schema Validation

**File**: `packages/cli/src/commands/validate.ts:355-366`

```typescript
if (lib.scopes && typeof lib.scopes === 'object') {
  for (const [scopeId, scopeDef] of Object.entries(lib.scopes)) {
    const scope = scopeDef as Record<string, unknown>;

    // Check for unknown fields
    checkUnknownFields(scope, ALLOWED_LIBRARY_FIELDS.scope, `scopes.${scopeId}`, issues);

    // Validate icon names are valid Lucide icons
    if (scope.icon) {
      validateIconName(scope.icon, `scopes.${scopeId}.icon`, issues);
    }
  }
}
```

**Purpose**: Schema validation for scope definitions
**Checks**: Unknown fields, valid icon names

#### 5. Discovery - Scopes Canvas Requirement

**File**: `packages/core/src/discovery/LibraryDiscovery.ts:299-338`

```typescript
private async validateScopesCanvasRequirement(
  packagePath: string,
  servicesWithScopes: ServiceWithScopes[],
  libraryPath: string,
  errors: LibraryValidationError[]
): Promise<void> {
  const hasOwnedScopes = servicesWithScopes.some(s => s.ownedScopes.length > 0);
  if (!hasOwnedScopes) return;

  const scopesCanvasExists = await this.checkScopesCanvasExists(pvDir);

  if (!scopesCanvasExists) {
    errors.push({
      message: `Scopes canvas required: library.yaml defines owned-scopes but no .scopes.canvas file found`,
      type: 'scopes-canvas-required'
    });
  }
}
```

**Purpose**: Ensures `.scopes.canvas` exists when `owned-scopes` is defined
**Validates**: Scopes are documented in canvas files

#### 6. Panels - Legend Display

**File**: `industry-themed-principal-view-panels/src/panels/CanvasEditorPanel.tsx:1836-1895`

```typescript
{state.library?.scopes && Object.keys(state.library.scopes).length > 0 && (
  <div>
    <span>Scopes:</span>
    {Object.entries(state.library.scopes).map(([scopeName, scopeConfig]) => (
      <div key={scopeName}>
        <div
          style={{ backgroundColor: scopeConfig.color }}
          onClick={(e) => openColorPicker(scopeName, e)}
        />
        <span>{scopeName}</span>
      </div>
    ))}
  </div>
)}
```

**Purpose**: Displays scope colors in legend with interactive color picker
**Feature**: Click to edit scope colors (saves to `library.yaml`)

---

## Migration Implementation

### Phase 1: Dual Support (Backwards Compatible)

**Goal**: Support both architectures simultaneously

#### Core Library Changes

**1. New Canvas-based Color Map Builder**

```typescript
// packages/core/src/scopes/utils.ts

/**
 * Build scope color map from .scopes.canvas nodes
 * Reads color from node.color or node.data?.color
 */
export function buildScopeColorMapFromCanvas(
  scopesCanvas: ExtendedCanvas | undefined
): Record<string, string> {
  const colorMap: Record<string, string> = {};

  if (!scopesCanvas?.nodes) return colorMap;

  for (const node of scopesCanvas.nodes) {
    // Only process otel-scope nodes
    if (node.type !== 'otel-scope') continue;

    const scopeName = node.otel?.scope;
    if (!scopeName) continue;

    // Get color from node.color or node.data.color
    const color = node.color || node.data?.color;
    if (color) {
      colorMap[scopeName] = color;
    }
  }

  return colorMap;
}
```

**2. Update Existing Builder with Fallback**

```typescript
// packages/core/src/scopes/utils.ts

/**
 * Build scope color map with fallback strategy:
 * 1. Use scopesCanvas if provided
 * 2. Fall back to library.scopes (deprecated)
 */
export function buildScopeColorMap(
  library: { scopes?: Record<string, ScopeDefinition> } | undefined,
  scopesCanvas?: ExtendedCanvas
): Record<string, string> {
  // Prefer canvas-based approach
  if (scopesCanvas) {
    return buildScopeColorMapFromCanvas(scopesCanvas);
  }

  // Fall back to library.scopes (deprecated)
  const colorMap: Record<string, string> = {};
  if (library?.scopes) {
    for (const [name, def] of Object.entries(library.scopes)) {
      colorMap[name] = def.color ?? DEFAULT_SCOPE_COLOR;
    }
  }

  return colorMap;
}
```

#### React Changes

**Update GraphRenderer to accept scopesCanvas**

```typescript
// packages/react/src/components/GraphRenderer.tsx

function useCanvasToLegacy(
  canvas: ExtendedCanvas | undefined,
  library?: ComponentLibrary,
  spansCanvas?: ExtendedCanvas,
  scopesCanvas?: ExtendedCanvas  // NEW parameter
) {
  // Build scope color map (prefers canvas, falls back to library)
  const scopeColorMap = buildScopeColorMap(library, scopesCanvas);

  // Rest of implementation unchanged
}
```

#### CLI Changes

**1. Add Migration Command**

```bash
pv migrate scopes-to-canvas
```

```typescript
// packages/cli/src/commands/migrate-scopes-to-canvas.ts

export async function migrateScopesToCanvas() {
  // 1. Read library.yaml
  const library = await loadLibrary();

  if (!library.scopes || Object.keys(library.scopes).length === 0) {
    console.log('No scopes to migrate');
    return;
  }

  // 2. Check if .scopes.canvas already exists
  const scopesCanvasPath = findScopesCanvas();
  let scopesCanvas: ExtendedCanvas;

  if (scopesCanvasPath) {
    // Load existing canvas
    scopesCanvas = await loadCanvas(scopesCanvasPath);
  } else {
    // Create new canvas
    scopesCanvas = {
      pv: {
        name: 'Instrumentation Scopes',
        description: 'Defines instrumentation scopes for the application'
      },
      nodes: [],
      edges: []
    };
  }

  // 3. Convert library.scopes to canvas nodes
  let x = 0;
  for (const [scopeName, scopeDef] of Object.entries(library.scopes)) {
    // Check if node already exists
    const existingNode = scopesCanvas.nodes.find(
      n => n.otel?.scope === scopeName
    );

    if (!existingNode) {
      scopesCanvas.nodes.push({
        id: `${scopeName}-scope`,
        type: 'otel-scope',
        label: scopeDef.description || scopeName,
        color: scopeDef.color,
        description: scopeDef.description,
        x,
        y: 0,
        width: 200,
        height: 80,
        otel: {
          scope: scopeName
        },
        data: scopeDef.icon ? { icon: scopeDef.icon } : undefined
      });
      x += 250; // Space nodes horizontally
    }
  }

  // 4. Save updated canvas
  const outputPath = scopesCanvasPath || '.principal-views/architecture.scopes.canvas';
  await saveCanvas(outputPath, scopesCanvas);

  // 5. Show deprecation warning
  console.warn(`
✓ Migrated ${Object.keys(library.scopes).length} scopes to ${outputPath}

⚠️  NEXT STEPS:
1. Review the generated .scopes.canvas file
2. Remove the 'scopes:' section from library.yaml
3. Update your code to pass scopesCanvas to GraphRenderer

The 'scopes' section in library.yaml is now deprecated and will be removed in v0.29.0.
  `);
}
```

**2. Add Deprecation Warning to Validation**

```typescript
// packages/cli/src/commands/validate.ts

// After existing scope validation
if (lib.scopes && typeof lib.scopes === 'object') {
  issues.push({
    level: 'warning',
    message: `The 'scopes' section in library.yaml is deprecated. Run 'pv migrate scopes-to-canvas' to migrate to .scopes.canvas. This section will be removed in v0.29.0.`,
    path: libraryPath
  });
}
```

**3. Update Scope Reference Validation**

```typescript
// packages/cli/src/commands/validate.ts

async function validateScopeReferences(
  canvas: ExtendedCanvas,
  library: ComponentLibrary,
  scopesCanvas?: ExtendedCanvas
) {
  for (const node of canvas.nodes) {
    const scope = node.otel?.scope;
    if (!scope) continue;

    // Build available scopes list from both sources
    let availableScopes: string[] = [];

    // 1. Check .scopes.canvas (preferred)
    if (scopesCanvas) {
      availableScopes = scopesCanvas.nodes
        .filter(n => n.type === 'otel-scope' && n.otel?.scope)
        .map(n => n.otel!.scope);
    }

    // 2. Fall back to library.scopes (deprecated)
    if (availableScopes.length === 0 && library.scopes) {
      availableScopes = Object.keys(library.scopes);
    }

    // 3. Validate scope exists
    if (availableScopes.length > 0 && !availableScopes.includes(scope)) {
      issues.push({
        level: 'error',
        nodeId: node.id,
        message: `Scope "${scope}" not found. Available scopes: ${availableScopes.join(', ')}`,
        suggestion: scopesCanvas
          ? `Add a node with type="otel-scope" and otel.scope="${scope}" to your .scopes.canvas file`
          : `Add "${scope}" to the scopes section in library.yaml (deprecated) or create a .scopes.canvas file`
      });
    }
  }
}
```

#### Panels Changes

**Update Legend to Support Both Sources**

```typescript
// industry-themed-principal-view-panels/src/panels/CanvasEditorPanel.tsx

// Load scopes canvas alongside library
const [scopesCanvas, setScopesCanvas] = useState<ExtendedCanvas | null>(null);

useEffect(() => {
  // Load .scopes.canvas if it exists
  const loadScopesCanvas = async () => {
    const scopesPath = findScopesCanvasPath(fileTree);
    if (scopesPath) {
      const content = await readFile(scopesPath);
      setScopesCanvas(ConfigLoader.parseCanvas(content));
    }
  };
  loadScopesCanvas();
}, [fileTree]);

// Build scope color map from both sources
const scopeColors = useMemo(() => {
  const colors: Record<string, string> = {};

  // 1. Prefer .scopes.canvas
  if (scopesCanvas?.nodes) {
    for (const node of scopesCanvas.nodes) {
      if (node.type === 'otel-scope' && node.otel?.scope) {
        colors[node.otel.scope] = node.color || '#64748b';
      }
    }
  }

  // 2. Fall back to library.scopes (deprecated)
  if (Object.keys(colors).length === 0 && state.library?.scopes) {
    for (const [name, def] of Object.entries(state.library.scopes)) {
      colors[name] = def.color || '#64748b';
    }
  }

  return colors;
}, [scopesCanvas, state.library]);

// Render legend
{Object.keys(scopeColors).length > 0 && (
  <div>
    <span>Scopes:</span>
    {Object.entries(scopeColors).map(([scopeName, color]) => (
      <div key={scopeName}>
        <div
          style={{ backgroundColor: color }}
          onClick={(e) => openColorPicker(scopeName, e)}
        />
        <span>{scopeName}</span>
      </div>
    ))}
  </div>
)}
```

**Update Color Picker to Edit Canvas**

```typescript
const handleScopeColorChange = async (scopeName: string, newColor: string) => {
  if (scopesCanvas) {
    // Edit .scopes.canvas node color
    const updatedCanvas = {
      ...scopesCanvas,
      nodes: scopesCanvas.nodes.map(node =>
        node.otel?.scope === scopeName
          ? { ...node, color: newColor }
          : node
      )
    };

    // Save canvas
    await actions.writeFile(scopesCanvasPath, JSON.stringify(updatedCanvas, null, 2));
    setScopesCanvas(updatedCanvas);
  } else {
    // Fall back to library.yaml (deprecated - existing code)
    // ... existing implementation
  }
};
```

### Phase 2: Deprecation (v0.29.0)

**Goal**: Make `library.scopes` an error, force migration

#### Changes

1. **CLI Validation**: Upgrade warning to error
   ```typescript
   if (lib.scopes) {
     issues.push({
       level: 'error',
       message: `The 'scopes' section in library.yaml is no longer supported. Run 'pv migrate scopes-to-canvas' to migrate.`
     });
   }
   ```

2. **Core Library**: Remove deprecated code paths
   - Keep `buildScopeColorMap` but require `scopesCanvas` parameter
   - Remove fallback to `library.scopes`

3. **Documentation**: Update all examples to use `.scopes.canvas`

### Phase 3: Removal (v0.30.0)

**Goal**: Complete removal of `library.scopes` support

#### Changes

1. **Type Definitions**: Remove `scopes` field from `ComponentLibrary` interface
2. **Validation**: Remove all `library.scopes` handling code
3. **Migration**: Archive migration command (no longer needed)

---

## Implementation Checklist

### Phase 1: Dual Support

#### Core Library (`@principal-ai/principal-view-core`)

- [ ] Add `buildScopeColorMapFromCanvas()` function
- [ ] Update `buildScopeColorMap()` to accept optional `scopesCanvas` parameter
- [ ] Add fallback logic (canvas → library.scopes)
- [ ] Update type exports
- [ ] Write unit tests for canvas-based color mapping
- [ ] Update existing tests to pass `scopesCanvas`

#### React (`@principal-ai/principal-view-react`)

- [ ] Add `scopesCanvas` prop to `GraphRenderer`
- [ ] Update `useCanvasToLegacy` to accept `scopesCanvas`
- [ ] Pass `scopesCanvas` to `buildScopeColorMap`
- [ ] Update PropTypes/TypeScript types
- [ ] Update Storybook examples

#### CLI (`@principal-ai/principal-view-cli`)

- [ ] Create `migrate-scopes-to-canvas` command
- [ ] Add deprecation warning to `validate` command
- [ ] Update scope validation to check both sources
- [ ] Add `--scopesCanvas` flag to validate command
- [ ] Update help text and documentation

#### Panels (`industry-themed-principal-view-panels`)

- [ ] Load `.scopes.canvas` file in `CanvasEditorPanel`
- [ ] Build scope colors from both sources (canvas preferred)
- [ ] Update color picker to edit canvas when available
- [ ] Fall back to library.yaml editing when no canvas
- [ ] Add deprecation UI warning when using library.scopes
- [ ] Update stories to use `.scopes.canvas`

### Phase 2: Deprecation (v0.29.0)

- [ ] Upgrade CLI warning to error
- [ ] Update all documentation
- [ ] Update all examples in repos
- [ ] Publish migration guide
- [ ] Create video tutorial on migration

### Phase 3: Removal (v0.30.0)

- [ ] Remove `scopes` field from `ComponentLibrary` interface
- [ ] Remove library.scopes fallback logic
- [ ] Remove deprecated code paths
- [ ] Archive migration command
- [ ] Update CHANGELOG

---

## Testing Strategy

### Unit Tests

```typescript
// packages/core/src/scopes/__tests__/utils.test.ts

describe('buildScopeColorMapFromCanvas', () => {
  it('extracts colors from otel-scope nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        {
          id: 'auth',
          type: 'otel-scope',
          color: '#3B82F6',
          otel: { scope: 'auth-service' }
        },
        {
          id: 'payment',
          type: 'otel-scope',
          color: '#10B981',
          otel: { scope: 'payment-service' }
        }
      ],
      edges: []
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap).toEqual({
      'auth-service': '#3B82F6',
      'payment-service': '#10B981'
    });
  });

  it('ignores non-otel-scope nodes', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        { id: 'regular', type: 'rectangle', color: '#FF0000' },
        { id: 'auth', type: 'otel-scope', color: '#3B82F6', otel: { scope: 'auth' } }
      ],
      edges: []
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap).toEqual({ 'auth': '#3B82F6' });
  });

  it('uses default color when node has no color', () => {
    const canvas: ExtendedCanvas = {
      nodes: [
        { id: 'auth', type: 'otel-scope', otel: { scope: 'auth' } }
      ],
      edges: []
    };

    const colorMap = buildScopeColorMapFromCanvas(canvas);

    expect(colorMap).toEqual({});
  });
});

describe('buildScopeColorMap with fallback', () => {
  it('prefers scopesCanvas over library.scopes', () => {
    const library = {
      scopes: {
        'auth': { color: '#OLD_COLOR' }
      }
    };

    const scopesCanvas: ExtendedCanvas = {
      nodes: [
        { id: 'auth', type: 'otel-scope', color: '#NEW_COLOR', otel: { scope: 'auth' } }
      ],
      edges: []
    };

    const colorMap = buildScopeColorMap(library, scopesCanvas);

    expect(colorMap['auth']).toBe('#NEW_COLOR');
  });

  it('falls back to library.scopes when no canvas provided', () => {
    const library = {
      scopes: {
        'auth': { color: '#3B82F6' }
      }
    };

    const colorMap = buildScopeColorMap(library);

    expect(colorMap['auth']).toBe('#3B82F6');
  });
});
```

### Integration Tests

```typescript
// packages/react/src/__tests__/GraphRenderer.scopes.test.tsx

describe('GraphRenderer with scopesCanvas', () => {
  it('colors nodes using scopesCanvas', () => {
    const canvas = {
      nodes: [
        { id: 'login', type: 'event', otel: { scope: 'auth' } }
      ]
    };

    const scopesCanvas = {
      nodes: [
        { id: 'auth', type: 'otel-scope', color: '#3B82F6', otel: { scope: 'auth' } }
      ]
    };

    render(<GraphRenderer canvas={canvas} scopesCanvas={scopesCanvas} />);

    // Verify node has correct background color
    const node = screen.getByTestId('node-login');
    expect(node).toHaveStyle({ backgroundColor: '#3B82F6' });
  });
});
```

### CLI Tests

```typescript
// packages/cli/src/commands/__tests__/migrate-scopes.test.ts

describe('migrate scopes-to-canvas', () => {
  it('creates .scopes.canvas from library.scopes', async () => {
    // Setup: library.yaml with scopes
    const library = `
version: "1.0"
scopes:
  auth:
    color: "#3B82F6"
    description: "Auth scope"
`;

    await fs.writeFile('library.yaml', library);

    // Run migration
    await migrateScopesToCanvas();

    // Verify: .scopes.canvas created
    const scopesCanvas = JSON.parse(
      await fs.readFile('.principal-views/architecture.scopes.canvas', 'utf-8')
    );

    expect(scopesCanvas.nodes).toHaveLength(1);
    expect(scopesCanvas.nodes[0]).toMatchObject({
      type: 'otel-scope',
      color: '#3B82F6',
      otel: { scope: 'auth' }
    });
  });
});
```

---

## Migration Examples

### Example 1: Simple Migration

**Before (library.yaml)**:
```yaml
version: "1.0"
name: "My App"

scopes:
  auth:
    color: "#3B82F6"
    description: "Authentication"
  payments:
    color: "#10B981"
    description: "Payment processing"

resources:
  my-service:
    service.name: "my-service"
    owned-scopes:
      - auth
      - payments
```

**After**:

**library.yaml**:
```yaml
version: "1.0"
name: "My App"

resources:
  my-service:
    service.name: "my-service"
    owned-scopes:
      - auth
      - payments
```

**.principal-views/architecture.scopes.canvas**:
```json
{
  "pv": {
    "name": "Instrumentation Scopes",
    "description": "OTEL instrumentation scopes for my-service"
  },
  "nodes": [
    {
      "id": "auth-scope",
      "type": "otel-scope",
      "label": "Authentication",
      "color": "#3B82F6",
      "description": "Authentication",
      "x": 0,
      "y": 0,
      "width": 200,
      "height": 80,
      "otel": {
        "scope": "auth"
      }
    },
    {
      "id": "payments-scope",
      "type": "otel-scope",
      "label": "Payment Processing",
      "color": "#10B981",
      "description": "Payment processing",
      "x": 250,
      "y": 0,
      "width": 200,
      "height": 80,
      "otel": {
        "scope": "payments"
      }
    }
  ],
  "edges": []
}
```

### Example 2: Code Usage Update

**Before**:
```typescript
// Only library needed
<GraphRenderer
  canvas={canvas}
  library={library}
/>
```

**After (Phase 1)**:
```typescript
// Load scopes canvas
const scopesCanvas = await loadCanvas('.principal-views/architecture.scopes.canvas');

// Pass to renderer
<GraphRenderer
  canvas={canvas}
  library={library}
  scopesCanvas={scopesCanvas}  // NEW
/>
```

---

## FAQ

### Q: Why not keep both for flexibility?

**A**: Maintaining two sources of truth creates:
- Synchronization bugs
- Confusing developer experience
- Higher maintenance burden
- More complex validation

The `.scopes.canvas` approach is strictly superior as it:
- Provides visual context
- Supports richer metadata
- Allows visual editing
- Is more maintainable

### Q: What happens to existing projects?

**A**: Projects can migrate at their own pace:
- **Phase 1 (v0.28)**: Both work, library.scopes deprecated
- **Phase 2 (v0.29)**: library.scopes causes error, must migrate
- **Phase 3 (v0.30)**: library.scopes support removed entirely

Migration is simple: `pv migrate scopes-to-canvas`

### Q: Can I still use library.yaml for other config?

**A**: Yes! Only the `scopes:` section is being removed. All other sections remain:
- `resources` - Service definitions with owned-scopes
- `nodeComponents` - Visual node type definitions
- `edgeComponents` - Edge type definitions
- `states` - Node state definitions

### Q: What if I don't want a visual canvas?

**A**: The `.scopes.canvas` file is primarily a **data structure**, not just a visual diagram. You don't need to display it visually. It's simply a better storage format than YAML for scope metadata because:
- JSON is easier to parse and manipulate
- Nodes naturally represent scopes (vs nested YAML objects)
- Can include positions for future visual editing
- Consistent with other canvas files

---

## Timeline

| Version | Release Date | Changes |
|---------|-------------|---------|
| v0.27.x | Current | library.scopes only |
| v0.28.0 | Q2 2026 | Dual support + migration command |
| v0.29.0 | Q3 2026 | library.scopes causes error |
| v0.30.0 | Q4 2026 | library.scopes removed |

---

## References

- [EVENTS_CANVAS_SUPPORT.md](../../docs/EVENTS_CANVAS_SUPPORT.md) - Events canvas architecture
- [WORKFLOW_VALIDATION.md](./WORKFLOW_VALIDATION.md) - Workflow validation
- [Library TypeScript Types](../src/types/library.ts) - ComponentLibrary interface
- [Scopes Utilities](../src/scopes/utils.ts) - Current implementation
