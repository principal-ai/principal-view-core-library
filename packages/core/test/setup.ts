/**
 * OpenTelemetry Test Setup
 *
 * Initializes tracing for test runs. Spans are collected in memory
 * and written to JSON files at the end of the test run.
 *
 * Usage:
 *   - Normal test run: `bun test` (spans saved to __traces__/)
 *   - Debug mode: `OTEL_CONSOLE_EXPORT=true bun test`
 *   - Custom output: `OTEL_TRACE_OUTPUT=./my-traces.json bun test`
 *   - Canvas output: `OTEL_CANVAS_OUTPUT=true bun test` (also outputs .canvas.json)
 */

import { trace, context, SpanStatusCode, type Span } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
  InMemorySpanExporter,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { afterAll, beforeAll } from 'bun:test';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

import { traceToCanvas, type TraceExport } from '../src/utils/TraceToCanvas';

// Configuration
const SERVICE_NAME = 'principal-view-core-tests';
const ENABLE_CONSOLE_EXPORT = process.env.OTEL_CONSOLE_EXPORT === 'true';
const ENABLE_CANVAS_OUTPUT = process.env.OTEL_CANVAS_OUTPUT === 'true';
const TRACE_OUTPUT_PATH = process.env.OTEL_TRACE_OUTPUT ?? join(__dirname, '../__traces__/test-run.json');
const CANVAS_OUTPUT_PATH = TRACE_OUTPUT_PATH.replace(/\.json$/, '.canvas.json');

// Create resource identifying this test suite
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
  'test.framework': 'bun:test',
  'test.run.id': `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
});

// In-memory exporter to collect all spans
const memoryExporter = new InMemorySpanExporter();

// Build span processors list
const spanProcessors = [new SimpleSpanProcessor(memoryExporter)];

// Optionally add console exporter for debugging
if (ENABLE_CONSOLE_EXPORT) {
  spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}

// Create provider with resource and processors
const provider = new BasicTracerProvider({
  resource,
  spanProcessors,
});

// Register as global tracer provider
trace.setGlobalTracerProvider(provider);

// Export tracer for use in tests
export const tracer = trace.getTracer(SERVICE_NAME);

// Export utilities for manual instrumentation in tests
export { trace, context, SpanStatusCode };

/**
 * Wraps a test function with a span for tracing
 *
 * @example
 * ```ts
 * import { traced } from '../test/setup';
 *
 * test('my test', traced('test:my-test', async (span) => {
 *   span.setAttribute('custom.attr', 'value');
 *   // ... test logic
 * }));
 * ```
 */
export function traced<T>(
  name: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => T | Promise<T>
): () => Promise<T> {
  return async () => {
    return tracer.startActiveSpan(name, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        throw error;
      } finally {
        span.end();
      }
    });
  };
}

/**
 * Creates a child span within the current context
 *
 * @example
 * ```ts
 * import { withSpan } from '../test/setup';
 *
 * const result = await withSpan('db:query', async (span) => {
 *   span.setAttribute('db.query', 'SELECT ...');
 *   return db.query(...);
 * });
 * ```
 */
export async function withSpan<T>(
  name: string,
  fn: (span: ReturnType<typeof tracer.startSpan>) => T | Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Convert ReadableSpan to a serializable format matching our OtelSpan type
 */
function spanToJson(span: ReadableSpan) {
  return {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: ['INTERNAL', 'SERVER', 'CLIENT', 'PRODUCER', 'CONSUMER'][span.kind] as string,
    startTime: span.startTime[0] * 1000 + span.startTime[1] / 1_000_000, // Convert to ms
    endTime: span.endTime[0] * 1000 + span.endTime[1] / 1_000_000,
    duration: span.duration[0] * 1000 + span.duration[1] / 1_000_000,
    resource: Object.fromEntries(
      span.resource.attributes ? Object.entries(span.resource.attributes) : []
    ),
    attributes: Object.fromEntries(
      span.attributes ? Object.entries(span.attributes) : []
    ),
    status: {
      code: ['UNSET', 'OK', 'ERROR'][span.status.code] as string,
      message: span.status.message,
    },
    events: span.events.map(e => ({
      name: e.name,
      timestamp: e.time[0] * 1000 + e.time[1] / 1_000_000,
      attributes: Object.fromEntries(
        e.attributes ? Object.entries(e.attributes) : []
      ),
    })),
  };
}

// Shutdown hook - write spans to file
beforeAll(() => {
  // Provider is already registered, nothing to do
});

afterAll(async () => {
  // Get all collected spans
  const spans = memoryExporter.getFinishedSpans();

  if (spans.length > 0) {
    // Convert to JSON format
    const traceExport: TraceExport = {
      exportedAt: new Date().toISOString(),
      serviceName: SERVICE_NAME,
      spanCount: spans.length,
      spans: spans.map(spanToJson),
    };

    // Ensure output directory exists
    mkdirSync(dirname(TRACE_OUTPUT_PATH), { recursive: true });

    // Write trace JSON
    writeFileSync(TRACE_OUTPUT_PATH, JSON.stringify(traceExport, null, 2));
    console.log(`\n📊 Wrote ${spans.length} spans to ${TRACE_OUTPUT_PATH}`);

    // Optionally write canvas format
    if (ENABLE_CANVAS_OUTPUT) {
      const { canvas, stats } = traceToCanvas(traceExport);
      writeFileSync(CANVAS_OUTPUT_PATH, JSON.stringify(canvas, null, 2));
      console.log(`🎨 Wrote canvas (${stats.traceCount} traces, ${stats.serviceCount} services) to ${CANVAS_OUTPUT_PATH}`);
    }
  }

  await provider.shutdown();
});
