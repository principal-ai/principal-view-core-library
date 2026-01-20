/**
 * Utilities for converting TestEventPanel data to OtelEvent format
 * for use with the narrative renderer
 */

import type { OtelEvent } from '@principal-ai/principal-view-core/browser';
import type { OtelLog, OtelSeverity } from '../components/TestEventPanel';

// TestEventPanel types (matching TestEventPanel.tsx)
interface SpanEvent {
  time: number;
  name: string;
  attributes: Record<string, string | number | boolean>;
}

interface TestSpan {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  status: 'OK' | 'ERROR';
  errorMessage?: string;
}

/**
 * Convert OtelSeverity to severity number (OpenTelemetry spec)
 */
function severityToNumber(severity: OtelSeverity): number {
  const severityMap: Record<OtelSeverity, number> = {
    TRACE: 1,
    DEBUG: 5,
    INFO: 9,
    WARN: 13,
    ERROR: 17,
    FATAL: 21,
  };
  return severityMap[severity] || 9;
}

/**
 * Convert TestSpan events to OtelEvent spans
 */
function convertSpanEvents(span: TestSpan): OtelEvent[] {
  return span.events.map((event) => ({
    name: event.name,
    timestamp: event.time,
    type: 'span' as const,
    spanId: span.id,
    traceId: span.id, // Use span ID as trace ID for single-span tests
    attributes: event.attributes,
  }));
}

/**
 * Convert OtelLogs to OtelEvent logs
 */
function convertLogs(logs: OtelLog[]): OtelEvent[] {
  return logs.map((log) => {
    // Filter out null values from attributes (OtelAttributeValue doesn't include null)
    const filterNullValues = (obj: Record<string, any> | undefined) => {
      if (!obj) return {};
      return Object.fromEntries(
        Object.entries(obj).filter(([, value]) => value !== null)
      );
    };

    return {
      name: 'log',
      timestamp: typeof log.timestamp === 'number' ? log.timestamp : new Date(log.timestamp).getTime(),
      type: 'log' as const,
      spanId: log.spanId,
      traceId: log.traceId,
      severityText: log.severity,
      severityNumber: severityToNumber(log.severity),
      body: typeof log.body === 'string' ? log.body : JSON.stringify(log.body),
      attributes: {
        ...filterNullValues(log.attributes),
        ...filterNullValues(log.resource),
      },
    };
  });
}

/**
 * Convert TestSpan and OtelLogs to OtelEvent array
 *
 * @param span - The test span to convert
 * @param logs - Optional OTEL logs to include
 * @returns Array of OtelEvents in chronological order
 */
export function convertToOtelEvents(span: TestSpan, logs: OtelLog[] = []): OtelEvent[] {
  const spanEvents = convertSpanEvents(span);

  // Filter logs for this specific span
  const spanLogs = logs.filter((log) => log.spanId === span.id || log.traceId === span.id);
  const logEvents = convertLogs(spanLogs);

  // Combine and sort by timestamp
  const allEvents = [...spanEvents, ...logEvents].sort((a, b) => {
    const aTime = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
    const bTime = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
    return aTime - bTime;
  });

  return allEvents;
}

/**
 * Convert all TestSpans to OtelEvents
 *
 * @param spans - Array of test spans
 * @param logs - Optional OTEL logs to include
 * @returns Array of OtelEvents for all spans
 */
export function convertAllSpansToOtelEvents(spans: TestSpan[], logs: OtelLog[] = []): OtelEvent[] {
  const allEvents: OtelEvent[] = [];

  for (const span of spans) {
    const spanEvents = convertToOtelEvents(span, logs);
    allEvents.push(...spanEvents);
  }

  // Sort all events chronologically
  return allEvents.sort((a, b) => {
    const aTime = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
    const bTime = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
    return aTime - bTime;
  });
}

/**
 * Extract test result attributes from TestSpan
 * Useful for narrative templates that check assertions
 */
export function extractTestAttributes(span: TestSpan): Record<string, unknown> {
  // Find assertion.complete event
  const assertionComplete = span.events.find((e) => e.name === 'assertion.complete');

  if (assertionComplete) {
    return {
      'assertions.passed': assertionComplete.attributes['assertions.passed'] || 0,
      'assertions.failed': assertionComplete.attributes['assertions.failed'] || 0,
      'test.status': span.status,
      'test.name': span.name,
      ...span.attributes,
    };
  }

  return {
    'test.status': span.status,
    'test.name': span.name,
    ...span.attributes,
  };
}
