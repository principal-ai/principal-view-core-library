# Dashboard Schema Reference

## File Location & Naming

Dashboard files use `.dashboard.json` extension in `.principal-views/`:

```
.principal-views/
├── overview.dashboard.json           # Root-level dashboard
└── [storyboard-name]/
    └── feature.dashboard.json        # Storyboard-scoped dashboard
```

## Structure

```typescript
interface DashboardDefinition {
  $schema?: string;                    // "https://principal.ai/schemas/dashboard.v1.json"
  id: string;                          // Unique identifier (kebab-case)
  name: string;                        // Display name
  description?: string;
  owner?: string;                      // Team/owner identifier

  externalLinks?: {
    grafana?: string;
    datadog?: string;
    runbook?: string;
  };

  metrics: MetricDefinition[];
  layout: DashboardLayout;
}
```

## Metric Definition

```typescript
interface MetricDefinition {
  id: string;                          // Unique within dashboard
  name: string;                        // Display name
  description?: string;
  type: 'counter' | 'gauge' | 'histogram';
  unit?: string;                       // e.g., "%", "views", "ms"

  sources: MetricSource[];             // Where data comes from
  query: MetricQuery;                  // How to aggregate

  thresholds?: {
    warning?: number;
    critical?: number;
  };

  alerts?: AlertDefinition[];
  display?: MetricDisplay;
  _mockData?: MockMetricData;          // For prototyping
}
```

### Metric Types

| Type | Use Case | Example |
|------|----------|---------|
| `counter` | Cumulative counts | Total page views, requests |
| `gauge` | Point-in-time values | Error rate %, CPU usage |
| `histogram` | Distribution analysis | Response time percentiles |

## Metric Sources

Link metrics to workflow nodes/events:

```typescript
interface MetricSource {
  type?: 'event' | 'span';
  storyboard: string;                  // Storyboard name
  workflow: string;                    // Workflow within storyboard
  nodes?: string[];                    // Specific node IDs
  event?: string;                      // Event name pattern
}
```

## Query Configuration

```typescript
interface MetricQuery {
  derivation: Derivation;
  filter?: string;                     // e.g., "isMobile = true"
  groupBy?: string[];                  // e.g., ["isMobile", "user.tier"]
  timeGroup?: 'minute' | 'hour' | 'day' | 'week' | 'month';
  window?: string;                     // e.g., "1h", "24h", "7d"
  over?: string;                       // Base for percentage calc
  percentile?: number;                 // For histogram metrics
}
```

### Derivations

| Derivation | Description |
|------------|-------------|
| `count` | Total occurrences |
| `rate` | Occurrences per time unit |
| `sum` | Sum of values |
| `avg` | Average value |
| `min` / `max` | Min/max values |
| `duration` | Time duration |
| `error_rate` | Errors / total |
| `success_rate` | Successes / total |
| `percentage` | Filtered / total (use with `filter`) |
| `p50` / `p95` / `p99` | Percentiles |

## Display Configuration

```typescript
interface MetricDisplay {
  component?: DisplayComponent;
  size?: 'small' | 'medium' | 'large';
  showTrend?: boolean;
  showSparkline?: boolean;
  color?: string;
}
```

### Display Components

| Component | Best For |
|-----------|----------|
| `MetricCard` | Single KPI values |
| `LineChart` | Time series trends |
| `BarChart` | Categorical comparisons |
| `StackedBarChart` | Grouped time series |
| `PieChart` | Part-of-whole |
| `GaugeChart` | Progress/thresholds |
| `Histogram` | Distributions |
| `DataTable` | Tabular data |

## Layout

```typescript
interface DashboardLayout {
  columns?: number;                    // Default: 12
  gap?: number;                        // Pixels between panels
  breakpoints?: {
    mobile?: number;                   // e.g., 768
    tablet?: number;                   // e.g., 1024
  };
  rows: DashboardRow[];
}

interface DashboardRow {
  title?: string;
  panels: PanelPlacement[];
}

interface PanelPlacement {
  id: string;                          // Metric ID
  span?: number;                       // Columns (1-12)
  spanMobile?: number;
  spanTablet?: number;
  spanDesktop?: number;
  height?: number | 'auto';
  minHeight?: number;
}
```

## Mock Data (for prototyping)

```typescript
interface MockMetricData {
  current?: number;
  previous?: number;
  trend?: 'up' | 'down' | 'flat';
  series?: { date: string; value?: number; [key: string]: any }[];
  breakdown?: Record<string, number>;
  histogram?: { buckets: string[]; counts: number[] };
}
```

## Example: Complete Metric

```json
{
  "id": "error-rate",
  "name": "Error Rate",
  "description": "Percentage of requests that failed",
  "type": "gauge",
  "unit": "%",

  "sources": [{
    "storyboard": "api-gateway",
    "workflow": "request-handling",
    "nodes": ["handle-error"]
  }],

  "query": {
    "derivation": "error_rate",
    "window": "1h"
  },

  "thresholds": {
    "warning": 2.0,
    "critical": 5.0
  },

  "display": {
    "component": "MetricCard",
    "size": "medium",
    "showTrend": true,
    "showSparkline": true
  },

  "_mockData": {
    "current": 0.8,
    "previous": 1.2,
    "trend": "down",
    "series": [
      { "date": "2024-03-27T00:00", "value": 1.4 },
      { "date": "2024-03-27T01:00", "value": 1.2 },
      { "date": "2024-03-27T02:00", "value": 0.8 }
    ]
  }
}
```
