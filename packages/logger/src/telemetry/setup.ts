/**
 * OpenTelemetry setup for unified trace and log export
 */

import type { Tracer } from '@opentelemetry/api';
import type { Logger as OTelLogger } from '@opentelemetry/api-logs';
import type {
  TelemetryConfig,
  TelemetryContext,
  StoredTelemetryConfig,
} from './types';

// Global telemetry state
let globalTelemetryContext: TelemetryContext | null = null;
let storedConfig: StoredTelemetryConfig | null = null;

/**
 * Try to require a module, returning null if not available
 */
function tryRequire<T>(moduleName: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(moduleName) as T;
  } catch {
    return null;
  }
}

/**
 * Create a no-op telemetry context when OTel packages are not installed
 */
function createNoopContext(config: TelemetryConfig): TelemetryContext {
  const noopTracer = {
    startSpan: () => ({
      end: () => {},
      setAttribute: () => {},
      setAttributes: () => {},
      addEvent: () => {},
      setStatus: () => {},
      recordException: () => {},
      isRecording: () => false,
      spanContext: () => ({
        traceId: '',
        spanId: '',
        traceFlags: 0,
      }),
      updateName: () => {},
    }),
    startActiveSpan: (_name: string, fn: (span: unknown) => unknown) => fn({}),
  } as unknown as Tracer;

  const noopLogger = {
    emit: () => {},
  } as unknown as OTelLogger;

  return {
    serviceName: config.serviceName,
    getTracer: () => noopTracer,
    getOTelLogger: () => noopLogger,
    shutdown: async () => {},
    forceFlush: async () => {},
    isEnabled: () => false,
  };
}

/**
 * Initialize OpenTelemetry with unified trace and log export
 *
 * @example
 * ```typescript
 * import { setupTelemetry, getTracer, createLogger } from '@principal-ai/principal-view-logger';
 *
 * setupTelemetry({
 *   endpoint: 'http://localhost:4318',
 *   serviceName: 'my-app'
 * });
 *
 * const tracer = getTracer();
 * const logger = createLogger(); // Auto-sends logs to OTel
 * ```
 */
export function setupTelemetry(config: TelemetryConfig): TelemetryContext {
  // Validate required fields
  if (!config.serviceName) {
    throw new Error('setupTelemetry requires serviceName');
  }

  // Try to load OTel packages
  const otelApi = tryRequire<typeof import('@opentelemetry/api')>(
    '@opentelemetry/api'
  );
  const otelApiLogs = tryRequire<typeof import('@opentelemetry/api-logs')>(
    '@opentelemetry/api-logs'
  );
  const otelSdkTracerNode =
    tryRequire<typeof import('@opentelemetry/sdk-trace-node')>(
      '@opentelemetry/sdk-trace-node'
    );
  const otelSdkTracerBase =
    tryRequire<typeof import('@opentelemetry/sdk-trace-base')>(
      '@opentelemetry/sdk-trace-base'
    );
  const otelSdkLogs = tryRequire<typeof import('@opentelemetry/sdk-logs')>(
    '@opentelemetry/sdk-logs'
  );
  const otelExporterTraceOtlpHttp =
    tryRequire<typeof import('@opentelemetry/exporter-trace-otlp-http')>(
      '@opentelemetry/exporter-trace-otlp-http'
    );
  const otelExporterLogsOtlpHttp =
    tryRequire<typeof import('@opentelemetry/exporter-logs-otlp-http')>(
      '@opentelemetry/exporter-logs-otlp-http'
    );
  const otelResources = tryRequire<typeof import('@opentelemetry/resources')>(
    '@opentelemetry/resources'
  );

  // Check if required packages are available
  if (!otelApi || !otelApiLogs) {
    console.warn(
      '[principal-view-logger] OpenTelemetry packages not found. Install @opentelemetry/api and @opentelemetry/api-logs for telemetry support.'
    );
    storedConfig = {
      autoAttachToLoggers: false,
      serviceName: config.serviceName,
    };
    globalTelemetryContext = createNoopContext(config);
    return globalTelemetryContext;
  }

  const endpoint = config.endpoint ?? 'http://localhost:4318';
  const enableTracing = config.enableTracing ?? true;
  const enableLogs = config.enableLogs ?? true;

  // Build resource attributes using standard attribute names
  const resourceAttributes: Record<string, string | number | boolean> = {
    'service.name': config.serviceName,
    ...(config.resourceAttributes ?? {}),
  };

  if (config.serviceVersion) {
    resourceAttributes['service.version'] = config.serviceVersion;
  }
  if (config.environment) {
    resourceAttributes['deployment.environment'] = config.environment;
  }

  // Create resource
  let resource: unknown;
  if (otelResources) {
    // Use Resource class constructor with attributes
    resource = new otelResources.Resource(resourceAttributes);
  }

  // Track providers for shutdown
  let tracerProvider: { shutdown: () => Promise<void>; forceFlush: () => Promise<void> } | null = null;
  let loggerProvider: { shutdown: () => Promise<void>; forceFlush: () => Promise<void> } | null = null;

  // Setup trace provider
  if (enableTracing && otelSdkTracerNode && otelSdkTracerBase && otelExporterTraceOtlpHttp) {
    const traceExporter = new otelExporterTraceOtlpHttp.OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
      headers: config.headers,
    });

    const provider = new otelSdkTracerNode.NodeTracerProvider({
      resource: resource as import('@opentelemetry/resources').IResource,
      spanProcessors: [new otelSdkTracerBase.SimpleSpanProcessor(traceExporter)],
    });

    provider.register();
    tracerProvider = provider;

    console.log(`[principal-view-logger] Trace provider initialized, exporting to ${endpoint}/v1/traces`);
  }

  // Setup log provider
  if (enableLogs && otelSdkLogs && otelExporterLogsOtlpHttp) {
    const logExporter = new otelExporterLogsOtlpHttp.OTLPLogExporter({
      url: `${endpoint}/v1/logs`,
      headers: config.headers,
    });

    const provider = new otelSdkLogs.LoggerProvider({
      resource: resource as import('@opentelemetry/resources').IResource,
    });

    provider.addLogRecordProcessor(
      new otelSdkLogs.SimpleLogRecordProcessor(logExporter)
    );

    otelApiLogs.logs.setGlobalLoggerProvider(provider);
    loggerProvider = provider;

    console.log(`[principal-view-logger] Log provider initialized, exporting to ${endpoint}/v1/logs`);
  }

  // Create context
  const ctx: TelemetryContext = {
    serviceName: config.serviceName,
    getTracer: (name?: string, version?: string) =>
      otelApi.trace.getTracer(name ?? config.serviceName, version),
    getOTelLogger: (name?: string, version?: string) =>
      otelApiLogs.logs.getLogger(name ?? config.serviceName, version),
    shutdown: async () => {
      await tracerProvider?.shutdown();
      await loggerProvider?.shutdown();
      globalTelemetryContext = null;
      storedConfig = null;
      otelApi.trace.disable();
    },
    forceFlush: async () => {
      await tracerProvider?.forceFlush();
      await loggerProvider?.forceFlush();
    },
    isEnabled: () => true,
  };

  // Store for global access
  globalTelemetryContext = ctx;
  storedConfig = {
    autoAttachToLoggers: config.autoAttachToLoggers ?? true,
    serviceName: config.serviceName,
  };

  return ctx;
}

/**
 * Get the global telemetry context, or null if not initialized
 */
export function getTelemetryContext(): TelemetryContext | null {
  return globalTelemetryContext;
}

/**
 * Get stored telemetry config for auto-attach behavior
 */
export function getStoredTelemetryConfig(): StoredTelemetryConfig | null {
  return storedConfig;
}

/**
 * Check if telemetry is enabled and auto-attach is configured
 */
export function isTelemetryEnabled(): boolean {
  return storedConfig?.autoAttachToLoggers ?? false;
}

/**
 * Convenience: Get a tracer from the global context
 *
 * @example
 * ```typescript
 * const tracer = getTracer();
 * const span = tracer.startSpan('my-operation');
 * span.end();
 * ```
 */
export function getTracer(name?: string, version?: string): Tracer {
  const ctx = getTelemetryContext();
  if (!ctx) {
    // Try to get a no-op tracer from OTel API
    const otelApi = tryRequire<typeof import('@opentelemetry/api')>(
      '@opentelemetry/api'
    );
    if (otelApi) {
      return otelApi.trace.getTracer(name ?? 'unknown');
    }
    throw new Error(
      'setupTelemetry() must be called before getTracer(), or install @opentelemetry/api'
    );
  }
  return ctx.getTracer(name, version);
}

/**
 * Shutdown telemetry and flush pending data
 */
export async function shutdownTelemetry(): Promise<void> {
  const ctx = getTelemetryContext();
  if (ctx) {
    await ctx.shutdown();
  }
}
