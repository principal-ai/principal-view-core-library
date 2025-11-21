import React from 'react';
import type { GraphEvent, Violation } from '@principal-ai/visual-validation-core';

export interface EventLogProps {
  /** List of events to display */
  events: GraphEvent[];

  /** Optional violations to highlight */
  violations?: Violation[];

  /** Callback when an event is clicked */
  onEventClick?: (event: GraphEvent) => void;

  /** Optional class name */
  className?: string;

  /** Optional max height */
  maxHeight?: number | string;
}

/**
 * Event log component for displaying graph events
 * TODO: Implement filtering, search, and severity indicators
 */
export const EventLog: React.FC<EventLogProps> = ({
  events,
  violations = [],
  className,
  maxHeight = '400px',
}) => {
  return (
    <div className={className} style={{ maxHeight, overflowY: 'auto', border: '1px solid #ccc' }}>
      <div style={{ padding: '10px' }}>
        <h3>Event Log (TODO)</h3>
        <p>Events: {events.length}</p>
        <p>Violations: {violations.length}</p>
        <div>
          <strong>TODO:</strong>
          <ul>
            <li>Display events in chronological order</li>
            <li>Show event type, category, operation</li>
            <li>Highlight violations with color coding</li>
            <li>Add filtering by category, type, severity</li>
            <li>Add text search</li>
            <li>Add timestamp formatting</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
