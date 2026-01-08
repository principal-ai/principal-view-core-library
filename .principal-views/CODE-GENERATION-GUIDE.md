# Code Generation Guide

Generate type-safe code from canvas event schemas.

## Overview

The code generator creates TypeScript types (and other languages in the future) from canvas event schemas, providing compile-time type safety in addition to runtime validation.

### Hybrid Approach

The framework uses a hybrid approach for organizing canvas files and generated types:

- **Canvas files** remain in `.principal-views/` (as the framework expects them)
- **Generated types** are output to `packages/core/src/generated/` (more idiomatic TypeScript location)
- **Path aliases** (`@generated/*`) provide clean imports without awkward relative paths

This keeps the framework structure intact while improving the developer experience with standard TypeScript conventions.

## Precedents

This follows industry-standard patterns from:

1. **GraphQL Code Generator** (graphql-code-generator.com)
   - Generates TypeScript types from GraphQL schemas
   - Enables end-to-end type safety
   - Similar: canvas → types

2. **OpenAPI Generator** (openapi-generator.tech)
   - Generates client SDKs in multiple languages
   - Supports 40+ languages
   - Similar: API spec → client code

3. **Protobuf Compiler** (`protoc`)
   - Generates message types from `.proto` files
   - Multi-language support
   - Similar: proto → types

4. **Zod** (zod.dev)
   - Runtime validation with TypeScript inference
   - Similar: schema → types + validation

## Quick Start

### 1. Define Event Schema in Canvas

```json
{
  "nodes": [{
    "id": "my-service",
    "pv": {
      "events": {
        "operation.started": {
          "description": "Operation begins",
          "attributes": {
            "input.size": {
              "type": "number",
              "required": true,
              "description": "Size of input"
            }
          }
        }
      }
    }
  }]
}
```

### 2. Generate Types

**CLI:**
```bash
npx @principal-ai/principal-view-core codegen my-service.canvas
```

**Programmatic:**
```typescript
import { generateTypes } from '@principal-ai/principal-view-core';
import fs from 'fs';

const canvas = JSON.parse(fs.readFileSync('my-service.canvas', 'utf-8'));
const result = generateTypes(canvas, { language: 'typescript' });

fs.writeFileSync(result.filename, result.code);
```

### 3. Use Generated Types

```typescript
import type { MyService, NodeEmitterByName } from '@generated/my-service.types';

const emit: NodeEmitterByName<MyService.Event> = (name, attrs) => {
  // Emit event
};

// ✅ Type-safe: TypeScript knows the attributes for this event
emit('operation.started', {
  'input.size': 100,
});

// ❌ TypeScript error: wrong type
// emit('operation.started', {
//   'input.size': 'large', // Should be number!
// });
```

## CLI Usage

### Basic Usage

```bash
# Generate TypeScript types (outputs to packages/core/src/generated/ by default)
npx @principal-ai/principal-view-core codegen .principal-views/my-flow.canvas

# Generate to specific output directory
npx @principal-ai/principal-view-core codegen --output src/types/ .principal-views/my-flow.canvas

# Generate multiple files
npx @principal-ai/principal-view-core codegen .principal-views/*.canvas

# Generate with namespace
npx @principal-ai/principal-view-core codegen --namespace Events .principal-views/my-flow.canvas
```

### Options

```bash
Options:
  -l, --lang <language>           Target language (typescript|python|go|rust)
  -o, --output <path>             Output file or directory [default: packages/core/src/generated/ for .principal-views canvases]
  -n, --namespace <name>          Wrap types in a namespace
  --readonly                      Use readonly modifiers (TypeScript)
  --no-strict-null-checks         Disable strict null checks
  --no-doc-comments               Omit JSDoc comments
  -w, --watch                     Watch for changes and regenerate
  --list-generators               List available code generators
  -h, --help                      Show help message
```

### Examples

**With namespace:**
```bash
npx @principal-ai/principal-view-core codegen --namespace TelemetryEvents my-flow.canvas
```

Generated:
```typescript
export namespace TelemetryEvents {
  export namespace MyService {
    export interface OperationStarted { ... }
  }
}
```

**With readonly modifiers:**
```bash
npx @principal-ai/principal-view-core codegen --readonly my-flow.canvas
```

Generated:
```typescript
export interface OperationStarted {
  readonly name: 'operation.started';
  readonly attributes: {
    readonly 'input.size': number;
  };
}
```

**Watch mode:**
```bash
npx @principal-ai/principal-view-core codegen --watch my-flow.canvas
```

## Generated Code Structure

### Namespace per Node

Each node with event schemas gets a namespace:

```typescript
export namespace GraphConverter {
  export interface ConversionStarted { ... }
  export interface ConversionComplete { ... }

  export type Event = ConversionStarted | ConversionComplete;
  export type EventName = 'conversion.started' | 'conversion.complete';
}
```

### Event Interfaces

Each event becomes an interface:

```typescript
export interface ConversionStarted {
  name: 'conversion.started'; // Literal type
  attributes: {
    'config.nodeTypes': number;
    'config.edgeTypes': number;
    'duration.ms'?: number; // Optional field
  };
}
```

### Union Types

All events are combined into union types:

```typescript
// All events for a node
export type Event = ConversionStarted | ConversionComplete | ...;

// All event names for a node
export type EventName = 'conversion.started' | 'conversion.complete' | ...;

// All event names in the canvas
export type AllEventNames = 'conversion.started' | 'validation.started' | ...;
```

### Helper Types

Emitter helper types for ergonomic usage:

```typescript
// Emit full event objects
export type NodeEmitter<TEventName, TEvent> = (event: TEvent) => void;

// Emit by name + attributes (more ergonomic)
export type NodeEmitterByName<TEvent> = <TName extends TEvent['name']>(
  eventName: TName,
  attributes: Extract<TEvent, { name: TName }>['attributes']
) => void;
```

## Usage Patterns

### Pattern 1: Full Event Objects

```typescript
const emit = (event: GraphConverter.Event) => {
  console.log(event);
};

emit({
  name: 'conversion.started',
  attributes: {
    'config.nodeTypes': 2,
    'config.edgeTypes': 1,
  },
});
```

### Pattern 2: By Name (Recommended)

```typescript
const emit: NodeEmitterByName<GraphConverter.Event> = (name, attrs) => {
  console.log(name, attrs);
};

// TypeScript infers attributes type from event name
emit('conversion.started', {
  'config.nodeTypes': 2,
  'config.edgeTypes': 1,
});
```

### Pattern 3: Production Service

```typescript
class GraphConverterService {
  private emit: NodeEmitterByName<GraphConverter.Event>;

  constructor(emitter: NodeEmitterByName<GraphConverter.Event>) {
    this.emit = emitter;
  }

  convert(config: Config) {
    this.emit('conversion.started', {
      'config.nodeTypes': config.nodeTypes.length,
      'config.edgeTypes': config.edgeTypes.length,
    });

    // ... conversion logic

    this.emit('conversion.complete', {
      'result.nodes.count': nodes.length,
      'result.edges.count': edges.length,
    });
  }
}
```

### Pattern 4: Event Handlers with Type Narrowing

```typescript
function handleEvent(event: GraphConverter.Event) {
  switch (event.name) {
    case 'conversion.started':
      // TypeScript knows exact attributes
      console.log(`Starting with ${event.attributes['config.nodeTypes']} types`);
      break;

    case 'conversion.complete':
      // TypeScript knows exact attributes
      console.log(`Completed: ${event.attributes['result.nodes.count']} nodes`);
      if (event.attributes['duration.ms']) { // TypeScript knows it's optional
        console.log(`Duration: ${event.attributes['duration.ms']}ms`);
      }
      break;
  }
}
```

### Pattern 5: Combined with Runtime Validation

```typescript
import { EventValidator, createValidatedEmitter } from '@principal-ai/principal-view-core';
import type { GraphConverter, NodeEmitterByName } from '@generated/graph-converter-execution.types';

const canvas = loadCanvas('.principal-views/graph-converter-execution.otel.canvas');
const validator = new EventValidator(canvas);

// Both type-safe AND runtime-validated
const emit = createValidatedEmitter(
  validator,
  'graph-converter',
  (name, attrs) => span.addEvent(name, attrs)
) as NodeEmitterByName<GraphConverter.Event>;

// ✅ TypeScript checks types at compile-time
// ✅ EventValidator checks schema at runtime
emit('conversion.started', {
  'config.nodeTypes': 2,
  'config.edgeTypes': 1,
});
```

## Multi-Language Support

The generator is designed to support multiple languages:

### Current Support

- ✅ **TypeScript** - Fully implemented

### Future Support (Extensible)

- 🔜 **Python** - Dataclasses or Pydantic models
- 🔜 **Go** - Structs with JSON tags
- 🔜 **Rust** - Structs with serde

### Implementing Custom Generators

```typescript
import { CodeGenerator, generatorRegistry } from '@principal-ai/principal-view-core';

class PythonGenerator implements CodeGenerator {
  language = 'python';

  generate(canvas, options) {
    // Generate Python code
    return {
      code: '# Python types...',
      extension: 'py',
      filename: 'canvas_types.py',
    };
  }
}

// Register custom generator
generatorRegistry.register(new PythonGenerator());

// Now available via CLI
// npx @principal-ai/principal-view-core codegen --lang python my-flow.canvas
```

## Integration Workflows

### Workflow 1: Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
npx @principal-ai/principal-view-core codegen .principal-views/*.canvas
git add packages/core/src/generated/*.types.ts
```

### Workflow 2: Build Script

```json
{
  "scripts": {
    "prebuild": "npx @principal-ai/principal-view-core codegen .principal-views/*.canvas",
    "build": "tsc"
  }
}
```

### Workflow 3: Watch Mode in Development

```bash
# Terminal 1: Watch canvas files and regenerate types
npx @principal-ai/principal-view-core codegen --watch .principal-views/*.canvas

# Terminal 2: TypeScript compiler
tsc --watch
```

### Workflow 4: CI/CD

```yaml
# .github/workflows/ci.yml
- name: Generate types from canvas
  run: npx @principal-ai/principal-view-core codegen .principal-views/*.canvas

- name: Check for uncommitted changes
  run: git diff --exit-code packages/core/src/generated/*.types.ts
```

## Best Practices

1. **Commit Generated Files**: Include `.types.ts` files in version control
   - Makes types available without build step
   - Documents the schema in code
   - Enables code review of schema changes

2. **Regenerate on Canvas Changes**: Always regenerate when canvas changes
   - Use pre-commit hooks
   - Or build scripts
   - Or CI/CD checks

3. **Use NodeEmitterByName**: More ergonomic than full event objects
   - TypeScript infers attributes from event name
   - Less boilerplate

4. **Combine with Runtime Validation**: Get both compile-time and runtime safety
   - TypeScript catches errors during development
   - EventValidator catches errors in tests/production

5. **Namespace Organization**: Use namespaces for multiple nodes
   - Prevents type name collisions
   - Clear organization

## Comparison with Other Tools

| Feature | Canvas Codegen | GraphQL Codegen | OpenAPI Gen | Protobuf |
|---------|---------------|-----------------|-------------|----------|
| Schema Format | JSON Canvas | GraphQL SDL | OpenAPI/Swagger | .proto files |
| Type Generation | ✅ | ✅ | ✅ | ✅ |
| Multi-language | 🔜 | ✅ | ✅ | ✅ |
| Runtime Validation | ✅ | ❌ | ✅ | ✅ |
| Visual Editing | ✅ (Obsidian) | ❌ | ✅ (Swagger UI) | ❌ |
| Architecture Focus | ✅ | ❌ | ✅ | ❌ |

## Examples

See:
- `packages/core/src/codegen/usage-example.ts` - Usage examples
- `packages/core/src/generated/graph-converter-execution.types.ts` - Generated types
- `packages/core/src/codegen/type-generator.test.ts` - Test suite

## Future Enhancements

1. **More Languages**: Python, Go, Rust generators
2. **JSON Schema Export**: Export schemas as JSON Schema
3. **Zod Schema Generation**: Generate Zod validators
4. **OpenAPI Integration**: Generate OpenAPI specs from canvas
5. **IDE Plugins**: VSCode extension for inline validation
6. **Schema Migration Tools**: Help migrate when schemas change
