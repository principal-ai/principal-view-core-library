# Dashboard UI Generation Design

This document outlines the approach for generating dashboard UIs from dashboard definition files, with a focus on prototyping with mock data before formalizing the schema.

## Goal

Render a functional dashboard UI directly from a `.dashboard.json` file:

```
dashboard.json  →  React Component  →  Interactive Dashboard
     │                   │                    │
     │                   │                    ├── Metric cards
     │                   │                    ├── Charts
     │                   │                    └── Source links
     │                   │
     │                   └── Layout engine
     │
     └── Schema + mock data
```

## Why UI First?

1. **Validate the schema** - See if the JSON structure produces useful UIs
2. **Discover missing fields** - Find what's needed that we haven't thought of
3. **Test with mock data** - Work without real OTEL infrastructure
4. **Iterate quickly** - Change JSON, see results immediately

---

## Approach Options

### Option A: Custom Renderer (Recommended for MVP)

Build a simple `<DashboardRenderer>` component that maps dashboard JSON to existing chart components.

```tsx
// packages/react/src/components/DashboardRenderer.tsx

interface DashboardRendererProps {
  dashboard: DashboardDefinition;
  data: MockDataProvider | RealDataProvider;
}

function DashboardRenderer({ dashboard, data }: DashboardRendererProps) {
  return (
    <div className="dashboard">
      <DashboardHeader dashboard={dashboard} />

      {dashboard.layout.rows.map(row => (
        <DashboardRow key={row.title}>
          {row.panels.map(panelId => {
            const metric = dashboard.metrics.find(m => m.id === panelId);
            return <MetricPanel metric={metric} data={data.get(panelId)} />;
          })}
        </DashboardRow>
      ))}
    </div>
  );
}
```

**Pros:**
- Full control
- Uses existing component library
- Simple to understand

**Cons:**
- Must build everything ourselves
- Layout logic is custom

### Option B: json-render Integration

Use [vercel-labs/json-render](https://github.com/vercel-labs/json-render) for component rendering with a defined catalog.

```tsx
// Define a catalog of dashboard components
const dashboardCatalog = createCatalog({
  MetricCard: {
    component: MetricCard,
    props: z.object({
      title: z.string(),
      value: z.number(),
      unit: z.string(),
      trend: z.enum(['up', 'down', 'flat']).optional(),
    }),
  },
  LineChart: {
    component: LineChart,
    props: z.object({
      data: z.array(z.object({ x: z.number(), y: z.number() })),
      xLabel: z.string(),
      yLabel: z.string(),
    }),
  },
  BarChart: { /* ... */ },
  PieChart: { /* ... */ },
  DataTable: { /* ... */ },
});

// Render dashboard from JSON
<Renderer catalog={dashboardCatalog} spec={dashboardSpec} />
```

**Pros:**
- Schema validation built-in (Zod)
- Multi-platform potential (could render to PDF reports)
- Actions/interactions handled

**Cons:**
- Additional dependency
- May be overkill for our needs
- Learning curve

### Option C: Hybrid

Use json-render for the component rendering, but our own layout/data logic.

---

## Recommended: Start with Option A, Evolve to C

1. **Phase 1**: Build `<DashboardRenderer>` with hardcoded component mapping
2. **Phase 2**: Extract component catalog pattern as we add more components
3. **Phase 3**: Consider json-render if we need multi-platform or AI generation

---

## Component Catalog

### Metric Display Components

| Component | Use Case | Props |
|-----------|----------|-------|
| `MetricCard` | Single value display | `title`, `value`, `unit`, `trend`, `sparkline?` |
| `MetricCardWithComparison` | Value with period comparison | `title`, `current`, `previous`, `unit` |
| `GaugeChart` | Percentage/threshold display | `value`, `min`, `max`, `thresholds` |

### Time Series Components

| Component | Use Case | Props |
|-----------|----------|-------|
| `LineChart` | Trends over time | `data`, `xAxis`, `yAxis`, `series[]` |
| `AreaChart` | Cumulative trends | `data`, `stacked?` |
| `BarChart` | Discrete comparisons | `data`, `orientation`, `grouped?` |

### Distribution Components

| Component | Use Case | Props |
|-----------|----------|-------|
| `PieChart` | Part of whole | `data`, `showLegend` |
| `Histogram` | Value distribution | `buckets`, `values` |
| `Heatmap` | Two-dimensional distribution | `data`, `xLabels`, `yLabels` |

### Tabular Components

| Component | Use Case | Props |
|-----------|----------|-------|
| `DataTable` | Detailed breakdowns | `columns`, `rows`, `sortable` |
| `TopNList` | Ranked items | `items`, `valueKey`, `limit` |

### Navigation/Context Components

| Component | Use Case | Props |
|-----------|----------|-------|
| `SourceLink` | Link to workflow/canvas | `storyboard`, `workflow`, `node` |
| `TimeRangePicker` | Filter time window | `value`, `onChange`, `presets` |
| `FilterBar` | Dimension filtering | `dimensions`, `values`, `onChange` |

---

## Mapping Metric Types to Components

The metric `type` and `query` determine which component to use:

```typescript
function getComponentForMetric(metric: MetricDefinition): ComponentType {
  const { type, query } = metric;

  // Counter with time grouping → line/bar chart
  if (type === 'counter' && query.timeGroup) {
    return query.groupBy?.length ? 'StackedBarChart' : 'LineChart';
  }

  // Counter without time → single value
  if (type === 'counter' && !query.timeGroup) {
    return 'MetricCard';
  }

  // Gauge (percentage) → gauge or metric card
  if (type === 'gauge') {
    return metric.thresholds ? 'GaugeChart' : 'MetricCard';
  }

  // Histogram → histogram or percentile display
  if (type === 'histogram') {
    return query.percentile ? 'MetricCard' : 'Histogram';
  }

  return 'MetricCard'; // fallback
}
```

---

## Mock Data System

### Mock Data Provider Interface

```typescript
interface MockDataProvider {
  // Get data for a specific metric
  get(metricId: string): MetricData;

  // Generate realistic mock data based on metric definition
  generate(metric: MetricDefinition): MetricData;
}

interface MetricData {
  current: number | DataPoint[];
  previous?: number | DataPoint[];
  series?: TimeSeries[];
  breakdown?: Record<string, number>;
}

interface DataPoint {
  timestamp: number;
  value: number;
  dimensions?: Record<string, string>;
}
```

### Mock Data Generation

```typescript
function generateMockData(metric: MetricDefinition): MetricData {
  const { type, query } = metric;

  if (query.timeGroup === 'day') {
    // Generate 7 days of data
    return {
      series: generateTimeSeries({
        points: 7,
        interval: 'day',
        baseValue: 1000,
        variance: 0.2,
        groupBy: query.groupBy,
      }),
    };
  }

  if (type === 'gauge' && query.derivation === 'percentage') {
    return {
      current: Math.random() * 100,
      previous: Math.random() * 100,
    };
  }

  // ... more generation logic
}
```

### Inline Mock Data in Dashboard (for prototyping)

```json
{
  "id": "daily-home-page-views",
  "name": "Daily Home Page Views",
  "type": "counter",
  "query": { "derivation": "count", "timeGroup": "day" },

  "_mockData": {
    "series": [
      { "date": "2024-03-21", "value": 28493 },
      { "date": "2024-03-22", "value": 31247 },
      { "date": "2024-03-23", "value": 29102 },
      { "date": "2024-03-24", "value": 27856 },
      { "date": "2024-03-25", "value": 30421 },
      { "date": "2024-03-26", "value": 32109 },
      { "date": "2024-03-27", "value": 29876 }
    ]
  }
}
```

---

## Prototype Structure

### File Organization

```
packages/react/
├── src/
│   ├── components/
│   │   └── dashboard/
│   │       ├── DashboardRenderer.tsx      # Main renderer
│   │       ├── DashboardHeader.tsx        # Title, description, links
│   │       ├── DashboardRow.tsx           # Layout row
│   │       ├── MetricPanel.tsx            # Wrapper for metric display
│   │       ├── components/                # Individual chart components
│   │       │   ├── MetricCard.tsx
│   │       │   ├── LineChart.tsx
│   │       │   ├── BarChart.tsx
│   │       │   ├── GaugeChart.tsx
│   │       │   └── SourceLink.tsx
│   │       ├── mock/
│   │       │   ├── MockDataProvider.ts
│   │       │   └── generators.ts
│   │       └── types.ts                   # Dashboard types (temporary)
│   └── stories/
│       └── dashboard/
│           ├── DashboardRenderer.stories.tsx
│           ├── sample-dashboards/
│           │   ├── activity-feed-analytics.dashboard.json
│           │   └── checkout-health.dashboard.json
│           └── MetricCard.stories.tsx
```

### Storybook Stories

```tsx
// DashboardRenderer.stories.tsx
import activityFeedDashboard from './sample-dashboards/activity-feed-analytics.dashboard.json';

export default {
  title: 'Dashboard/DashboardRenderer',
  component: DashboardRenderer,
};

export const ActivityFeedAnalytics = {
  args: {
    dashboard: activityFeedDashboard,
    dataProvider: new MockDataProvider(),
  },
};

export const WithRealData = {
  args: {
    dashboard: activityFeedDashboard,
    dataProvider: new OTELDataProvider({ endpoint: '/api/metrics' }),
  },
};
```

---

## Sample Dashboard JSON (for prototyping)

```json
{
  "$schema": "https://principal.ai/schemas/dashboard.v1.json",
  "id": "activity-feed-analytics",
  "name": "Activity Feed Analytics",
  "description": "User engagement metrics for the activity feed",

  "metrics": [
    {
      "id": "mobile-view-percentage",
      "name": "Mobile View %",
      "description": "Percentage of views from mobile devices",
      "type": "gauge",
      "unit": "percent",
      "display": {
        "component": "MetricCard",
        "size": "small",
        "showTrend": true
      },
      "query": {
        "derivation": "percentage",
        "filter": "isMobile = true"
      },
      "_mockData": {
        "current": 34.2,
        "previous": 31.8,
        "trend": "up"
      }
    },
    {
      "id": "daily-home-page-views",
      "name": "Daily Page Views",
      "description": "Home page views per day",
      "type": "counter",
      "unit": "views",
      "display": {
        "component": "LineChart",
        "size": "large"
      },
      "query": {
        "derivation": "count",
        "timeGroup": "day"
      },
      "_mockData": {
        "series": [
          { "date": "2024-03-21", "value": 28493 },
          { "date": "2024-03-22", "value": 31247 },
          { "date": "2024-03-23", "value": 29102 },
          { "date": "2024-03-24", "value": 27856 },
          { "date": "2024-03-25", "value": 30421 },
          { "date": "2024-03-26", "value": 32109 },
          { "date": "2024-03-27", "value": 29876 }
        ]
      }
    },
    {
      "id": "views-by-viewport",
      "name": "Views by Viewport",
      "description": "Daily views split by mobile/desktop",
      "type": "counter",
      "unit": "views",
      "display": {
        "component": "StackedBarChart",
        "size": "large"
      },
      "query": {
        "derivation": "count",
        "groupBy": ["isMobile"],
        "timeGroup": "day"
      },
      "_mockData": {
        "series": [
          { "date": "2024-03-25", "mobile": 9847, "desktop": 18646 },
          { "date": "2024-03-26", "mobile": 11023, "desktop": 20224 },
          { "date": "2024-03-27", "mobile": 10156, "desktop": 18946 }
        ]
      }
    }
  ],

  "layout": {
    "rows": [
      {
        "title": "Overview",
        "panels": ["mobile-view-percentage"]
      },
      {
        "title": "Traffic",
        "panels": ["daily-home-page-views", "views-by-viewport"]
      }
    ]
  }
}
```

---

## Next Steps

1. [ ] Create `DashboardRenderer` component in `packages/react`
2. [ ] Create basic chart components (`MetricCard`, `LineChart`, `BarChart`)
3. [ ] Create sample dashboard JSON files
4. [ ] Set up Storybook stories for iteration
5. [ ] Create `MockDataProvider` for generating realistic data
6. [ ] Iterate on schema based on UI needs
7. [ ] Extract types to `packages/core` once stable

---

## Questions to Answer Through Prototyping

1. What display hints do we need in the schema? (`size`, `component`, `color`?)
2. How do we handle responsive layout? (mobile vs desktop dashboard view)
3. What interactions are needed? (drill-down, time range selection, filtering)
4. How do we link back to source workflows? (click metric → see workflow node)
5. What does the loading/error state look like?
6. Should metrics auto-refresh? How to configure?

---

## Related Documents

- [DASHBOARD_METRICS_DESIGN.md](./DASHBOARD_METRICS_DESIGN.md) - Schema and validation design
- [Vercel json-render](https://github.com/vercel-labs/json-render) - Potential rendering framework
