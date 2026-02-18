/**
 * Type definitions for the addon configuration and state
 */

export interface OtelExportConfig {
  /**
   * Whether to enable OTLP trace export
   * @default false
   */
  enabled?: boolean;

  /**
   * OTLP HTTP endpoint URL
   * @default 'http://localhost:4318/v1/traces'
   */
  endpoint?: string;

  /**
   * Service name to use in resource attributes
   * @default 'storybook'
   */
  serviceName?: string;

  /**
   * Additional resource attributes
   */
  resourceAttributes?: Record<string, string | number | boolean>;

  /**
   * Custom headers to send with OTLP requests
   */
  headers?: Record<string, string>;

  /**
   * Timeout for export requests in milliseconds
   * @default 10000
   */
  timeoutMillis?: number;

  /**
   * Maximum queue size for batching spans
   * @default 2048
   */
  maxQueueSize?: number;

  /**
   * Maximum batch size for export
   * @default 512
   */
  maxExportBatchSize?: number;

  /**
   * Scheduled delay (in milliseconds) for batching
   * @default 5000
   */
  scheduledDelayMillis?: number;
}

export interface OtelExportStatus {
  /**
   * Whether the provider is initialized and ready
   */
  ready: boolean;

  /**
   * Whether export is currently enabled
   */
  enabled: boolean;

  /**
   * Current endpoint URL
   */
  endpoint: string;

  /**
   * Service name being used
   */
  serviceName: string;

  /**
   * Error message if initialization failed
   */
  error?: string;
}

export type StatusUpdatePayload = OtelExportStatus;
