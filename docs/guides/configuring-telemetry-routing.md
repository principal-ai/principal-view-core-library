# Configuring Telemetry Routing for Dev Workspace

This guide explains how to configure your project so that OpenTelemetry traces route correctly to storyboards in the dev workspace. It covers both **test telemetry** (bun, vitest, jest) and **Storybook telemetry**.

## Prerequisites

- An existing `.principal-views/` directory with `library.yaml`
- At least one `.otel.canvas` and `.workflow.json` file
- A running OTEL collector (local dev workspace)

## Key Concepts

### Instrumentation Scope

The **instrumentation scope** is the name passed to `trace.getTracer()`. For library instrumentation, this is typically the package name:

```typescript
// In your library's telemetry.ts
export const TRACER_NAME = "@my-org/my-library";

export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME, TRACER_VERSION);
}
```

### Scope Ownership

The dev workspace needs to know which service "owns" which instrumentation scope. This is how it routes traces from a library to the correct storyboards.

For example:
- Library `@backlog-md/core` emits traces with scope `@backlog-md/core`
- Test service `@backlog-md/core-test` declares it owns scope `@backlog-md/core`
- Dev workspace routes traces from that scope to storyboards in the library repo

## Configuration Steps

### 1. Add `scope` to workflow.json

Each workflow file needs to declare which instrumentation scope it handles:

```json
{
  "version": "1.0.0",
  "canvas": ".principal-views/my-feature/my-feature.otel.canvas",
  "scope": "@my-org/my-library",
  "mode": "span-tree",
  "name": "My Feature",
  "description": "Description of the feature",
  "spanPattern": "my-feature.operation",
  "scenarios": [...]
}
```

The `scope` field must match the `TRACER_NAME` used in your library's telemetry code.

### 2. Configure library.yaml Resources

Add a `resources` section to `library.yaml` with your test/storybook services:

```yaml
version: "1.0.0"
name: "@my-org/my-library"
description: "My library description"

resources:
  # Test service configuration
  my-library-test:
    service.name: "@my-org/my-library-test"
    service.version: "1.0.0"
    deployment.environment: "test"
    test.framework: "bun"
    owned-scopes:
      - "@my-org/my-library"

nodeComponents: {}
edgeComponents: {}
```

### 3. Match Service Name in Test Setup

Your test OTEL setup must use the same `service.name` declared in `library.yaml`:

```typescript
// src/test/otel-setup.ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";

export async function setupOTEL(): Promise<void> {
  const exporter = new OTLPTraceExporter({
    url: "http://localhost:4318/v1/traces",
  });

  const resource = resourceFromAttributes({
    // Must match library.yaml resources entry
    [ATTR_SERVICE_NAME]: "@my-org/my-library-test",
    [ATTR_SERVICE_VERSION]: "1.0.0",
    [ATTR_DEPLOYMENT_ENVIRONMENT]: "test",
  });

  const provider = new NodeTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  provider.register();
}
```

## Test Telemetry Setup

### Dependencies

```bash
# Runtime dependency (library instrumentation)
bun add @opentelemetry/api

# Dev dependencies (test infrastructure)
bun add -d @opentelemetry/sdk-trace-node \
           @opentelemetry/exporter-trace-otlp-http \
           @opentelemetry/resources \
           @opentelemetry/semantic-conventions
```

### Complete Test Setup Example

```typescript
// src/test/otel-setup.ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  NodeTracerProvider,
  type NodeTracerConfig,
} from "@opentelemetry/sdk-trace-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";

let tracerProvider: NodeTracerProvider | null = null;

export interface OTELSetupOptions {
  serviceName?: string;
  serviceVersion?: string;
  endpoint?: string;
}

export async function setupOTEL(options: OTELSetupOptions = {}): Promise<void> {
  const endpoint = options.endpoint ?? "http://localhost:4318/v1/traces";
  const serviceName = options.serviceName ?? "@my-org/my-library-test";
  const serviceVersion = options.serviceVersion ?? "1.0.0";

  const exporter = new OTLPTraceExporter({ url: endpoint });

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    [ATTR_DEPLOYMENT_ENVIRONMENT]: "test",
  });

  tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });

  tracerProvider.register();
  console.log(`[OTEL] Initialized, exporting to ${endpoint}`);
}

export async function flushOTEL(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.forceFlush();
  }
}

export async function shutdownOTEL(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
    console.log("[OTEL] Tracer provider shut down");
  }
}
```

### Integration Test Example

```typescript
// src/test/my-feature.otel.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { setupOTEL, shutdownOTEL, flushOTEL } from "./otel-setup";
import { MyLibrary } from "../index";

describe("My feature telemetry", () => {
  beforeAll(async () => {
    await setupOTEL({
      serviceName: "@my-org/my-library-test",
    });
  });

  afterAll(async () => {
    await shutdownOTEL();
  });

  test("emits telemetry events on success", async () => {
    const lib = new MyLibrary();
    await lib.doSomething();

    // Flush to ensure traces are sent before test ends
    await flushOTEL();

    expect(true).toBe(true);
  });
});
```

## Storybook Telemetry Setup

For Storybook, you use the `@principal-ai/storybook-otel-addon` which handles the OTEL setup automatically.

### Dependencies

```bash
bun add -d @principal-ai/storybook-otel-addon
```

### Storybook Configuration

```typescript
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  // ... other config
  addons: [
    "@storybook/addon-essentials",
    "@principal-ai/storybook-otel-addon",
  ],
};

export default config;
```

### Configure Addon

```typescript
// .storybook/preview.ts
import type { Preview } from "@storybook/react";

const preview: Preview = {
  parameters: {
    otel: {
      // Must match library.yaml resources entry
      serviceName: "my-library-storybook",
      serviceVersion: "1.0.0",
      environment: "development",
      endpoint: "http://localhost:4318/v1/traces",
    },
  },
};

export default preview;
```

### library.yaml for Storybook

```yaml
version: "1.0.0"
name: "@my-org/my-library"
description: "My library description"

resources:
  # Storybook service configuration
  my-library-storybook:
    service.name: "my-library-storybook"
    service.version: "1.0.0"
    deployment.environment: "development"
    project: "my-library"
    owned-scopes:
      - "@my-org/my-library"

nodeComponents: {}
edgeComponents: {}
```

## Complete library.yaml Example

Here's a complete example with both test and Storybook services:

```yaml
version: "1.0.0"
name: "@my-org/my-library"
description: "My library description"

resources:
  # Test service - used by bun test / vitest / jest
  my-library-test:
    service.name: "@my-org/my-library-test"
    service.version: "1.0.0"
    deployment.environment: "test"
    test.framework: "bun"
    library.name: "@my-org/my-library"
    owned-scopes:
      - "@my-org/my-library"

  # Storybook service - used by storybook addon
  my-library-storybook:
    service.name: "my-library-storybook"
    service.version: "1.0.0"
    deployment.environment: "development"
    project: "my-library"
    owned-scopes:
      - "@my-org/my-library"

nodeComponents: {}
edgeComponents: {}
```

## How Routing Works

1. **Trace arrives** at dev workspace with:
   - `service.name` from resource attributes (e.g., `@my-org/my-library-test`)
   - Instrumentation scope from span (e.g., `@my-org/my-library`)

2. **Dev workspace** looks up the service in all `library.yaml` files:
   - Finds resource with matching `service.name`
   - Checks `owned-scopes` for the instrumentation scope

3. **Storyboard matching** uses `scope` field in `workflow.json`:
   - Finds workflows where `scope` matches the instrumentation scope
   - Matches `spanPattern` to find the right workflow
   - Applies scenario templates to render the trace

## Validation

After configuring, validate your files:

```bash
# Validate all principal-view files
npx @principal-ai/principal-view-cli validate

# Validate just the library
npx @principal-ai/principal-view-cli validate .principal-views/library.yaml
```

## Troubleshooting

### "No storyboards found for scope"

This means the dev workspace can't find a workflow that matches the incoming trace.

**Check:**
1. `scope` field in `workflow.json` matches your `TRACER_NAME`
2. `owned-scopes` in `library.yaml` resource includes your library scope
3. `service.name` in your OTEL setup matches `library.yaml` resource

### Traces arrive but don't match scenarios

**Check:**
1. `spanPattern` in `workflow.json` matches your span names
2. Events in `template.events` match event names emitted by your code

### Validation errors on library.yaml

**Check:**
1. `owned-scopes` is nested inside a resource entry, not at root level
2. All required fields are present: `version`, `name`, `description`, `resources`, `nodeComponents`, `edgeComponents`

## Related Documentation

- [Adding OpenTelemetry to Tests](./adding-opentelemetry-to-tests.md) - Basic test OTEL setup
- [Library Telemetry and Matching](../LIBRARY_TELEMETRY_AND_MATCHING.md) - Deep dive on matching
- CLI formats: `npx @principal-ai/principal-view-cli formats library`
- CLI formats: `npx @principal-ai/principal-view-cli formats workflow`
