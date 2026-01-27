# Workflow Template System

Transform OpenTelemetry event streams into human-readable execution workflows.

## Overview

The Workflow Template System converts raw OTEL telemetry data (spans, logs, metrics) into structured, readable workflows that tell the story of what happened during an execution.

## Features

- **Scenario-based Matching**: Automatically selects the appropriate workflow based on which events occurred
- **Template Expression Language**: Rich templating with property access, conditionals, arithmetic, and string operations
- **Multiple Rendering Modes**:
  - `span-tree`: Hierarchical view following span parent-child relationships
  - `timeline`: Chronological event ordering
  - `summary-only`: Just introduction and summary
- **Log Integration**: Attach logs to their parent spans or interleave with events
- **Flexible Conditions**: Match scenarios based on required/excluded events and attribute assertions

## Quick Start

### 1. Create a Workflow Template

Create a `.workflow.json` file that references your `.otel.canvas` file:

```json
{
  "version": "1.0.0",
  "canvas": "my-execution.otel.canvas",
  "name": "My Execution Workflow",
  "mode": "span-tree",
  "scenarioSelection": "first-match",
  "scenarios": [
    {
      "id": "success",
      "priority": 1,
      "condition": {
        "requires": ["execution.complete"],
        "assertions": { "result.status": { "$eq": "success" } }
      },
      "template": {
        "introduction": "✅ Execution Successful",
        "summary": "Completed in {duration.ms}ms"
      }
    }
  ]
}
```

### 2. Use the Workflow Renderer

```typescript
import { renderWorkflow } from '@principal-ai/principal-view-core/workflow';
import type { OtelEvent } from '@principal-ai/principal-view-core/workflow';

// Your OTEL events
const events: OtelEvent[] = [
  {
    name: 'execution.started',
    timestamp: 1000,
    type: 'span',
    spanId: 'span1',
    traceId: 'trace1'
  },
  {
    name: 'execution.complete',
    timestamp: 2000,
    type: 'span',
    spanId: 'span1',
    traceId: 'trace1',
    attributes: {
      'result.status': 'success',
      'duration.ms': 1000
    }
  }
];

// Render the workflow
const result = renderWorkflow(template, events);
console.log(result.text);
```

## Template Expression Syntax

Expressions are enclosed in `{curly braces}` and can include:

### Property Access
```
{config.nodeTypes}
{result.violations.total}
```

### Conditionals (Ternary)
```
{count > 0 ? 'yes' : 'no'}
{result.status === 'success' ? '✅ PASSED' : '❌ FAILED'}
```

### Arithmetic
```
{duration.ms / 1000}
{config.nodeTypes + config.edgeTypes}
```

### String Methods
```
{'━'.repeat(50)}
{'hello'.toUpperCase()}
```

### Comparisons
```
{count > 5}
{result.total >= 10}
{status === 'complete'}
```

## Scenario Matching

Scenarios are evaluated in priority order (lowest number = highest priority). The first matching scenario is selected.

### Condition Types

**Default Scenario** (always matches):
```json
{
  "condition": { "default": true }
}
```

**Required Events** (all must be present):
```json
{
  "condition": {
    "requires": ["conversion.started", "conversion.complete"]
  }
}
```

**Required Events** (any must be present):
```json
{
  "condition": {
    "requires": ["error.*", "*.failed"],
    "any": true
  }
}
```

**Excluded Events** (must not be present):
```json
{
  "condition": {
    "requires": ["execution.complete"],
    "excludes": ["*.error"]
  }
}
```

**Attribute Assertions**:
```json
{
  "condition": {
    "assertions": {
      "result.violations.total": { "$gt": 0 },
      "status": { "$eq": "failed" }
    }
  }
}
```

### Assertion Operators

- `$exists`: Check if value exists (`{ "$exists": true }`)
- `$eq`: Equals (`{ "$eq": 5 }`)
- `$ne`: Not equals (`{ "$ne": 0 }`)
- `$gt`: Greater than (`{ "$gt": 10 }`)
- `$gte`: Greater than or equal (`{ "$gte": 5 }`)
- `$lt`: Less than (`{ "$lt": 100 }`)
- `$lte`: Less than or equal (`{ "$lte": 50 }`)
- `$in`: In array (`{ "$in": ["success", "warning"] }`)
- `$nin`: Not in array (`{ "$nin": ["error", "failed"] }`)

## Rendering Modes

### Span Tree Mode

Renders events hierarchically following span parent-child relationships:

```json
{
  "mode": "span-tree",
  "template": {
    "introduction": "✅ Execution",
    "span": "→ {span.name}",
    "children": "recurse",
    "summary": "Complete"
  }
}
```

Output:
```
✅ Execution
→ parent.span
  → child.span
    → grandchild.span
Complete
```

### Timeline Mode

Renders events in chronological order:

```json
{
  "mode": "timeline",
  "formatting": {
    "showTimestamps": true
  },
  "template": {
    "events": {
      "execution.started": "🔵 Started",
      "execution.complete": "✅ Complete"
    }
  }
}
```

### Summary-Only Mode

Shows only introduction and summary:

```json
{
  "mode": "summary-only",
  "template": {
    "introduction": "Execution Report",
    "summary": "Status: {result.status}"
  }
}
```

## Log Integration

### Attach Logs to Spans

```json
{
  "showLogsPerSpan": true,
  "template": {
    "logs": {
      "error": "  ❌ {log.body}",
      "warn": "  ⚠️  {log.body}",
      "info": "  ℹ️  {log.body}",
      "debug": "  🔍 {log.body}"
    }
  }
}
```

Logs are categorized by severity:
- `error`: severityNumber >= 17 (ERROR, FATAL)
- `warn`: severityNumber 13-16 (WARN)
- `info`: severityNumber 9-12 (INFO)
- `debug`: severityNumber 5-8 (DEBUG, TRACE)

## Examples

See the `.workflow.json` files in `.principal-views/` for complete examples:
- `graph-converter-execution.workflow.json` - Simple conversion flow
- `rules-engine-execution.workflow.json` - Complex validation with multiple scenarios
- `graph-converter-test.workflow.json` - Test execution workflow

## API Reference

### `renderWorkflow(template, events)`

Main rendering function.

**Parameters:**
- `template: WorkflowTemplate` - The workflow template configuration
- `events: OtelEvent[]` - Array of OTEL events to render

**Returns:**
- `WorkflowResult` - Rendered workflow with metadata

```typescript
interface WorkflowResult {
  text: string;                    // Rendered workflow text
  scenarioId: string;               // ID of selected scenario
  isDefault: boolean;               // Whether default scenario was used
  metadata: {
    templateName: string;
    eventCount: number;
    spanCount: number;
    logCount: number;
    timeRange?: { start: number; end: number };
  };
}
```

### `parseTemplate(template, context)`

Parse and evaluate a template string with expressions.

**Parameters:**
- `template: string` - Template string with `{expressions}`
- `context: Record<string, unknown>` - Data context for variable lookup

**Returns:** `string` - Evaluated template

### `selectScenario(template, events, attributes)`

Select the first matching scenario from a template.

**Parameters:**
- `template: WorkflowTemplate` - Template with scenarios
- `events: OtelEvent[]` - OTEL events
- `attributes: Record<string, unknown>` - Aggregated attributes

**Returns:** `ScenarioMatchResult` - Matched scenario and metadata

## Implementation Status

✅ **Phase 1: Core Infrastructure** (Complete)
- Type definitions
- Scenario matcher with assertion operators
- Template expression parser
- Template renderer (all modes)
- Comprehensive test suite (89 tests passing)

📋 **Phase 2: Example Templates** (Complete)
- Graph converter execution workflow
- Rules engine execution workflow
- Graph converter test workflow

🔮 **Phase 3: UI Integration** (Future)
- Canvas viewer integration
- Scenario switcher
- Live event streaming
- Interactive template editor

## Testing

Run the test suite:

```bash
bun test packages/core/src/workflow/__tests__/
```

Test coverage:
- `scenario-matcher.test.ts`: Event matching, assertions, aggregates
- `template-parser.test.ts`: Expression evaluation, template parsing
- `template-renderer.test.ts`: End-to-end workflow rendering

## Architecture

```
workflow/
├── types.ts              # TypeScript type definitions
├── scenario-matcher.ts   # Scenario selection and matching logic
├── template-parser.ts    # Template expression parser
├── template-renderer.ts  # Main rendering engine
├── index.ts             # Public API exports
└── __tests__/           # Comprehensive test suite
```

## Contributing

When adding new features:

1. Add type definitions to `types.ts`
2. Implement logic in appropriate module
3. Add tests covering new functionality
4. Update this README with examples
5. Create example `.workflow.json` files

## License

Part of the Principal View Core Library.
