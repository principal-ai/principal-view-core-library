import React from 'react';
import type { GraphMetrics } from '@principal-ai/visual-validation-core';

export interface MetricsDashboardProps {
  /** Current metrics */
  metrics: GraphMetrics;

  /** Optional class name */
  className?: string;
}

/**
 * Metrics dashboard component for displaying graph statistics
 * TODO: Implement full metrics visualization
 */
export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ metrics, className }) => {
  return (
    <div className={className} style={{ padding: '20px', border: '1px solid #ccc' }}>
      <h3>Metrics Dashboard (TODO)</h3>
      <div>
        <p>Total Nodes: {metrics.nodes.total}</p>
        <p>Total Edges: {metrics.edges.total}</p>
        <p>Total Events: {metrics.events.total}</p>
        <p>Violations: {metrics.validation.violations}</p>
        <p>Health Score: {metrics.validation.healthScore}</p>
      </div>
      <div>
        <strong>TODO:</strong>
        <ul>
          <li>Add visual charts/graphs</li>
          <li>Show breakdown by node type</li>
          <li>Show breakdown by edge type</li>
          <li>Show event rate over time</li>
          <li>Add health score indicator</li>
          <li>Add performance metrics</li>
        </ul>
      </div>
    </div>
  );
};
