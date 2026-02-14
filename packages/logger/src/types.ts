/**
 * Log levels supported by the enhanced logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Acceptable metadata value types
 */
export type MetadataValue = string | number | boolean | null | undefined | Error | Record<string, unknown>;

/**
 * Source location information extracted from stack trace
 */
export interface SourceLocation {
  /** Relative file path from project root (e.g., "lib/lock-manager.ts") */
  file: string;
  /** Line number where log was called */
  line?: number;
  /** Column number where log was called */
  column?: number;
  /** Function name if available */
  functionName?: string;
}

/**
 * Metadata attached to every log entry
 */
export interface LogMetadata {
  /** Timestamp when log was created */
  timestamp: number;
  /** Log severity level */
  level: LogLevel;
  /** Source location where log was called */
  source?: SourceLocation;
  /**
   * Instance identifier for multi-instance components.
   * Used to differentiate between multiple nodes of the same type
   * (e.g., "client-1", "client-2" for components of type "client").
   * If not provided, events will target the node type rather than a specific instance.
   */
  instanceId?: string;
  /** Additional custom metadata */
  [key: string]: MetadataValue;
}

/**
 * Complete log entry with message, metadata, and arguments
 */
export interface LogEntry {
  /** Log message */
  message: string;
  /** Log metadata including source and timestamp */
  metadata: LogMetadata;
  /** Additional arguments passed to logger */
  args?: MetadataValue[];
}

/**
 * Configuration options for EnhancedLogger
 */
export interface EnhancedLoggerOptions {
  /** Project root directory for normalizing paths */
  projectRoot?: string;
  /** Whether to capture source locations (default: true) */
  captureSource?: boolean;
  /** Custom log level (default: 'info') */
  level?: LogLevel;
  /** Whether to enable sampling (1/N logs) */
  samplingRate?: number;
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
