/**
 * @principal-ai/visual-validation-logger
 *
 * Enhanced logger with automatic source path capture for visual validation framework
 */

export { EnhancedLogger } from './EnhancedLogger';
export { SourceCapture } from './SourceCapture';
export {
  enhanceLogger,
  wrapConsoleLogger,
  createLogger,
  createVVFTransport,
  getEnhancedLogger
} from './wrappers';

export type {
  LogLevel,
  SourceLocation,
  LogMetadata,
  LogEntry,
  EnhancedLoggerOptions,
  LoggerEvent,
  LogTransport
} from './types';

// Transports
export {
  createRecorderTransport,
  createBufferedRecorderTransport,
  WebSocketTransport,
  createWebSocketTransport,
} from './transports';
export type {
  LogReceiver,
  RecorderTransportOptions,
  ConnectionState,
  WebSocketTransportOptions,
} from './transports';
