/**
 * RecorderTransport - Direct transport for EventRecorderService
 *
 * Use this transport when the EventRecorderService is in the same process.
 * For remote recording, use WebSocketTransport instead.
 */

import type { LoggerEvent, LogTransport } from '../types';

/**
 * Callback type for receiving log entries
 * Compatible with EventRecorderService.processLog()
 */
export type LogReceiver = (log: {
  message: string;
  metadata: {
    timestamp: number;
    level: string;
    source?: {
      file: string;
      line?: number;
      column?: number;
    };
    instanceId?: string;
    [key: string]: any;
  };
}) => void;

/**
 * Configuration for RecorderTransport
 */
export interface RecorderTransportOptions {
  /** Callback to receive log entries */
  onLog: LogReceiver;

  /** Whether to include args in the log (default: false) */
  includeArgs?: boolean;

  /** Filter function to selectively forward logs (default: forward all) */
  filter?: (event: LoggerEvent) => boolean;
}

/**
 * Creates a transport that forwards logs to a callback
 *
 * @example
 * ```typescript
 * const service = new EventRecorderService({ graphConfig });
 *
 * const transport = createRecorderTransport({
 *   onLog: (log) => service.processLog(log),
 * });
 *
 * logger.addTransport(transport);
 * ```
 */
export function createRecorderTransport(options: RecorderTransportOptions): LogTransport {
  const { onLog, includeArgs = false, filter } = options;

  return (event: LoggerEvent) => {
    // Apply filter if provided
    if (filter && !filter(event)) {
      return;
    }

    const { entry } = event;

    // Build the log object compatible with EventRecorderService
    const log: Parameters<LogReceiver>[0] = {
      message: entry.message,
      metadata: {
        timestamp: entry.metadata.timestamp,
        level: entry.metadata.level,
        source: entry.metadata.source,
        instanceId: entry.metadata.instanceId,
      },
    };

    // Optionally include args
    if (includeArgs && entry.args && entry.args.length > 0) {
      log.metadata.args = entry.args;
    }

    onLog(log);
  };
}

/**
 * Creates a transport that buffers logs and flushes them periodically
 *
 * Useful for reducing overhead when logging at high frequency.
 *
 * @example
 * ```typescript
 * const transport = createBufferedRecorderTransport({
 *   onFlush: (logs) => service.processLogs(logs),
 *   flushIntervalMs: 100,
 *   maxBufferSize: 50,
 * });
 *
 * logger.addTransport(transport);
 *
 * // Don't forget to dispose when done
 * transport.dispose();
 * ```
 */
export function createBufferedRecorderTransport(options: {
  onFlush: (logs: Array<Parameters<LogReceiver>[0]>) => void;
  flushIntervalMs?: number;
  maxBufferSize?: number;
  filter?: (event: LoggerEvent) => boolean;
  includeArgs?: boolean;
}): LogTransport & { dispose: () => void; flush: () => void } {
  const {
    onFlush,
    flushIntervalMs = 100,
    maxBufferSize = 100,
    filter,
    includeArgs = false,
  } = options;

  let buffer: Array<Parameters<LogReceiver>[0]> = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;

  const flush = () => {
    if (buffer.length > 0) {
      const logs = buffer;
      buffer = [];
      onFlush(logs);
    }
  };

  // Start flush timer
  flushTimer = setInterval(flush, flushIntervalMs);

  const transport = (event: LoggerEvent) => {
    // Apply filter if provided
    if (filter && !filter(event)) {
      return;
    }

    const { entry } = event;

    const log: Parameters<LogReceiver>[0] = {
      message: entry.message,
      metadata: {
        timestamp: entry.metadata.timestamp,
        level: entry.metadata.level,
        source: entry.metadata.source,
        instanceId: entry.metadata.instanceId,
      },
    };

    if (includeArgs && entry.args && entry.args.length > 0) {
      log.metadata.args = entry.args;
    }

    buffer.push(log);

    // Flush if buffer is full
    if (buffer.length >= maxBufferSize) {
      flush();
    }
  };

  // Add dispose and flush methods
  (transport as any).dispose = () => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    flush(); // Final flush
  };

  (transport as any).flush = flush;

  return transport as LogTransport & { dispose: () => void; flush: () => void };
}
