/**
 * OpenTelemetry Types for Log Association
 *
 * These types represent the OTEL data model for logs and resources,
 * enabling canvas nodes to be matched against incoming telemetry.
 *
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/
 * @see https://opentelemetry.io/docs/specs/otel/resource/semantic_conventions/
 */

/**
 * OTEL Resource - describes the entity producing telemetry
 *
 * Resources are immutable metadata about the source of telemetry.
 * Common attributes follow semantic conventions.
 *
 * @example
 * ```typescript
 * const resource: OtelResource = {
 *   'service.name': 'checkout-api',
 *   'service.namespace': 'checkout',
 *   'deployment.environment': 'production',
 *   'k8s.pod.name': 'checkout-api-7d8f9c6b5d-x2j4k'
 * };
 * ```
 */
export interface OtelResource {
  // Service identification (most common)
  'service.name'?: string;
  'service.namespace'?: string;
  'service.instance.id'?: string;
  'service.version'?: string;

  // Kubernetes
  'k8s.pod.name'?: string;
  'k8s.pod.uid'?: string;
  'k8s.deployment.name'?: string;
  'k8s.namespace.name'?: string;
  'k8s.node.name'?: string;
  'k8s.container.name'?: string;
  'k8s.replicaset.name'?: string;

  // Cloud
  'cloud.provider'?: string;
  'cloud.region'?: string;
  'cloud.availability_zone'?: string;
  'cloud.account.id'?: string;

  // Deployment
  'deployment.environment'?: string;

  // Host
  'host.name'?: string;
  'host.id'?: string;
  'host.type'?: string;

  // Process
  'process.pid'?: number;
  'process.executable.name'?: string;
  'process.runtime.name'?: string;
  'process.runtime.version'?: string;

  // Database (for DB spans/logs)
  'db.system'?: string;
  'db.name'?: string;
  'db.user'?: string;

  // Messaging (for queue spans/logs)
  'messaging.system'?: string;
  'messaging.destination.name'?: string;

  // Allow arbitrary attributes
  [key: string]: string | number | boolean | undefined;
}

/**
 * OTEL Severity levels
 *
 * Can be either text names or numeric values (1-24).
 * @see https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
export type OtelSeverityText = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
export type OtelSeverityNumber =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24;
export type OtelSeverity = OtelSeverityText | OtelSeverityNumber;

/**
 * OTEL Log Record
 *
 * Represents a single log entry with resource context and optional trace correlation.
 *
 * @example
 * ```typescript
 * const log: OtelLog = {
 *   timestamp: Date.now(),
 *   severity: 'INFO',
 *   body: 'Payment processed successfully',
 *   resource: {
 *     'service.name': 'payment-service',
 *     'deployment.environment': 'production'
 *   },
 *   attributes: {
 *     'payment.id': 'pay_123',
 *     'payment.amount': 99.99
 *   },
 *   traceId: 'abc123',
 *   spanId: 'def456'
 * };
 * ```
 */
export interface OtelLog {
  /** Timestamp in milliseconds, nanoseconds, or ISO string */
  timestamp: number | string;

  /** Observed timestamp (when collector received it) */
  observedTimestamp?: number | string;

  /** Severity number (1-24) */
  severity?: OtelSeverity;

  /** Severity text (DEBUG, INFO, etc.) */
  severityText?: string;

  /** Log body - the actual message or structured content */
  body: string | Record<string, unknown>;

  /** Resource describing the source entity */
  resource: OtelResource;

  /** Log attributes (structured data specific to this log) */
  attributes?: Record<string, string | number | boolean>;

  /** Trace ID for correlation */
  traceId?: string;

  /** Span ID for correlation */
  spanId?: string;

  /** Trace flags */
  traceFlags?: number;

  /**
   * Source location (for path-based matching)
   * This extends OTEL with source file information for code coverage analysis.
   */
  source?: {
    file?: string;
    line?: number;
    function?: string;
  };
}

/**
 * OTEL Span Kind
 */
export type OtelSpanKind = 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';

/**
 * OTEL Span Status
 */
export interface OtelSpanStatus {
  code: 'UNSET' | 'OK' | 'ERROR';
  message?: string;
}

/**
 * OTEL Span
 *
 * Represents a unit of work in a distributed trace.
 * Used for trace-based edge derivation between canvas nodes.
 *
 * @example
 * ```typescript
 * const span: OtelSpan = {
 *   traceId: 'abc123',
 *   spanId: 'span1',
 *   parentSpanId: 'span0',
 *   name: 'POST /api/checkout',
 *   kind: 'SERVER',
 *   startTime: Date.now(),
 *   resource: {
 *     'service.name': 'checkout-api'
 *   }
 * };
 * ```
 */
export interface OtelSpan {
  /** Trace ID this span belongs to */
  traceId: string;

  /** Unique span ID */
  spanId: string;

  /** Parent span ID (undefined for root spans) */
  parentSpanId?: string;

  /** Span name (usually operation name) */
  name: string;

  /** Span kind */
  kind: OtelSpanKind;

  /** Start time in milliseconds, nanoseconds, or ISO string */
  startTime: number | string;

  /** End time (undefined if span is still active) */
  endTime?: number | string;

  /** Resource describing the source entity */
  resource: OtelResource;

  /** Span attributes */
  attributes?: Record<string, string | number | boolean>;

  /** Span status */
  status?: OtelSpanStatus;

  /** Events (logs within the span) */
  events?: Array<{
    name: string;
    timestamp: number | string;
    attributes?: Record<string, string | number | boolean>;
  }>;
}

/**
 * Type guard: Check if severity indicates an error
 */
export function isErrorSeverity(severity: OtelSeverity | undefined): boolean {
  if (severity === undefined) return false;
  if (typeof severity === 'string') {
    return severity === 'ERROR' || severity === 'FATAL';
  }
  return severity >= 17; // ERROR starts at 17 in OTEL spec
}

/**
 * Type guard: Check if severity indicates a warning
 */
export function isWarnSeverity(severity: OtelSeverity | undefined): boolean {
  if (severity === undefined) return false;
  if (typeof severity === 'string') {
    return severity === 'WARN';
  }
  return severity >= 13 && severity <= 16; // WARN is 13-16 in OTEL spec
}
