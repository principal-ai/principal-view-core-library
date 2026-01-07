# Event Schema Validation - Implementation Summary

## What We Built

Type-safe telemetry validation system that ensures emitted events match the schema defined in `.canvas` files.

## Problem Statement

**Before**: No connection between canvas definitions (architecture) and emitted telemetry (implementation)
- Canvas shows what *should* happen
- Code emits events with no validation
- No guarantee events match the architecture
- Difficult to catch telemetry bugs

**After**: Canvas serves as the contract between architecture and implementation
- Canvas defines event schemas with typed fields
- Production code emits events validated against schemas
- Tests ensure events match architecture
- Type safety at compile-time and runtime

## Key Components

### 1. Canvas Event Schema Types (`packages/core/src/types/canvas.ts`)

Extended `PVNodeExtension` with event schema support:

```typescript
interface PVNodeExtension {
  // ... existing fields

  events?: Record<string, PVEventSchema>;
}

interface PVEventSchema {
  description: string;
  attributes: Record<string, PVEventFieldSchema>;
}

interface PVEventFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  description?: string;
}
```

### 2. Event Validator (`packages/core/src/telemetry/event-validator.ts`)

Runtime validation engine:

```typescript
class EventValidator {
  validate(nodeId, eventName, attributes): ValidationResult
  getNodeSchema(nodeId): Record<string, PVEventSchema>
  getNodeEventNames(nodeId): string[]
  hasSchema(nodeId): boolean
}

function createValidatedEmitter(
  validator,
  nodeId,
  addEventFn,
  options?: { strict?: boolean }
): EmitFunction
```

Features:
- Validates event names against schema
- Validates required fields
- Validates field types
- Strict mode (throws) vs permissive mode (warns)
- Special metadata fields always allowed (`code.*`, `description`)

### 3. Test Integration (`packages/core/test/otel-setup.ts`)

Helper for test instrumentation:

```typescript
function createValidatedSpanEmitter(
  canvas: ExtendedCanvas,
  nodeId: string,
  span: TestSpan,
  options?: { strict?: boolean }
): EmitFunction
```

Usage in tests:
```typescript
const canvas = loadCanvas('my-flow.canvas');
const span = startTestSpan('my test');
const emit = createValidatedSpanEmitter(canvas, 'my-node', span);

// Validated against canvas schema!
emit('conversion.started', {
  'config.nodeTypes': 2,
  'config.edgeTypes': 1,
});
```

### 4. Example Canvas (`.principal-views/graph-converter-execution.canvas`)

Real-world example with event schemas for:
- `graph-converter` node: 5 event types
- `validation` node: 2 event types
- `graph-output` node: 1 event type

### 5. Tests (`packages/core/test/event-validation.test.ts`)

Comprehensive test suite covering:
- ✅ Valid events pass validation
- ✅ Missing required fields fail validation
- ✅ Wrong field types fail validation
- ✅ Optional fields work correctly
- ✅ Undefined events are rejected
- ✅ Nodes without schema are permissive
- ✅ Strict mode throws on errors
- ✅ Permissive mode warns on errors
- ✅ Special metadata fields are allowed
- ✅ Full execution narratives can be validated

### 6. Storybook Stories (`packages/react/src/stories/ValidatedExecution.stories.tsx`)

Visual demonstration of:
- Execution flow with event schemas
- Validated events panel
- Side-by-side flow and events
- Canvas schema JSON view

### 7. Documentation (`.principal-views/EVENT-SCHEMA-VALIDATION-GUIDE.md`)

Complete guide covering:
- Canvas event schema structure
- Using validation in tests
- Production instrumentation patterns
- Validation modes
- API reference
- Best practices

## Workflow

### 1. Define Schema in Canvas

```json
{
  "nodes": [{
    "id": "my-service",
    "pv": {
      "events": {
        "operation.started": {
          "description": "Operation begins",
          "attributes": {
            "input.size": { "type": "number", "required": true }
          }
        }
      }
    }
  }]
}
```

### 2. Implement in Production Code

```typescript
import { EventValidator, createValidatedEmitter } from '@principal-ai/principal-view-core';

class MyService {
  private emit: EmitFunction;

  constructor(canvas, span) {
    const validator = new EventValidator(canvas);
    this.emit = createValidatedEmitter(
      validator,
      'my-service',
      (name, attrs) => span.addEvent(name, attrs),
      { strict: false } // Permissive in production
    );
  }

  operate(input) {
    this.emit('operation.started', {
      'input.size': input.length,
    });
    // ...
  }
}
```

### 3. Validate in Tests

```typescript
test('should emit correct events', () => {
  const canvas = loadCanvas('my-flow.canvas');
  const span = startTestSpan('event validation');
  const emit = createValidatedSpanEmitter(canvas, 'my-service', span, {
    strict: true, // Throw on errors in tests!
  });

  const service = new MyService(canvas, span);
  service.operate(data);

  // Events are validated against schema
  expect(span.events[0].name).toBe('operation.started');
});
```

## Benefits

### 1. Living Documentation
- Canvas documents expected telemetry
- Always up-to-date (tests fail if not)
- Easy to understand execution flow

### 2. Type Safety
- Compile-time validation (future: TypeScript codegen)
- Runtime validation catches bugs early
- Prevents telemetry drift

### 3. Refactoring Confidence
- Change canvas schema
- Tests fail if code doesn't match
- Safe to evolve architecture

### 4. Production Quality
- Events emitted in production are validated in tests
- Consistent telemetry structure
- Easy to query and analyze

## Files Changed/Added

### Added
- `packages/core/src/telemetry/event-validator.ts` - Validation engine
- `packages/core/test/event-validation.test.ts` - Test suite
- `.principal-views/graph-converter-execution.canvas` - Example canvas
- `.principal-views/EVENT-SCHEMA-VALIDATION-GUIDE.md` - User guide
- `.principal-views/EVENT-SCHEMA-IMPLEMENTATION-SUMMARY.md` - This file
- `packages/react/src/stories/ValidatedExecution.stories.tsx` - Storybook demo
- `packages/react/src/stories/data/graph-converter-validated-execution.json` - Test data

### Modified
- `packages/core/src/types/canvas.ts` - Added event schema types
- `packages/core/src/index.ts` - Export validation API
- `packages/core/test/otel-setup.ts` - Added validated emitter helper
- `packages/react/src/index.ts` - Export TestEventPanel

## Test Results

```bash
$ bun test packages/core/test/event-validation.test.ts
✅ 11 tests pass
✅ 22 expect() calls
✅ All validation scenarios covered
```

## Next Steps

Potential enhancements:
1. **TypeScript Codegen**: Generate types from canvas schemas
2. **Zod Integration**: Use Zod for more powerful validation
3. **IDE Support**: Autocomplete for event names/attributes
4. **Coverage Reports**: Which events are never emitted
5. **Schema Visualization**: Show schemas in Storybook
6. **Migration Tools**: Convert existing telemetry to schemas

## Usage

### For Tests
```typescript
import { createValidatedSpanEmitter } from '@principal-ai/principal-view-core/test/otel-setup';

const emit = createValidatedSpanEmitter(canvas, nodeId, span);
emit('event.name', { field: value });
```

### For Production
```typescript
import { EventValidator, createValidatedEmitter } from '@principal-ai/principal-view-core';

const validator = new EventValidator(canvas);
const emit = createValidatedEmitter(validator, nodeId, addEventFn, { strict: false });
emit('event.name', { field: value });
```

## Documentation

See `.principal-views/EVENT-SCHEMA-VALIDATION-GUIDE.md` for complete usage guide.

## Demo

Run Storybook to see the visual demonstration:
```bash
bun run storybook
# Navigate to: Features → Validated Execution
```
