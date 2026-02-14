import { EnhancedLogger } from './EnhancedLogger';
import { EnhancedLoggerOptions, LogEntry, MetadataValue } from './types';

/**
 * Interface for any logger object with standard log methods
 */
interface LoggerLike {
  debug?: (...args: MetadataValue[]) => void;
  info?: (...args: MetadataValue[]) => void;
  warn?: (...args: MetadataValue[]) => void;
  error?: (...args: MetadataValue[]) => void;
  log?: (level: string, ...args: MetadataValue[]) => void;
  _vvfLogger?: EnhancedLogger;
  [key: string]: unknown;
}

/**
 * Wrapper for any logger that follows console.log interface
 */
export function wrapConsoleLogger(
  logger: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>,
  options: EnhancedLoggerOptions = {}
): EnhancedLogger {
  const enhancedLogger = new EnhancedLogger(options);

  // Add transport that forwards to original logger
  enhancedLogger.addTransport(({ entry }) => {
    const { message, metadata, args = [] } = entry;
    const allArgs = [message, ...args];

    // Call original logger method
    switch (metadata.level) {
      case 'debug':
        logger.debug(...allArgs);
        break;
      case 'info':
        logger.info(...allArgs);
        break;
      case 'warn':
        logger.warn(...allArgs);
        break;
      case 'error':
        logger.error(...allArgs);
        break;
    }
  });

  return enhancedLogger;
}

/**
 * Generic wrapper that intercepts existing logger methods
 * Works with winston, bunyan, pino, and most other loggers
 */
export function enhanceLogger<T extends LoggerLike>(
  logger: T,
  options: EnhancedLoggerOptions = {}
): T {
  const enhancedLogger = new EnhancedLogger(options);

  // Store original methods
  const originalMethods = {
    debug: logger.debug?.bind(logger),
    info: logger.info?.bind(logger),
    warn: logger.warn?.bind(logger),
    error: logger.error?.bind(logger),
    log: logger.log?.bind(logger),
  };

  // Add transport that forwards to original logger
  enhancedLogger.addTransport(({ entry }) => {
    const { message, metadata, args = [] } = entry;
    const allArgs = [message, ...args];

    // Call original logger method if it exists
    const method = originalMethods[metadata.level];
    if (method) {
      method(...allArgs);
    } else if (originalMethods.log) {
      originalMethods.log(metadata.level, ...allArgs);
    }
  });

  // Intercept logger methods
  const methodsToWrap = ['debug', 'info', 'warn', 'error'] as const;

  methodsToWrap.forEach((method) => {
    if (logger[method]) {
      logger[method] = function (...args: MetadataValue[]) {
        // Call enhanced logger (captures source)
        enhancedLogger[method](...args);
      };
    }
  });

  // Store enhanced logger instance on the wrapped logger
  logger._vvfLogger = enhancedLogger;

  return logger;
}

/**
 * Get the EnhancedLogger instance from a wrapped logger
 */
export function getEnhancedLogger<T extends LoggerLike>(
  logger: T
): EnhancedLogger | undefined {
  return logger._vvfLogger;
}

/**
 * Create a standalone enhanced logger (not wrapping existing logger)
 */
export function createLogger(options: EnhancedLoggerOptions = {}): EnhancedLogger {
  const logger = new EnhancedLogger(options);

  // Add default console transport
  logger.addTransport(({ entry }) => {
    const { message, metadata, args = [] } = entry;
    const timestamp = new Date(metadata.timestamp).toISOString();
    const source = metadata.source ? ` [${metadata.source.file}:${metadata.source.line}]` : '';
    const prefix = `[${timestamp}] [${metadata.level.toUpperCase()}]${source}`;

    console.log(prefix, message, ...args);
  });

  return logger;
}

/**
 * Create a transport that sends logs to Visual Validation Framework
 */
export function createVVFTransport(onLog: (entry: LogEntry) => void | Promise<void>) {
  return ({ entry }: { type: 'log'; entry: LogEntry }) => {
    onLog(entry);
  };
}
