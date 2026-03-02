/**
 * @principal-ai/principal-view-logger
 *
 * Logger with OpenTelemetry integration for easy telemetry export
 */

// Core logger
export { EnhancedLogger } from './EnhancedLogger';
export { createLogger } from './wrappers';
export type { CreateLoggerOptions } from './wrappers';

// Types
export type {
  LogLevel,
  LogMetadata,
  LogEntry,
  EnhancedLoggerOptions,
  LoggerEvent,
  LogTransport,
  MetadataValue,
} from './types';

// OTel transport
export { createOTelTransport } from './transports';
export type { OTelTransportOptions } from './transports';

// Telemetry (OpenTelemetry integration)
export {
  setupTelemetry,
  getTelemetryContext,
  getTracer,
  shutdownTelemetry,
  isTelemetryEnabled,
} from './telemetry';
export type { TelemetryConfig, TelemetryContext } from './telemetry';
