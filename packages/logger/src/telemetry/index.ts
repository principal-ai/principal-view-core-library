/**
 * Telemetry module - OpenTelemetry integration
 */

export {
  setupTelemetry,
  getTelemetryContext,
  getStoredTelemetryConfig,
  isTelemetryEnabled,
  getTracer,
  shutdownTelemetry,
} from './setup';

export type {
  TelemetryConfig,
  TelemetryContext,
  StoredTelemetryConfig,
} from './types';
