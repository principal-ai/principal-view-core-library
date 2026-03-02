import {
  LogLevel,
  LogEntry,
  LogMetadata,
  MetadataValue,
  EnhancedLoggerOptions,
  LoggerEvent,
  LogTransport,
} from './types';

/**
 * Logger that emits events to registered transports
 */
export class EnhancedLogger {
  private options: { level: LogLevel; serviceName?: string };
  private transports: LogTransport[] = [];

  constructor(options: EnhancedLoggerOptions = {}) {
    this.options = {
      level: options.level || 'info',
      serviceName: options.serviceName,
    };
  }

  /**
   * Add a transport to receive log events
   */
  public addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /**
   * Remove a transport
   */
  public removeTransport(transport: LogTransport): void {
    this.transports = this.transports.filter((t) => t !== transport);
  }

  /**
   * Log a debug message
   */
  public debug(message: string, ...args: MetadataValue[]): void {
    this.log('debug', message, ...args);
  }

  /**
   * Log an info message
   */
  public info(message: string, ...args: MetadataValue[]): void {
    this.log('info', message, ...args);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, ...args: MetadataValue[]): void {
    this.log('warn', message, ...args);
  }

  /**
   * Log an error message
   */
  public error(message: string, ...args: MetadataValue[]): void {
    this.log('error', message, ...args);
  }

  /**
   * Core logging method
   */
  public log(level: LogLevel, message: string, ...args: MetadataValue[]): void {
    // Check if log level is enabled
    if (!this.isLevelEnabled(level)) {
      return;
    }

    const metadata: LogMetadata = {
      timestamp: Date.now(),
      level,
    };

    // Extract attributes from last arg if it's an object
    const lastArg = args[args.length - 1];
    if (lastArg && typeof lastArg === 'object' && !(lastArg instanceof Error)) {
      const attrs = lastArg as Record<string, unknown>;
      // Copy non-internal attributes to metadata
      for (const [key, value] of Object.entries(attrs)) {
        if (value !== undefined) {
          metadata[key] = value as MetadataValue;
        }
      }
      args = args.slice(0, -1);
    }

    const entry: LogEntry = {
      message,
      metadata,
      args: args.length > 0 ? args : undefined,
    };

    // Emit to all transports
    this.emit({ type: 'log', entry });
  }

  /**
   * Check if a log level should be captured
   */
  private isLevelEnabled(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.options.level);
    const messageLevelIndex = levels.indexOf(level);

    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Emit event to all transports
   */
  private emit(event: LoggerEvent): void {
    for (const transport of this.transports) {
      try {
        transport(event);
      } catch (err) {
        // Silently ignore transport errors to avoid breaking logging
        console.error('[EnhancedLogger] Transport error:', err);
      }
    }
  }
}
