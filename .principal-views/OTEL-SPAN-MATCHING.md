# OTEL Span-to-Canvas Node Matching

## Overview

This document specifies the architecture for matching incoming OpenTelemetry trace spans to canvas nodes in real-time. This enables live visualization of trace data flowing through your system, highlighting which components are active based on actual telemetry.

### Problem Statement

We receive OTEL trace data (spans) via message port from the main process to renderer windows. Each span contains:
- Resource attributes (service.name, deployment.environment, etc.)
- Span attributes (name, kind, custom attributes)
- Timing information (start/end timestamps)
- Trace/span IDs for correlation

Canvas nodes need to "light up" when spans matching their criteria flow through the system. This requires:
1. **Declarative matching rules** defined in canvas node metadata
2. **Efficient matching algorithm** that scales to hundreds of nodes
3. **Real-time processing** as spans arrive via message port
4. **Type-safe implementation** in the core library

### Design Goals

- **Declarative**: Node authors define matching criteria in canvas files, not code
- **Efficient**: Pre-compile matching rules; avoid re-parsing on every span
- **Flexible**: Support multiple matching strategies (resource, span name, attributes)
- **Composable**: Multiple rules can combine (AND logic)
- **Pattern-based**: Support wildcards and glob patterns for flexibility

---

## Architecture

### High-Level Flow

```
┌─────────────────┐
│ Main Process    │
│  OTEL Collector │
└────────┬────────┘
         │ IPC/MessagePort
         ▼
┌─────────────────────────────────┐
│ Renderer: Dev Workspace Window  │
│                                 │
│  ┌──────────────────────────┐  │
│  │ TraceIngestionPipeline   │  │ ← Receives ResourceSpans
│  └──────────┬───────────────┘  │
│             │                   │
│  ┌──────────▼───────────────┐  │
│  │ SpanMatcher              │  │ ← Core matching logic (from core lib)
│  │ - Pre-compiled rules     │  │
│  │ - Pattern matching       │  │
│  │ - Multi-strategy support │  │
│  └──────────┬───────────────┘  │
│             │                   │
│  ┌──────────▼───────────────┐  │
│  │ CanvasHighlightController│  │ ← Emits highlight events
│  └──────────┬───────────────┘  │
│             │                   │
│  ┌──────────▼───────────────┐  │
│  │ Canvas Renderer (React)  │  │ ← Updates visual state
│  └──────────────────────────┘  │
└─────────────────────────────────┘
```

### Component Responsibilities

| Component | Location | Responsibility |
|-----------|----------|---------------|
| **PVOtelSpanMatch** | core/types/canvas.ts | Type definitions for span matching criteria |
| **SpanMatcher** | core/matchers/SpanMatcher.ts | Core matching algorithm (new file) |
| **TraceIngestionPipeline** | panels/telemetry/* | Receives spans, orchestrates matching |
| **CanvasHighlightController** | panels/execution-viewer/* | Manages node highlight state |

---

## Type Definitions

### 1. Extend `PVOtelExtension` in `canvas.ts`

Currently, `PVOtelExtension` is used for architectural diagrams. We need to extend it to support runtime span matching:

```typescript
/**
 * OTEL span matching criteria
 *
 * Defines rules for matching incoming OTEL spans to this canvas node.
 * Multiple criteria are combined with AND logic (all must match).
 */
export interface PVOtelSpanMatch {
  /**
   * Match span name
   *
   * Supports:
   * - Exact string: "validateUser"
   * - Array of options: ["GET /api/users", "POST /api/users"]
   * - Glob patterns: "GET /api/*", "*.checkout"
   *
   * @example "validateUser"
   * @example ["GET /api/users", "POST /api/users"]
   * @example "*.checkout"
   */
  name?: string | string[];

  /**
   * Match span kind
   *
   * @example "SPAN_KIND_SERVER"
   * @example "SPAN_KIND_CLIENT"
   */
  kind?: OtelSpanKind | OtelSpanKind[];

  /**
   * Match span attributes
   *
   * All specified attributes must match (AND logic).
   * Supports exact values and wildcards.
   *
   * @example
   * {
   *   "http.route": "/api/checkout",
   *   "http.method": "POST"
   * }
   *
   * @example
   * {
   *   "db.system": "postgresql",
   *   "db.operation": "*"  // Any operation
   * }
   */
  attributes?: Record<string, string | string[]>;

  /**
   * Match span events
   *
   * If specified, span must contain at least one event matching these criteria.
   *
   * @example
   * {
   *   name: "exception",
   *   attributes: { "exception.type": "ValidationError" }
   * }
   */
  event?: {
    name?: string | string[];
    attributes?: Record<string, string | string[]>;
  };
}

/**
 * OTEL resource matching criteria
 *
 * Matches against OTEL resource attributes (service.name, deployment.environment, etc.).
 * Multiple attributes are combined with AND logic.
 */
export interface PVOtelResourceMatch {
  /**
   * Resource attribute patterns to match
   *
   * Supports:
   * - Exact match: { "service.name": "checkout-api" }
   * - Wildcard: { "service.name": "*-api" }
   * - Array of options: { "service.name": ["api-1", "api-2"] }
   *
   * @example
   * {
   *   "service.name": "checkout-service",
   *   "deployment.environment": "production"
   * }
   */
  [attributeKey: string]: string | string[];
}

/**
 * OTEL node extension (updated)
 */
export interface PVOtelExtension {
  // Existing fields for architectural diagrams
  kind?: PVOtelKind;
  category?: PVOtelCategory;
  isNew?: boolean;

  // NEW: Runtime matching criteria
  /**
   * Resource matching criteria
   *
   * When specified, this node will highlight when spans are received
   * from resources with matching attributes.
   */
  resourceMatch?: PVOtelResourceMatch;

  /**
   * Span matching criteria
   *
   * When specified, this node will highlight when spans matching
   * these criteria are received.
   */
  spanMatch?: PVOtelSpanMatch;

  // Allow additional properties
  [key: string]: JsonValue | undefined;
}

/**
 * OTEL span kind enumeration
 */
export type OtelSpanKind =
  | 'SPAN_KIND_UNSPECIFIED'
  | 'SPAN_KIND_INTERNAL'
  | 'SPAN_KIND_SERVER'
  | 'SPAN_KIND_CLIENT'
  | 'SPAN_KIND_PRODUCER'
  | 'SPAN_KIND_CONSUMER';
```

### 2. OTEL Data Structures

Add these types to `core/types/otel.ts` (new file):

```typescript
/**
 * OpenTelemetry data structures
 *
 * Minimal type definitions for OTEL span data as received from the collector.
 * Based on OTLP/JSON format.
 */

export interface OtelAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: number;
    doubleValue?: number;
    boolValue?: boolean;
    arrayValue?: { values: OtelAttributeValue[] };
    kvlistValue?: { values: OtelAttribute[] };
  };
}

export type OtelAttributeValue = OtelAttribute['value'];

export interface OtelResource {
  attributes: OtelAttribute[];
}

export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind?: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes?: OtelAttribute[];
  events?: OtelSpanEvent[];
  status?: {
    code?: string;
    message?: string;
  };
}

export interface OtelSpanEvent {
  timeUnixNano: string;
  name: string;
  attributes?: OtelAttribute[];
}

export interface OtelScopeSpan {
  scope: {
    name: string;
    version?: string;
  };
  spans: OtelSpan[];
}

export interface OtelResourceSpan {
  resource: OtelResource;
  scopeSpans: OtelScopeSpan[];
}

export interface OtelResourceSpans {
  resourceSpans: OtelResourceSpan[];
}

/**
 * Helper to extract string value from OTEL attribute
 */
export function getAttributeStringValue(attribute: OtelAttribute): string | undefined {
  return attribute.value.stringValue;
}

/**
 * Helper to find attribute by key
 */
export function findAttribute(
  attributes: OtelAttribute[] | undefined,
  key: string
): OtelAttribute | undefined {
  return attributes?.find(attr => attr.key === key);
}

/**
 * Helper to get attribute value by key
 */
export function getAttributeValue(
  attributes: OtelAttribute[] | undefined,
  key: string
): string | number | boolean | undefined {
  const attr = findAttribute(attributes, key);
  if (!attr) return undefined;

  return (
    attr.value.stringValue ??
    attr.value.intValue ??
    attr.value.doubleValue ??
    attr.value.boolValue
  );
}

/**
 * Helper to convert resource attributes to a flat object
 */
export function flattenResourceAttributes(resource: OtelResource): Record<string, string> {
  const result: Record<string, string> = {};

  for (const attr of resource.attributes) {
    const value = getAttributeStringValue(attr);
    if (value !== undefined) {
      result[attr.key] = value;
    }
  }

  return result;
}
```

---

## Implementation: SpanMatcher

Create a new file: `packages/core/src/matchers/SpanMatcher.ts`

```typescript
import type { ExtendedCanvas, PVOtelExtension } from '../types/canvas';
import type { OtelSpan, OtelResource, OtelSpanEvent } from '../types/otel';
import { getAttributeValue, flattenResourceAttributes } from '../types/otel';

/**
 * Compiled matching rule for a single canvas node
 */
interface CompiledMatchRule {
  nodeId: string;
  resourceMatchers: ResourceMatcher[];
  spanMatchers: SpanMatcher[];
}

/**
 * Resource attribute matcher function
 */
type ResourceMatcher = (resourceAttrs: Record<string, string>) => boolean;

/**
 * Span matcher function
 */
type SpanMatcher = (span: OtelSpan) => boolean;

/**
 * Match result containing matched node IDs and metadata
 */
export interface SpanMatchResult {
  /** IDs of nodes that matched this span */
  matchedNodeIds: string[];
  /** Timestamp extracted from span (milliseconds since epoch) */
  timestamp: number;
  /** Span duration in milliseconds */
  duration: number;
}

/**
 * SpanMatcher
 *
 * Efficiently matches incoming OTEL spans to canvas nodes based on
 * declarative matching criteria defined in node metadata.
 *
 * @example
 * const canvas = loadCanvas('checkout-flow.otel.canvas.json');
 * const matcher = new SpanMatcher(canvas);
 *
 * // Later, when spans arrive:
 * const result = matcher.matchSpan(span, resource);
 * if (result.matchedNodeIds.length > 0) {
 *   console.log('Matched nodes:', result.matchedNodeIds);
 * }
 */
export class SpanMatcher {
  private rules: CompiledMatchRule[] = [];

  /**
   * Create a new SpanMatcher for a canvas
   *
   * @param canvas Canvas with nodes containing OTEL matching criteria
   */
  constructor(canvas: ExtendedCanvas) {
    this.rules = this.compileRules(canvas);
  }

  /**
   * Pre-compile matching rules from canvas nodes
   *
   * This is done once at initialization for performance.
   */
  private compileRules(canvas: ExtendedCanvas): CompiledMatchRule[] {
    const rules: CompiledMatchRule[] = [];

    if (!canvas.nodes) return rules;

    for (const node of canvas.nodes) {
      if (!node.pv?.otel) continue;

      const otel = node.pv.otel;
      const rule: CompiledMatchRule = {
        nodeId: node.id,
        resourceMatchers: [],
        spanMatchers: [],
      };

      // Compile resource matchers
      if (otel.resourceMatch) {
        rule.resourceMatchers.push(
          this.compileResourceMatcher(otel.resourceMatch)
        );
      }

      // Compile span matchers
      if (otel.spanMatch) {
        // Span name matcher
        if (otel.spanMatch.name) {
          rule.spanMatchers.push(
            this.compileSpanNameMatcher(otel.spanMatch.name)
          );
        }

        // Span kind matcher
        if (otel.spanMatch.kind) {
          rule.spanMatchers.push(
            this.compileSpanKindMatcher(otel.spanMatch.kind)
          );
        }

        // Span attributes matcher
        if (otel.spanMatch.attributes) {
          rule.spanMatchers.push(
            this.compileSpanAttributesMatcher(otel.spanMatch.attributes)
          );
        }

        // Span event matcher
        if (otel.spanMatch.event) {
          rule.spanMatchers.push(
            this.compileSpanEventMatcher(otel.spanMatch.event)
          );
        }
      }

      // Only add rule if it has at least one matcher
      if (rule.resourceMatchers.length > 0 || rule.spanMatchers.length > 0) {
        rules.push(rule);
      }
    }

    return rules;
  }

  /**
   * Compile resource attribute matcher
   */
  private compileResourceMatcher(
    resourceMatch: Record<string, string | string[]>
  ): ResourceMatcher {
    return (resourceAttrs: Record<string, string>) => {
      // All specified attributes must match (AND logic)
      return Object.entries(resourceMatch).every(([key, pattern]) => {
        const value = resourceAttrs[key];
        if (!value) return false;

        if (Array.isArray(pattern)) {
          // Match any of the patterns (OR within the array)
          return pattern.some(p => this.matchPattern(value, p));
        }

        return this.matchPattern(value, pattern);
      });
    };
  }

  /**
   * Compile span name matcher
   */
  private compileSpanNameMatcher(
    namePattern: string | string[]
  ): SpanMatcher {
    const patterns = Array.isArray(namePattern) ? namePattern : [namePattern];

    return (span: OtelSpan) => {
      return patterns.some(pattern => this.matchPattern(span.name, pattern));
    };
  }

  /**
   * Compile span kind matcher
   */
  private compileSpanKindMatcher(
    kindPattern: string | string[]
  ): SpanMatcher {
    const kinds = Array.isArray(kindPattern) ? kindPattern : [kindPattern];

    return (span: OtelSpan) => {
      if (!span.kind) return false;
      return kinds.includes(span.kind);
    };
  }

  /**
   * Compile span attributes matcher
   */
  private compileSpanAttributesMatcher(
    attributesMatch: Record<string, string | string[]>
  ): SpanMatcher {
    return (span: OtelSpan) => {
      // All specified attributes must match (AND logic)
      return Object.entries(attributesMatch).every(([key, pattern]) => {
        const value = getAttributeValue(span.attributes, key);
        if (value === undefined) return false;

        const valueStr = String(value);

        if (Array.isArray(pattern)) {
          return pattern.some(p => this.matchPattern(valueStr, p));
        }

        return this.matchPattern(valueStr, pattern);
      });
    };
  }

  /**
   * Compile span event matcher
   */
  private compileSpanEventMatcher(
    eventMatch: {
      name?: string | string[];
      attributes?: Record<string, string | string[]>;
    }
  ): SpanMatcher {
    return (span: OtelSpan) => {
      if (!span.events || span.events.length === 0) return false;

      // At least one event must match
      return span.events.some(event => {
        // Match event name if specified
        if (eventMatch.name) {
          const namePatterns = Array.isArray(eventMatch.name)
            ? eventMatch.name
            : [eventMatch.name];

          const nameMatches = namePatterns.some(pattern =>
            this.matchPattern(event.name, pattern)
          );

          if (!nameMatches) return false;
        }

        // Match event attributes if specified
        if (eventMatch.attributes) {
          const attrsMatch = Object.entries(eventMatch.attributes).every(
            ([key, pattern]) => {
              const value = getAttributeValue(event.attributes, key);
              if (value === undefined) return false;

              const valueStr = String(value);

              if (Array.isArray(pattern)) {
                return pattern.some(p => this.matchPattern(valueStr, p));
              }

              return this.matchPattern(valueStr, pattern);
            }
          );

          if (!attrsMatch) return false;
        }

        return true;
      });
    };
  }

  /**
   * Match a value against a pattern
   *
   * Supports:
   * - Wildcard: "*" matches anything
   * - Glob patterns: "GET /api/*" matches "GET /api/users"
   * - Exact match: "validateUser" matches only "validateUser"
   */
  private matchPattern(value: string, pattern: string): boolean {
    // Wildcard matches everything
    if (pattern === '*') return true;

    // Exact match (fast path)
    if (!pattern.includes('*')) {
      return value === pattern;
    }

    // Glob pattern matching
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  /**
   * Match a span against all canvas nodes
   *
   * @param span OTEL span to match
   * @param resource OTEL resource associated with the span
   * @returns Match result with matched node IDs and metadata
   */
  public matchSpan(span: OtelSpan, resource: OtelResource): SpanMatchResult {
    const matchedNodeIds: string[] = [];
    const resourceAttrs = flattenResourceAttributes(resource);

    for (const rule of this.rules) {
      // Check if all resource matchers pass
      const resourceMatch = rule.resourceMatchers.every(matcher =>
        matcher(resourceAttrs)
      );

      // Check if all span matchers pass
      const spanMatch = rule.spanMatchers.every(matcher => matcher(span));

      // Node matches if both resource AND span criteria match
      // (Empty arrays evaluate to true for every())
      if (resourceMatch && spanMatch) {
        matchedNodeIds.push(rule.nodeId);
      }
    }

    return {
      matchedNodeIds,
      timestamp: this.parseNanoTime(span.startTimeUnixNano),
      duration: this.calculateDuration(span),
    };
  }

  /**
   * Parse OTEL nanosecond timestamp to milliseconds
   */
  private parseNanoTime(nanos: string): number {
    return parseInt(nanos, 10) / 1_000_000;
  }

  /**
   * Calculate span duration in milliseconds
   */
  private calculateDuration(span: OtelSpan): number {
    const start = parseInt(span.startTimeUnixNano, 10);
    const end = parseInt(span.endTimeUnixNano, 10);
    return (end - start) / 1_000_000;
  }

  /**
   * Get statistics about the compiled rules
   *
   * Useful for debugging and performance analysis.
   */
  public getStats(): {
    totalRules: number;
    rulesWithResourceMatch: number;
    rulesWithSpanMatch: number;
  } {
    return {
      totalRules: this.rules.length,
      rulesWithResourceMatch: this.rules.filter(r => r.resourceMatchers.length > 0).length,
      rulesWithSpanMatch: this.rules.filter(r => r.spanMatchers.length > 0).length,
    };
  }
}
```

---

## Usage Examples

### 1. Canvas Node Configuration

```json
{
  "nodes": [
    {
      "id": "user-auth",
      "type": "text",
      "text": "User Authentication",
      "x": 100,
      "y": 100,
      "width": 200,
      "height": 100,
      "pv": {
        "nodeType": "rest-api",
        "otel": {
          "resourceMatch": {
            "service.name": "auth-service"
          },
          "spanMatch": {
            "name": ["POST /auth/login", "POST /auth/register"],
            "kind": "SPAN_KIND_SERVER"
          }
        }
      }
    },
    {
      "id": "checkout-db",
      "type": "text",
      "text": "Checkout Database",
      "x": 400,
      "y": 200,
      "width": 200,
      "height": 100,
      "pv": {
        "nodeType": "database",
        "otel": {
          "resourceMatch": {
            "service.name": "checkout-service"
          },
          "spanMatch": {
            "name": "*.query",
            "attributes": {
              "db.system": "postgresql",
              "db.name": "checkout"
            }
          }
        }
      }
    },
    {
      "id": "error-handler",
      "type": "text",
      "text": "Error Handler",
      "x": 700,
      "y": 300,
      "width": 200,
      "height": 100,
      "pv": {
        "nodeType": "business-logic",
        "otel": {
          "spanMatch": {
            "event": {
              "name": "exception",
              "attributes": {
                "exception.type": "*"
              }
            }
          }
        }
      }
    }
  ]
}
```

### 2. Using SpanMatcher in Code

```typescript
import { SpanMatcher } from '@principal-ai/visual-validation-core';
import type { OtelResourceSpans } from '@principal-ai/visual-validation-core';

// Load canvas
const canvas = await loadCanvas('checkout-flow.otel.canvas.json');

// Create matcher (do this once, reuse for all spans)
const matcher = new SpanMatcher(canvas);

// Log stats for debugging
console.log('Matcher stats:', matcher.getStats());
// Output: { totalRules: 15, rulesWithResourceMatch: 10, rulesWithSpanMatch: 15 }

// Process incoming OTEL data
function processResourceSpans(data: OtelResourceSpans) {
  for (const resourceSpan of data.resourceSpans) {
    const resource = resourceSpan.resource;

    for (const scopeSpan of resourceSpan.scopeSpans) {
      for (const span of scopeSpan.spans) {
        // Match span to nodes
        const result = matcher.matchSpan(span, resource);

        if (result.matchedNodeIds.length > 0) {
          console.log(`Span "${span.name}" matched nodes:`, result.matchedNodeIds);

          // Emit events for UI to handle
          for (const nodeId of result.matchedNodeIds) {
            eventEmitter.emit('span:matched', {
              nodeId,
              span,
              resource,
              timestamp: result.timestamp,
              duration: result.duration,
            });
          }
        }
      }
    }
  }
}
```

---

## Performance Considerations

### Pre-compilation

The `SpanMatcher` constructor pre-compiles all matching rules into functions. This means:
- ✅ Pattern parsing happens **once** at initialization
- ✅ Regex compilation happens **once** per pattern
- ✅ Matching is reduced to simple function calls
- ❌ Canvas changes require creating a new `SpanMatcher` instance

### Time Complexity

For a canvas with `N` nodes and an incoming span:
- **Best case**: O(1) if no nodes have OTEL matchers
- **Average case**: O(N × M) where M is average matchers per node (~2-5)
- **Worst case**: O(N × M × A) where A is attributes to check (~5-10)

With 100 nodes and 5 matchers each, matching a single span takes ~500-1000 comparisons. Modern JavaScript engines handle this in < 1ms.

### Memory Usage

Each compiled rule stores:
- Node ID (string): ~50 bytes
- Matcher functions: ~100-500 bytes each
- Total per node: ~500-2000 bytes

For 100 nodes: ~50-200 KB of matcher data. Negligible compared to canvas JSON.

### Optimization Opportunities

1. **Early exit**: If resource doesn't match, skip span matchers
2. **Index by service**: Group rules by `service.name` for faster lookups
3. **Bloom filters**: For large canvases (>500 nodes), use bloom filters to quickly reject non-matches
4. **Worker threads**: Move matching to a Web Worker for non-blocking operation

---

## Integration with Panels

### Expected Integration Points

1. **panels/telemetry/TraceIngestionPipeline.ts**
   - Receives `OtelResourceSpans` via message port
   - Creates `SpanMatcher` instance for active canvas
   - Calls `matchSpan()` for each incoming span
   - Emits events for matched nodes

2. **panels/execution-viewer/CanvasHighlightController.ts**
   - Listens for `span:matched` events
   - Updates canvas node visual state (glow, color, intensity)
   - Manages auto-fade timers based on span duration
   - Provides API for manual highlight control

3. **React Components**
   - Subscribe to highlight events
   - Apply visual styles to nodes (CSS classes, inline styles)
   - Show span details on hover
   - Display trace timeline

### Message Port Protocol

The main process should send messages in this format:

```typescript
interface OtelTraceMessage {
  type: 'otel:traces';
  payload: OtelResourceSpans;
}

// In renderer window:
window.addEventListener('message', (event) => {
  if (event.data.type === 'otel:traces') {
    traceIngestionPipeline.process(event.data.payload);
  }
});
```

---

## Testing Strategy

### Unit Tests

Test the `SpanMatcher` class in isolation:

```typescript
describe('SpanMatcher', () => {
  describe('pattern matching', () => {
    it('should match exact span names', () => {
      const canvas = createMockCanvas({
        nodes: [{
          id: 'node1',
          pv: { otel: { spanMatch: { name: 'validateUser' } } }
        }]
      });

      const matcher = new SpanMatcher(canvas);
      const result = matcher.matchSpan(
        createMockSpan({ name: 'validateUser' }),
        createMockResource({})
      );

      expect(result.matchedNodeIds).toEqual(['node1']);
    });

    it('should match glob patterns', () => {
      const canvas = createMockCanvas({
        nodes: [{
          id: 'node1',
          pv: { otel: { spanMatch: { name: 'GET /api/*' } } }
        }]
      });

      const matcher = new SpanMatcher(canvas);
      const result = matcher.matchSpan(
        createMockSpan({ name: 'GET /api/users' }),
        createMockResource({})
      );

      expect(result.matchedNodeIds).toEqual(['node1']);
    });
  });

  describe('resource matching', () => {
    it('should match resource attributes', () => {
      const canvas = createMockCanvas({
        nodes: [{
          id: 'node1',
          pv: {
            otel: {
              resourceMatch: { 'service.name': 'auth-service' }
            }
          }
        }]
      });

      const matcher = new SpanMatcher(canvas);
      const result = matcher.matchSpan(
        createMockSpan({ name: 'login' }),
        createMockResource({ 'service.name': 'auth-service' })
      );

      expect(result.matchedNodeIds).toEqual(['node1']);
    });
  });

  describe('combined matching', () => {
    it('should require both resource AND span match', () => {
      const canvas = createMockCanvas({
        nodes: [{
          id: 'node1',
          pv: {
            otel: {
              resourceMatch: { 'service.name': 'auth-service' },
              spanMatch: { name: 'login' }
            }
          }
        }]
      });

      const matcher = new SpanMatcher(canvas);

      // Should match: both criteria met
      expect(
        matcher.matchSpan(
          createMockSpan({ name: 'login' }),
          createMockResource({ 'service.name': 'auth-service' })
        ).matchedNodeIds
      ).toEqual(['node1']);

      // Should NOT match: wrong service
      expect(
        matcher.matchSpan(
          createMockSpan({ name: 'login' }),
          createMockResource({ 'service.name': 'other-service' })
        ).matchedNodeIds
      ).toEqual([]);

      // Should NOT match: wrong span name
      expect(
        matcher.matchSpan(
          createMockSpan({ name: 'logout' }),
          createMockResource({ 'service.name': 'auth-service' })
        ).matchedNodeIds
      ).toEqual([]);
    });
  });
});
```

### Integration Tests

Test with real OTEL data:

```typescript
describe('SpanMatcher integration', () => {
  it('should match real OTEL trace data', async () => {
    const canvas = await loadCanvas('test-fixtures/checkout-flow.otel.canvas.json');
    const otelData = await loadJSON('test-fixtures/checkout-trace.json');

    const matcher = new SpanMatcher(canvas);
    const matches: Record<string, number> = {};

    for (const resourceSpan of otelData.resourceSpans) {
      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          const result = matcher.matchSpan(span, resourceSpan.resource);
          for (const nodeId of result.matchedNodeIds) {
            matches[nodeId] = (matches[nodeId] || 0) + 1;
          }
        }
      }
    }

    expect(matches['user-validation']).toBeGreaterThan(0);
    expect(matches['checkout-db']).toBeGreaterThan(0);
  });
});
```

---

## Migration Path

### Phase 1: Core Library (This Document)
- ✅ Define types in `types/canvas.ts`
- ✅ Define OTEL types in `types/otel.ts`
- ✅ Implement `SpanMatcher` in `matchers/SpanMatcher.ts`
- ✅ Add unit tests
- ✅ Export from `index.ts`

### Phase 2: Panel Integration (Next Conversation)
- Implement `TraceIngestionPipeline` in panels package
- Implement `CanvasHighlightController` in execution-viewer
- Wire up message port listeners
- Add visual highlight styles

### Phase 3: Demo & Refinement
- Create demo canvas with OTEL matching
- Record demo trace data
- Test end-to-end flow
- Performance profiling & optimization

---

## Open Questions

1. **Should nodes support OR logic between multiple `spanMatch` blocks?**
   - Current design: Single `spanMatch` with AND logic
   - Alternative: Array of `spanMatch` objects with OR logic
   - Recommendation: Start simple, add later if needed

2. **Should we cache match results for duplicate spans?**
   - Trace data often has duplicate spans (retries, fan-out)
   - Could cache by `(traceId, spanId)` tuple
   - Trade-off: Memory vs CPU
   - Recommendation: Measure first, optimize later

3. **How to handle canvas updates during live replay?**
   - User edits canvas while traces are flowing
   - Need to recreate `SpanMatcher` instance
   - Could debounce updates to avoid thrashing
   - Recommendation: Disable editing during replay

4. **Should we support negation in patterns?**
   - Example: `{ name: "!GET *" }` (anything except GET)
   - Increases complexity significantly
   - Recommendation: Add only if users request it

---

## Related Documentation

- [OTEL Log Association](./otel-log-association.md) - Similar concept for logs
- [Event Schema Implementation](./EVENT-SCHEMA-IMPLEMENTATION-SUMMARY.md) - Event validation
- [Canvas Types Reference](../packages/core/src/types/canvas.ts) - Type definitions

---

## Authors & Changelog

- 2026-02-01: Initial specification (Claude Sonnet 4.5 via Claude Code)
- TBD: Implementation review & feedback
