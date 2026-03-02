/**
 * Telemetry types for OpenTelemetry integration
 */

import type { Tracer } from '@opentelemetry/api';
import type { Logger as OTelLogger } from '@opentelemetry/api-logs';

/**
 * Configuration for unified telemetry setup
 */
export interface TelemetryConfig {
  /**
   * OTLP endpoint base URL
   * @default 'http://localhost:4318'
   */
  endpoint?: string;

  /**
   * Service name for resource attribution (required)
   */
  serviceName: string;

  /**
   * Service version
   */
  serviceVersion?: string;

  /**
   * Deployment environment (e.g., 'development', 'production')
   */
  environment?: string;

  /**
   * Additional resource attributes
   */
  resourceAttributes?: Record<string, string | number | boolean>;

  /**
   * Auto-attach OTel transport to new loggers created via createLogger()
   * @default true
   */
  autoAttachToLoggers?: boolean;

  /**
   * Enable trace export
   * @default true
   */
  enableTracing?: boolean;

  /**
   * Enable log export
   * @default true
   */
  enableLogs?: boolean;

  /**
   * Headers to send with OTLP requests
   */
  headers?: Record<string, string>;
}

/**
 * Active telemetry context returned by setupTelemetry()
 */
export interface TelemetryContext {
  /**
   * Configured service name
   */
  serviceName: string;

  /**
   * Get a tracer for creating spans
   */
  getTracer: (name?: string, version?: string) => Tracer;

  /**
   * Get an OTel logger for emitting OTLP logs directly
   */
  getOTelLogger: (name?: string, version?: string) => OTelLogger;

  /**
   * Shutdown all providers gracefully
   */
  shutdown: () => Promise<void>;

  /**
   * Force flush all pending telemetry
   */
  forceFlush: () => Promise<void>;

  /**
   * Check if telemetry is enabled
   */
  isEnabled: () => boolean;
}

/**
 * Internal stored config for auto-attach behavior
 */
export interface StoredTelemetryConfig {
  autoAttachToLoggers: boolean;
  serviceName: string;
}
