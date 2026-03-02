import { EnhancedLogger } from './EnhancedLogger';
import { EnhancedLoggerOptions } from './types';
import { isTelemetryEnabled } from './telemetry';
import { createOTelTransport } from './transports/OTelTransport';

/**
 * Extended options for createLogger
 */
export interface CreateLoggerOptions extends EnhancedLoggerOptions {
  /**
   * Disable automatic OTel transport attachment
   * @default false
   */
  disableOTelTransport?: boolean;

  /**
   * Disable default console transport
   * @default false
   */
  disableConsoleTransport?: boolean;
}

/**
 * Create a logger instance
 *
 * When telemetry is configured via setupTelemetry(), an OTel transport
 * is automatically attached to send logs to the OTLP endpoint.
 *
 * @example
 * ```typescript
 * import { setupTelemetry, createLogger } from '@principal-ai/principal-view-logger';
 *
 * setupTelemetry({
 *   endpoint: 'http://localhost:4318',
 *   serviceName: 'my-app'
 * });
 *
 * const logger = createLogger();
 * logger.info('Hello world');
 * ```
 */
export function createLogger(options: CreateLoggerOptions = {}): EnhancedLogger {
  const {
    disableOTelTransport = false,
    disableConsoleTransport = false,
    ...loggerOptions
  } = options;

  const logger = new EnhancedLogger(loggerOptions);

  // Add default console transport unless disabled
  if (!disableConsoleTransport) {
    logger.addTransport(({ entry }) => {
      const { message, metadata, args = [] } = entry;
      const timestamp = new Date(metadata.timestamp).toISOString();
      const prefix = `[${timestamp}] [${metadata.level.toUpperCase()}]`;

      console.log(prefix, message, ...args);
    });
  }

  // Auto-attach OTel transport if telemetry is enabled
  if (!disableOTelTransport && isTelemetryEnabled()) {
    logger.addTransport(createOTelTransport());
  }

  return logger;
}
