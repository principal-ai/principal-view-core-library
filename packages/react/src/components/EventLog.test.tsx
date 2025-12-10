import React from 'react';
import { render, screen } from '@testing-library/react';
import { EventLog } from './EventLog';
import type { GraphEvent, Violation } from '@principal-ai/principal-view-core';

describe('EventLog', () => {
  const testEvents: GraphEvent[] = [
    {
      id: 'evt-1',
      type: 'node_created',
      timestamp: Date.now(),
      category: 'node',
      operation: 'create',
      payload: {
        operation: 'create',
        nodeId: 'user-1',
        nodeType: 'user',
        data: { userId: 'alice' },
      },
      expected: true,
    },
    {
      id: 'evt-2',
      type: 'edge_created',
      timestamp: Date.now(),
      category: 'edge',
      operation: 'create',
      payload: {
        operation: 'create',
        edgeId: 'conn-1',
        edgeType: 'connection',
        from: 'user-1',
        to: 'user-2',
      },
      expected: true,
    },
  ];

  const testViolations: Violation[] = [
    {
      id: 'violation-1',
      severity: 'error',
      type: 'connection',
      description: 'Invalid connection',
    },
  ];

  it('should render without crashing', () => {
    render(<EventLog events={testEvents} />);

    expect(screen.getByText(/Event Log/i)).toBeDefined();
  });

  it('should display event count', () => {
    render(<EventLog events={testEvents} />);

    expect(screen.getByText(/Events: 2/i)).toBeDefined();
  });

  it('should display violation count', () => {
    render(<EventLog events={testEvents} violations={testViolations} />);

    expect(screen.getByText(/Violations: 1/i)).toBeDefined();
  });

  it('should render with empty events', () => {
    render(<EventLog events={[]} />);

    expect(screen.getByText(/Events: 0/i)).toBeDefined();
  });

  it('should apply custom className', () => {
    const { container } = render(<EventLog events={testEvents} className="custom-log" />);

    const element = container.querySelector('.custom-log');
    expect(element).toBeDefined();
  });

  it('should apply custom maxHeight', () => {
    const { container } = render(<EventLog events={testEvents} maxHeight="300px" />);

    const element = container.querySelector('div');
    expect(element?.style.maxHeight).toBe('300px');
  });
});
