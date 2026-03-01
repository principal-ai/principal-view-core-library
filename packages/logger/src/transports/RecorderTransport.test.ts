import { describe, it, expect } from 'bun:test';
import { createRecorderTransport, createBufferedRecorderTransport, type LogReceiver } from './RecorderTransport';
import type { LoggerEvent } from '../types';

describe('RecorderTransport', () => {
  describe('createRecorderTransport', () => {
    it('should forward log events to the callback', () => {
      const receivedLogs: Array<Parameters<LogReceiver>[0]> = [];
      const transport = createRecorderTransport({
        onLog: (log) => receivedLogs.push(log),
      });

      const event: LoggerEvent = {
        type: 'log',
        entry: {
          message: 'Test message',
          metadata: {
            timestamp: 1234567890,
            level: 'info',
            source: { file: 'test.ts', line: 42 },
          },
        },
      };

      transport(event);

      expect(receivedLogs).toHaveLength(1);
      expect(receivedLogs[0].message).toBe('Test message');
      expect(receivedLogs[0].metadata.timestamp).toBe(1234567890);
      expect(receivedLogs[0].metadata.level).toBe('info');
      expect(receivedLogs[0].metadata.source).toEqual({ file: 'test.ts', line: 42 });
    });

    it('should include instanceId in metadata', () => {
      const receivedLogs: Array<Parameters<LogReceiver>[0]> = [];
      const transport = createRecorderTransport({
        onLog: (log) => receivedLogs.push(log),
      });

      const event: LoggerEvent = {
        type: 'log',
        entry: {
          message: 'Test message',
          metadata: {
            timestamp: 1234567890,
            level: 'info',
            instanceId: 'client-1',
          },
        },
      };

      transport(event);

      expect(receivedLogs[0].metadata.instanceId).toBe('client-1');
    });

    it('should filter events when filter is provided', () => {
      const receivedLogs: Array<Parameters<LogReceiver>[0]> = [];
      const transport = createRecorderTransport({
        onLog: (log) => receivedLogs.push(log),
        filter: (event) => event.entry.metadata.level === 'error',
      });

      transport({
        type: 'log',
        entry: { message: 'Info message', metadata: { timestamp: 1, level: 'info' } },
      });

      transport({
        type: 'log',
        entry: { message: 'Error message', metadata: { timestamp: 2, level: 'error' } },
      });

      expect(receivedLogs).toHaveLength(1);
      expect(receivedLogs[0].message).toBe('Error message');
    });

    it('should include args when includeArgs is true', () => {
      const receivedLogs: Array<Parameters<LogReceiver>[0]> = [];
      const transport = createRecorderTransport({
        onLog: (log) => receivedLogs.push(log),
        includeArgs: true,
      });

      const event: LoggerEvent = {
        type: 'log',
        entry: {
          message: 'Test message',
          metadata: { timestamp: 1, level: 'info' },
          args: ['arg1', { key: 'value' }],
        },
      };

      transport(event);

      expect(receivedLogs[0].metadata.args).toEqual(['arg1', { key: 'value' }]);
    });

    it('should not include args by default', () => {
      const receivedLogs: Array<Parameters<LogReceiver>[0]> = [];
      const transport = createRecorderTransport({
        onLog: (log) => receivedLogs.push(log),
      });

      const event: LoggerEvent = {
        type: 'log',
        entry: {
          message: 'Test message',
          metadata: { timestamp: 1, level: 'info' },
          args: ['arg1'],
        },
      };

      transport(event);

      expect(receivedLogs[0].metadata.args).toBeUndefined();
    });
  });

  describe('createBufferedRecorderTransport', () => {
    it('should buffer logs and flush on interval', async () => {
      const receivedBatches: Array<Parameters<LogReceiver>[0]>[] = [];
      const transport = createBufferedRecorderTransport({
        onFlush: (logs) => receivedBatches.push(logs),
        flushIntervalMs: 50,
      });

      transport({
        type: 'log',
        entry: { message: 'Log 1', metadata: { timestamp: 1, level: 'info' } },
      });

      transport({
        type: 'log',
        entry: { message: 'Log 2', metadata: { timestamp: 2, level: 'info' } },
      });

      // Wait for flush
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedBatches.length).toBeGreaterThanOrEqual(1);
      expect(receivedBatches[0]).toHaveLength(2);
      expect(receivedBatches[0][0].message).toBe('Log 1');
      expect(receivedBatches[0][1].message).toBe('Log 2');

      transport.dispose();
    });

    it('should flush immediately when buffer is full', () => {
      const receivedBatches: Array<Parameters<LogReceiver>[0]>[] = [];
      const transport = createBufferedRecorderTransport({
        onFlush: (logs) => receivedBatches.push(logs),
        flushIntervalMs: 10000, // Long interval
        maxBufferSize: 3,
      });

      transport({
        type: 'log',
        entry: { message: 'Log 1', metadata: { timestamp: 1, level: 'info' } },
      });

      transport({
        type: 'log',
        entry: { message: 'Log 2', metadata: { timestamp: 2, level: 'info' } },
      });

      expect(receivedBatches).toHaveLength(0); // Not yet

      transport({
        type: 'log',
        entry: { message: 'Log 3', metadata: { timestamp: 3, level: 'info' } },
      });

      expect(receivedBatches).toHaveLength(1);
      expect(receivedBatches[0]).toHaveLength(3);

      transport.dispose();
    });

    it('should flush remaining logs on dispose', () => {
      const receivedBatches: Array<Parameters<LogReceiver>[0]>[] = [];
      const transport = createBufferedRecorderTransport({
        onFlush: (logs) => receivedBatches.push(logs),
        flushIntervalMs: 10000,
        maxBufferSize: 100,
      });

      transport({
        type: 'log',
        entry: { message: 'Log 1', metadata: { timestamp: 1, level: 'info' } },
      });

      transport({
        type: 'log',
        entry: { message: 'Log 2', metadata: { timestamp: 2, level: 'info' } },
      });

      expect(receivedBatches).toHaveLength(0);

      transport.dispose();

      expect(receivedBatches).toHaveLength(1);
      expect(receivedBatches[0]).toHaveLength(2);
    });

    it('should respect filter option', () => {
      const receivedBatches: Array<Parameters<LogReceiver>[0]>[] = [];
      const transport = createBufferedRecorderTransport({
        onFlush: (logs) => receivedBatches.push(logs),
        flushIntervalMs: 10000,
        maxBufferSize: 10,
        filter: (event) => event.entry.metadata.level === 'error',
      });

      transport({
        type: 'log',
        entry: { message: 'Info', metadata: { timestamp: 1, level: 'info' } },
      });

      transport({
        type: 'log',
        entry: { message: 'Error 1', metadata: { timestamp: 2, level: 'error' } },
      });

      transport({
        type: 'log',
        entry: { message: 'Error 2', metadata: { timestamp: 3, level: 'error' } },
      });

      transport.dispose();

      expect(receivedBatches).toHaveLength(1);
      expect(receivedBatches[0]).toHaveLength(2);
      expect(receivedBatches[0][0].message).toBe('Error 1');
    });

    it('should allow manual flush', () => {
      const receivedBatches: Array<Parameters<LogReceiver>[0]>[] = [];
      const transport = createBufferedRecorderTransport({
        onFlush: (logs) => receivedBatches.push(logs),
        flushIntervalMs: 10000,
      });

      transport({
        type: 'log',
        entry: { message: 'Log 1', metadata: { timestamp: 1, level: 'info' } },
      });

      expect(receivedBatches).toHaveLength(0);

      transport.flush();

      expect(receivedBatches).toHaveLength(1);

      transport.dispose();
    });
  });
});
