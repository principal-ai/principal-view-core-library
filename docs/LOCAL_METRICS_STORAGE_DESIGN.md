# Local Metrics Storage Design: SQLite-Powered Dashboard Data

This document describes the storage architecture for computing and persisting metrics locally, enabling dashboards to display real data from OTEL traces without requiring external infrastructure.

**Companion to**: [DASHBOARD_METRICS_DESIGN.md](./DASHBOARD_METRICS_DESIGN.md) (schema and validation)

---

## Overview

### The Problem

Dashboard definitions (`.dashboard.json`) describe *what* metrics should exist and *how* to derive them from OTEL data. But to actually display metrics, we need:

1. **Ingestion** - Receive matched traces and route to relevant metrics
2. **Aggregation** - Compute counts, rates, percentiles, etc.
3. **Storage** - Persist aggregates for time-series queries
4. **Query** - Serve data to dashboard components

### Why SQLite?

For local development and small-scale deployments, SQLite provides:

| Requirement | SQLite Capability |
|-------------|-------------------|
| Zero configuration | Single file, no server process |
| Time-series queries | Window functions, date arithmetic |
| Aggregations | Built-in SUM, AVG, MIN, MAX, COUNT |
| JSON attributes | JSON1 extension for attribute queries |
| Concurrent reads | WAL mode supports multiple readers |
| Portable | Database is a single file, easy to share/debug |
| Browser-compatible | Via sql.js or similar WASM builds |

### Storage Estimate

For a typical local development scenario:

```
10 metrics × 1440 minute buckets/day × 7 days = ~100,000 rows
~50 bytes/row = ~5MB for rollups

Raw events (24h retention):
1000 events/hour × 24 hours = 24,000 rows
~200 bytes/row = ~5MB for raw events

Total: ~10MB for 7 days of data
```

This is trivially handled by SQLite.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW OVERVIEW                                         │
└─────────────────────────────────────────────────────────────────────────────────────┘

                           ┌──────────────────────┐
                           │   OTEL Collector     │
                           │   (OTLP/HTTP)        │
                           └──────────┬───────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  TRACE REGISTRY MATCHER (existing)                                                   │
│  ────────────────────────────────────                                                │
│  Converts OTLP traces to RegisteredTrace with:                                       │
│  - scenarioMatches: spans where workflow + scenario matched                          │
│  - storyboardMatches: spans where workflow matched (orphaned)                        │
│  - unmatchedSpans: spans that didn't match any workflow                              │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  METRICS INGESTION SERVICE (new)                                                     │
│  ────────────────────────────────                                                    │
│  1. Routes matched spans to relevant metrics (via MetricSourceIndex)                 │
│  2. Stores raw events (short retention for debugging)                                │
│  3. Updates pre-aggregated rollups (longer retention for dashboards)                 │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                  ┌──────────────┐       ┌──────────────┐
                  │ span_events  │       │metric_rollups│
                  │ (24h)        │       │ (7-30 days)  │
                  └──────────────┘       └──────────────┘
                          │                       │
                          └───────────┬───────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  METRICS QUERY SERVICE (new)                                                         │
│  ────────────────────────────                                                        │
│  Implements DataProvider interface for DashboardRenderer                             │
│  - Translates MetricQuery to SQL                                                     │
│  - Handles time range, grouping, derivations                                         │
│  - Returns MetricData for rendering                                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                          ┌──────────────────────┐
                          │  DashboardRenderer   │
                          │  (existing)          │
                          └──────────────────────┘
```

---

## Database Schema

### Core Tables

```sql
-- ============================================================================
-- RAW EVENTS TABLE
-- Short retention (24-48h), enables debugging and ad-hoc queries
-- ============================================================================

CREATE TABLE span_events (
  -- Identity
  id TEXT PRIMARY KEY,                    -- "{traceId}-{spanId}" or UUID
  timestamp INTEGER NOT NULL,             -- Unix milliseconds

  -- Trace context
  trace_id TEXT NOT NULL,
  span_id TEXT,
  parent_span_id TEXT,

  -- Workflow matching (from RegisteredTrace)
  storyboard_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  scenario_id TEXT,                       -- NULL if orphaned (storyboard match only)
  node_id TEXT,

  -- Event data
  event_name TEXT,                        -- Primary event name from span
  span_name TEXT,
  duration_ms REAL,                       -- Span duration in milliseconds
  is_error INTEGER DEFAULT 0,             -- 1 if span status = ERROR

  -- Flexible attributes (for groupBy and filter)
  attributes TEXT,                        -- JSON object

  -- Metadata
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Primary lookup: by workflow and time
CREATE INDEX idx_events_workflow_time
  ON span_events(storyboard_id, workflow_id, timestamp);

-- For cleanup: by timestamp
CREATE INDEX idx_events_timestamp
  ON span_events(timestamp);

-- For trace correlation
CREATE INDEX idx_events_trace
  ON span_events(trace_id);


-- ============================================================================
-- METRIC ROLLUPS TABLE
-- Pre-aggregated buckets, longer retention (7-30 days)
-- ============================================================================

CREATE TABLE metric_rollups (
  -- Composite key
  metric_id TEXT NOT NULL,                -- Dashboard metric ID
  bucket_start INTEGER NOT NULL,          -- Unix milliseconds (start of bucket)
  granularity TEXT NOT NULL,              -- 'minute' | 'hour' | 'day'
  dimension_key TEXT NOT NULL DEFAULT '', -- Serialized groupBy values

  -- Aggregate values
  count INTEGER DEFAULT 0,
  sum_value REAL DEFAULT 0,
  min_value REAL,
  max_value REAL,
  error_count INTEGER DEFAULT 0,

  -- For percentiles (t-digest or HDR histogram serialized)
  duration_digest BLOB,

  -- Metadata
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

  PRIMARY KEY (metric_id, bucket_start, granularity, dimension_key)
);

-- For time-range queries
CREATE INDEX idx_rollups_time
  ON metric_rollups(metric_id, granularity, bucket_start);


-- ============================================================================
-- DASHBOARD METRICS REGISTRY
-- Tracks which metrics exist and their configurations
-- ============================================================================

CREATE TABLE dashboard_metrics (
  metric_id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_type TEXT NOT NULL,              -- 'counter' | 'gauge' | 'histogram'

  -- Serialized configuration
  sources_json TEXT NOT NULL,             -- MetricSource[] as JSON
  query_json TEXT NOT NULL,               -- MetricQuery as JSON

  -- Status
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_metrics_dashboard
  ON dashboard_metrics(dashboard_id);
```

### Dimension Key Format

The `dimension_key` column stores serialized groupBy values for efficient querying:

```
Format: "key1=value1|key2=value2" (sorted alphabetically)

Examples:
  - No groupBy: ""
  - groupBy: ["isMobile"]: "isMobile=true" or "isMobile=false"
  - groupBy: ["isMobile", "user.tier"]: "isMobile=true|user.tier=pro"
```

This enables efficient GROUP BY queries without JSON parsing:

```sql
SELECT bucket_start, dimension_key, SUM(count) as value
FROM metric_rollups
WHERE metric_id = 'daily-views-by-device'
  AND granularity = 'hour'
  AND bucket_start >= ?
GROUP BY bucket_start, dimension_key
```

---

## Ingestion Pipeline

### MetricsIngestionService

```typescript
import type { RegisteredTrace, ScenarioMatch, MatchedSpan } from '@principal-ai/core';
import type { DashboardDefinition, MetricDefinition, MetricSource } from '@principal-ai/core';
import type { Database } from 'better-sqlite3';

interface MetricsIngestionConfig {
  db: Database;
  dashboards: DashboardDefinition[];
  rollupGranularities: Array<'minute' | 'hour' | 'day'>;
  rawEventRetentionMs: number;  // e.g., 24 * 60 * 60 * 1000
}

/**
 * MetricsIngestionService
 *
 * Receives matched traces and:
 * 1. Routes spans to relevant metrics based on dashboard sources
 * 2. Stores raw events for debugging
 * 3. Updates pre-aggregated rollups for dashboard queries
 */
export class MetricsIngestionService {
  private sourceIndex: MetricSourceIndex;
  private insertEventStmt: Statement;
  private upsertRollupStmt: Statement;

  constructor(private config: MetricsIngestionConfig) {
    this.sourceIndex = new MetricSourceIndex(config.dashboards);
    this.prepareStatements();
  }

  /**
   * Main entry point - process a matched trace
   */
  async ingestTrace(trace: RegisteredTrace): Promise<IngestResult> {
    const timestamp = trace.startTime;
    let eventsIngested = 0;
    let metricsUpdated = 0;

    // Process scenario matches (full workflow + scenario match)
    for (const match of trace.scenarioMatches) {
      for (const span of match.matchedSpans) {
        const result = await this.processMatchedSpan(trace, match, span, timestamp);
        eventsIngested += result.eventStored ? 1 : 0;
        metricsUpdated += result.metricsUpdated;
      }
    }

    // Optionally process storyboard matches (orphaned spans)
    for (const match of trace.storyboardMatches) {
      for (const span of match.orphanedSpans) {
        // Store raw event but may not update metrics (depends on config)
        await this.storeRawEvent(trace, match, span, timestamp);
        eventsIngested++;
      }
    }

    return { eventsIngested, metricsUpdated };
  }

  /**
   * Process a single matched span
   */
  private async processMatchedSpan(
    trace: RegisteredTrace,
    match: ScenarioMatch,
    span: MatchedSpan,
    timestamp: number
  ): Promise<{ eventStored: boolean; metricsUpdated: number }> {

    // 1. Find metrics this span contributes to
    const affectedMetrics = this.sourceIndex.findMetrics({
      storyboardId: match.storyboardId,
      workflowId: match.workflowId,
      nodeId: span.nodeId,
      events: span.events,
    });

    // 2. Store raw event
    this.storeRawEvent(trace, match, span, timestamp);

    // 3. Update rollups for each affected metric
    let metricsUpdated = 0;
    for (const metric of affectedMetrics) {
      await this.updateRollups(metric, span, timestamp, trace.hasErrors);
      metricsUpdated++;
    }

    return { eventStored: true, metricsUpdated };
  }

  /**
   * Store raw event for debugging and ad-hoc queries
   */
  private storeRawEvent(
    trace: RegisteredTrace,
    match: ScenarioMatch | StoryboardMatch,
    span: MatchedSpan | OrphanedSpan,
    timestamp: number
  ): void {
    this.insertEventStmt.run({
      id: `${trace.traceId}-${span.spanId}`,
      timestamp,
      trace_id: trace.traceId,
      span_id: span.spanId,
      parent_span_id: span.parentSpanId || null,
      storyboard_id: match.storyboardId,
      workflow_id: match.workflowId,
      scenario_id: 'scenarioId' in match ? match.scenarioId : null,
      node_id: span.nodeId,
      event_name: span.events?.[0] || null,
      span_name: span.spanName,
      duration_ms: span.duration,
      is_error: trace.hasErrors ? 1 : 0,
      attributes: JSON.stringify(span.attributes || {}),
    });
  }

  /**
   * Update rollup aggregates for a metric
   */
  private updateRollups(
    metric: MetricDefinition,
    span: MatchedSpan,
    timestamp: number,
    hasError: boolean
  ): void {
    // Compute dimension key from groupBy attributes
    const dimensionKey = this.computeDimensionKey(
      metric.query.groupBy,
      span.attributes
    );

    // Get the value to aggregate (depends on derivation)
    const value = this.extractValue(metric.query.derivation, span);

    // Update each configured granularity
    for (const granularity of this.config.rollupGranularities) {
      const bucketStart = this.getBucketStart(timestamp, granularity);

      this.upsertRollupStmt.run({
        metric_id: metric.id,
        bucket_start: bucketStart,
        granularity,
        dimension_key: dimensionKey,
        count: 1,
        sum_value: value,
        min_value: value,
        max_value: value,
        error_count: hasError ? 1 : 0,
        duration_digest: this.createDigest(span.duration),
      });
    }
  }

  /**
   * Compute dimension key for groupBy
   */
  private computeDimensionKey(
    groupBy: string[] | undefined,
    attributes: Record<string, unknown> | undefined
  ): string {
    if (!groupBy?.length || !attributes) return '';

    return groupBy
      .map(key => `${key}=${attributes[key] ?? 'null'}`)
      .sort()
      .join('|');
  }

  /**
   * Extract value based on derivation type
   */
  private extractValue(derivation: string, span: MatchedSpan): number {
    switch (derivation) {
      case 'count':
      case 'rate':
        return 1;
      case 'duration':
      case 'p50':
      case 'p95':
      case 'p99':
      case 'avg':
        return span.duration;
      default:
        return 1;
    }
  }

  /**
   * Get bucket start timestamp for granularity
   */
  private getBucketStart(timestamp: number, granularity: string): number {
    const date = new Date(timestamp);

    switch (granularity) {
      case 'minute':
        date.setSeconds(0, 0);
        break;
      case 'hour':
        date.setMinutes(0, 0, 0);
        break;
      case 'day':
        date.setHours(0, 0, 0, 0);
        break;
    }

    return date.getTime();
  }

  /**
   * Cleanup old data based on retention policy
   */
  async cleanup(): Promise<{ eventsDeleted: number; rollupsDeleted: number }> {
    const rawCutoff = Date.now() - this.config.rawEventRetentionMs;

    const eventsResult = this.config.db.prepare(`
      DELETE FROM span_events WHERE timestamp < ?
    `).run(rawCutoff);

    // Keep rollups longer (configurable, default 30 days)
    const rollupCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);

    const rollupsResult = this.config.db.prepare(`
      DELETE FROM metric_rollups WHERE bucket_start < ?
    `).run(rollupCutoff);

    return {
      eventsDeleted: eventsResult.changes,
      rollupsDeleted: rollupsResult.changes,
    };
  }
}
```

### MetricSourceIndex

Fast lookup structure to route spans to metrics:

```typescript
/**
 * Index for fast metric source matching
 *
 * Given a span's (storyboard, workflow, node, events), quickly find
 * all metrics that should be updated.
 */
class MetricSourceIndex {
  // storyboard:workflow → [MetricDefinition, ...]
  private workflowIndex = new Map<string, MetricDefinition[]>();

  // storyboard:workflow:node → [MetricDefinition, ...]
  private nodeIndex = new Map<string, MetricDefinition[]>();

  // storyboard:workflow:event → [MetricDefinition, ...]
  private eventIndex = new Map<string, MetricDefinition[]>();

  constructor(dashboards: DashboardDefinition[]) {
    for (const dashboard of dashboards) {
      for (const metric of dashboard.metrics) {
        this.indexMetric(metric);
      }
    }
  }

  private indexMetric(metric: MetricDefinition): void {
    for (const source of metric.sources) {
      const workflowKey = `${source.storyboard}:${source.workflow}`;

      // Index by workflow
      if (!this.workflowIndex.has(workflowKey)) {
        this.workflowIndex.set(workflowKey, []);
      }
      this.workflowIndex.get(workflowKey)!.push(metric);

      // Index by specific nodes (if specified)
      if (source.nodes?.length) {
        for (const node of source.nodes) {
          const nodeKey = `${workflowKey}:${node}`;
          if (!this.nodeIndex.has(nodeKey)) {
            this.nodeIndex.set(nodeKey, []);
          }
          this.nodeIndex.get(nodeKey)!.push(metric);
        }
      }

      // Index by event (if specified)
      if (source.event) {
        const eventKey = `${workflowKey}:${source.event}`;
        if (!this.eventIndex.has(eventKey)) {
          this.eventIndex.set(eventKey, []);
        }
        this.eventIndex.get(eventKey)!.push(metric);
      }
    }
  }

  /**
   * Find all metrics affected by a span
   */
  findMetrics(lookup: {
    storyboardId: string;
    workflowId: string;
    nodeId?: string;
    events?: string[];
  }): MetricDefinition[] {
    const results = new Set<MetricDefinition>();
    const workflowKey = `${lookup.storyboardId}:${lookup.workflowId}`;

    // Check workflow-level metrics (no node/event filter)
    const workflowMetrics = this.workflowIndex.get(workflowKey) || [];
    for (const metric of workflowMetrics) {
      // Only include if metric has no node/event filters
      const source = metric.sources.find(s =>
        s.storyboard === lookup.storyboardId &&
        s.workflow === lookup.workflowId
      );
      if (source && !source.nodes?.length && !source.event) {
        results.add(metric);
      }
    }

    // Check node-specific metrics
    if (lookup.nodeId) {
      const nodeKey = `${workflowKey}:${lookup.nodeId}`;
      const nodeMetrics = this.nodeIndex.get(nodeKey) || [];
      for (const metric of nodeMetrics) {
        results.add(metric);
      }
    }

    // Check event-specific metrics
    if (lookup.events?.length) {
      for (const event of lookup.events) {
        const eventKey = `${workflowKey}:${event}`;
        const eventMetrics = this.eventIndex.get(eventKey) || [];
        for (const metric of eventMetrics) {
          results.add(metric);
        }
      }
    }

    return Array.from(results);
  }
}
```

---

## Query Service

### MetricsQueryService

Implements `DataProvider` interface for `DashboardRenderer`:

```typescript
import type {
  DataProvider,
  MetricData,
  DashboardDefinition,
  MetricDefinition,
  TimeRange,
  TimeSeriesPoint
} from '@principal-ai/core';

/**
 * MetricsQueryService
 *
 * Implements DataProvider to serve real metric data to DashboardRenderer.
 * Translates MetricQuery definitions to SQL queries against rollup tables.
 */
export class MetricsQueryService implements DataProvider {
  private metricsMap: Map<string, MetricDefinition>;

  constructor(
    private db: Database,
    private dashboard: DashboardDefinition,
    private timeRange: TimeRange
  ) {
    this.metricsMap = new Map(
      dashboard.metrics.map(m => [m.id, m])
    );
  }

  get(metricId: string): MetricData {
    const metric = this.metricsMap.get(metricId);
    if (!metric) {
      return { error: `Unknown metric: ${metricId}` };
    }
    return this.queryMetric(metric);
  }

  getAll(): Record<string, MetricData> {
    const result: Record<string, MetricData> = {};
    for (const metric of this.dashboard.metrics) {
      result[metric.id] = this.queryMetric(metric);
    }
    return result;
  }

  private queryMetric(metric: MetricDefinition): MetricData {
    try {
      const { start, end } = this.resolveTimeRange();
      const { query } = metric;

      // Select appropriate granularity based on time range
      const granularity = this.selectGranularity(query.timeGroup, start, end);

      if (query.timeGroup) {
        return this.queryTimeSeries(metric, granularity, start, end);
      } else {
        return this.querySingleValue(metric, start, end);
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Query failed' };
    }
  }

  /**
   * Query time series data
   */
  private queryTimeSeries(
    metric: MetricDefinition,
    granularity: string,
    start: number,
    end: number
  ): MetricData {
    const { query } = metric;
    const selectExpr = this.getSelectExpression(query.derivation);

    const sql = `
      SELECT
        bucket_start,
        dimension_key,
        ${selectExpr} as value
      FROM metric_rollups
      WHERE metric_id = ?
        AND granularity = ?
        AND bucket_start >= ?
        AND bucket_start < ?
      GROUP BY bucket_start, dimension_key
      ORDER BY bucket_start ASC
    `;

    const rows = this.db.prepare(sql).all(metric.id, granularity, start, end);

    return {
      series: this.transformToSeries(rows, query.groupBy, granularity),
    };
  }

  /**
   * Query single aggregate value with trend
   */
  private querySingleValue(
    metric: MetricDefinition,
    start: number,
    end: number
  ): MetricData {
    const windowMs = end - start;

    // Current period
    const current = this.aggregateWindow(metric, start, end);

    // Previous period (for trend calculation)
    const previous = this.aggregateWindow(metric, start - windowMs, start);

    const trend = current > previous ? 'up' : current < previous ? 'down' : 'flat';
    const changePercent = previous > 0
      ? Math.round(((current - previous) / previous) * 100 * 10) / 10
      : 0;

    return { current, previous, trend, changePercent };
  }

  /**
   * Aggregate a time window into single value
   */
  private aggregateWindow(metric: MetricDefinition, start: number, end: number): number {
    const { derivation } = metric.query;
    const selectExpr = this.getSelectExpression(derivation);

    // Use finest granularity available for accuracy
    const sql = `
      SELECT ${selectExpr} as value
      FROM metric_rollups
      WHERE metric_id = ?
        AND granularity = 'minute'
        AND bucket_start >= ?
        AND bucket_start < ?
    `;

    const result = this.db.prepare(sql).get(metric.id, start, end) as { value: number } | undefined;
    return result?.value ?? 0;
  }

  /**
   * Get SQL expression for derivation type
   */
  private getSelectExpression(derivation: string): string {
    switch (derivation) {
      case 'count':
        return 'SUM(count)';
      case 'sum':
        return 'SUM(sum_value)';
      case 'avg':
        return 'SUM(sum_value) / NULLIF(SUM(count), 0)';
      case 'min':
        return 'MIN(min_value)';
      case 'max':
        return 'MAX(max_value)';
      case 'rate':
        // Per-minute rate
        return 'SUM(count) * 1.0 / COUNT(DISTINCT bucket_start)';
      case 'error_rate':
        return 'SUM(error_count) * 100.0 / NULLIF(SUM(count), 0)';
      case 'success_rate':
        return '(SUM(count) - SUM(error_count)) * 100.0 / NULLIF(SUM(count), 0)';
      default:
        return 'SUM(count)';
    }
  }

  /**
   * Transform SQL rows to TimeSeriesPoint[]
   */
  private transformToSeries(
    rows: Array<{ bucket_start: number; dimension_key: string; value: number }>,
    groupBy: string[] | undefined,
    granularity: string
  ): TimeSeriesPoint[] {
    if (!groupBy?.length) {
      // Simple series without grouping
      return rows.map(row => ({
        date: this.formatDate(row.bucket_start, granularity),
        value: row.value,
      }));
    }

    // Grouped series - pivot dimension_key into columns
    const bucketMap = new Map<number, TimeSeriesPoint>();

    for (const row of rows) {
      if (!bucketMap.has(row.bucket_start)) {
        bucketMap.set(row.bucket_start, {
          date: this.formatDate(row.bucket_start, granularity),
        });
      }

      const point = bucketMap.get(row.bucket_start)!;

      // Extract group value from dimension_key
      // e.g., "isMobile=true" → point.true = value
      const groupValue = this.extractGroupValue(row.dimension_key, groupBy[0]);
      point[groupValue] = row.value;
    }

    return Array.from(bucketMap.values());
  }

  /**
   * Select optimal granularity based on time range
   */
  private selectGranularity(
    requestedGranularity: string | undefined,
    start: number,
    end: number
  ): string {
    if (requestedGranularity) return requestedGranularity;

    const hours = (end - start) / (1000 * 60 * 60);

    if (hours <= 2) return 'minute';
    if (hours <= 48) return 'hour';
    return 'day';
  }

  /**
   * Format timestamp for display
   */
  private formatDate(timestamp: number, granularity: string): string {
    const date = new Date(timestamp);

    switch (granularity) {
      case 'minute':
        return date.toISOString().slice(11, 16); // HH:MM
      case 'hour':
        return date.toISOString().slice(11, 13) + ':00'; // HH:00
      case 'day':
        return date.toISOString().slice(0, 10); // YYYY-MM-DD
      default:
        return date.toISOString().slice(0, 10);
    }
  }

  /**
   * Resolve TimeRange to start/end timestamps
   */
  private resolveTimeRange(): { start: number; end: number } {
    const now = Date.now();

    if (this.timeRange.start && this.timeRange.end) {
      return {
        start: this.timeRange.start.getTime(),
        end: this.timeRange.end.getTime(),
      };
    }

    // Preset ranges
    const presetMs: Record<string, number> = {
      'last_5m': 5 * 60 * 1000,
      'last_15m': 15 * 60 * 1000,
      'last_30m': 30 * 60 * 1000,
      'last_1h': 60 * 60 * 1000,
      'last_3h': 3 * 60 * 60 * 1000,
      'last_6h': 6 * 60 * 60 * 1000,
      'last_12h': 12 * 60 * 60 * 1000,
      'last_24h': 24 * 60 * 60 * 1000,
      'last_7d': 7 * 24 * 60 * 60 * 1000,
      'last_30d': 30 * 24 * 60 * 60 * 1000,
    };

    const ms = presetMs[this.timeRange.preset || 'last_1h'] || presetMs['last_1h'];

    return { start: now - ms, end: now };
  }

  private extractGroupValue(dimensionKey: string, groupBy: string): string {
    // Parse "isMobile=true|user.tier=pro" format
    const parts = dimensionKey.split('|');
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === groupBy) return value;
    }
    return 'unknown';
  }
}
```

---

## Percentile Handling

For `p50`, `p95`, `p99` derivations, we need distribution data that can be merged across time buckets.

### Option A: t-digest (Recommended)

Store t-digest centroids as binary blob:

```typescript
import { TDigest } from 'tdigest';

class PercentileStore {
  /**
   * Create a new digest from a single value
   */
  createDigest(value: number): Buffer {
    const td = new TDigest();
    td.push(value);
    return Buffer.from(td.serialize());
  }

  /**
   * Merge two digests (used in UPSERT)
   */
  mergeDigests(a: Buffer, b: Buffer): Buffer {
    const tdA = TDigest.deserialize(a);
    const tdB = TDigest.deserialize(b);
    tdA.merge(tdB);
    return Buffer.from(tdA.serialize());
  }

  /**
   * Get percentile from digest
   */
  getPercentile(digest: Buffer, percentile: number): number {
    const td = TDigest.deserialize(digest);
    return td.percentile(percentile / 100);
  }
}
```

Register as SQLite user function:

```typescript
db.function('merge_digest', (a: Buffer | null, b: Buffer) => {
  if (!a) return b;
  return percentileStore.mergeDigests(a, b);
});
```

### Option B: Histogram Buckets

For simpler implementation, store fixed histogram buckets:

```sql
CREATE TABLE metric_histograms (
  metric_id TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  granularity TEXT NOT NULL,
  dimension_key TEXT NOT NULL DEFAULT '',

  -- Fixed buckets (latency in ms)
  bucket_0_50 INTEGER DEFAULT 0,      -- 0-50ms
  bucket_50_100 INTEGER DEFAULT 0,    -- 50-100ms
  bucket_100_200 INTEGER DEFAULT 0,   -- 100-200ms
  bucket_200_500 INTEGER DEFAULT 0,   -- 200-500ms
  bucket_500_1000 INTEGER DEFAULT 0,  -- 500ms-1s
  bucket_1000_plus INTEGER DEFAULT 0, -- >1s

  PRIMARY KEY (metric_id, bucket_start, granularity, dimension_key)
);
```

Calculate approximate percentiles from bucket distributions.

---

## Integration with Existing Components

### Connecting to DashboardRenderer

```typescript
import { DashboardRenderer } from '@principal-ai/react';
import { MetricsQueryService } from './MetricsQueryService';

function LiveDashboard({ dashboard, db }: Props) {
  const [timeRange, setTimeRange] = useState<TimeRange>({ preset: 'last_1h' });
  const [refreshKey, setRefreshKey] = useState(0);

  // Create query service as data provider
  const dataProvider = useMemo(
    () => new MetricsQueryService(db, dashboard, timeRange),
    [db, dashboard, timeRange, refreshKey]
  );

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <DashboardRenderer
      dashboard={dashboard}
      dataProvider={dataProvider}
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
    />
  );
}
```

### Connecting to TraceRegistryMatcher

```typescript
// In your OTLP receiver
async function handleOtlpTraces(request: OtelExportTraceServiceRequest) {
  // 1. Match against registry (existing)
  const registeredTrace = await traceRegistryMatcher.matchTrace(request);

  // 2. Ingest into metrics storage (new)
  await metricsIngestionService.ingestTrace(registeredTrace);

  // 3. Optionally emit for real-time visualization
  eventEmitter.emit('trace', registeredTrace);
}
```

---

## Maintenance Operations

### Cleanup Job

```typescript
// Run periodically (e.g., every hour)
async function runCleanup() {
  const result = await metricsIngestionService.cleanup();
  console.log(`Cleanup: deleted ${result.eventsDeleted} events, ${result.rollupsDeleted} rollups`);
}

// Schedule with node-cron or similar
cron.schedule('0 * * * *', runCleanup);
```

### Dashboard Registration

When dashboards are loaded or changed:

```typescript
async function syncDashboards(dashboards: DashboardDefinition[]) {
  const db = getDatabase();

  // Clear existing metric registrations
  db.prepare('DELETE FROM dashboard_metrics').run();

  // Register all metrics
  const insert = db.prepare(`
    INSERT INTO dashboard_metrics (metric_id, dashboard_id, metric_name, metric_type, sources_json, query_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const dashboard of dashboards) {
    for (const metric of dashboard.metrics) {
      insert.run(
        metric.id,
        dashboard.id,
        metric.name,
        metric.type,
        JSON.stringify(metric.sources),
        JSON.stringify(metric.query)
      );
    }
  }

  // Rebuild source index
  metricsIngestionService.rebuildIndex(dashboards);
}
```

---

## Performance Considerations

### Write Path

| Operation | Frequency | Optimization |
|-----------|-----------|--------------|
| Insert raw event | Per span | Batch inserts, async |
| Update rollups | Per span × granularities | Prepared statements, UPSERT |
| Source matching | Per span | In-memory index |

### Read Path

| Query Type | Optimization |
|------------|--------------|
| Time series | Index on (metric_id, granularity, bucket_start) |
| Single value | Aggregate from finest granularity |
| Grouped queries | Pre-computed dimension_key |

### WAL Mode

Enable WAL for concurrent reads during writes:

```typescript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');  // Faster with acceptable durability
```

---

## Event Coverage Analysis

A key benefit of targeted metrics is identifying **unused telemetry** - events that are defined but never used, or expected but never seen.

### Coverage Scenarios

| Scenario | Detection | Action |
|----------|-----------|--------|
| **Defined, never fired** | Event in canvas schema, never seen in traces | Remove from schema or fix instrumentation |
| **Fired, not used** | Event seen in traces, no metric references it | Remove instrumentation (cost savings) or add metric |
| **Expected, never seen** | Metric references event, zero data | Fix instrumentation or remove metric |

### Schema: Event Registry

Track all events we've seen:

```sql
-- ============================================================================
-- EVENT REGISTRY
-- Tracks all observed events and their usage
-- ============================================================================

CREATE TABLE event_registry (
  -- Identity
  event_key TEXT PRIMARY KEY,             -- "storyboard:workflow:node:event"

  -- Components
  storyboard_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  node_id TEXT,
  event_name TEXT,

  -- Observation stats
  first_seen_at INTEGER,                  -- Unix ms
  last_seen_at INTEGER,                   -- Unix ms
  total_count INTEGER DEFAULT 0,

  -- Usage tracking
  used_by_metrics TEXT,                   -- JSON array of metric IDs
  defined_in_canvas INTEGER DEFAULT 0,    -- 1 if in canvas schema

  -- Metadata
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX idx_event_registry_storyboard
  ON event_registry(storyboard_id, workflow_id);
```

### EventCoverageService

```typescript
interface EventCoverage {
  // Events defined in canvas but never seen
  definedButNeverFired: EventRef[];

  // Events seen but no metric uses them
  firedButUnused: EventRef[];

  // Metrics expecting events that never fire
  metricsWithNoData: MetricRef[];

  // Summary stats
  stats: {
    totalDefinedEvents: number;
    totalObservedEvents: number;
    totalMetricSources: number;
    coveragePercent: number;
  };
}

class EventCoverageService {
  constructor(
    private db: Database,
    private dashboards: DashboardDefinition[],
    private canvasSchemas: CanvasSchema[]
  ) {}

  /**
   * Update registry when an event is observed
   */
  recordEvent(
    storyboardId: string,
    workflowId: string,
    nodeId: string | undefined,
    eventName: string | undefined
  ): void {
    const eventKey = this.makeEventKey(storyboardId, workflowId, nodeId, eventName);
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO event_registry
        (event_key, storyboard_id, workflow_id, node_id, event_name,
         first_seen_at, last_seen_at, total_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT (event_key) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        total_count = total_count + 1,
        updated_at = excluded.last_seen_at
    `).run(eventKey, storyboardId, workflowId, nodeId, eventName, now, now);
  }

  /**
   * Analyze coverage across definitions, observations, and usage
   */
  analyzeCoverage(): EventCoverage {
    // 1. Get all defined events from canvas schemas
    const definedEvents = this.extractDefinedEvents();

    // 2. Get all observed events from registry
    const observedEvents = this.getObservedEvents();

    // 3. Get all events referenced by metrics
    const metricSources = this.extractMetricSources();

    // 4. Cross-reference to find gaps
    return this.computeCoverage(definedEvents, observedEvents, metricSources);
  }

  /**
   * Find events defined in canvas but never observed
   */
  private findDefinedButNeverFired(
    defined: Set<string>,
    observed: Set<string>
  ): EventRef[] {
    const missing: EventRef[] = [];

    for (const eventKey of defined) {
      if (!observed.has(eventKey)) {
        missing.push(this.parseEventKey(eventKey));
      }
    }

    return missing;
  }

  /**
   * Find events observed but not used by any metric
   */
  private findFiredButUnused(
    observed: Set<string>,
    usedByMetrics: Set<string>
  ): EventRef[] {
    const unused: EventRef[] = [];

    for (const eventKey of observed) {
      if (!usedByMetrics.has(eventKey)) {
        unused.push(this.parseEventKey(eventKey));
      }
    }

    return unused;
  }

  /**
   * Find metrics referencing events that never fire
   */
  private findMetricsWithNoData(
    metricSources: Map<string, string[]>,  // metricId → eventKeys
    observed: Set<string>
  ): MetricRef[] {
    const noData: MetricRef[] = [];

    for (const [metricId, eventKeys] of metricSources) {
      const hasData = eventKeys.some(key => observed.has(key));
      if (!hasData) {
        noData.push({ metricId, expectedEvents: eventKeys });
      }
    }

    return noData;
  }

  /**
   * Generate coverage report
   */
  generateReport(): string {
    const coverage = this.analyzeCoverage();

    let report = `# Event Coverage Report\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;

    report += `## Summary\n\n`;
    report += `| Metric | Value |\n`;
    report += `|--------|-------|\n`;
    report += `| Defined events | ${coverage.stats.totalDefinedEvents} |\n`;
    report += `| Observed events | ${coverage.stats.totalObservedEvents} |\n`;
    report += `| Metric sources | ${coverage.stats.totalMetricSources} |\n`;
    report += `| Coverage | ${coverage.stats.coveragePercent.toFixed(1)}% |\n\n`;

    if (coverage.definedButNeverFired.length > 0) {
      report += `## Defined But Never Fired\n\n`;
      report += `These events are in your canvas schemas but have never been observed.\n\n`;
      for (const event of coverage.definedButNeverFired) {
        report += `- \`${event.storyboard}/${event.workflow}\` → \`${event.event}\`\n`;
      }
      report += `\n`;
    }

    if (coverage.firedButUnused.length > 0) {
      report += `## Fired But Unused\n\n`;
      report += `These events fire but no dashboard metric uses them. Consider removing instrumentation.\n\n`;
      for (const event of coverage.firedButUnused) {
        report += `- \`${event.storyboard}/${event.workflow}\` → \`${event.event}\`\n`;
        report += `  - Last seen: ${event.lastSeen}\n`;
        report += `  - Total count: ${event.totalCount}\n`;
      }
      report += `\n`;
    }

    if (coverage.metricsWithNoData.length > 0) {
      report += `## Metrics With No Data\n\n`;
      report += `These metrics expect events that have never been observed.\n\n`;
      for (const metric of coverage.metricsWithNoData) {
        report += `- **${metric.metricId}**\n`;
        report += `  - Expected: ${metric.expectedEvents.join(', ')}\n`;
      }
      report += `\n`;
    }

    return report;
  }

  private makeEventKey(
    storyboard: string,
    workflow: string,
    node: string | undefined,
    event: string | undefined
  ): string {
    return [storyboard, workflow, node || '*', event || '*'].join(':');
  }

  private parseEventKey(key: string): EventRef {
    const [storyboard, workflow, node, event] = key.split(':');
    return {
      storyboard,
      workflow,
      node: node === '*' ? undefined : node,
      event: event === '*' ? undefined : event,
    };
  }
}
```

### CLI Integration

```bash
# Generate coverage report
$ principal metrics coverage

Event Coverage Report
=====================

Summary:
  Defined events:  47
  Observed events: 38
  Metric sources:  12
  Coverage:        80.9%

Defined But Never Fired (9):
  - activity-feed/feed-load → activity-feed.error.displayed
  - activity-feed/feed-load → activity-feed.retry.clicked
  ...

Fired But Unused (26):
  - checkout/payment → payment.method.selected
    Last seen: 2 hours ago | Total: 1,247
  - checkout/payment → payment.validation.started
    Last seen: 2 hours ago | Total: 1,102
  ...

  Consider: These events cost money but no dashboard uses them.
  Run 'principal metrics suggest' to get metric suggestions.

Metrics With No Data (0):
  All metrics are receiving data.
```

### Telemetry Cost Optimization

The "fired but unused" report directly feeds into cost optimization:

```typescript
interface TelemetryCostEstimate {
  event: EventRef;
  monthlyVolume: number;
  estimatedCostPerMonth: number;  // Based on backend pricing
  usedByMetrics: boolean;
}

function estimateSavings(unusedEvents: EventRef[]): number {
  // Estimate cost savings from removing unused instrumentation
  let totalSavings = 0;

  for (const event of unusedEvents) {
    const stats = getEventStats(event);
    const monthlyCost = estimateCost(stats.monthlyVolume);
    totalSavings += monthlyCost;
  }

  return totalSavings;
}
```

### Integration with Ingestion

Update the ingestion service to track events:

```typescript
class MetricsIngestionService {
  constructor(
    private config: MetricsIngestionConfig,
    private coverageService: EventCoverageService  // Add this
  ) {}

  private async processMatchedSpan(
    trace: RegisteredTrace,
    match: ScenarioMatch,
    span: MatchedSpan,
    timestamp: number
  ): Promise<{ eventStored: boolean; metricsUpdated: number }> {

    // Track this event in the registry
    this.coverageService.recordEvent(
      match.storyboardId,
      match.workflowId,
      span.nodeId,
      span.events?.[0]
    );

    // ... rest of ingestion logic
  }
}
```

### Validation Rules

Add to your validation pipeline:

```typescript
const COVERAGE_RULES = {
  'coverage/no-orphan-events': {
    severity: 'warning',
    message: 'Event defined in canvas but never observed',
    check: (coverage) => coverage.definedButNeverFired.length === 0,
  },

  'coverage/no-unused-telemetry': {
    severity: 'info',
    message: 'Event is instrumented but not used by any metric',
    check: (coverage) => coverage.firedButUnused.length === 0,
  },

  'coverage/metrics-have-data': {
    severity: 'error',
    message: 'Metric references events that never fire',
    check: (coverage) => coverage.metricsWithNoData.length === 0,
  },
};
```

---

## Future Considerations

### Scaling Beyond SQLite

If data volume grows beyond SQLite's practical limits:

1. **DuckDB** - Better for analytical queries, similar simplicity
2. **TimescaleDB** - PostgreSQL extension for time-series
3. **ClickHouse** - Column-oriented, excellent for aggregations

The abstraction through `DataProvider` interface makes backend swapping straightforward.

### Distributed Scenarios

For multi-service deployments:

1. Each service runs local SQLite for its metrics
2. Central aggregation service collects from services
3. Or: Direct push to shared time-series database

---

## Related Documents

- [DASHBOARD_METRICS_DESIGN.md](./DASHBOARD_METRICS_DESIGN.md) - Dashboard schema and validation
- [LIBRARY_TELEMETRY_AND_MATCHING.md](./LIBRARY_TELEMETRY_AND_MATCHING.md) - Trace matching design
- [LOCAL_DEVELOPMENT_REGISTRY.md](./LOCAL_DEVELOPMENT_REGISTRY.md) - Registry architecture
