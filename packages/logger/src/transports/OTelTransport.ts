/**
 * OTelTransport - OpenTelemetry log transport
 *
 * Sends logs to an OTLP endpoint via the configured LoggerProvider.
 */

import type { LoggerEvent, LogTransport } from '../types';
import { getTelemetryContext } from '../telemetry';
import type { Logger as OTelLogger } from '@opentelemetry/api-logs';

/**
 * OTel severity numbers for log levels
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
const SEVERITY_MAP: Record<string, number> = {
  debug: 5, // DEBUG
  info: 9, // INFO
  warn: 13, // WARN
  error: 17, // ERROR
};

/**
 * Configuration for OTel log transport
 */
export interface OTelTransportOptions {
  /**
   * Custom logger name (default: uses service name from telemetry setup)
   */
  loggerName?: string;

  /**
   * Logger version
   */
  loggerVersion?: string;

  /**
   * Include additional args as attributes
   * @default false
   */
  includeArgs?: boolean;

  /**
   * Filter function to selectively forward logs
   */
  filter?: (event: LoggerEvent) => boolean;
}

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
 * Creates a transport that sends logs to OTLP endpoint
 *
 * Requires setupTelemetry() to be called first.
 *
 * @example
 * ```typescript
 * import { setupTelemetry, createLogger, createOTelTransport } from '@principal-ai/principal-view-logger';
 *
 * setupTelemetry({
 *   endpoint: 'http://localhost:4318',
 *   serviceName: 'my-app'
 * });
 *
 * const logger = createLogger();
 * // OTel transport is auto-attached when telemetry is configured
 *
 * // Or manually add it:
 * const transport = createOTelTransport();
 * logger.addTransport(transport);
 * ```
 */
export function createOTelTransport(
  options: OTelTransportOptions = {}
): LogTransport {
  const { loggerName, loggerVersion, includeArgs = false, filter } = options;

  // Lazy-loaded OTel logger instance
  let otelLogger: OTelLogger | null = null;
  let traceApi: typeof import('@opentelemetry/api') | null = null;

  const getLogger = (): OTelLogger | null => {
    if (otelLogger) return otelLogger;

    const ctx = getTelemetryContext();
    if (!ctx || !ctx.isEnabled()) return null;

    otelLogger = ctx.getOTelLogger(loggerName, loggerVersion);
    return otelLogger;
  };

  const getTraceApi = (): typeof import('@opentelemetry/api') | null => {
    if (traceApi) return traceApi;
    traceApi = tryRequire<typeof import('@opentelemetry/api')>(
      '@opentelemetry/api'
    );
    return traceApi;
  };

  return (event: LoggerEvent) => {
    // Apply filter if provided
    if (filter && !filter(event)) {
      return;
    }

    const logger = getLogger();
    if (!logger) return; // OTel not initialized, silently skip

    const { entry } = event;
    const { message, metadata, args } = entry;

    // Build attributes from metadata
    const attributes: Record<string, string | number | boolean> = {};

    // Add all metadata as attributes (excluding standard fields)
    const excludeKeys = new Set(['timestamp', 'level']);
    for (const [key, value] of Object.entries(metadata)) {
      if (excludeKeys.has(key)) continue;
      if (value !== null && value !== undefined) {
        if (typeof value === 'object') {
          attributes[key] = JSON.stringify(value);
        } else {
          attributes[key] = value as string | number | boolean;
        }
      }
    }

    // Optionally include args
    if (includeArgs && args && args.length > 0) {
      attributes['log.args'] = JSON.stringify(args);
    }

    // Get active span context for log correlation
    const api = getTraceApi();
    if (api) {
      const activeSpan = api.trace.getSpan(api.context.active());
      if (activeSpan) {
        const spanContext = activeSpan.spanContext();
        attributes['trace.id'] = spanContext.traceId;
        attributes['span.id'] = spanContext.spanId;
      }
    }

    // Emit log record
    logger.emit({
      severityNumber: SEVERITY_MAP[metadata.level] ?? 9,
      severityText: metadata.level.toUpperCase(),
      body: message,
      attributes,
      timestamp: metadata.timestamp,
    });
  };
}
