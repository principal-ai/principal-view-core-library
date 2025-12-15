import { SourceCapture } from './SourceCapture';
import {
  LogLevel,
  LogEntry,
  LogMetadata,
  EnhancedLoggerOptions,
  LoggerEvent,
  LogTransport,
} from './types';

/**
 * Enhanced logger that automatically captures source location from stack traces
 */
export class EnhancedLogger {
  private sourceCapture: SourceCapture;
  private options: Required<EnhancedLoggerOptions>;
  private transports: LogTransport[] = [];
  private sampleCounter: number = 0;

  constructor(options: EnhancedLoggerOptions = {}) {
    this.options = {
      projectRoot: options.projectRoot || process.cwd(),
      captureSource: options.captureSource ?? true,
      level: options.level || 'info',
      samplingRate: options.samplingRate || 1, // Default: capture all logs
    };

    this.sourceCapture = new SourceCapture(this.options.projectRoot);
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
  public debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  /**
   * Log an info message
   */
  public info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  /**
   * Log an error message
   */
  public error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }

  /**
   * Core logging method
   */
  public log(level: LogLevel, message: string, ...args: any[]): void {
    // Check if log level is enabled
    if (!this.isLevelEnabled(level)) {
      return;
    }

    // Apply sampling if configured
    if (!this.shouldSample()) {
      return;
    }

    // Capture source location (skip 2 frames: Error + this log method)
    const source = this.options.captureSource ? this.sourceCapture.capture(2) : undefined;

    // Extract metadata from args if present
    const metadata: LogMetadata = {
      timestamp: Date.now(),
      level,
      source,
    };

    // If last arg is an object with VVF metadata fields, extract them
    const lastArg = args[args.length - 1];
    if (lastArg && typeof lastArg === 'object') {
      let hasVvfMetadata = false;

      // Extract source override
      if (lastArg._vvfSource) {
        metadata.source = {
          file: lastArg._vvfSource,
          line: lastArg._vvfLine,
          column: lastArg._vvfColumn,
        };
        hasVvfMetadata = true;
      }

      // Extract instance ID for multi-instance component tracking
      if (lastArg._vvfInstanceId) {
        metadata.instanceId = lastArg._vvfInstanceId;
        hasVvfMetadata = true;
      }

      // Remove the metadata arg if it contained VVF fields
      if (hasVvfMetadata) {
        args = args.slice(0, -1);
      }
    }

    const entry: LogEntry = {
      message,
      metadata,
      args,
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
   * Check if this log should be sampled (captured)
   */
  private shouldSample(): boolean {
    if (this.options.samplingRate === 1) {
      return true; // No sampling, capture all
    }

    this.sampleCounter++;

    if (this.sampleCounter >= this.options.samplingRate) {
      this.sampleCounter = 0;
      return true;
    }

    return false;
  }

  /**
   * Emit event to all transports
   */
  private emit(event: LoggerEvent): void {
    for (const transport of this.transports) {
      try {
        transport(event);
      } catch (error) {
        // Silently fail if transport throws - we don't want logging to break the app
        console.error('Transport error:', error);
      }
    }
  }
}
