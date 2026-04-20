# Adding New Canvas Types to Principal View Framework

This guide explains how to add support for new specialized canvas file types (e.g., `.scopes.canvas`, `.events.canvas`, `.resources.canvas`) to the Principal View Framework.

## Overview

The Principal View Framework supports multiple canvas types beyond standard `.canvas` files. Each specialized canvas type follows a consistent pattern across three repositories:

1. **Core Library** (`packages/core/`) - Type system, discovery, and validation
2. **CLI** (`packages/cli/`) - Command-line validation tools
3. **Dynamic File Tree** (visualization) - UI rendering and grouping

## Architecture Pattern

```
File Extension: .{type}.canvas
├── Core: Discovery & Validation
│   ├── Add to CanvasType union
│   ├── Update parseCanvasPath()
│   └── Create {Type}CanvasValidator
├── CLI: Command Interface
│   ├── Create validate command
│   └── Register CLI command
└── Visualization: UI Rendering
    ├── Add to architecture groups
    ├── Update tree building logic
    └── Add icon/styling
```

## Step-by-Step Implementation

### 1. Core Library (`packages/core/`)

#### Step 1.1: Add Canvas Type to Type System

**File:** `packages/core/src/discovery/types.ts`

Add your new type to the `CanvasType` union:

```typescript
/**
 * Canvas file type discriminator
 * - 'otel': OpenTelemetry canvas (.otel.canvas) for workflow/tracing visualization
 * - 'scopes': Scopes canvas (.scopes.canvas) for documenting instrumentation scopes
 * - 'resources': Resources canvas (.resources.canvas) for documenting OTel resources
 * - 'spans': Spans canvas (.spans.canvas) for documenting span conventions
 * - '{yourtype}': {YourType} canvas (.{yourtype}.canvas) for {purpose}  // ADD THIS
 * - 'regular': Regular canvas (.canvas) for documentation/architecture diagrams
 */
export type CanvasType = 'otel' | 'scopes' | 'resources' | 'spans' | '{yourtype}' | 'regular';
```

**Replace:**
- `{yourtype}` with your canvas type name (lowercase, kebab-case)
- `{YourType}` with the display name (Title Case)
- `{purpose}` with a brief description

**Example:**
```typescript
// For events canvas:
export type CanvasType = 'otel' | 'scopes' | 'resources' | 'spans' | 'events' | 'regular';
```

---

#### Step 1.2: Update Canvas Discovery

**File:** `packages/core/src/discovery/CanvasDiscovery.ts`

Find the `parseCanvasPath()` method (around line 753) and add your type **before** the regular `.canvas` check:

```typescript
private parseCanvasPath(path: string): { basename: string; type: CanvasType } | null {
  const filename = path.split('/').pop();
  if (!filename) return null;

  // Check for .scopes.canvas first (must come before .canvas check)
  if (filename.endsWith('.scopes.canvas')) {
    return {
      basename: filename.replace(/\.scopes\.canvas$/, ''),
      type: 'scopes',
    };
  }

  // Check for .resources.canvas (must come before .canvas check)
  if (filename.endsWith('.resources.canvas')) {
    return {
      basename: filename.replace(/\.resources\.canvas$/, ''),
      type: 'resources',
    };
  }

  // ADD YOUR TYPE HERE (must come before .canvas check)
  if (filename.endsWith('.{yourtype}.canvas')) {
    return {
      basename: filename.replace(/\.{yourtype}\.canvas$/, ''),
      type: '{yourtype}',
    };
  }

  // Check for .canvas (standard canvas files)
  if (filename.endsWith('.canvas')) {
    // ... existing logic
  }
}
```

**Replace:**
- `{yourtype}` with your canvas type name

**Example:**
```typescript
// For events canvas:
if (filename.endsWith('.events.canvas')) {
  return {
    basename: filename.replace(/\.events\.canvas$/, ''),
    type: 'events',
  };
}
```

---

#### Step 1.3: Create Validator (Optional but Recommended)

**File:** `packages/core/src/{yourtype}/{YourType}CanvasValidator.ts` (new file)

Create a validator class following this template:

```typescript
/**
 * {YourType} Canvas Validator
 *
 * Validates that a .{yourtype}.canvas file meets the requirements for {purpose}.
 */

import type { ExtendedCanvas, ExtendedCanvasNode } from '../types/canvas';

/**
 * {YourType} canvas validation context
 */
export interface {YourType}CanvasValidationContext {
  /** The {yourtype} canvas (if found) */
  {yourtype}Canvas?: ExtendedCanvas;

  /** Path to the {yourtype} canvas file */
  {yourtype}CanvasPath?: string;

  /** Base path for resolving relative paths */
  basePath: string;

  // Add any other context needed for validation
  // Example: libraryData, configData, etc.
}

/**
 * {YourType} canvas validation violation
 */
export interface {YourType}CanvasViolation {
  /** Rule ID that detected this violation */
  ruleId: string;

  /** Severity level */
  severity: 'error' | 'warn';

  /** File path where violation occurred */
  file: string;

  /** JSON path within file (optional) */
  path?: string;

  /** Human-readable description of what's wrong */
  message: string;

  /** Why this matters */
  impact: string;

  /** How to fix it */
  suggestion: string;
}

/**
 * {YourType} canvas validation result
 */
export interface {YourType}CanvasValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;

  /** List of violations found */
  violations: {YourType}CanvasViolation[];

  /** Optional: Add coverage or metrics specific to your type */
  metrics?: {
    // Example: totalItems, documentedItems, missingItems, etc.
  };
}

/**
 * Validates {yourtype} canvas files
 */
export class {YourType}CanvasValidator {
  /**
   * Validate a {yourtype} canvas
   */
  async validate(
    context: {YourType}CanvasValidationContext
  ): Promise<{YourType}CanvasValidationResult> {
    const violations: {YourType}CanvasViolation[] = [];
    const { {yourtype}Canvas, {yourtype}CanvasPath, basePath } = context;

    // Check if canvas exists when required
    if (!{yourtype}Canvas) {
      violations.push({
        ruleId: '{yourtype}-canvas-required',
        severity: 'error',
        file: {yourtype}CanvasPath || '.principal-views/architecture.{yourtype}.canvas',
        message: '{YourType} canvas is required for {reason}',
        impact: 'Cannot {what happens without it}',
        suggestion: `Create a {yourtype} canvas at .principal-views/architecture.{yourtype}.canvas`,
      });

      return {
        valid: false,
        violations,
      };
    }

    // Implement your validation rules here
    // Examples:
    // - Check required nodes exist
    // - Validate node schemas
    // - Check relationships/edges
    // - Validate against external data sources

    const errors = violations.filter(v => v.severity === 'error');

    return {
      valid: errors.length === 0,
      violations,
    };
  }

  /**
   * Helper methods for extraction and validation
   */
  private extractDataFromCanvas(canvas: ExtendedCanvas): any[] {
    // Implement extraction logic
    return [];
  }
}
```

**Replace all placeholders:**
- `{yourtype}` - lowercase type name
- `{YourType}` - Title Case type name
- `{purpose}` - what this canvas type is for
- `{reason}` - why the canvas is required
- `{what happens without it}` - impact description

**Example Reference:**
See `packages/core/src/scopes/ScopesCanvasValidator.ts` for a complete implementation.

---

#### Step 1.4: Export Validator

**File:** `packages/core/src/{yourtype}/index.ts` (new file)

```typescript
export { {YourType}CanvasValidator } from './{YourType}CanvasValidator';
export type {
  {YourType}CanvasValidationContext,
  {YourType}CanvasViolation,
  {YourType}CanvasValidationResult,
} from './{YourType}CanvasValidator';
```

**File:** `packages/core/src/index.ts`

Add export to main index:

```typescript
// Existing exports...
export * from './scopes';
export * from './{yourtype}';  // ADD THIS
```

---

### 2. CLI (`packages/cli/`)

#### Step 2.1: Create Validate Command

**File:** `packages/cli/src/commands/{yourtype}/validate.ts` (new file)

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  {YourType}CanvasValidator,
  CanvasDiscovery,
} from '@principal-ai/principal-view-core/node';
import type {
  ExtendedCanvas,
  DiscoveredCanvasWithContent,
  {YourType}CanvasViolation,
} from '@principal-ai/principal-view-core';
import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';

interface ValidateOptions {
  json?: boolean;
  dir?: string;
}

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate {yourtype}.canvas against {validation target}')
    .option('--json', 'Output as JSON')
    .option('-d, --dir <path>', 'Project directory (default: cwd)')
    .action(async (options: ValidateOptions) => {
      try {
        const baseDir = options.dir || process.cwd();

        // Load any required configuration/data
        // Example: Load library.yaml, config files, etc.

        // Discover {yourtype} canvas
        const service = new FilesystemService(new NodeFileSystemAdapter());
        const fileTree = await service.buildFileSystemTreeFromPath(baseDir);
        const discovery = new CanvasDiscovery();
        const discoveryResult = await discovery.discover(fileTree, {
          fileReader: async (path: string) => readFileSync(resolve(baseDir, path), 'utf-8'),
          includeContent: true,
        });

        // Find {yourtype} canvas
        const {yourtype}Canvas = discoveryResult.canvases.find(c => c.type === '{yourtype}');
        let {yourtype}CanvasContent: ExtendedCanvas | undefined;
        let {yourtype}CanvasPath: string | undefined;

        if ({yourtype}Canvas) {
          {yourtype}CanvasPath = {yourtype}Canvas.path;
          const canvasWithContent = {yourtype}Canvas as DiscoveredCanvasWithContent;
          if (canvasWithContent.content) {
            {yourtype}CanvasContent = canvasWithContent.content;
          }
        }

        // Validate
        const validator = new {YourType}CanvasValidator();
        const result = await validator.validate({
          {yourtype}Canvas: {yourtype}CanvasContent,
          {yourtype}CanvasPath,
          basePath: baseDir,
          // Add any other context data
        });

        // Output results
        if (options.json) {
          console.log(JSON.stringify({
            valid: result.valid,
            violations: result.violations,
            // Include any metrics
          }, null, 2));
        } else {
          console.log(chalk.bold('\n{YourType} Canvas Validation\n'));
          console.log('━'.repeat(60));

          // Display metrics if any
          // console.log(chalk.bold('\nMetrics:'));
          // ...

          // Violations
          if (result.violations.length > 0) {
            console.log(chalk.bold('\nIssues:'));
            console.log('━'.repeat(60));

            for (const violation of result.violations) {
              const label = violation.severity === 'error'
                ? chalk.red('error')
                : chalk.yellow('warning');

              console.log(`\n${label}: ${violation.message}`);
              if (violation.path) {
                console.log(chalk.gray(`  Location: ${violation.path}`));
              }
              if (violation.impact) {
                console.log(chalk.gray(`  Impact: ${violation.impact}`));
              }
              if (violation.suggestion) {
                console.log(chalk.cyan(`  Suggestion: ${violation.suggestion}`));
              }
            }
          }

          // Summary
          const errors = result.violations.filter((v: {YourType}CanvasViolation) => v.severity === 'error');
          const warnings = result.violations.filter((v: {YourType}CanvasViolation) => v.severity === 'warn');

          console.log(chalk.bold('\nSummary:'));
          if (result.valid) {
            console.log(chalk.green('  ✓ {YourType} canvas is valid'));
          } else {
            console.log(chalk.red(`  ✗ ${errors.length} error(s)`));
          }

          if (warnings.length > 0) {
            console.log(chalk.yellow(`  ⚠ ${warnings.length} warning(s)`));
          }

          console.log();
        }

        // Exit with error code if validation failed
        if (!result.valid) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
```

**Replace all placeholders** with your specific values.

**Example Reference:**
See `packages/cli/src/commands/scopes/validate.ts` for a complete implementation.

---

#### Step 2.2: Register CLI Command

**File:** `packages/cli/src/index.ts` (or wherever commands are registered)

```typescript
import { createValidateCommand as create{YourType}ValidateCommand } from './commands/{yourtype}/validate';

// In the CLI setup:
const {yourtype}Command = program.command('{yourtype}');
{yourtype}Command.addCommand(create{YourType}ValidateCommand());
```

**Example:**
```typescript
import { createValidateCommand as createEventsValidateCommand } from './commands/events/validate';

const eventsCommand = program.command('events');
eventsCommand.addCommand(createEventsValidateCommand());
```

---

### 3. Dynamic File Tree (Visualization)

#### Step 3.1: Update Architecture Group Type

**File:** `src/components/CanvasListTree/types.ts`

Add your type to the `architectureGroupType` union:

```typescript
/** Architecture group type for grouping special canvas types */
architectureGroupType?: 'resources-scopes' | 'spans' | '{yourtype}' | 'dashboards' | 'misc';
```

---

#### Step 3.2: Update Tree Building Logic

**File:** `src/components/CanvasListTree/CanvasListTreeCore.tsx`

##### 3.2.1: Add canvas grouping array (around line 25):

```typescript
// Separate canvases into architecture groups and regular canvases
const resourcesScopesCanvases: DiscoveredCanvas[] = [];
const spansCanvases: DiscoveredCanvas[] = [];
const {yourtype}Canvases: DiscoveredCanvas[] = [];  // ADD THIS
const regularCanvases: DiscoveredCanvas[] = [];
```

##### 3.2.2: Update grouping logic (around line 29):

```typescript
for (const canvas of canvases) {
  if (canvas.type === 'resources' || canvas.type === 'scopes') {
    resourcesScopesCanvases.push(canvas);
  } else if (canvas.type === 'spans') {
    spansCanvases.push(canvas);
  } else if (canvas.type === '{yourtype}') {  // ADD THIS
    {yourtype}Canvases.push(canvas);
  } else {
    regularCanvases.push(canvas);
  }
}
```

##### 3.2.3: Add architecture group section (around line 180, after existing groups):

```typescript
// Add {YourType} group if there are any
if ({yourtype}Canvases.length > 0) {
  const {yourtype}Nodes = {yourtype}Canvases
    .map(buildCanvasNode)
    .sort((a, b) => a.name.localeCompare(b.name));

  result.push({
    id: 'architecture-group:{yourtype}',
    name: '{YourType Display Name}',  // e.g., "Events", "Workflows"
    type: 'architecture-group' as const,
    architectureGroupType: '{yourtype}',
    children: {yourtype}Nodes,
  });
}
```

##### 3.2.4: Add icon (around line 394):

First, import your chosen icon at the top of the file:
```typescript
import { Package, Folder, LayoutDashboard, FileText, Layers, Network, BarChart3, Gauge, {YourIcon} } from 'lucide-react';
```

Then add to the icon logic:
```typescript
const icon =
  data.type === 'architecture-group' ? (
    data.architectureGroupType === 'resources-scopes' ? (
      <Layers size={16} />
    ) : data.architectureGroupType === 'spans' ? (
      <Network size={16} />
    ) : data.architectureGroupType === '{yourtype}' ? (  // ADD THIS
      <{YourIcon} size={16} />
    ) : data.architectureGroupType === 'dashboards' ? (
      <BarChart3 size={16} />
    ) : (
      <Folder size={16} />
    )
  ) : // ... rest of icon logic
```

**Icon suggestions:**
- Events: `Gauge`, `Activity`, `Zap`, `Radio`
- Workflows: `GitBranch`, `Workflow`, `Route`
- Metrics: `BarChart3`, `TrendingUp`, `LineChart`
- See [Lucide Icons](https://lucide.dev/) for more options

---

### 4. Publishing Changes

Since this is a non-workspace monorepo, you must publish packages in order:

```bash
# 1. Build and publish core
cd packages/core
bun run build
npm publish

# 2. Update CLI's package.json to use new core version
cd ../cli
# Edit package.json: "@principal-ai/core": "^x.x.x"
bun install
bun run build
npm publish

# 3. Update dynamic-file-tree to use new core version
cd /Users/griever/Developer/dynamic-file-tree
# Edit package.json: "@principal-ai/principal-view-core": "^x.x.x"
bun install
bun run build
npm publish
```

---

## Testing Checklist

- [ ] Canvas discovery finds `.{yourtype}.canvas` files
- [ ] CLI validation command exists and runs
- [ ] Validation rules correctly identify issues
- [ ] Canvas files appear in correct group in file tree
- [ ] Group icon displays correctly
- [ ] Opening canvas/overview nodes works
- [ ] Git status indicators work (if applicable)
- [ ] Drag-and-drop works (if enabled)

---

## Examples in Codebase

### Minimal Example: Scopes Canvas
- **Discovery:** Simple type detection
- **Validation:** Cross-reference with `library.yaml`
- **CLI:** Basic validation command
- **Files:**
  - `packages/core/src/scopes/ScopesCanvasValidator.ts`
  - `packages/cli/src/commands/scopes/validate.ts`

### Complex Example: OTEL Canvas
- **Discovery:** Complex content parsing
- **Validation:** Schema validation, reference checking
- **CLI:** Multiple commands (validate, transform, etc.)
- **Files:**
  - `packages/core/src/canvas/OtelCanvasValidator.ts`
  - `packages/cli/src/commands/validate.ts`

---

## Tips and Best Practices

1. **Naming Conventions**
   - File extension: `.{type}.canvas` (lowercase, kebab-case)
   - Type constant: `'{type}'` (lowercase, kebab-case)
   - Class names: `{Type}CanvasValidator` (PascalCase)
   - Display names: `"{Type}"` (Title Case with spaces)

2. **Validation Design**
   - Make validators stateless (no instance state)
   - Provide detailed error messages with actionable suggestions
   - Use `error` for blocking issues, `warn` for recommendations
   - Include file paths and JSON paths in violations

3. **CLI Design**
   - Support both human-readable and JSON output
   - Exit with non-zero code on validation failure
   - Use colors appropriately (red=error, yellow=warn, green=success)
   - Group related commands under a parent command

4. **UI Design**
   - Choose icons that visually represent the canvas purpose
   - Group similar canvas types together
   - Sort within groups alphabetically
   - Maintain consistent indentation and styling

5. **Documentation**
   - Document the purpose of each canvas type
   - Provide examples of valid canvas files
   - Explain validation rules and rationale
   - Link to related documentation

---

## Troubleshooting

### Canvas files not discovered
- Check file extension matches exactly (`.{type}.canvas`)
- Ensure files are in `.principal-views/` directory
- Verify `parseCanvasPath()` check comes before regular `.canvas` check

### Validation not running
- Verify validator is exported from core package
- Check CLI command is registered
- Ensure core package is built and published

### Canvas not appearing in tree
- Check `architectureGroupType` is added to types
- Verify grouping logic includes your canvas type
- Ensure icon logic handles your type

### TypeScript errors
- Rebuild core package: `cd packages/core && bun run build`
- Update package versions in dependent packages
- Re-install dependencies: `bun install`

---

## Related Documentation

- [Canvas Type System](../types/canvas.ts) - Type definitions
- [Canvas Discovery](../discovery/CanvasDiscovery.ts) - Discovery implementation
- [Scopes Canvas Example](.principal-views/architecture.scopes.canvas) - Minimal example
- [OTEL Canvas Example](.principal-views/validation.otel.canvas) - Complex example
