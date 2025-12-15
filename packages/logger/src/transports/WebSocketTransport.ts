/**
 * WebSocketTransport - Transport for sending logs to a remote EventRecorderService
 *
 * Use this transport when the EventRecorderService is running in a different process
 * (e.g., in electron-app or web-ade).
 */

import type { LoggerEvent, LogTransport } from '../types';

/**
 * WebSocket connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Configuration for WebSocketTransport
 */
export interface WebSocketTransportOptions {
  /** WebSocket server URL (e.g., "ws://localhost:8080") */
  url: string;

  /** Session name to use when starting a recording */
  sessionName?: string;

  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;

  /** Reconnect delay in ms (default: 1000) */
  reconnectDelayMs?: number;

  /** Maximum reconnect attempts (default: 10, -1 for infinite) */
  maxReconnectAttempts?: number;

  /** Filter function to selectively forward logs */
  filter?: (event: LoggerEvent) => boolean;

  /** Include args in log messages (default: false) */
  includeArgs?: boolean;

  /** Callback when connection state changes */
  onConnectionChange?: (state: ConnectionState) => void;

  /** Callback when an error occurs */
  onError?: (error: Error) => void;

  /** Request acknowledgments for messages (default: false) */
  requestAck?: boolean;
}

/**
 * Protocol message types (must match EventRecorderService)
 */
interface ProtocolMessage {
  type: string;
  timestamp: number;
  requestId?: string;
  payload?: any;
}

/**
 * WebSocketTransport class for remote log recording
 *
 * @example
 * ```typescript
 * const transport = new WebSocketTransport({
 *   url: 'ws://localhost:8080/logs',
 *   sessionName: 'My Test Run',
 *   onConnectionChange: (state) => console.log('Connection:', state),
 * });
 *
 * await transport.connect();
 * await transport.startSession('Test: User Login Flow');
 *
 * logger.addTransport(transport.getTransport());
 *
 * // When done
 * await transport.endSession('pass');
 * transport.disconnect();
 * ```
 */
export class WebSocketTransport {
  private ws: WebSocket | null = null;
  private options: Required<
    Omit<WebSocketTransportOptions, 'filter' | 'onConnectionChange' | 'onError'>
  > & {
    filter?: (event: LoggerEvent) => boolean;
    onConnectionChange?: (state: ConnectionState) => void;
    onError?: (error: Error) => void;
  };
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: ProtocolMessage[] = [];
  private currentSessionId: string | null = null;
  private requestIdCounter = 0;
  private pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();

  constructor(options: WebSocketTransportOptions) {
    this.options = {
      url: options.url,
      sessionName: options.sessionName || 'Recording Session',
      autoReconnect: options.autoReconnect ?? true,
      reconnectDelayMs: options.reconnectDelayMs ?? 1000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      filter: options.filter,
      includeArgs: options.includeArgs ?? false,
      onConnectionChange: options.onConnectionChange,
      onError: options.onError,
      requestAck: options.requestAck ?? false,
    };
  }

  /**
   * Get current connection state
   */
  public get connectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Get current session ID
   */
  public get sessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.state === 'connected') {
        resolve();
        return;
      }

      this.setState('connecting');

      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.onopen = () => {
          this.setState('connected');
          this.reconnectAttempts = 0;
          this.flushQueue();
          resolve();
        };

        this.ws.onclose = () => {
          this.handleDisconnect();
        };

        this.ws.onerror = (event) => {
          const error = new Error('WebSocket error');
          this.options.onError?.(error);
          if (this.state === 'connecting') {
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        this.setState('disconnected');
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState('disconnected');
    this.currentSessionId = null;
  }

  /**
   * Start a recording session
   */
  public async startSession(name?: string, metadata?: Record<string, any>): Promise<string> {
    const requestId = this.generateRequestId();

    const message: ProtocolMessage = {
      type: 'session_start',
      timestamp: Date.now(),
      requestId,
      payload: {
        name: name || this.options.sessionName,
        metadata,
      },
    };

    const response = await this.sendWithAck(message);
    this.currentSessionId = response.sessionId;
    return this.currentSessionId!;
  }

  /**
   * End the current recording session
   */
  public async endSession(result?: 'pass' | 'fail' | 'skip', error?: string): Promise<void> {
    if (!this.currentSessionId) {
      return;
    }

    const requestId = this.generateRequestId();

    const message: ProtocolMessage = {
      type: 'session_end',
      timestamp: Date.now(),
      requestId,
      payload: {
        sessionId: this.currentSessionId,
        result,
        error,
      },
    };

    await this.sendWithAck(message);
    this.currentSessionId = null;
  }

  /**
   * Get the LogTransport function to add to EnhancedLogger
   */
  public getTransport(): LogTransport {
    return (event: LoggerEvent) => {
      // Apply filter if provided
      if (this.options.filter && !this.options.filter(event)) {
        return;
      }

      const { entry } = event;

      const message: ProtocolMessage = {
        type: 'log',
        timestamp: Date.now(),
        payload: {
          message: entry.message,
          metadata: {
            timestamp: entry.metadata.timestamp,
            level: entry.metadata.level,
            source: entry.metadata.source,
            instanceId: entry.metadata.instanceId,
            ...(this.options.includeArgs && entry.args?.length ? { args: entry.args } : {}),
          },
        },
      };

      // Request ack if configured
      if (this.options.requestAck) {
        message.requestId = this.generateRequestId();
      }

      this.send(message);
    };
  }

  /**
   * Send a ping to keep the connection alive
   */
  public ping(): void {
    this.send({ type: 'ping', timestamp: Date.now() });
  }

  // Private methods

  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.options.onConnectionChange?.(state);
    }
  }

  private generateRequestId(): string {
    return `req-${++this.requestIdCounter}-${Date.now()}`;
  }

  private send(message: ProtocolMessage): void {
    if (this.ws && this.state === 'connected') {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for later
      this.messageQueue.push(message);
    }
  }

  private async sendWithAck(message: ProtocolMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!message.requestId) {
        message.requestId = this.generateRequestId();
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.requestId!);
        reject(new Error('Request timeout'));
      }, 10000);

      this.pendingRequests.set(message.requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.send(message);
    });
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.state === 'connected') {
      const message = this.messageQueue.shift()!;
      this.send(message);
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ProtocolMessage;

      // Handle ack responses
      if (message.type === 'ack' && message.requestId) {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          this.pendingRequests.delete(message.requestId);
          pending.resolve((message as any).payload || {});
        }
      }

      // Handle error responses
      if (message.type === 'error' && message.requestId) {
        const pending = this.pendingRequests.get(message.requestId);
        if (pending) {
          this.pendingRequests.delete(message.requestId);
          pending.reject(new Error((message as any).payload?.message || 'Unknown error'));
        }
      }

      // Handle pong
      if (message.type === 'pong') {
        // Connection is alive
      }
    } catch (error) {
      this.options.onError?.(error as Error);
    }
  }

  private handleDisconnect(): void {
    this.ws = null;

    if (this.options.autoReconnect && this.state !== 'disconnected') {
      this.attemptReconnect();
    } else {
      this.setState('disconnected');
    }
  }

  private attemptReconnect(): void {
    if (
      this.options.maxReconnectAttempts !== -1 &&
      this.reconnectAttempts >= this.options.maxReconnectAttempts
    ) {
      this.setState('disconnected');
      this.options.onError?.(new Error('Max reconnect attempts reached'));
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // Will trigger another reconnect attempt via handleDisconnect
      });
    }, this.options.reconnectDelayMs);
  }
}

/**
 * Factory function to create a simple WebSocket transport
 *
 * @example
 * ```typescript
 * const transport = createWebSocketTransport({
 *   url: 'ws://localhost:8080/logs',
 * });
 *
 * logger.addTransport(transport);
 * ```
 */
export function createWebSocketTransport(
  options: Omit<WebSocketTransportOptions, 'sessionName'>
): LogTransport & { connect: () => Promise<void>; disconnect: () => void } {
  const wsTransport = new WebSocketTransport(options);

  const transport = wsTransport.getTransport() as LogTransport & {
    connect: () => Promise<void>;
    disconnect: () => void;
  };

  transport.connect = () => wsTransport.connect();
  transport.disconnect = () => wsTransport.disconnect();

  return transport;
}
