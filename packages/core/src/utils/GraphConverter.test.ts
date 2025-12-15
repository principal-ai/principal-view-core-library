import { describe, expect, test } from 'bun:test';
import { GraphConverter } from './GraphConverter';
import type { PathBasedGraphConfiguration } from '../types/path-based-config';

describe('GraphConverter', () => {
  test('should convert simple config to nodes and edges', () => {
    const config: PathBasedGraphConfiguration = {
      metadata: {
        name: 'Test Config',
        version: '1.0.0',
      },
      nodeTypes: {
        'node-a': {
          shape: 'circle',
          icon: 'user',
          color: '#3b82f6',
          dataSchema: {},
        },
        'node-b': {
          shape: 'rectangle',
          icon: 'server',
          color: '#8b5cf6',
          dataSchema: {},
        },
      },
      edgeTypes: {
        connection: {
          style: 'solid',
          color: '#64748b',
          width: 2,
          directed: true,
        },
      },
      allowedConnections: [
        {
          from: 'node-a',
          to: 'node-b',
          via: 'connection',
        },
      ],
    };

    const result = GraphConverter.configToGraph(config);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    // Check nodes
    expect(result.nodes[0].id).toBe('node-a');
    expect(result.nodes[0].type).toBe('node-a');
    expect(result.nodes[0].data.shape).toBe('circle');
    expect(result.nodes[0].data.icon).toBe('user');

    expect(result.nodes[1].id).toBe('node-b');
    expect(result.nodes[1].type).toBe('node-b');
    expect(result.nodes[1].data.shape).toBe('rectangle');

    // Check edges
    expect(result.edges[0].from).toBe('node-a');
    expect(result.edges[0].to).toBe('node-b');
    expect(result.edges[0].type).toBe('connection');
    expect(result.edges[0].data.style).toBe('solid');
  });

  test('should extract manual positions from node types', () => {
    const config: PathBasedGraphConfiguration = {
      metadata: {
        name: 'Test Config',
        version: '1.0.0',
      },
      nodeTypes: {
        'node-a': {
          shape: 'circle',
          color: '#3b82f6',
          dataSchema: {},
          position: { x: 100, y: 200 },
        },
        'node-b': {
          shape: 'rectangle',
          color: '#8b5cf6',
          dataSchema: {},
          position: { x: 300, y: 400 },
        },
      },
      edgeTypes: {},
      allowedConnections: [],
    };

    const result = GraphConverter.configToGraph(config);

    expect(result.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(result.nodes[1].position).toEqual({ x: 300, y: 400 });
  });

  test('should handle nodes without positions', () => {
    const config: PathBasedGraphConfiguration = {
      metadata: {
        name: 'Test Config',
        version: '1.0.0',
      },
      nodeTypes: {
        'node-a': {
          shape: 'circle',
          color: '#3b82f6',
          dataSchema: {},
        },
      },
      edgeTypes: {},
      allowedConnections: [],
    };

    const result = GraphConverter.configToGraph(config);

    expect(result.nodes[0].position).toBeUndefined();
  });

  test('should include source paths and actions in node data', () => {
    const config: PathBasedGraphConfiguration = {
      metadata: {
        name: 'Test Config',
        version: '1.0.0',
      },
      nodeTypes: {
        'node-a': {
          shape: 'circle',
          color: '#3b82f6',
          dataSchema: {},
          sources: ['src/api/**/*.ts'],
          actions: [
            {
              pattern: 'Lock acquired: (?<lockId>.*)',
              event: 'lock-acquired',
              state: 'locked',
            },
          ],
        },
      },
      edgeTypes: {},
      allowedConnections: [],
    };

    const result = GraphConverter.configToGraph(config);

    expect(result.nodes[0].data.sources).toEqual(['src/api/**/*.ts']);
    expect(result.nodes[0].data.actions).toHaveLength(1);
    expect(result.nodes[0].data.actions[0].event).toBe('lock-acquired');
  });

  test('should handle edge animation config', () => {
    const config: PathBasedGraphConfiguration = {
      metadata: {
        name: 'Test Config',
        version: '1.0.0',
      },
      nodeTypes: {
        'node-a': {
          shape: 'circle',
          color: '#3b82f6',
          dataSchema: {},
        },
        'node-b': {
          shape: 'rectangle',
          color: '#8b5cf6',
          dataSchema: {},
        },
      },
      edgeTypes: {
        'animated-flow': {
          style: 'solid',
          color: '#3b82f6',
          width: 3,
          animation: {
            type: 'flow',
            duration: 1500,
            color: '#60a5fa',
          },
        },
      },
      allowedConnections: [
        {
          from: 'node-a',
          to: 'node-b',
          via: 'animated-flow',
        },
      ],
    };

    const result = GraphConverter.configToGraph(config);

    expect(result.edges[0].data.animation).toBeDefined();
    expect(result.edges[0].data.animation?.type).toBe('flow');
    expect(result.edges[0].data.animation?.duration).toBe(1500);
    expect(result.edges[0].data.animation?.color).toBe('#60a5fa');
  });
});
