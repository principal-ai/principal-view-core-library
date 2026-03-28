/**
 * Dashboard Types (Temporary - will move to packages/core after stabilization)
 *
 * These types define the structure of dashboard definition files and the
 * data format for rendering metrics.
 */

// ============================================================================
// Dashboard Definition Types (from .dashboard.json files)
// ============================================================================

export interface DashboardDefinition {
  $schema?: string;
  id: string;
  name: string;
  description?: string;
  owner?: string;

  externalLinks?: {
    grafana?: string;
    datadog?: string;
    [key: string]: string | undefined;
  };

  metrics: MetricDefinition[];

  layout: DashboardLayout;
}

export interface MetricDefinition {
  id: string;
  name: string;
  description?: string;
  type: MetricType;
  unit?: string;

  sources: MetricSource[];

  query: MetricQuery;

  thresholds?: {
    warning?: number;
    critical?: number;
  };

  alerts?: AlertDefinition[];

  // Display hints for the renderer
  display?: MetricDisplay;

  // Mock data for prototyping (prefixed with _ to indicate non-production)
  _mockData?: MockMetricData;
}

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricSource {
  type?: 'event' | 'span';
  storyboard: string;
  workflow: string;
  nodes?: string[];
  event?: string;
}

export interface MetricQuery {
  derivation: Derivation;
  filter?: string;
  groupBy?: string[];
  timeGroup?: TimeGroup;
  window?: string;
  over?: string;
  percentile?: number;
}

export type Derivation =
  | 'count'
  | 'rate'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'duration'
  | 'error_rate'
  | 'success_rate'
  | 'percentage'
  | 'p50'
  | 'p95'
  | 'p99';

export type TimeGroup = 'minute' | 'hour' | 'day' | 'week' | 'month';

export interface AlertDefinition {
  name: string;
  condition: string;
  severity: 'info' | 'warning' | 'critical';
  runbook?: string;
}

export interface MetricDisplay {
  component?: DisplayComponent;
  size?: 'small' | 'medium' | 'large';
  showTrend?: boolean;
  showSparkline?: boolean;
  color?: string;
}

export type DisplayComponent =
  | 'MetricCard'
  | 'LineChart'
  | 'BarChart'
  | 'StackedBarChart'
  | 'PieChart'
  | 'GaugeChart'
  | 'Histogram'
  | 'DataTable';

export interface DashboardLayout {
  // Grid configuration
  columns?: number; // Default columns (e.g., 12 for 12-column grid)
  gap?: number; // Gap between panels in pixels

  // Responsive breakpoints
  breakpoints?: {
    mobile?: number;   // e.g., 768 - below this, single column
    tablet?: number;   // e.g., 1024 - below this, reduced columns
  };

  rows: DashboardRow[];
}

export interface DashboardRow {
  title?: string;
  panels: PanelPlacement[];
}

export interface PanelPlacement {
  id: string;           // metric ID

  // Grid span (how many columns this panel takes)
  span?: number;        // Default span (1-12 for 12-column grid)

  // Responsive spans
  spanMobile?: number;  // Span on mobile (default: full width)
  spanTablet?: number;  // Span on tablet
  spanDesktop?: number; // Span on desktop

  // Height control
  height?: number | 'auto'; // Fixed height in pixels or auto
  minHeight?: number;
}

// ============================================================================
// Mock Data Types (for prototyping)
// ============================================================================

export interface MockMetricData {
  current?: number;
  previous?: number;
  trend?: 'up' | 'down' | 'flat';
  series?: TimeSeriesPoint[];
  breakdown?: Record<string, number>;
  histogram?: HistogramData;
}

export interface TimeSeriesPoint {
  date: string;
  value?: number;
  // For grouped data
  [key: string]: string | number | undefined;
}

export interface HistogramData {
  buckets: string[];
  counts: number[];
}

// ============================================================================
// Time Range Types
// ============================================================================

export type TimeRangePreset =
  | 'last_5m'
  | 'last_15m'
  | 'last_30m'
  | 'last_1h'
  | 'last_3h'
  | 'last_6h'
  | 'last_12h'
  | 'last_24h'
  | 'last_7d'
  | 'last_30d'
  | 'custom';

export interface TimeRange {
  preset?: TimeRangePreset;
  // For custom ranges
  start?: Date;
  end?: Date;
}

export type RefreshInterval = 'off' | '10s' | '30s' | '1m' | '5m' | '10m';

export interface TimeRangeConfig {
  // Available presets to show in the selector
  presets?: TimeRangePreset[];
  // Default time range
  defaultRange?: TimeRangePreset;
  // Available refresh intervals
  refreshIntervals?: RefreshInterval[];
  // Default refresh interval
  defaultRefresh?: RefreshInterval;
}

// ============================================================================
// Runtime Data Types (for rendering)
// ============================================================================

export interface MetricData {
  current?: number;
  previous?: number;
  trend?: 'up' | 'down' | 'flat';
  changePercent?: number;
  series?: TimeSeriesPoint[];
  breakdown?: Record<string, number>;
  histogram?: HistogramData;
  loading?: boolean;
  error?: string;
}

export interface DataProvider {
  get(metricId: string): MetricData;
  getAll(): Record<string, MetricData>;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface DashboardRendererProps {
  dashboard: DashboardDefinition;
  dataProvider?: DataProvider;

  // Time range controls
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  refreshInterval?: RefreshInterval;
  onRefreshIntervalChange?: (interval: RefreshInterval) => void;
  timeRangeConfig?: TimeRangeConfig;

  // Callbacks
  onMetricClick?: (metricId: string) => void;
  onSourceClick?: (source: MetricSource) => void;
}

export interface MetricPanelProps {
  metric: MetricDefinition;
  data: MetricData;
  onMetricClick?: (metricId: string) => void;
  onSourceClick?: (source: MetricSource) => void;
}

export interface MetricCardProps {
  title: string;
  value: number | string;
  unit?: string;
  description?: string;
  trend?: 'up' | 'down' | 'flat';
  changePercent?: number;
  showTrend?: boolean;
  showSparkline?: boolean;
  sparklineData?: TimeSeriesPoint[];
  thresholds?: { warning?: number; critical?: number };
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
}

export interface LineChartProps {
  title: string;
  data: TimeSeriesPoint[];
  xKey?: string;
  yKey?: string;
  series?: string[]; // For multi-series charts
  unit?: string;
  height?: number;
  onClick?: () => void;
}

export interface BarChartProps {
  title: string;
  data: TimeSeriesPoint[];
  xKey?: string;
  series: string[];
  stacked?: boolean;
  unit?: string;
  height?: number;
  onClick?: () => void;
}

export interface SourceLinkProps {
  source: MetricSource;
  onClick?: (source: MetricSource) => void;
}

export interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  refreshInterval?: RefreshInterval;
  onRefreshIntervalChange?: (interval: RefreshInterval) => void;
  config?: TimeRangeConfig;
}
