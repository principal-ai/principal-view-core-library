# @principal-ai/storybook-addon-otel

Storybook addon for forwarding OpenTelemetry traces to an OTLP HTTP endpoint.

## Features

- Simple forwarding of existing OpenTelemetry instrumentation to OTLP collector
- Configurable via Storybook parameters
- Minimal toolbar status indicator
- Support for per-story configuration overrides
- Zero component changes required

## Installation

```bash
npm install --save-dev @principal-ai/storybook-addon-otel
# or
yarn add -D @principal-ai/storybook-addon-otel
# or
bun add -D @principal-ai/storybook-addon-otel
```

## Setup

### 1. Add to Storybook addons

In `.storybook/main.ts`:

```typescript
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  addons: [
    // ... other addons
    '@principal-ai/storybook-addon-otel',
  ],
  // ... rest of config
};

export default config;
```

### 2. Configure in preview

In `.storybook/preview.ts`:

```typescript
import type { Preview } from '@storybook/react';
import type { OtelExportConfig } from '@principal-ai/storybook-addon-otel';

const preview: Preview = {
  parameters: {
    otelExport: {
      enabled: true,
      endpoint: 'http://localhost:4318/v1/traces',
      serviceName: 'storybook',
      resourceAttributes: {
        'environment': 'development',
      },
    } as OtelExportConfig,
  },
};

export default preview;
```

## Configuration Options

```typescript
interface OtelExportConfig {
  enabled?: boolean;                    // Default: false
  endpoint?: string;                    // Default: 'http://localhost:4318/v1/traces'
  serviceName?: string;                 // Default: 'storybook'
  resourceAttributes?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;     // Custom headers (e.g., auth)
  timeoutMillis?: number;              // Default: 10000
  maxQueueSize?: number;               // Default: 2048
  maxExportBatchSize?: number;         // Default: 512
  scheduledDelayMillis?: number;       // Default: 5000
}
```

## Per-Story Configuration

Override configuration for specific stories:

```typescript
export default {
  title: 'My Story',
  component: MyComponent,
  parameters: {
    otelExport: {
      serviceName: 'my-specific-service',
      resourceAttributes: {
        'story.name': 'MyComponent',
      },
    },
  },
};
```

## Toolbar Status Indicator

The addon adds a toolbar button showing:
- **Green dot**: Export active and working
- **Gray dot**: Export disabled
- **Red dot**: Initialization error

Hover over the button for detailed status information.

## Requirements

- Storybook 8+ or 10+
- Components instrumented with `@opentelemetry/api`
- OTLP HTTP collector endpoint (e.g., [@principal-ai/otel-collector-server](https://www.npmjs.com/package/@principal-ai/otel-collector-server))

## How It Works

1. The addon initializes the OpenTelemetry Web SDK in Storybook's preview iframe
2. It registers a global `WebTracerProvider` with an OTLP HTTP exporter
3. Components that use `@opentelemetry/api` automatically send traces through the registered provider
4. Traces are batched and sent to the configured OTLP endpoint
5. The toolbar indicator shows real-time connection status

## License

Apache-2.0
