/**
 * Preview decorator - Initializes OpenTelemetry Web SDK
 * Runs in the preview iframe where components render
 */

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { trace } from '@opentelemetry/api';
import { addons } from 'storybook/preview-api';
import { PARAM_KEY, EVENTS } from './constants';
import type { OtelExportConfig, OtelExportStatus } from './types';

// Global state to track initialization
let provider: WebTracerProvider | null = null;
let currentConfig: OtelExportConfig | null = null;
let testTraceListenerRegistered = false;

/**
 * Get default configuration
 */
function getDefaultConfig(): Required<OtelExportConfig> {
  return {
    enabled: false,
    endpoint: 'http://localhost:4318/v1/traces',
    serviceName: 'storybook',
    resourceAttributes: {},
    headers: {},
    timeoutMillis: 10000,
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 1000, // Reduced from 5000ms to 1000ms for faster exports
  };
}

/**
 * Initialize or update the OpenTelemetry provider
 */
function initializeProvider(
  config: Required<OtelExportConfig>,
  channel: any
): void {
  try {
    // Shutdown existing provider if configuration changed
    if (provider && configChanged(currentConfig, config)) {
      console.log('[OTEL Addon] Configuration changed, shutting down existing provider');
      provider.shutdown().catch(console.error);
      provider = null;
    }

    // Don't initialize if disabled
    if (!config.enabled) {
      if (provider) {
        console.log('[OTEL Addon] Export disabled, shutting down provider');
        provider.shutdown().catch(console.error);
        provider = null;
      }
      sendStatusUpdate(channel, config, false);
      return;
    }

    // Skip if already initialized with same config
    if (provider && !configChanged(currentConfig, config)) {
      sendStatusUpdate(channel, config, true);
      return;
    }

    console.log('[OTEL Addon] Initializing OpenTelemetry provider', {
      endpoint: config.endpoint,
      serviceName: config.serviceName,
    });

    // Create resource with service information
    const resource = Resource.default().merge(
      new Resource({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: '1.0.0',
        ...config.resourceAttributes,
      })
    );

    // Create OTLP exporter with logging wrapper
    const baseExporter = new OTLPTraceExporter({
      url: config.endpoint,
      headers: config.headers,
      timeoutMillis: config.timeoutMillis,
    });

    // Wrap exporter to add logging
    const exporter = {
      export: (spans: any, resultCallback: any) => {
        console.log(`[OTEL Addon] Exporting ${spans.length} span(s) to ${config.endpoint}`);
        console.log(`[OTEL Addon] Span names:`, spans.map((s: any) => s.name));
        baseExporter.export(spans, (result: any) => {
          if (result.code === 0) {
            console.log(`[OTEL Addon] Successfully exported ${spans.length} span(s)`);
          } else {
            console.error(`[OTEL Addon] Export failed:`, result.error);
          }
          resultCallback(result);
        });
      },
      shutdown: () => baseExporter.shutdown(),
      forceFlush: () => {
        console.log('[OTEL Addon] Force flush called on exporter');
        return baseExporter.forceFlush ? baseExporter.forceFlush() : Promise.resolve();
      },
    };

    // Create batch span processor
    const processor = new BatchSpanProcessor(exporter as any, {
      maxQueueSize: config.maxQueueSize,
      maxExportBatchSize: config.maxExportBatchSize,
      scheduledDelayMillis: config.scheduledDelayMillis,
    });

    // Create and configure provider
    provider = new WebTracerProvider({ resource });
    provider.addSpanProcessor(processor);

    // Register the provider globally
    provider.register({
      contextManager: new ZoneContextManager(),
    });

    // Force flush on page unload to ensure pending spans are exported
    if (typeof window !== 'undefined') {
      const handleBeforeUnload = () => {
        console.log('[OTEL Addon] Flushing pending spans before unload');
        provider?.forceFlush().catch(console.error);
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('pagehide', handleBeforeUnload);
    }

    currentConfig = config;

    console.log('[OTEL Addon] Provider initialized and registered successfully');

    // Test that the provider is working by getting the global tracer
    if (typeof window !== 'undefined') {
      (window as any).__otelProvider = provider;
      (window as any).__otelForceFlush = () => {
        console.log('[OTEL Addon] Manual force flush triggered');
        return provider?.forceFlush().then(() => {
          console.log('[OTEL Addon] Force flush completed');
        });
      };
    }

    // Log when spans are created
    console.log('[OTEL Addon] Tip: Check Network tab for POST to /v1/traces (batched every ~1 second)');
    console.log('[OTEL Addon] To manually flush: __otelForceFlush()');

    sendStatusUpdate(channel, config, true);

    // Emit ready event
    channel.emit(EVENTS.PROVIDER_READY, {
      endpoint: config.endpoint,
      serviceName: config.serviceName,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[OTEL Addon] Failed to initialize provider:', error);

    sendStatusUpdate(channel, config, false, errorMessage);

    // Emit error event
    channel.emit(EVENTS.PROVIDER_ERROR, { error: errorMessage });
  }
}

/**
 * Check if configuration has changed
 */
function configChanged(
  oldConfig: OtelExportConfig | null,
  newConfig: OtelExportConfig
): boolean {
  if (!oldConfig) return true;

  return (
    oldConfig.enabled !== newConfig.enabled ||
    oldConfig.endpoint !== newConfig.endpoint ||
    oldConfig.serviceName !== newConfig.serviceName ||
    JSON.stringify(oldConfig.headers) !== JSON.stringify(newConfig.headers) ||
    JSON.stringify(oldConfig.resourceAttributes) !== JSON.stringify(newConfig.resourceAttributes)
  );
}

/**
 * Send status update to manager UI
 */
function sendStatusUpdate(
  channel: any,
  config: Required<OtelExportConfig>,
  ready: boolean,
  error?: string
): void {
  const status: OtelExportStatus = {
    ready,
    enabled: config.enabled,
    endpoint: config.endpoint,
    serviceName: config.serviceName,
    error,
  };

  channel.emit(EVENTS.STATUS_UPDATE, status);
}

/**
 * Send a test trace to verify the connection is working
 */
function sendTestTrace(): void {
  if (!provider) {
    console.warn('[OTEL Addon] Cannot send test trace: provider not initialized');
    return;
  }

  const tracer = trace.getTracer('storybook-addon-otel-test');
  const span = tracer.startSpan('test-trace', {
    attributes: {
      'test.type': 'connection-verification',
      'test.timestamp': new Date().toISOString(),
    },
  });

  console.log('[OTEL Addon] Sending test trace...');

  // End the span immediately
  span.end();

  // Force flush to send it right away
  provider.forceFlush().then(() => {
    console.log('[OTEL Addon] Test trace sent and flushed successfully');
  }).catch((err) => {
    console.error('[OTEL Addon] Failed to flush test trace:', err);
  });
}

/**
 * Register listener for test trace event from manager
 */
function registerTestTraceListener(channel: any): void {
  if (testTraceListenerRegistered) return;

  channel.on(EVENTS.SEND_TEST_TRACE, () => {
    sendTestTrace();
  });

  testTraceListenerRegistered = true;
}

/**
 * Decorator that initializes OTEL on each story render
 */
export const withOtelExport = (storyFn: any, context: any) => {
  // Get configuration from parameters
  const userConfig = context.parameters[PARAM_KEY] as OtelExportConfig | undefined;
  const config = { ...getDefaultConfig(), ...userConfig };

  // Initialize provider with current config
  if (typeof window !== 'undefined') {
    const channel = addons.getChannel();

    if (channel) {
      initializeProvider(config, channel);
      registerTestTraceListener(channel);
    }
  }

  // Render the story normally
  return storyFn();
};

/**
 * Preview annotations export for preset
 */
export const decorators = [withOtelExport];
