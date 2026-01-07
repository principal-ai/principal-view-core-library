import React, { useState, useEffect } from 'react';
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
// Convert Test Spans to Graph Events
// ============================================================================

function convertSpansToEvents(spans: typeof testSpans): GraphEvent[] {
  const events: GraphEvent[] = [];
  let time = 0;

  spans.forEach((testSpan) => {
    // Pulse test suite node at start of each test
    events.push({
      timestamp: time,
      category: 'node',
      operation: 'animate',
      payload: {
        nodeId: 'test-suite',
        animation: { type: 'pulse', duration: 500 },
      },
    });
    time += 600;

    // Animate through events in the span
    testSpan.events.forEach((event) => {
      const eventName = event.name;

      // Determine which phase based on event name
      let nodeId = '';
      let edgeId = '';

      if (eventName.startsWith('setup.')) {
        nodeId = 'setup-phase';
        edgeId = 'suite-to-setup';
      } else if (eventName.startsWith('execution.')) {
        nodeId = 'execution-phase';
        edgeId = 'setup-to-execution';
      } else if (eventName.startsWith('assertion.')) {
        nodeId = 'assertion-phase';
        edgeId = 'execution-to-assertion';
      }

      // Animate edge when phase starts
      if (eventName.endsWith('.started') && edgeId) {
        events.push({
          timestamp: time,
          category: 'edge',
          operation: 'animate',
          payload: {
            edgeId,
            animation: { type: 'particle', duration: 500 },
          },
        });
        time += 600;
      }

      // Pulse node
      if (nodeId) {
        events.push({
          timestamp: time,
          category: 'node',
          operation: 'animate',
          payload: {
            nodeId,
            animation: { type: 'pulse', duration: 600 },
          },
        });
        time += 700;
      }
    });

    // Animate to result
    events.push({
      timestamp: time,
      category: 'edge',
      operation: 'animate',
      payload: {
        edgeId: 'assertion-to-result',
        animation: { type: 'particle', duration: 500 },
      },
    });
    time += 600;

    events.push({
      timestamp: time,
      category: 'node',
      operation: 'animate',
      payload: {
        nodeId: 'test-result',
        animation: { type: 'pulse', duration: 800 },
      },
    });
    time += 1200; // Pause between tests
  });

  return events;
}

// ============================================================================
// Animated Story
// ============================================================================

const AnimatedTestExecution = () => {
  const [events, setEvents] = useState<GraphEvent[]>([]);
  const [currentSpanIndex, setCurrentSpanIndex] = useState(0);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [highlightedPhase, setHighlightedPhase] = useState<string | undefined>();

  useEffect(() => {
    const graphEvents = convertSpansToEvents(testSpans);
    const timers: NodeJS.Timeout[] = [];

    let spanIndex = 0;
    let eventIndex = 0;
    let eventsPerTest = testSpans[0].events.length * 2 + 2; // ~2 graph events per span event + suite + result

    graphEvents.forEach((event, index) => {
      const timer = setTimeout(() => {
        setEvents((prev) => [...prev, event]);

        // Track which span and event we're on
        spanIndex = Math.floor(index / eventsPerTest);
        eventIndex = Math.floor((index % eventsPerTest) / 2);

        setCurrentSpanIndex(Math.min(spanIndex, testSpans.length - 1));
        setCurrentEventIndex(eventIndex);
      }, event.timestamp);
      timers.push(timer);
    });

    // Reset animation
    const resetTimer = setTimeout(() => {
      setEvents([]);
      setCurrentSpanIndex(0);
      setCurrentEventIndex(0);
    }, graphEvents[graphEvents.length - 1].timestamp + 2000);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(resetTimer);
    };
  }, []);

  // Map node IDs to phase names
  const getPhaseFromNodeId = (nodeId: string): string | undefined => {
    if (nodeId === 'setup-phase') return 'setup';
    if (nodeId === 'execution-phase') return 'execution';
    if (nodeId === 'assertion-phase') return 'assertion';
    return undefined;
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {/* Graph Visualization - Left Side */}
      <div
        style={{ flex: '0 0 60%', height: '100%', position: 'relative' }}
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
            showMinimap={true}
            showControls={true}
            events={events}
          />
        </div>
      </div>

      {/* Event Panel - Right Side */}
      <div style={{ flex: '0 0 40%', height: '100%', borderLeft: '1px solid #333' }}>
        <TestEventPanel
          spans={testSpans as any}
          currentSpanIndex={currentSpanIndex}
          currentEventIndex={currentEventIndex}
          highlightedPhase={highlightedPhase}
        />
      </div>
    </div>
  );
};

/**
 * Animated visualization of real test execution data using the "wide event" pattern.
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
 * - See how context builds up through events as the animation plays
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
    showMinimap: true,
    showControls: true,
  },
};

/**
 * Event panel component showing test execution narrative with file/line information.
 *
 * Shows how events accumulate context as tests execute, with automatic file/line
 * capture from stack traces and manual override for code under test.
 */
export const EventPanelOnly: StoryObj = {
  render: () => (
    <div style={{ width: '600px', height: '100vh' }}>
      <TestEventPanel
        spans={testSpans as any}
        currentSpanIndex={0}
        currentEventIndex={5} // Show all events
        highlightedPhase={undefined}
      />
    </div>
  ),
};
