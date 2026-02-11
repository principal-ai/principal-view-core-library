# Telemetry Coverage Tool

## Overview

The `privu coverage` command measures **file-based telemetry coverage** for OpenTelemetry instrumentation in your codebase. It validates that documented events in canvas files are actually implemented in your source code.

## Concept

### What is File-Based Coverage?

Traditional telemetry coverage asks: "What % of documented events exist?"

**File-based coverage** asks: "What % of implementation files in my codebase have instrumentation?"

```
Coverage = (Files with instrumentation) / (Total implementation files)
```

This gives you a true measure of **codebase observability** - how much of your actual code emits telemetry.

## How It Works

### 1. Implementation Files (Denominator)

**Current Implementation**: Pattern-based detection using configurable glob patterns.

Default patterns:
```typescript
include: [
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.js',
  'src/**/*.jsx',
  'src/**/*.py',
  'src/**/*.go',
  'lib/**/*.ts',
  'app/**/*.ts',
]

exclude: [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.config.*',
  '**/*.d.ts',
  '**/dist/**',
  '**/build/**',
  '**/node_modules/**',
  '**/__tests__/**',
  '**/.next/**',
]
```

**Future Integration**: Will use the "implementation layer" concept from `@principal-ai/codebase-composition` (located at `/Users/griever/Developer/new-panels/codebase-composition`). This will provide a more accurate, framework-aware definition of implementation files vs test files, config files, etc.

### 2. Canvas Node Status

Nodes can have one of three states:

#### Draft (`pv.status: "draft"` or missing)
- **Purpose**: Design/proposal phase, under review
- **Requirements**: None
- **Validation**: None
- **Coverage**: Not counted

```json
{
  "id": "proposed-event",
  "pv": {
    "status": "draft",
    "event": { "name": "feature.proposed" }
  }
}
```

#### Approved (`pv.status: "approved"`)
- **Purpose**: Design finalized, ready for implementation
- **Requirements**: Must specify `pv.otel.files`
- **Validation**: Errors if `pv.otel.files` is missing
- **Coverage**: Not counted (not implemented yet)

```json
{
  "id": "approved-event",
  "pv": {
    "status": "approved",
    "event": { "name": "feature.approved" },
    "otel": {
      "files": ["src/features/handler.ts"]  // Required
    }
  }
}
```

#### Implemented (`pv.status: "implemented"`)
- **Purpose**: Code exists and should have instrumentation
- **Requirements**: Must have `pv.otel.files` AND event must exist in file
- **Validation**:
  - Errors if `pv.otel.files` is missing
  - Errors if event string not found in specified files
- **Coverage**: Counted - files from implemented nodes contribute to numerator

```json
{
  "id": "live-event",
  "pv": {
    "status": "implemented",
    "event": { "name": "feature.executed" },
    "otel": {
      "files": ["src/features/handler.ts"]
    }
  }
}
```

### 3. Event Detection

The tool searches for the **exact event name string** in the specified files:

```typescript
// Canvas says event name is "auth.callback.started"
// Tool checks if this string exists anywhere in the file:

span.addEvent('auth.callback.started', { ... })  // ✅ Found
logger.info('auth.callback.started')             // ✅ Found (string match)
// "This handles auth.callback.started"          // ✅ Found (even in comments)
```

This approach is:
- **Language agnostic** - works with TypeScript, Python, Go, etc.
- **Simple** - just string matching, no AST parsing
- **Fast** - efficient for large codebases

### 4. Coverage Calculation Details

**Step 1: Collect implementation files from implemented nodes**

```typescript
// Get all unique files from nodes with status="implemented"
const implementedNodeFiles = getUniqueFiles(
  nodes.filter(n => n.pv.status === 'implemented')
          .map(n => n.pv.otel.files)
);
```

**Step 2: Filter to only actual implementation files**

```typescript
// Only count files that match implementation patterns
const filesToCheck = implementedNodeFiles.filter(file =>
  isImplementationFile(file, config)
);
```

**Step 3: Check each file for events**

```typescript
for (const file of filesToCheck) {
  const expectedEvents = getEventsForFile(file);
  const foundEvents = expectedEvents.filter(event =>
    fileContains(file, event)
  );

  if (foundEvents.length > 0) {
    filesWithInstrumentation++;
  }
}
```

**Step 4: Calculate coverage**

```typescript
coverage = (filesWithInstrumentation / filesToCheck.length) * 100
```

## Canvas Schema

### New Field: `pv.otel.files`

```typescript
interface PVOtelExtension {
  kind?: 'event' | 'span';
  category?: 'lifecycle' | 'operation' | 'error';

  /**
   * Files where this event is instrumented
   * Used by coverage tools to validate implementation
   */
  files?: string[];
}
```

### Example Canvas Node

```json
{
  "id": "auth-started",
  "type": "text",
  "text": "# auth.callback.started\n\nAuth flow begins",
  "pv": {
    "status": "implemented",
    "event": {
      "name": "auth.callback.started"
    },
    "sources": [
      "src/app/api/auth/callback/route.ts",
      "src/lib/auth/session.ts"
    ],
    "otel": {
      "kind": "event",
      "category": "lifecycle",
      "files": [
        "src/app/api/auth/callback/route.ts"
      ]
    }
  }
}
```

**Note**: `pv.sources` and `pv.otel.files` serve different purposes:
- `pv.sources`: Related files for context/documentation
- `pv.otel.files`: Exact files where this event is instrumented

## CLI Usage

### Basic Usage

```bash
privu coverage
```

### Options

```bash
privu coverage [options]

Options:
  -d, --dir <path>          Project directory (defaults to current)
  --json                    Output results as JSON
  -t, --threshold <percent> Minimum coverage % (exit with error if below)
  -v, --verbose             Show all files in output
```

### Examples

```bash
# Basic coverage report
privu coverage

# Check specific project
privu coverage --dir /path/to/project

# Enforce minimum coverage (for CI/CD)
privu coverage --threshold 80

# Get JSON output for tooling
privu coverage --json

# See all files
privu coverage --verbose
```

## Output Format

### Console Output

```
──────────────────────────────────────────────────────────────────────
📈 TELEMETRY COVERAGE REPORT
──────────────────────────────────────────────────────────────────────

📋 Canvas Files Analyzed: 3

📊 Node Status:
   Draft: 5 nodes (design phase)
   Approved: 10 nodes, 8 files specified (awaiting implementation)
   Implemented: 20 nodes, 15 files specified

🎯 File Coverage Summary:
   Implementation files checked: 15
   Files with instrumentation: 10
   Files without instrumentation: 5
   Coverage: 66.7%

📊 Event Summary:
   Total expected events: 25
   Events found: 20
   Events missing: 5

❌ Files Missing Instrumentation (5):
   File: src/app/api/versions/route.ts
   Missing events: version.registration.started, version.registration.complete

🔥 Top Instrumented Files (Heat Map):
   1. src/app/api/auth/callback/route.ts: ████ 5 events
   2. src/lib/version-registry/version-manager.ts: ██ 3 events
   3. src/app/api/auth/token-status/route.ts: ██ 2 events
```

### JSON Output

```json
{
  "totalImplementationFiles": 15,
  "filesWithInstrumentation": 10,
  "coveragePercentage": 66.7,
  "totalExpectedEvents": 25,
  "totalFoundEvents": 20,
  "canvasFiles": [
    ".principal-views/auth-callback.otel.canvas",
    ".principal-views/version-registry.otel.canvas"
  ],
  "fileCoverage": [
    {
      "filePath": "src/app/api/auth/callback/route.ts",
      "expectedEvents": ["auth.callback.started", "auth.state.validated"],
      "foundEvents": ["auth.callback.started", "auth.state.validated"],
      "instrumentationCount": 2,
      "hasInstrumentation": true,
      "missingEvents": [],
      "isImplementationFile": true
    }
  ]
}
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Check telemetry coverage
  run: |
    privu coverage --threshold 80

- name: Upload coverage report
  if: failure()
  run: |
    privu coverage --json > coverage.json
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Only run if canvas files changed
if git diff --cached --name-only | grep -q '\.canvas$'; then
  privu coverage --threshold 50 || {
    echo "❌ Telemetry coverage below 50%"
    exit 1
  }
fi
```

## Migration Guide

### From Old Coverage (Node-Based)

**Old way** (deprecated):
```json
{
  "pv": {
    "sources": ["src/handler.ts"]
  }
}
```

Coverage checked if `sources` files had ANY OTEL code.

**New way** (file-based):
```json
{
  "pv": {
    "status": "implemented",
    "sources": ["src/handler.ts"],  // For context
    "event": {
      "name": "handler.executed"
    },
    "otel": {
      "files": ["src/handler.ts"]  // For coverage
    }
  }
}
```

Coverage checks if `otel.files` contain the SPECIFIC event.

### Migration Steps

1. **Add status to all nodes**
   - Design phase: `"status": "draft"`
   - Ready to implement: `"status": "approved"`
   - Already in code: `"status": "implemented"`

2. **Add `pv.otel.files` to approved/implemented nodes**
   - Copy from `pv.sources` if they match
   - Specify only files that actually emit events

3. **Run coverage to see gaps**
   ```bash
   privu coverage --verbose
   ```

4. **Fix missing instrumentation**
   - Add `span.addEvent('event.name')` calls
   - Or mark as "approved" if not implemented yet

## Configuration

### Custom Implementation File Patterns

Currently in code (will be configurable via file in future):

```typescript
// packages/core/src/telemetry/coverage.ts
export const DEFAULT_IMPLEMENTATION_CONFIG: ImplementationFileConfig = {
  include: ['src/**/*.ts', 'lib/**/*.js'],
  exclude: ['**/*.test.*', '**/dist/**']
};
```

### Future: codebase-composition Integration

The coverage tool will integrate with `@principal-ai/codebase-composition` to automatically detect implementation files based on:
- Package structure
- Framework conventions
- Build configuration
- File type layers

See: `/Users/griever/Developer/new-panels/codebase-composition`

## Troubleshooting

### Coverage is 0%

**Cause**: No nodes marked as `"status": "implemented"`

**Fix**: Add status to your canvas nodes:
```json
{ "pv": { "status": "implemented" } }
```

### Validation errors for approved nodes

**Cause**: Approved nodes missing `pv.otel.files`

**Fix**: Add the files field:
```json
{
  "pv": {
    "status": "approved",
    "otel": {
      "files": ["src/handler.ts"]
    }
  }
}
```

### Event not detected but it exists

**Cause**: Event name mismatch or whitespace differences

**Fix**: Ensure exact string match:
```typescript
// Canvas: "auth.callback.started"
// Code must have:
span.addEvent('auth.callback.started', { ... })
// Not:
span.addEvent("auth.callback.started ") // extra space
span.addEvent('auth-callback-started')  // different separator
```

## Implementation Details

- **Package**: `@principal-ai/principal-view-core@0.21.3`
- **Location**: `packages/core/src/telemetry/coverage.ts`
- **CLI Command**: `packages/cli/src/commands/coverage.ts`
- **Types**: Exported from `@principal-ai/principal-view-core/node`

## Future Enhancements

1. **codebase-composition integration**: Use implementation layer as denominator
2. **Configuration file**: `.principal-view/coverage.config.json` for patterns
3. **Historical tracking**: Track coverage over time
4. **Heat map visualization**: Visual representation in File City
5. **Event attribute validation**: Check event data schemas
6. **Multi-language AST parsing**: More precise detection than string matching
7. **Coverage badges**: Generate badges for README files
