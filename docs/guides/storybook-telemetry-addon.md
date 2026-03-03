# Storybook Telemetry Addon Integration Guide

**Status:** Onboarding Guide
**Author:** Development Team
**Date:** 2026-03-02
**Version:** 0.1.0

## Overview

The `@principal-ai/storybook-addon-otel` addon captures OpenTelemetry traces from Storybook stories, enabling you to visualize component behavior, user interactions, and data flow during development.

This guide explains how to integrate the addon into your project.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [Configuration](#configuration)
4. [Library Instrumentation Pattern](#library-instrumentation-pattern)
5. [Instrumenting Components](#instrumenting-components)
6. [Build Configuration](#build-configuration)
7. [Captured Events](#captured-events)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Install Dependencies

```bash
# Using bun
bun add -d @principal-ai/storybook-addon-otel

# Using npm
npm install -D @principal-ai/storybook-addon-otel

# The addon manages OTEL SDK dependencies internally, but you need the API
bun add @opentelemetry/api
```

### 2. Register the Addon

Add to `.storybook/main.ts`:

```typescript
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  // ... other config
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-docs',
    '@principal-ai/storybook-addon-otel', // Add telemetry addon
  ],
};

export default config;
```

### 3. Configure Telemetry Export

Add to `.storybook/preview.ts`:

```typescript
import type { Preview } from '@storybook/react';
import type { OtelExportConfig } from '@principal-ai/storybook-addon-otel';

const preview: Preview = {
  parameters: {
    otelExport: {
      enabled: true,
      endpoint: 'http://localhost:4318/v1/traces',
      serviceName: 'my-project-storybook',
      resourceAttributes: {
        environment: 'development',
        project: 'my-project',
      },
    } as OtelExportConfig,
  },
};

export default preview;
```

---

## How It Works

```
┌────────────────────────────────────────────────────────────────────┐
│                     STORYBOOK ENVIRONMENT                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Story Preview (iframe)                                      │   │
│  │                                                              │   │
│  │   Component ──▶ getTracer() ──▶ Global TracerProvider       │   │
│  │                                     │                        │   │
│  │                                     ▼                        │   │
│  │                              Creates Spans                   │   │
│  │                                     │                        │   │
│  │                                     ▼                        │   │
│  │                         Addon Decorator Captures             │   │
│  └─────────────────────────────────────┬───────────────────────┘   │
│                                        │ Storybook Channel          │
│  ┌─────────────────────────────────────▼───────────────────────┐   │
│  │  Storybook Manager                                           │   │
│  │                                                              │   │
│  │   Telemetry Panel ◀── Receives Spans ◀── Channel             │   │
│  │                                                              │   │
│  │   [Timeline View] [Span List] [Export JSON]                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                        │                            │
│                                        ▼                            │
│                          Optional: OTLP Export                      │
│                          http://localhost:4318/v1/traces            │
└────────────────────────────────────────────────────────────────────┘
```

**Key Points:**

1. The addon registers a global `TracerProvider` in the Storybook preview
2. Your components call `getTracer()` from `@opentelemetry/api`
3. Spans are captured by the addon's decorator
4. Spans are sent via Storybook's channel to the manager UI
5. The Telemetry Panel displays spans in real-time
6. Optionally, spans can be exported to an OTLP endpoint

---

## Configuration

### OtelExportConfig Options

| Option               | Type    | Default     | Description                                      |
| -------------------- | ------- | ----------- | ------------------------------------------------ |
| `enabled`            | boolean | `true`      | Enable/disable telemetry collection              |
| `endpoint`           | string  | -           | OTLP HTTP endpoint for trace export              |
| `serviceName`        | string  | `storybook` | Service name in trace metadata                   |
| `resourceAttributes` | object  | `{}`        | Additional resource attributes (environment, etc)|

### Per-Story Configuration

You can override configuration at the story level:

```typescript
export const MyStory: Story = {
  parameters: {
    otelExport: {
      enabled: false, // Disable telemetry for this story
    },
  },
};
```

---

## Library Instrumentation Pattern

When building reusable component libraries, follow the **library instrumentation pattern**:

### Why This Pattern?

- Libraries should NOT bundle SDK dependencies
- Libraries should NOT configure providers/exporters
- Libraries should work whether or not telemetry is configured
- The host application (Storybook, your app) configures the provider

### Implementation

Create `src/telemetry.ts`:

```typescript
import { trace, context, SpanStatusCode, type Tracer, type Span } from '@opentelemetry/api';

// Package metadata
export const TRACER_NAME = '@my-org/my-component-library';
export const TRACER_VERSION = '1.0.0'; // Or import from package.json

/**
 * Get a tracer instance.
 * Returns a no-op tracer if no provider is registered.
 */
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}

/**
 * Get the currently active span, if any.
 */
export function getActiveSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Execute a function within a span's context.
 */
export async function withSpan<T>(span: Span, fn: () => Promise<T>): Promise<T> {
  return context.with(trace.setSpan(context.active(), span), fn);
}

// Re-export commonly used types
export { SpanStatusCode };
export type { Span };
```

### Key Principle: Only Import the API

```typescript
// ✅ CORRECT - Only import @opentelemetry/api
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

// ❌ WRONG - Don't import SDK packages in library code
import { BasicTracerProvider } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
```

---

## Instrumenting Components

### Basic Usage

```typescript
import { useEffect, useCallback } from 'react';
import { getTracer } from '../telemetry';

export function MyComponent() {
  const tracer = getTracer();

  // Track component lifecycle
  useEffect(() => {
    const span = tracer.startSpan('component.lifecycle', {
      attributes: { 'component.name': 'MyComponent' }
    });
    span.addEvent('component.mounted');

    return () => {
      span.addEvent('component.unmounted');
      span.end();
    };
  }, []);

  // Track user interactions
  const handleClick = useCallback(() => {
    const span = tracer.startSpan('user.interaction', {
      attributes: { 'interaction.type': 'click' }
    });
    span.addEvent('button.clicked');
    span.end();
  }, []);

  return <button onClick={handleClick}>Click me</button>;
}
```

### Tracking Async Operations

```typescript
const handleSubmit = useCallback(async (data: FormData) => {
  const tracer = getTracer();
  const span = tracer.startSpan('form.submit', {
    attributes: {
      'form.id': 'user-registration',
      'form.field_count': Object.keys(data).length,
    }
  });

  try {
    span.addEvent('validation.start');
    await validate(data);
    span.addEvent('validation.complete');

    span.addEvent('submit.start');
    const result = await submitForm(data);
    span.addEvent('submit.complete', { 'response.status': result.status });

    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    span.end();
  }
}, []);
```

### Adding Meaningful Attributes

```typescript
// Panel/board interactions
span.setAttribute('panel.id', 'kanban-board');
span.setAttribute('column.selected', 'in-progress');
span.setAttribute('task.count', tasks.length);

// Search operations
span.setAttribute('search.query', query);
span.setAttribute('search.result_count', results.length);

// Data operations
span.setAttribute('file.path', '/path/to/file.md');
span.setAttribute('operation.type', 'read');

// User context
span.setAttribute('user.action', 'drag-and-drop');
span.setAttribute('source.column', 'todo');
span.setAttribute('target.column', 'done');
```

---

## Build Configuration

### Vite Configuration

Externalize `@opentelemetry/api` as a peer dependency:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@opentelemetry/api',  // Externalize OTEL API
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@opentelemetry/api': 'opentelemetry',
        },
      },
    },
  },
});
```

### Package.json Configuration

```json
{
  "peerDependencies": {
    "@opentelemetry/api": "^1.8.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@opentelemetry/api": "^1.8.0",
    "@principal-ai/storybook-addon-otel": "^0.3.22"
  }
}
```

---

## Captured Events

The addon automatically captures story lifecycle events. Your instrumentation adds domain-specific events:

### Automatic Events (from addon)

| Event              | Description                |
| ------------------ | -------------------------- |
| `story.mounted`    | Story component mounted    |
| `story.unmounted`  | Story component unmounted  |
| `story.rendered`   | Initial render complete    |
| `story.args.changed` | Story args updated       |

### Recommended Custom Events

| Category          | Event Name           | Attributes                          |
| ----------------- | -------------------- | ----------------------------------- |
| Component         | `component.mounted`  | `component.name`, `component.id`    |
| Component         | `component.error`    | `error.message`, `error.type`       |
| User Interaction  | `button.clicked`     | `button.id`, `button.label`         |
| User Interaction  | `input.changed`      | `input.name`, `input.value`         |
| User Interaction  | `form.submitted`     | `form.id`, `field.count`            |
| Data              | `data.loaded`        | `source`, `record.count`            |
| Data              | `data.error`         | `error.message`, `operation`        |
| Navigation        | `tab.selected`       | `tab.id`, `previous.tab`            |
| Search            | `search.performed`   | `query`, `result.count`             |

---

## Best Practices

### 1. Use Consistent Span Naming

```typescript
// Use dot notation for namespacing
'panel.lifecycle'
'board.interaction'
'task.create'
'search.perform'
'file.read'

// Not recommended
'panelLifecycle'
'BOARD_INTERACTION'
'TaskCreate'
```

### 2. End Spans Promptly

```typescript
// ✅ Good - span ended immediately after operation
const span = tracer.startSpan('quick.operation');
doSomething();
span.end();

// ❌ Bad - span lives too long
const span = tracer.startSpan('component.render');
// ... component renders forever, span never ends
```

### 3. Use Events for Milestones Within a Span

```typescript
const span = tracer.startSpan('multi.step.process');

span.addEvent('step.1.started');
await step1();
span.addEvent('step.1.completed');

span.addEvent('step.2.started');
await step2();
span.addEvent('step.2.completed');

span.end();
```

### 4. Keep Attribute Values Simple

```typescript
// ✅ Good - simple, queryable values
span.setAttribute('task.status', 'completed');
span.setAttribute('item.count', 42);

// ❌ Bad - complex objects
span.setAttribute('task', JSON.stringify(task)); // Don't do this
```

### 5. Handle Errors Consistently

```typescript
try {
  await riskyOperation();
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error instanceof Error ? error.message : 'Unknown error',
  });
  span.recordException(error instanceof Error ? error : new Error(String(error)));
  throw error; // Re-throw after recording
} finally {
  span.end(); // Always end the span
}
```

---

## Troubleshooting

### Telemetry Panel Not Showing

1. Verify addon is registered in `.storybook/main.ts`
2. Check browser console for errors
3. Ensure `otelExport.enabled` is `true` in preview.ts

### No Spans Appearing

1. Verify components are calling `getTracer()`
2. Check that spans are being ended with `span.end()`
3. Look for errors in browser console

### Spans Not Connected (No Parent-Child Relationships)

This happens when context propagation breaks. In Storybook, spans within the same render cycle should be connected. If not:

1. Ensure you're using `context.with()` for nested operations
2. Check that async operations maintain context

```typescript
// Explicit context propagation
import { context, trace } from '@opentelemetry/api';

const parentSpan = tracer.startSpan('parent');
const ctx = trace.setSpan(context.active(), parentSpan);

await context.with(ctx, async () => {
  // Child spans created here will be linked to parent
  const childSpan = tracer.startSpan('child');
  // ...
  childSpan.end();
});

parentSpan.end();
```

### Export to OTLP Endpoint Failing

1. Verify the endpoint is running (e.g., `docker run -p 4318:4318 otel/opentelemetry-collector`)
2. Check for CORS issues in browser console
3. Verify endpoint URL includes `/v1/traces`

---

## Next Steps

- Set up the addon in your Storybook project
- Add telemetry to your component library using the library instrumentation pattern
- Create stories that exercise key user workflows
- Use captured traces to understand component behavior
- Export traces for visualization or debugging

## References

- [@principal-ai/storybook-addon-otel](https://github.com/principal-ai/storybook-addon-otel)
- [OpenTelemetry JavaScript API](https://opentelemetry.io/docs/languages/js/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/concepts/semantic-conventions/)
- [Storybook Addons](https://storybook.js.org/docs/addons)
