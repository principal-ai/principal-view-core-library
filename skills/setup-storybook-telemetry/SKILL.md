---
name: setup-storybook-telemetry
description: Set up the storybook-addon-otel to capture OpenTelemetry traces from Storybook stories
---

# Setup Storybook Telemetry Skill

Guide users through setting up the `@principal-ai/storybook-addon-otel` addon to capture OpenTelemetry traces from Storybook stories.

## Purpose

This skill helps users integrate telemetry into their Storybook environment, enabling them to:
- Capture component behavior during story execution
- Visualize user interactions and data flow
- Export traces to an OTLP collector for analysis
- Debug component instrumentation in development

## When to Use This Skill

Use this skill when the user wants to:
- Set up telemetry capture in Storybook
- Configure the storybook-addon-otel addon
- Connect Storybook to a local OTEL collector
- Instrument components for Storybook visualization

## Prerequisites

Before using this skill, verify:
1. User has an existing Storybook setup (Storybook 8+ or 10+)
2. User has components they want to instrument (or will instrument)

## Interactive Workflow

### Phase 1: Assess Current Setup

**Ask the user:**

1. **Do you have Storybook set up already?**
   - Yes -> Proceed to Phase 2
   - No -> Help them set up Storybook first (outside scope of this skill)

2. **What package manager are you using?**
   - bun / npm / yarn / pnpm
   - This determines install commands

3. **Do you have a local OTEL collector running?**
   - Yes -> Get the endpoint URL
   - No -> Offer to help set one up (see Phase 2b)

### Phase 2: Install Dependencies

1. **Install the addon and OTEL API:**

   ```bash
   # Using bun
   bun add -d @principal-ai/storybook-addon-otel
   bun add @opentelemetry/api

   # Using npm
   npm install -D @principal-ai/storybook-addon-otel
   npm install @opentelemetry/api
   ```

2. **Verify installation** by checking package.json

### Phase 2b: Set Up Local Collector (if needed)

If user doesn't have a collector:

1. **Option A: Use @principal-ai/otel-collector-server**
   ```bash
   bun add -d @principal-ai/otel-collector-server
   ```

2. **Option B: Use Docker**
   ```bash
   docker run -p 4318:4318 otel/opentelemetry-collector
   ```

3. **Explain the endpoint:**
   - Default OTLP HTTP endpoint: `http://localhost:4318/v1/traces`

### Phase 3: Register the Addon

1. **Update `.storybook/main.ts`:**

   ```typescript
   import type { StorybookConfig } from '@storybook/react-vite';

   const config: StorybookConfig = {
     // ... existing config
     addons: [
       '@storybook/addon-essentials',
       // ... other addons
       '@principal-ai/storybook-addon-otel', // Add telemetry addon
     ],
   };

   export default config;
   ```

2. **Verify the file was updated correctly**

### Phase 4: Configure Telemetry Export

1. **Update `.storybook/preview.ts`:**

   ```typescript
   import type { Preview } from '@storybook/react';
   import type { OtelExportConfig } from '@principal-ai/storybook-addon-otel';

   const preview: Preview = {
     parameters: {
       otelExport: {
         enabled: true,
         endpoint: 'http://localhost:4318/v1/traces',
         serviceName: '<project-name>-storybook',
         resourceAttributes: {
           environment: 'development',
           project: '<project-name>',
         },
       } as OtelExportConfig,
     },
   };

   export default preview;
   ```

2. **Customize for their project:**
   - Replace `<project-name>` with actual project name
   - Adjust endpoint if using different collector
   - Add relevant resource attributes

### Phase 5: Create Telemetry Helper (Library Pattern)

If the user is building a component library, help them set up the library instrumentation pattern:

1. **Create `src/telemetry.ts`:**

   ```typescript
   import { trace, context, SpanStatusCode, type Tracer, type Span } from '@opentelemetry/api';

   // Package metadata - customize for their project
   export const TRACER_NAME = '<package-name>';
   export const TRACER_VERSION = '1.0.0';

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

2. **Explain the key principle:**
   - Only import `@opentelemetry/api` in library code
   - Never import SDK packages (`@opentelemetry/sdk-trace-base`)
   - The host application (Storybook) configures the provider

### Phase 6: Instrument a Component (Example)

Show how to instrument a component:

1. **Basic component instrumentation:**

   ```typescript
   import { useEffect, useCallback } from 'react';
   import { getTracer, SpanStatusCode } from '../telemetry';

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

2. **Explain span naming conventions:**
   - Use dot notation: `panel.lifecycle`, `user.interaction`, `data.load`
   - Be consistent across components

### Phase 7: Verify Setup

1. **Start Storybook:**
   ```bash
   bun storybook
   # or npm run storybook
   ```

2. **Check the toolbar:**
   - Look for the telemetry indicator in Storybook toolbar
   - Green dot = export active and working
   - Gray dot = export disabled
   - Red dot = initialization error

3. **Verify traces are being sent:**
   - Open browser dev tools -> Network tab
   - Look for requests to the OTLP endpoint
   - Should see POST requests to `/v1/traces`

4. **If using a collector with UI:**
   - Check the collector's trace viewer
   - Should see traces from Storybook

### Phase 8: Troubleshooting

If issues arise, check these common problems:

**Telemetry Panel Not Showing:**
- Verify addon is registered in `.storybook/main.ts`
- Check browser console for errors
- Ensure `otelExport.enabled` is `true`

**No Spans Appearing:**
- Verify components are calling `getTracer()`
- Check that spans are being ended with `span.end()`
- Look for errors in browser console

**Export to OTLP Endpoint Failing:**
- Verify the endpoint is running
- Check for CORS issues in browser console
- Verify endpoint URL includes `/v1/traces`

## Configuration Reference

### OtelExportConfig Options

| Option               | Type    | Default                           | Description                              |
| -------------------- | ------- | --------------------------------- | ---------------------------------------- |
| `enabled`            | boolean | `false`                           | Enable/disable telemetry collection      |
| `endpoint`           | string  | `http://localhost:4318/v1/traces` | OTLP HTTP endpoint for trace export      |
| `serviceName`        | string  | `storybook`                       | Service name in trace metadata           |
| `resourceAttributes` | object  | `{}`                              | Additional resource attributes           |
| `headers`            | object  | `{}`                              | Custom headers (e.g., auth)              |
| `timeoutMillis`      | number  | `10000`                           | Export timeout                           |
| `maxQueueSize`       | number  | `2048`                            | Max spans in queue                       |
| `maxExportBatchSize` | number  | `512`                             | Max spans per export batch               |
| `scheduledDelayMillis` | number | `5000`                           | Delay between exports                    |

### Per-Story Configuration

Override configuration for specific stories:

```typescript
export const MyStory: Story = {
  parameters: {
    otelExport: {
      enabled: false, // Disable telemetry for this story
    },
  },
};
```

## Success Criteria

After completing setup, user should have:

**Addon installed and configured**
- `@principal-ai/storybook-addon-otel` in devDependencies
- `@opentelemetry/api` in dependencies
- Addon registered in `.storybook/main.ts`
- Export configured in `.storybook/preview.ts`

**Telemetry helper created** (if building component library)
- `src/telemetry.ts` with getTracer() helper
- Only imports from `@opentelemetry/api`

**Verification complete**
- Storybook starts without errors
- Toolbar shows telemetry indicator
- Traces are being sent to collector (if configured)

## Best Practices

**Span Naming:**
- Use dot notation: `panel.lifecycle`, `user.interaction`
- Be consistent across components
- Avoid camelCase or SCREAMING_CASE

**Span Lifecycle:**
- Always call `span.end()` when done
- Use try/finally to ensure spans end on error
- Don't leave spans open indefinitely

**Attributes:**
- Keep values simple (strings, numbers, booleans)
- Don't stringify complex objects
- Use semantic attribute names

**Error Handling:**
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
  throw error;
} finally {
  span.end();
}
```

## Example Session

```
User: "I want to set up telemetry in my Storybook"

Claude: "I'll help you set up the storybook-addon-otel to capture traces.
First, a few questions:

1. What package manager are you using?
2. Do you have a local OTEL collector running?"

User: "Using bun, no collector yet"

Claude: "Let's install the addon and set up a collector.

[Installs @principal-ai/storybook-addon-otel]
[Installs @opentelemetry/api]
[Optionally sets up collector]

Now let me configure Storybook.

[Updates .storybook/main.ts to register addon]
[Updates .storybook/preview.ts with export config]

I've also created src/telemetry.ts with helper functions.

Start Storybook with `bun storybook` and you should see
the telemetry indicator in the toolbar.

To instrument a component, import getTracer() and create spans
for the behavior you want to track."
```

## References

- [Storybook Telemetry Addon Guide](docs/guides/storybook-telemetry-addon.md)
- [@principal-ai/storybook-addon-otel package](packages/storybook-addon-otel/)
- [OpenTelemetry JavaScript API](https://opentelemetry.io/docs/languages/js/)
- [Storybook Addons Documentation](https://storybook.js.org/docs/addons)
