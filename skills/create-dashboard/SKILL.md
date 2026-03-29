---
name: create-dashboard
description: Create .dashboard.json files that define metrics visualizations linked to OTEL workflows. Use when users want to (1) create observability dashboards for their services, (2) define metrics that aggregate data from workflow spans/events, (3) design dashboard layouts with charts and KPI cards, or (4) prototype dashboards with mock data before OTEL instrumentation is complete.
---

# Create Dashboard

Create `.dashboard.json` files that define metrics, their data sources (from OTEL workflows), and visual layouts.

## Workflow

1. **Identify existing storyboards/workflows** - Dashboard metrics source data from workflow nodes
2. **Define metrics** - Determine KPIs: counters, gauges, or histograms
3. **Design layout** - Organize metrics into rows with responsive spans
4. **Add mock data** - Enable prototyping before live OTEL data

## Quick Start

Minimal dashboard:

```json
{
  "$schema": "https://principal.ai/schemas/dashboard.v1.json",
  "id": "service-health",
  "name": "Service Health",
  "metrics": [
    {
      "id": "request-count",
      "name": "Requests",
      "type": "counter",
      "sources": [{ "storyboard": "api", "workflow": "handle-request" }],
      "query": { "derivation": "count", "window": "1h" },
      "display": { "component": "MetricCard" }
    }
  ],
  "layout": {
    "columns": 12,
    "rows": [{ "panels": [{ "id": "request-count", "span": 4 }] }]
  }
}
```

## Metric Patterns

### Counter - Total occurrences

```json
{
  "id": "total-page-views",
  "name": "Page Views",
  "type": "counter",
  "sources": [{ "storyboard": "web", "workflow": "page-load", "event": "page.viewed" }],
  "query": { "derivation": "count", "window": "1h" },
  "display": { "component": "MetricCard", "showSparkline": true }
}
```

### Gauge - Percentage/rate

```json
{
  "id": "error-rate",
  "name": "Error Rate",
  "type": "gauge",
  "unit": "%",
  "sources": [{ "storyboard": "api", "workflow": "request", "nodes": ["handle-error"] }],
  "query": { "derivation": "error_rate", "window": "1h" },
  "thresholds": { "warning": 2.0, "critical": 5.0 },
  "display": { "component": "MetricCard", "showTrend": true }
}
```

### Histogram - Latency percentiles

```json
{
  "id": "response-latency-p95",
  "name": "P95 Latency",
  "type": "histogram",
  "unit": "ms",
  "sources": [{ "storyboard": "api", "workflow": "request" }],
  "query": { "derivation": "p95", "window": "1h" },
  "display": { "component": "MetricCard" }
}
```

### Time series with grouping

```json
{
  "id": "views-by-platform",
  "name": "Views by Platform",
  "type": "counter",
  "sources": [{ "storyboard": "web", "workflow": "page-load" }],
  "query": { "derivation": "count", "groupBy": ["platform"], "timeGroup": "day" },
  "display": { "component": "StackedBarChart", "size": "large" }
}
```

## Layout Patterns

### 3-column KPI row

```json
{
  "title": "Overview",
  "panels": [
    { "id": "metric-1", "span": 4, "spanMobile": 12 },
    { "id": "metric-2", "span": 4, "spanMobile": 12 },
    { "id": "metric-3", "span": 4, "spanMobile": 12 }
  ]
}
```

### 2-column chart row

```json
{
  "title": "Trends",
  "panels": [
    { "id": "chart-1", "span": 6, "spanMobile": 12, "minHeight": 280 },
    { "id": "chart-2", "span": 6, "spanMobile": 12, "minHeight": 280 }
  ]
}
```

## Mock Data

Add `_mockData` for prototyping:

```json
"_mockData": {
  "current": 28493,
  "previous": 26102,
  "trend": "up",
  "series": [
    { "date": "2024-03-27T00:00", "value": 25102 },
    { "date": "2024-03-27T01:00", "value": 26234 }
  ]
}
```

For grouped data:
```json
"_mockData": {
  "series": [
    { "date": "2024-03-21", "mobile": 9847, "desktop": 18646 },
    { "date": "2024-03-22", "mobile": 11023, "desktop": 20224 }
  ]
}
```

## Checklist

Before completing a dashboard:

- [ ] All metric `id`s are unique and kebab-case
- [ ] Each metric has at least one source linking to an existing storyboard/workflow
- [ ] Layout panel `id`s match metric `id`s
- [ ] Responsive spans set (`spanMobile: 12` for full-width on mobile)
- [ ] Charts have `minHeight` for consistent sizing
- [ ] `_mockData` provided for prototyping if no live OTEL data yet

## Reference

See [references/dashboard-schema.md](references/dashboard-schema.md) for complete schema documentation including all derivations, display components, and type definitions.
