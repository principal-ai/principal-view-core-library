import type { Meta, StoryObj } from '@storybook/react';
import { MetricsDashboard } from '../components/MetricsDashboard';
import type { GraphMetrics } from '@principal-ai/visual-validation-core';

const meta = {
  title: 'Components/MetricsDashboard',
  component: MetricsDashboard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MetricsDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample metrics
const sampleMetrics: GraphMetrics = {
  nodes: {
    total: 25,
    byType: {
      process: 10,
      data: 8,
      external: 7,
    },
    byStatus: {
      active: 20,
      inactive: 3,
      error: 2,
    },
  },
  edges: {
    total: 42,
    byType: {
      dataflow: 30,
      control: 8,
      dependency: 4,
    },
    byStatus: {
      active: 38,
      inactive: 2,
      error: 2,
    },
  },
  events: {
    total: 156,
    byCategory: {
      node: 85,
      edge: 45,
      validation: 15,
      system: 11,
    },
    byType: {
      node_added: 25,
      node_updated: 35,
      node_removed: 10,
      edge_added: 30,
      edge_updated: 10,
      edge_removed: 5,
      validation_run: 15,
      system_start: 5,
      system_stop: 5,
      custom: 16,
    },
    rate: {
      perSecond: 2.5,
      perMinute: 150,
      perHour: 9000,
    },
  },
  validation: {
    violations: 3,
    warnings: 7,
    healthScore: 0.92,
    lastRun: Date.now() - 30000,
  },
  performance: {
    avgEventProcessingTime: 15,
    avgValidationTime: 120,
    memoryUsage: 45.2,
  },
};

const healthyMetrics: GraphMetrics = {
  nodes: {
    total: 10,
    byType: { process: 5, data: 5 },
    byStatus: { active: 10, inactive: 0, error: 0 },
  },
  edges: {
    total: 12,
    byType: { dataflow: 12 },
    byStatus: { active: 12, inactive: 0, error: 0 },
  },
  events: {
    total: 50,
    byCategory: { node: 30, edge: 15, validation: 5, system: 0 },
    byType: {
      node_added: 10,
      node_updated: 15,
      node_removed: 5,
      edge_added: 12,
      edge_updated: 3,
      edge_removed: 0,
      validation_run: 5,
      system_start: 0,
      system_stop: 0,
      custom: 0,
    },
    rate: { perSecond: 1.0, perMinute: 60, perHour: 3600 },
  },
  validation: {
    violations: 0,
    warnings: 0,
    healthScore: 1.0,
    lastRun: Date.now() - 5000,
  },
  performance: {
    avgEventProcessingTime: 8,
    avgValidationTime: 50,
    memoryUsage: 25.5,
  },
};

const criticalMetrics: GraphMetrics = {
  nodes: {
    total: 50,
    byType: { process: 20, data: 15, external: 15 },
    byStatus: { active: 30, inactive: 10, error: 10 },
  },
  edges: {
    total: 80,
    byType: { dataflow: 50, control: 20, dependency: 10 },
    byStatus: { active: 50, inactive: 15, error: 15 },
  },
  events: {
    total: 500,
    byCategory: { node: 200, edge: 180, validation: 100, system: 20 },
    byType: {
      node_added: 50,
      node_updated: 100,
      node_removed: 30,
      edge_added: 80,
      edge_updated: 70,
      edge_removed: 30,
      validation_run: 100,
      system_start: 10,
      system_stop: 10,
      custom: 20,
    },
    rate: { perSecond: 5.2, perMinute: 312, perHour: 18720 },
  },
  validation: {
    violations: 25,
    warnings: 40,
    healthScore: 0.35,
    lastRun: Date.now() - 60000,
  },
  performance: {
    avgEventProcessingTime: 45,
    avgValidationTime: 350,
    memoryUsage: 85.8,
  },
};

export const Default: Story = {
  args: {
    metrics: sampleMetrics,
  },
};

export const HealthySystem: Story = {
  args: {
    metrics: healthyMetrics,
  },
};

export const CriticalSystem: Story = {
  args: {
    metrics: criticalMetrics,
  },
};

export const MinimalGraph: Story = {
  args: {
    metrics: {
      nodes: {
        total: 2,
        byType: { process: 1, data: 1 },
        byStatus: { active: 2, inactive: 0, error: 0 },
      },
      edges: {
        total: 1,
        byType: { dataflow: 1 },
        byStatus: { active: 1, inactive: 0, error: 0 },
      },
      events: {
        total: 5,
        byCategory: { node: 2, edge: 1, validation: 1, system: 1 },
        byType: {
          node_added: 2,
          node_updated: 0,
          node_removed: 0,
          edge_added: 1,
          edge_updated: 0,
          edge_removed: 0,
          validation_run: 1,
          system_start: 1,
          system_stop: 0,
          custom: 0,
        },
        rate: { perSecond: 0.1, perMinute: 6, perHour: 360 },
      },
      validation: {
        violations: 0,
        warnings: 1,
        healthScore: 0.95,
        lastRun: Date.now() - 10000,
      },
      performance: {
        avgEventProcessingTime: 5,
        avgValidationTime: 30,
        memoryUsage: 12.3,
      },
    },
  },
};
