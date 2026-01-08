# Event Schema Validation Guide

Type-safe telemetry validation ensuring emitted events match canvas schemas.

## Overview

Event schema validation bridges the gap between **canvas definitions** (what events should be emitted) and **production code** (what events are actually emitted). This ensures:

1. **Type Safety**: Events are validated against the schema at runtime
2. **Documentation**: The canvas serves as living documentation of telemetry
3. **Test Coverage**: Tests verify that production code emits the correct events
4. **Production Ready**: Instrumentation in production code is validated

## Canvas Event Schema

Define event schemas in your `.canvas` file under the `pv.events` property of each node:

```json
{
  "nodes": [
    {
      "id": "graph-converter",
      "type": "text",
      "text": "# Graph Converter",
      "x": 0,
      "y": 0,
      "width": 300,
      "height": 120,
      "pv": {
        "nodeType": "converter",
        "name": "Graph Converter",
        "events": {
          "conversion.started": {
            "description": "Graph conversion begins",
            "attributes": {
              "config.nodeTypes": {
                "type": "number",
                "required": true,
                "description": "Number of node types in configuration"
              },
              "config.edgeTypes": {
                "type": "number",
                "required": true,
                "description": "Number of edge types in configuration"
              }
            }
          },
          "conversion.complete": {
            "description": "Graph conversion completes successfully",
            "attributes": {
              "result.nodes.count": {
                "type": "number",
                "required": true
              },
              "result.edges.count": {
                "type": "number",
                "required": true
              },
              "duration.ms": {
                "type": "number",
                "required": false
              }
            }
          }
        }
      }
    }
  ]
}
```

## Event Schema Structure

Each event schema has:

- **description**: What this event represents
- **attributes**: Expected fields for this event
  - **type**: `'string' | 'number' | 'boolean' | 'object' | 'array'`
  - **required**: Whether this field must be present
  - **description**: What this field represents (optional)

## Using Event Validation in Tests

### 1. Load the Canvas

```typescript
import fs from 'fs';
import type { ExtendedCanvas } from '@principal-ai/principal-view-core';

const canvas: ExtendedCanvas = JSON.parse(
  fs.readFileSync('my-execution-flow.canvas', 'utf-8')
);
```

### 2. Create a Validated Emitter

```typescript
import { startTestSpan, createValidatedSpanEmitter } from './otel-setup';

const testSpan = startTestSpan('my test');
const emit = createValidatedSpanEmitter(
  canvas,
  'graph-converter', // Node ID from canvas
  testSpan
);
```

### 3. Emit Events with Validation

```typescript
// This will be validated against the canvas schema
emit('conversion.started', {
  'config.nodeTypes': 2,
  'config.edgeTypes': 1,
});

// Validation error - missing required field!
emit('conversion.started', {
  'config.nodeTypes': 2,
  // Missing 'config.edgeTypes' - will throw EventValidationError
});

// Validation error - wrong type!
emit('conversion.complete', {
  'result.nodes.count': 'five', // Should be number! - will throw
  'result.edges.count': 3,
});
```

## Validation Modes

### Strict Mode (default in tests)

Throws `EventValidationError` on validation failures:

```typescript
const emit = createValidatedSpanEmitter(canvas, nodeId, span, { strict: true });

emit('conversion.started', {
  'config.nodeTypes': 2,
  // Missing required field - throws!
});
```

### Permissive Mode (for production)

Logs warnings but allows events:

```typescript
const emit = createValidatedSpanEmitter(canvas, nodeId, span, { strict: false });

emit('conversion.started', {
  'config.nodeTypes': 2,
  // Missing required field - warns but doesn't throw
});
```

## Special Metadata Fields

These fields are always allowed and don't need to be in the schema:

- `code.filepath` - Source file path
- `code.lineno` - Line number in source file
- `description` - Event description

```typescript
emit('conversion.started', {
  'config.nodeTypes': 2,
  'config.edgeTypes': 1,
  'code.filepath': 'GraphConverter.ts', // Always allowed
  'code.lineno': 15, // Always allowed
  description: 'Starting conversion', // Always allowed
});
```

## Production Instrumentation

Move instrumentation into production code, use tests to validate:

### Production Code

```typescript
// src/GraphConverter.ts
import { EventValidator, createValidatedEmitter } from '@principal-ai/principal-view-core';
import type { ExtendedCanvas } from '@principal-ai/principal-view-core';

export class GraphConverter {
  private emitEvent: (name: string, attrs: Record<string, any>) => void;

  constructor(canvas: ExtendedCanvas, span: Span) {
    const validator = new EventValidator(canvas);
    this.emitEvent = createValidatedEmitter(
      validator,
      'graph-converter',
      (name, attrs) => span.addEvent(name, attrs),
      { strict: false } // Permissive in production
    );
  }

  convert(config: Config) {
    this.emitEvent('conversion.started', {
      'config.nodeTypes': Object.keys(config.nodeTypes).length,
      'config.edgeTypes': Object.keys(config.edgeTypes).length,
    });

    // ... conversion logic

    this.emitEvent('conversion.complete', {
      'result.nodes.count': nodes.length,
      'result.edges.count': edges.length,
    });
  }
}
```

### Test Validates Events

```typescript
// test/GraphConverter.test.ts
test('should emit correct telemetry events', () => {
  const canvas = loadCanvas('graph-converter-execution.canvas');
  const span = startTestSpan('telemetry validation');
  const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span, {
    strict: true, // Strict in tests!
  });

  const converter = new GraphConverter(canvas, span);
  converter.convert(config);

  // Events are validated against canvas schema
  expect(span.events).toHaveLength(2);
  expect(span.events[0].name).toBe('conversion.started');
  expect(span.events[1].name).toBe('conversion.complete');
});
```

## Validation API

### EventValidator

```typescript
import { EventValidator } from '@principal-ai/principal-view-core';

const validator = new EventValidator(canvas);

// Validate an event
const result = validator.validate('graph-converter', 'conversion.started', {
  'config.nodeTypes': 2,
  'config.edgeTypes': 1,
});

console.log(result.valid); // true or false
console.log(result.errors); // Array of error messages

// Get event names for a node
const eventNames = validator.getNodeEventNames('graph-converter');
// => ['conversion.started', 'conversion.complete', ...]

// Check if node has schema
const hasSchema = validator.hasSchema('graph-converter'); // true
```

### createValidatedEmitter

```typescript
import { createValidatedEmitter } from '@principal-ai/principal-view-core';

const emit = createValidatedEmitter(
  validator,
  'graph-converter',
  (eventName, attributes) => {
    // Your event emission logic
    span.addEvent(eventName, attributes);
  },
  { strict: true }
);

emit('conversion.started', { ... });
```

## Benefits

### 1. Canvas as Contract

The canvas defines the contract between architecture and implementation:

```
Canvas (Architecture)  →  Production Code (Implementation)  →  Tests (Validation)
      │                           │                                    │
      └─────────────────────────────────────────────────────────────────┘
                    Type-safe validated events
```

### 2. Living Documentation

The canvas serves as living documentation of telemetry:
- What events are emitted
- What fields they contain
- What types those fields have

### 3. Refactoring Safety

When you change the canvas:
- Tests fail if production code doesn't match
- TypeScript catches type mismatches
- Runtime validation catches schema violations

### 4. Production Confidence

Events emitted in production are validated in tests:
- No surprises in production
- Consistent telemetry structure
- Easy to query and analyze

## Example: Graph Converter

See `.principal-views/graph-converter-execution.canvas` for a complete example with event schemas.

Run the validation tests:

```bash
bun test packages/core/test/event-validation.test.ts
```

View the generated execution data:

```bash
cat packages/react/src/stories/data/graph-converter-validated-execution.json
```

## Best Practices

1. **Define schemas upfront**: Create the canvas with event schemas before implementing
2. **Use strict mode in tests**: Catch violations early
3. **Use permissive mode in production**: Log warnings but don't crash
4. **Document fields**: Add descriptions to help future developers
5. **Keep events focused**: Each event should represent a single meaningful moment
6. **Use consistent naming**: `phase.action` pattern (e.g., `conversion.started`, `validation.complete`)

## Implemented Features

- ✅ TypeScript type generation from canvas schemas - see CODE-GENERATION-GUIDE.md

## Future Enhancements

- Zod schema generation for runtime validation
- IDE autocomplete for event names and attributes
- Schema visualization in Storybook
- Event coverage reports (which events are never emitted)
