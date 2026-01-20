import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import { TestEventPanel } from '../components/TestEventPanel';
import type { ExtendedCanvas, JsonValue } from '@principal-ai/principal-view-core/browser';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import executionCanvas from '../../../../.principal-views/graph-converter-execution.otel.canvas';
import validatedSpans from './data/graph-converter-validated-execution.json';

const meta = {
  title: 'Features/Validated Execution',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Demonstrates type-safe event emission with schema validation. The canvas defines expected events, and production code is validated against this schema. Shows how events match the schema defined in graph-converter-execution.otel.canvas.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <div style={{ width: '100vw', height: '100vh', background: '#0a0a0a' }}>
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Graph visualization of the execution flow with event schema definitions.
 *
 * This canvas defines:
 * - `graph-converter` node with 5 event types
 * - `validation` node with 2 event types
 * - `graph-output` node with 1 event type
 *
 * Each event type has a schema defining:
 * - Required/optional fields
 * - Field types (string, number, boolean, etc.)
 * - Field descriptions
 *
 * See `.principal-views/graph-converter-execution.otel.canvas` for the full schema.
 */
export const ExecutionFlow: Story = {
  args: {
    canvas: executionCanvas as ExtendedCanvas,
    showControls: true,
  },
};

/**
 * Event panel showing validated execution data.
 *
 * These events were emitted using `createValidatedSpanEmitter()` which:
 * - Validates events against the canvas schema
 * - Ensures required fields are present
 * - Checks field types match the schema
 * - Throws errors in strict mode if validation fails
 *
 * All events in this panel passed schema validation.
 */
export const ValidatedEvents: Story = {
  render: () => (
    <div style={{ width: '800px', height: '100vh' }}>
      <TestEventPanel
        spans={validatedSpans as JsonValue[]}
        currentSpanIndex={0}
        currentEventIndex={10} // Show all events
        highlightedPhase={undefined}
      />
    </div>
  ),
};

/**
 * Side-by-side view of execution flow and validated events.
 *
 * **How it works:**
 * 1. Canvas defines event schemas (what events should be emitted)
 * 2. Tests use `createValidatedSpanEmitter()` to emit events
 * 3. Events are validated against the schema in strict mode
 * 4. If validation fails, test throws `EventValidationError`
 * 5. If validation passes, events are emitted and collected
 *
 * This ensures production code emits events that match the architecture.
 */
export const FlowWithValidation: Story = {
  render: () => (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* Graph Visualization - Left Side */}
      <div style={{ flex: '0 0 60%', height: '100%', position: 'relative' }}>
        <GraphRenderer
          canvas={executionCanvas as ExtendedCanvas}
          showControls={true}
        />
      </div>

      {/* Event Panel - Right Side */}
      <div style={{ flex: '0 0 40%', height: '100%', borderLeft: '1px solid #333' }}>
        <div style={{ padding: '20px', color: '#fff', borderBottom: '1px solid #333' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
            Type-Safe Validated Events
          </h3>
          <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
            Events validated against canvas schema. See{' '}
            <code>.principal-views/graph-converter-execution.otel.canvas</code>
          </p>
        </div>
        <TestEventPanel
          spans={validatedSpans as JsonValue[]}
          currentSpanIndex={0}
          currentEventIndex={10}
          highlightedPhase={undefined}
        />
      </div>
    </div>
  ),
};

/**
 * Canvas with event schema definitions (JSON view).
 *
 * Shows the raw canvas structure including event schemas.
 * Notice the `pv.events` property on each node defining:
 * - Event names (e.g., "conversion.started")
 * - Event descriptions
 * - Field schemas with types and requirements
 */
export const CanvasSchema: Story = {
  render: () => (
    <div
      style={{
        padding: '20px',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: '12px',
        overflow: 'auto',
        height: '100vh',
      }}
    >
      <h2>Event Schema Definition</h2>
      <p>
        This canvas defines event schemas for type-safe telemetry validation.
      </p>
      <pre style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px' }}>
        {JSON.stringify(executionCanvas, null, 2)}
      </pre>
    </div>
  ),
};
