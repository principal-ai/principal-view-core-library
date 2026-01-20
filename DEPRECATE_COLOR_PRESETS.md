# Deprecate Color Presets

## Summary

Remove support for numeric color presets (1-6) from the Principal View canvas format. All colors should use hex format only.

## Current State

The codebase currently supports two color formats:

1. **Hex colors**: `"#3b82f6"`, `"#ef4444"`, etc.
2. **Numeric presets**: `1`, `2`, `3`, `4`, `5`, `6` mapping to predefined colors

```typescript
export type CanvasColor = string | 1 | 2 | 3 | 4 | 5 | 6;

export const CANVAS_COLOR_PRESETS: Record<number, string> = {
  1: '#ef4444', // red
  2: '#f97316', // orange
  3: '#eab308', // yellow
  4: '#22c55e', // green
  5: '#06b6d4', // cyan
  6: '#8b5cf6', // purple
};
```

## Problems

1. **Inconsistent validation**: The `valid-color-format` rule only accepts hex colors, but the type system allows numeric presets
2. **Documentation mismatch**: CLI help text mentions presets, but validation rejects them
3. **Confusion**: Users don't know which format to use
4. **Limited palette**: Only 6 colors restricts design flexibility
5. **Ambiguity**: What should `"0"` mean? What about `7`+?

## Proposed Changes

### 1. Update Type Definitions

**File**: `packages/core/src/types/canvas.ts`

```typescript
// BEFORE
export type CanvasColor = string | 1 | 2 | 3 | 4 | 5 | 6;

// AFTER
export type CanvasColor = string; // Hex format only: #RGB or #RRGGBB
```

Remove:
- `CANVAS_COLOR_PRESETS` constant (lines 647-654)
- `resolveCanvasColor()` function (lines 659-665) - or simplify to just return the hex string

### 2. Update Validation Rules

**File**: `packages/core/src/rules/implementations/valid-color-format.ts`

The validation already only accepts hex colors, which is correct. No changes needed here.

**However**, add validation for the `color` field on canvas nodes and edges:

```typescript
// Add validation for node.color
for (const node of canvas.nodes || []) {
  if (node.color && !isValidColor(node.color)) {
    violations.push(
      createColorViolation(
        configPath,
        `nodes[${node.id}].color`,
        node.color,
        `node "${node.id}"`
      )
    );
  }
}

// Add validation for edge.color
for (const edge of canvas.edges || []) {
  if (edge.color && !isValidColor(edge.color)) {
    violations.push(
      createColorViolation(
        configPath,
        `edges[${edge.id}].color`,
        edge.color,
        `edge "${edge.id}"`
      )
    );
  }
}
```

### 3. Update CLI Documentation

**File**: `packages/cli/src/commands/schema.ts`

Line 59:
```typescript
// BEFORE
${chalk.green('color')}     ${chalk.dim('string|number')}   Hex color or preset (1-6)

// AFTER
${chalk.green('color')}     ${chalk.dim('string')}   Hex color (#RGB or #RRGGBB)
```

Lines 102-104 - **Remove entire "Color Presets" section**:
```typescript
${chalk.bold('Color Presets:')}
  ${chalk.red('1')} = red    ${chalk.hex('#f97316')('2')} = orange    ${chalk.yellow('3')} = yellow
  ${chalk.green('4')} = green  ${chalk.cyan('5')} = cyan      ${chalk.hex('#8b5cf6')('6')} = purple
```

### 4. Update Examples

Search for any example .canvas files using numeric presets and convert them to hex:

```bash
# Find files using numeric color presets
grep -r '"color":\s*[0-6]' packages/
```

## Migration Guide

For users with existing .canvas files using numeric presets:

| Old | New |
|-----|-----|
| `"color": 1` | `"color": "#ef4444"` |
| `"color": 2` | `"color": "#f97316"` |
| `"color": 3` | `"color": "#eab308"` |
| `"color": 4` | `"color": "#22c55e"` |
| `"color": 5` | `"color": "#06b6d4"` |
| `"color": 6` | `"color": "#8b5cf6"` |

## Implementation Checklist

- [ ] Update `CanvasColor` type to `string` only
- [ ] Remove `CANVAS_COLOR_PRESETS` constant
- [ ] Remove or simplify `resolveCanvasColor()` function
- [ ] Add validation for `node.color` in `valid-color-format` rule
- [ ] Add validation for `edge.color` in `valid-color-format` rule
- [ ] Update CLI documentation in `schema.ts`
- [ ] Find and update all example .canvas files using presets
- [ ] Update README/docs mentioning color presets
- [ ] Add tests for color validation on nodes/edges
- [ ] Consider adding a migration script to auto-convert old files

## Breaking Change

This is a **breaking change** that requires a major version bump. Existing .canvas files using numeric presets will fail validation after this change.

Consider:
1. Adding a deprecation warning first in a minor version
2. Providing a CLI command to migrate files: `privu migrate colors`
3. Clear communication in changelog and migration guide
