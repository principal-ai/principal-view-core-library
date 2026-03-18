# Canvas Node Type Migration

**Status:** Completed
**Created:** 2026-03-18
**Updated:** 2026-03-18
**Author:** Claude (AI-assisted implementation)

## Summary

Migrate from using JSON Canvas `type: "text"` nodes with `pv.nodeType` extensions to custom semantic node types (`otel-event`, `otel-span`, etc.) that better represent OpenTelemetry concepts.

## Current State

### Node Structure (JSON Canvas + PV Extensions)

Currently, all semantic nodes use the standard JSON Canvas `text` node type with Principal View extensions nested in a `pv` field:

```json
{
  "type": "text",
  "text": "Analysis Started",
  "x": 100,
  "y": 50,
  "width": 200,
  "height": 100,
  "pv": {
    "nodeType": "event",
    "name": "Analysis Started",
    "description": "Codebase composition analysis begins",
    "event": {
      "name": "analysis.started",
      "description": "...",
      "attributes": { ... }
    }
  }
}
```

### Problems with Current Approach

1. **Semantic Mismatch**: `type: "text"` doesn't describe what the node represents
2. **Redundant `text` Field**: The `text` field duplicates `pv.name` and serves no purpose
3. **Deep Nesting**: All meaningful data buried under `pv`
4. **Parsing Complexity**: Fallback logic to extract name/description from `text` field
5. **No Obsidian Usage**: We don't use Obsidian for authoring, so JSON Canvas compatibility provides no value

### Current Node Types (via `pv.nodeType`)

| `pv.nodeType` | Purpose | Count in Codebase |
|---------------|---------|-------------------|
| `event` | Telemetry events in workflows | ~40+ |
| `span-convention` | Span naming patterns | ~10 |
| `scope` | Instrumentation scopes | ~5 |
| `resource` | Service/deployment resources | ~3 |
| `boundary` | External system interfaces | ~2 |

### Parsing Logic (CanvasConverter.ts:287-316)

```typescript
// Current fallback logic for text nodes
case 'text': {
  const lines = node.text?.split('\n') || [];
  nodeName = lines[0]?.replace(/^#+ /, '').substring(0, 50) || 'Text';
  nodeDescription = lines.slice(1).join('\n').trim() || undefined;
  break;
}

// Then override with pv fields if present
const finalName = pv?.name || nodeName;
const finalDescription = pv?.description || nodeDescription;
```

## Proposed Changes

### New Custom Node Types

Replace `type: "text"` + `pv.nodeType` with semantic node types:

| New Type | Replaces | Purpose |
|----------|----------|---------|
| `otel-event` | `type: "text"` + `pv.nodeType: "event"` | Telemetry events in workflows |
| `otel-span-convention` | `type: "text"` + `pv.nodeType: "span-convention"` | Span naming conventions/patterns |
| `otel-scope` | `type: "text"` + `pv.nodeType: "scope"` | Instrumentation scopes |
| `otel-resource` | `type: "text"` + `pv.nodeType: "resource"` | Service/deployment resources |
| `otel-boundary` | `type: "text"` + `pv.nodeType: "boundary"` | External system interfaces |

### New Node Structure

**Before:**
```json
{
  "type": "text",
  "text": "Analysis Started",
  "x": 100,
  "y": 50,
  "width": 200,
  "height": 100,
  "pv": {
    "nodeType": "event",
    "name": "Analysis Started",
    "description": "Codebase composition analysis begins",
    "status": "implemented",
    "event": {
      "name": "analysis.started",
      "description": "Analysis event",
      "attributes": {
        "file.count": { "type": "number", "required": true }
      }
    },
    "otel": {
      "scope": "validation",
      "files": ["src/validation/analyzer.ts"]
    }
  }
}
```

**After:**
```json
{
  "type": "otel-event",
  "id": "analysis-started",
  "x": 100,
  "y": 50,
  "width": 200,
  "height": 100,
  "color": "4",
  "label": "Analysis Started",
  "event": {
    "name": "analysis.started",
    "attributes": {
      "file.count": { "type": "number", "required": true }
    }
  },
  "otel": {
    "status": "implemented",
    "scope": "validation",
    "files": ["src/validation/analyzer.ts"]
  }
}
```

Notes:
- `label` is the canvas display text (required)
- `event.name` is the OTEL event identifier
- `otel` groups all instrumentation metadata (status, scope, files)
- `event.description` removed - that was schema documentation, not OTEL data

### Node Display: Label + Identifier

Each node type shows its **label** plus its **identifier** on the canvas:

| Node Type | Identifier Shown | Example Display |
|-----------|------------------|-----------------|
| `otel-event` | `event.name` | **Analysis Started**<br/>`analysis.started` |
| `otel-span-convention` | `otel.spanPattern` | **Validation Operations**<br/>`validate.*` |
| `otel-scope` | `otel.scope` | **Validation Scope**<br/>`validation` |
| `otel-resource` | `otel.resourceMatch` | **CLI Service**<br/>`service.name: pv.cli` |
| `otel-boundary` | `boundary.direction` | **GitHub Webhook**<br/>`inbound` |

This makes the OTEL identity visible at a glance without hovering for tooltips.

### What Changes

| Aspect | Before | After |
|--------|--------|-------|
| Node type | `"text"` | `"otel-event"`, `"otel-span-convention"`, etc. |
| `text` field | Required (often redundant) | Removed |
| `pv` wrapper | Required for all extensions | Removed for otel nodes |
| Display text | `pv.name` | `label` (required) |
| `description` field | `pv.description` | On span/scope/resource/boundary only (events use schema) |
| `nodeType` field | `pv.nodeType` | Implicit from `type` |

### What Stays the Same

- Canvas-level `pv` for metadata (`pv.nodeTypes`, `pv.edgeTypes`, `pv.scope`, etc.)
- Standard node types (`text`, `file`, `link`, `group`) still supported
- All `pv` extension fields remain available, just not nested
- Edge structure unchanged

## Type Definitions

### New Node Interfaces

```typescript
// Base for all otel nodes
interface OtelNodeBase extends CanvasNodeBase {
  /** Display label shown on canvas node */
  label: string;
  /** Visual customization */
  icon?: string;
  fill?: string;
  stroke?: string;
  shape?: PVNodeShape;
}

// Shared otel instrumentation metadata
interface OtelMetadata {
  /** Implementation status */
  status?: 'draft' | 'approved' | 'implemented';
  /** Instrumentation scope (maps to getTracer('scope-name')) */
  scope?: string;
  /** Files where this is instrumented */
  files?: string[];
  /** Origin of the code */
  origin?: 'internal' | 'external';
  /** References/documentation for external code */
  references?: string[];
}

interface OtelEventNode extends OtelNodeBase {
  type: 'otel-event';
  /** Inline event schema */
  event?: PVEventSchema;
  /** Reference to library event */
  eventRef?: string;
  /** Data schema for typed fields */
  dataSchema?: Record<string, DataSchemaField>;
  /** OTEL instrumentation metadata */
  otel?: OtelMetadata;
}

interface OtelSpanConventionNode extends OtelNodeBase {
  type: 'otel-span-convention';
  /** Short description of this span convention */
  description?: string;
  otel: OtelMetadata & {
    /** Span naming pattern (e.g., "validate.*") */
    spanPattern: string;
    /** OTel SpanKind */
    spanKind?: PVOtelSpanKind;
    /** Span matching criteria */
    spanMatch?: PVOtelSpanMatch;
  };
}

interface OtelScopeNode extends OtelNodeBase {
  type: 'otel-scope';
  /** Short description of this instrumentation scope */
  description?: string;
  otel: OtelMetadata & {
    /** Scope name - required for scope nodes */
    scope: string;
  };
}

interface OtelResourceNode extends OtelNodeBase {
  type: 'otel-resource';
  /** Short description of this resource */
  description?: string;
  otel: OtelMetadata & {
    /** Resource attribute matching */
    resourceMatch: PVOtelResourceMatch;
  };
}

interface OtelBoundaryNode extends OtelNodeBase {
  type: 'otel-boundary';
  /** Short description of this boundary */
  description?: string;
  otel?: OtelMetadata;
  boundary: PVBoundaryExtension;
}
```

### Updated Union Type

```typescript
type ExtendedCanvasNode =
  | ExtendedCanvasTextNode      // Standard JSON Canvas
  | ExtendedCanvasFileNode      // Standard JSON Canvas
  | ExtendedCanvasLinkNode      // Standard JSON Canvas
  | ExtendedCanvasGroupNode     // Standard JSON Canvas
  | OtelEventNode               // New
  | OtelSpanConventionNode      // New
  | OtelScopeNode               // New
  | OtelResourceNode            // New
  | OtelBoundaryNode;           // New
```

## Migration Plan

### Phase 1: Type Definitions (packages/core)

**Files to modify:**
- `packages/core/src/types/canvas.ts`

**Tasks:**
1. Add `OtelNodeBase` interface with shared fields (`label`, `icon`, `fill`, `stroke`, `shape`)
2. Add `OtelMetadata` interface for instrumentation fields (`status`, `scope`, `files`, `origin`, `references`)
3. Add node interfaces: `OtelEventNode`, `OtelSpanConventionNode`, `OtelScopeNode`, `OtelResourceNode`, `OtelBoundaryNode`
4. Add type guards: `isOtelEventNode()`, `isOtelSpanConventionNode()`, etc.
5. Update `ExtendedCanvasNode` union to include new types
6. Export new types from `packages/core/src/types/index.ts`

### Phase 2: Renderer Updates (packages/react)

**Files to modify:**
- `packages/react/src/nodes/CustomNode.tsx`

**Tasks:**
1. Update identifier extraction to check multiple sources:
   - `event.name` for otel-event
   - `otel.spanPattern` for otel-span-convention
   - `otel.scope` for otel-scope
   - `otel.resourceMatch` for otel-resource
   - `boundary.direction` for otel-boundary
2. Use `label` field directly when present (new format)
3. Fall back to `pv.name` for backward compatibility

### Phase 3: Converter Updates (packages/core)

**Files to modify:**
- `packages/core/src/utils/CanvasConverter.ts`

**Tasks:**
1. Add cases for new node types in the conversion switch
2. Extract `label` directly for otel-* nodes (no text parsing)
3. Map `otel` field to React Flow node data
4. Maintain backward compatibility: detect old format and convert

### Phase 4: Validator Updates (packages/cli)

**Files to modify:**
- `packages/cli/src/validation/*.ts` (canvas validators)

**Tasks:**
1. Add validation rules for each new node type
2. Require `label` field for otel-* nodes
3. Require `event` or `eventRef` for otel-event nodes
4. Require `otel.spanPattern` for otel-span-convention nodes
5. Require `otel.scope` for otel-scope nodes
6. Require `otel.resourceMatch` for otel-resource nodes
7. Require `boundary` for otel-boundary nodes
8. Add deprecation warnings when old format detected

### Phase 5: Migration Script

**New file:**
- `packages/cli/src/commands/migrate-canvas.ts`

**Tasks:**
1. Create CLI command: `pv migrate-canvas [path]`
2. Transform old format to new format:
   - `type: "text"` + `pv.nodeType: "event"` → `type: "otel-event"`
   - `pv.name` → `label`
   - Flatten `pv` fields to node level
   - Remove `text` field
3. Preserve formatting (use same JSON indentation)
4. Dry-run mode to preview changes
5. Backup original files

### Phase 6: Canvas File Migration

**Files to migrate:**
- `.principal-views/**/*.canvas`
- `.principal-views/**/*.otel.canvas`
- `packages/react/src/stories/data/*.json` (test fixtures)

**Tasks:**
1. Run migration script on all canvas files
2. Verify rendering in Storybook
3. Run validators to ensure compliance
4. Update test snapshots if any

### Phase 7: Documentation & Cleanup

**Tasks:**
1. Update `docs/NODE_TYPE_MIGRATION.md` with completion status
2. Remove prototype story (`OtelNodeTypesPrototype.stories.tsx`) or convert to documentation
3. Update any authoring guides
4. Add deprecation timeline for old format support

## Backward Compatibility

During transition, support both formats:

```typescript
function getNodeLabel(node: ExtendedCanvasNode): string {
  // New format: label directly on node (required for otel-* nodes)
  if ('label' in node && node.label) {
    return node.label;
  }

  // Old format: pv.name or parsed from text
  if ('pv' in node && node.pv?.name) {
    return node.pv.name;
  }

  // Legacy text parsing
  if (node.type === 'text') {
    const lines = node.text?.split('\n') || [];
    return lines[0]?.replace(/^#+ /, '').substring(0, 50) || 'Text';
  }

  return node.id;
}
```

## Impact Analysis

### Files to Modify

| File | Changes |
|------|---------|
| `packages/core/src/types/canvas.ts` | Add new node types |
| `packages/core/src/utils/CanvasConverter.ts` | Handle new types, simplify parsing |
| `packages/core/src/validation/*.ts` | Update validators |
| `packages/cli/src/commands/validate.ts` | Update validation logic |
| `packages/react/src/components/CustomNode.tsx` | Handle new node data shape |
| `.principal-views/**/*.canvas` | Migrate to new format |

### Test Updates

- Unit tests for new type guards
- Converter tests for new node types
- Validator tests for new validation rules
- Integration tests with migrated canvas files

## Open Questions

1. **Group nodes**: Should we add `otel-group` for grouping related otel nodes?
2. **Edge types**: Should we also create `otel-*` edge types?
3. **Versioning**: How do we version the canvas format for breaking changes?

## Implementation Completed

### Migration CLI Command

A CLI command is available to migrate existing canvas files:

```bash
# Dry run to preview changes
principal-ai migrate-nodes --dry-run

# Run migration (creates backups)
principal-ai migrate-nodes

# Skip backups
principal-ai migrate-nodes --no-backup

# Verbose output
principal-ai migrate-nodes -v
```

### Files Modified

| Phase | Files |
|-------|-------|
| Phase 1: Type Definitions | `packages/core/src/types/canvas.ts` - Added OTEL node interfaces, type guards, `getOtelNodeIdentifier()` |
| Phase 2: Renderer | `packages/react/src/nodes/CustomNode.tsx` - Updated `getNodeIdentifier()` to support multiple sources |
| Phase 3: Converter | `packages/core/src/utils/CanvasConverter.ts` - Handle new node types in switch statement |
| Phase 4: Validators | `packages/core/src/workflow/validator.ts`, `packages/core/src/scopes/ScopesCanvasValidator.ts` - Support both formats |
| Phase 5: Migration | `packages/cli/src/commands/migrate-nodes.ts` - CLI migration command |
| Phase 6: Canvas Files | `.principal-views/architecture.spans.canvas`, `.principal-views/validation/validation.otel.canvas` |

### Migration Results

- **Files processed:** 4
- **Files modified:** 2
- **Nodes transformed:** 23
- **Node types migrated:**
  - `text` + `pv.nodeType: "event"` → `otel-event`
  - `text` + `pv.nodeType: "span-convention"` → `otel-span-convention`

### Backward Compatibility

Both old and new formats are supported during the transition period:
- Validators check for new `type: "otel-*"` nodes first, then fall back to legacy `pv.*` format
- Renderer extracts identifiers from both formats
- Converter handles both formats transparently

## References

- [JSON Canvas Spec 1.0](https://jsoncanvas.org/spec/1.0/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)
- `packages/core/src/types/canvas.ts` - Type definitions
- `packages/core/src/utils/CanvasConverter.ts` - Conversion logic
- `packages/cli/src/commands/migrate-nodes.ts` - Migration command
