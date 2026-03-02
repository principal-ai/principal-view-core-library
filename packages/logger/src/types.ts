/**
 * Log levels supported by the logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Acceptable metadata value types
 */
export type MetadataValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Error
  | MetadataValue[]
  | Record<string, unknown>;

/**
 * Metadata attached to every log entry
 */
export interface LogMetadata {
  /** Timestamp when log was created */
  timestamp: number;
  /** Log severity level */
  level: LogLevel;
  /** Additional attributes */
  [key: string]: MetadataValue;
}

/**
 * Complete log entry with message, metadata, and arguments
 */
export interface LogEntry {
  /** Log message */
  message: string;
  /** Log metadata including timestamp */
  metadata: LogMetadata;
  /** Additional arguments passed to logger */
  args?: MetadataValue[];
}

/**
 * Configuration options for EnhancedLogger
 */
export interface EnhancedLoggerOptions {
  /** Minimum log level (default: 'info') */
  level?: LogLevel;
  /** Service name for telemetry */
  serviceName?: string;
}

/**
 * Event emitted by EnhancedLogger
 */
export interface LoggerEvent {
  type: 'log';
  entry: LogEntry;
}

/**
 * Transport interface for consuming log events
 */
export interface LogTransport {
  (event: LoggerEvent): void | Promise<void>;
}
