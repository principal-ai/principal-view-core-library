import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import { TestEventPanel } from '../components/TestEventPanel';
import type { ExtendedCanvas, GraphEvent } from '@principal-ai/principal-view-core';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import testSpans from './data/graph-converter-test-execution.json';

const meta = {
  title: 'Features/Real Test Execution',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Visualizes REAL test execution data from instrumented Bun tests using the "wide event" pattern. Shows actual spans with file/line information collected from running GraphConverter.test.ts. Hover over graph nodes to highlight related events in the panel.',
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

// ============================================================================
// Test Execution Flow Canvas
// ============================================================================

const testExecutionCanvas: ExtendedCanvas = {
  nodes: [
    // Test Suite
    {
      id: 'test-suite',
      type: 'text',
      text: 'GraphConverter Test Suite',
      x: -100,
      y: -100,
      width: 240,
      height: 80,
      pv: {
        nodeType: 'test-suite',
        name: 'Test Suite',
        description: 'Collection of GraphConverter tests',
        shape: 'rectangle',
        fill: '#3b82f6',
      },
    },

    // Test Phase Nodes
    {
      id: 'setup-phase',
      type: 'text',
      text: 'Setup',
      x: -250,
      y: 50,
      width: 120,
      height: 80,
      pv: {
        nodeType: 'test-phase',
        name: 'Setup Phase',
        description: 'Test data preparation',
        shape: 'hexagon',
        fill: '#10b981',
      },
    },
    {
      id: 'execution-phase',
      type: 'text',
      text: 'Execution',
      x: -80,
      y: 50,
      width: 120,
      height: 80,
      pv: {
        nodeType: 'test-phase',
        name: 'Execution Phase',
        description: 'Code under test runs',
        shape: 'hexagon',
        fill: '#f59e0b',
      },
    },
    {
      id: 'assertion-phase',
      type: 'text',
      text: 'Assertion',
      x: 90,
      y: 50,
      width: 120,
      height: 80,
      pv: {
        nodeType: 'test-phase',
        name: 'Assertion Phase',
        description: 'Verify results',
        shape: 'hexagon',
        fill: '#8b5cf6',
      },
    },

    // Result Node
    {
      id: 'test-result',
      type: 'text',
      text: 'Test Result',
      x: -100,
      y: 200,
      width: 240,
      height: 80,
      pv: {
        nodeType: 'result',
        name: 'Test Result',
        description: 'Pass/Fail outcome',
        shape: 'rectangle',
        fill: '#10b981',
      },
    },
  ],
  edges: [
    {
      id: 'suite-to-setup',
      fromNode: 'test-suite',
      toNode: 'setup-phase',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'start test',
      pv: {
        edgeType: 'flow',
        style: 'solid',
      },
    },
    {
      id: 'setup-to-execution',
      fromNode: 'setup-phase',
      toNode: 'execution-phase',
      fromSide: 'right',
      toSide: 'left',
      label: 'data ready',
      pv: {
        edgeType: 'flow',
        style: 'solid',
      },
    },
    {
      id: 'execution-to-assertion',
      fromNode: 'execution-phase',
      toNode: 'assertion-phase',
      fromSide: 'right',
      toSide: 'left',
      label: 'got result',
      pv: {
        edgeType: 'flow',
        style: 'solid',
      },
    },
    {
      id: 'assertion-to-result',
      fromNode: 'assertion-phase',
      toNode: 'test-result',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'complete',
      pv: {
        edgeType: 'flow',
        style: 'solid',
      },
    },
  ],
  pv: {
    version: '1.0.0',
    name: 'Test Execution Flow',
    description: 'Visualizes the flow of test execution through phases',
  },
};

// ============================================================================
// Interactive Story (No Animation)
// ============================================================================

const AnimatedTestExecution = () => {
  const [events] = useState<GraphEvent[]>([]);
  const [currentSpanIndex] = useState(0);
  // Show all events by default - set to a large number
  const [currentEventIndex] = useState(999);
  const [highlightedPhase, setHighlightedPhase] = useState<string | undefined>();

  // Extract spans and logs from test data
  const testData = testSpans as any;
  const spans = Array.isArray(testData) ? testData : testData.spans || testData;
  const logs = testData.logs || [];

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
      {/* Event Panel - Left Side */}
      <div style={{ flex: '0 0 50%', height: '100%', borderRight: `1px solid #333`, overflow: 'hidden' }}>
        <TestEventPanel
          spans={spans}
          logs={logs}
          currentSpanIndex={currentSpanIndex}
          currentEventIndex={currentEventIndex}
          highlightedPhase={highlightedPhase}
        />
      </div>

      {/* Graph Visualization - Right Side */}
      <div
        style={{ flex: '0 0 50%', height: '100%', position: 'relative' }}
        onMouseLeave={() => setHighlightedPhase(undefined)}
      >
        <div
          style={{ width: '100%', height: '100%' }}
          onMouseOver={(e) => {
            // Check if hovering over a phase node
            const target = e.target as HTMLElement;
            const textContent = target.textContent;
            if (textContent === 'Setup') setHighlightedPhase('setup');
            else if (textContent === 'Execution') setHighlightedPhase('execution');
            else if (textContent === 'Assertion') setHighlightedPhase('assertion');
          }}
        >
          <GraphRenderer
            canvas={testExecutionCanvas}
            showControls={true}
            events={events}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * Interactive visualization of real test execution data using the "wide event" pattern.
 *
 * This demonstrates the key concept from loggingsucks.com:
 * - ONE comprehensive span per test (not multiple child spans)
 * - Events show the narrative of what happened during execution
 * - Context accumulates through event attributes with file/line information
 * - Easy to search by test.name to get full execution story
 *
 * **Interaction:**
 * - Hover over graph nodes (Setup, Execution, Assertion) to highlight related events
 * - Watch the code journey: blue = test file, green = code under test
 * - All events are shown immediately for easy review
 */
export const Animated: Story = {
  render: () => <AnimatedTestExecution />,
};

/**
 * Static view of the test execution flow showing phases.
 */
export const StaticView: Story = {
  args: {
    canvas: testExecutionCanvas,
    showControls: true,
  },
};

/**
 * Event panel component showing test execution narrative with file/line information.
 *
 * Shows how events and logs are interleaved in chronological order, with automatic
 * file/line capture from stack traces and severity-based color coding for logs.
 */
export const EventPanelOnly: StoryObj = {
  render: () => {
    const testData = testSpans as any;
    const spans = Array.isArray(testData) ? testData : testData.spans || testData;
    const logs = testData.logs || [];

    return (
      <div style={{ width: '600px', height: '100vh' }}>
        <TestEventPanel
          spans={spans}
          logs={logs}
          currentSpanIndex={0}
          currentEventIndex={999} // Show all events
          highlightedPhase={undefined}
        />
      </div>
    );
  },
};
