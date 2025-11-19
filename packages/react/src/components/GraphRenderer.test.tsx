import React from 'react';
import { render, screen } from '@testing-library/react';
import { GraphRenderer } from './GraphRenderer';
import type { GraphConfiguration, NodeState, EdgeState } from '@principal-ai/visual-validation-core';

describe('GraphRenderer', () => {
  const testConfig: GraphConfiguration = {
    metadata: {
      name: 'Test Graph',
      version: '1.0.0',
    },
    nodeTypes: {
      user: {
        shape: 'circle',
        color: '#4CAF50',
        dataSchema: {
          userId: { type: 'string', required: true },
        },
      },
    },
    edgeTypes: {
      connection: {
        style: 'solid',
        directed: true,
      },
    },
    allowedConnections: [{ from: 'user', to: 'user', via: 'connection' }],
  };

  const testNodes: NodeState[] = [
    {
      id: 'user-1',
      type: 'user',
      data: { userId: 'alice' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'user-2',
      type: 'user',
      data: { userId: 'bob' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const testEdges: EdgeState[] = [
    {
      id: 'conn-1',
      type: 'connection',
      from: 'user-1',
      to: 'user-2',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  it('should render without crashing', () => {
    render(<GraphRenderer configuration={testConfig} nodes={testNodes} edges={testEdges} />);

    expect(screen.getByText(/Graph Renderer/i)).toBeDefined();
  });

  it('should display configuration name', () => {
    render(<GraphRenderer configuration={testConfig} nodes={testNodes} edges={testEdges} />);

    expect(screen.getByText(/Test Graph/i)).toBeDefined();
  });

  it('should display node count', () => {
    render(<GraphRenderer configuration={testConfig} nodes={testNodes} edges={testEdges} />);

    expect(screen.getByText(/Nodes: 2/i)).toBeDefined();
  });

  it('should display edge count', () => {
    render(<GraphRenderer configuration={testConfig} nodes={testNodes} edges={testEdges} />);

    expect(screen.getByText(/Edges: 1/i)).toBeDefined();
  });

  it('should render with empty nodes and edges', () => {
    render(<GraphRenderer configuration={testConfig} nodes={[]} edges={[]} />);

    expect(screen.getByText(/Nodes: 0/i)).toBeDefined();
    expect(screen.getByText(/Edges: 0/i)).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <GraphRenderer
        configuration={testConfig}
        nodes={testNodes}
        edges={testEdges}
        className="custom-class"
      />
    );

    const element = container.querySelector('.custom-class');
    expect(element).toBeDefined();
  });

  it('should apply custom width and height', () => {
    const { container } = render(
      <GraphRenderer
        configuration={testConfig}
        nodes={testNodes}
        edges={testEdges}
        width="500px"
        height="400px"
      />
    );

    const element = container.querySelector('div');
    expect(element?.style.width).toBe('500px');
    expect(element?.style.height).toBe('400px');
  });
});
