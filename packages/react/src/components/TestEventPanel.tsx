import React from 'react';

interface SpanEvent {
  time: number;
  name: string;
  attributes: Record<string, string | number | boolean>;
}

interface TestSpan {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  status: 'OK' | 'ERROR';
  errorMessage?: string;
}

export interface TestEventPanelProps {
  spans: TestSpan[];
  currentSpanIndex: number;
  currentEventIndex: number;
  highlightedPhase?: string; // 'setup' | 'execution' | 'assertion'
}

export const TestEventPanel: React.FC<TestEventPanelProps> = ({
  spans,
  currentSpanIndex,
  currentEventIndex,
  highlightedPhase,
}) => {
  const currentSpan = spans[currentSpanIndex];
  const eventsUpToNow = currentSpan?.events.slice(0, currentEventIndex + 1) || [];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
        padding: '20px',
        fontFamily: 'monospace',
        fontSize: '12px',
        overflow: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '15px', fontSize: '14px' }}>
        📊 Wide Event Pattern - Code Journey
      </div>
      <div style={{ fontSize: '10px', color: '#888', marginBottom: '15px' }}>
        Test: {currentSpan?.name || 'Loading...'}
        <br />
        Events: {eventsUpToNow.length} / {currentSpan?.events.length || 0}
      </div>
      <div style={{ fontSize: '10px', color: '#a3a3a3', marginBottom: '20px', lineHeight: '1.5' }}>
        Watch how execution flows through files:
        <br />
        <span style={{ color: '#60a5fa' }}>Blue = Test file</span>
        {' • '}
        <span style={{ color: '#4ade80' }}>Green → Code under test</span>
      </div>

      {currentSpan && (
        <>
          {/* Span Attributes (static context) */}
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                color: '#60a5fa',
                fontWeight: 'bold',
                marginBottom: '8px',
                fontSize: '11px',
              }}
            >
              Span Context (Static)
            </div>
            <pre
              style={{
                background: '#0d0d0d',
                padding: '10px',
                borderRadius: '4px',
                margin: 0,
                fontSize: '10px',
                lineHeight: '1.5',
              }}
            >
              {JSON.stringify(
                {
                  'test.file': currentSpan.attributes['test.file'],
                  'test.suite': currentSpan.attributes['test.suite'],
                  'test.result': currentSpan.attributes['test.result'],
                },
                null,
                2
              )}
            </pre>
          </div>

          {/* Event Timeline (context mutations) */}
          <div>
            <div
              style={{
                color: '#4ade80',
                fontWeight: 'bold',
                marginBottom: '8px',
                fontSize: '11px',
              }}
            >
              Event Timeline (Context Mutations)
            </div>
            {eventsUpToNow.map((event, idx) => {
              const filepath = event.attributes['code.filepath'] as string;
              const lineno = event.attributes['code.lineno'] as number;
              const isCodeUnderTest = filepath && filepath !== 'GraphConverter.test.ts';

              // Determine which phase this event belongs to
              const eventPhase = event.name.split('.')[0]; // 'setup', 'execution', 'assertion'
              const isHighlighted = highlightedPhase === eventPhase;

              return (
                <div
                  key={idx}
                  style={{
                    marginBottom: '12px',
                    paddingBottom: '12px',
                    borderBottom: idx < eventsUpToNow.length - 1 ? '1px solid #333' : 'none',
                    opacity: highlightedPhase && !isHighlighted ? 0.4 : 1,
                    transition: 'opacity 0.2s ease',
                    transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
                    backgroundColor: isHighlighted ? '#1e293b' : 'transparent',
                    padding: isHighlighted ? '8px' : '0',
                    borderRadius: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    <div style={{ color: '#f59e0b', fontSize: '10px' }}>
                      {idx + 1}. {event.name}
                    </div>
                    {filepath && (
                      <div
                        style={{
                          fontSize: '9px',
                          color: isCodeUnderTest ? '#4ade80' : '#60a5fa',
                          fontFamily: 'monospace',
                          background: isCodeUnderTest ? '#064e3b' : '#1e3a8a',
                          padding: '2px 6px',
                          borderRadius: '3px',
                        }}
                      >
                        {isCodeUnderTest && '→ '}
                        {filepath}:{lineno}
                      </div>
                    )}
                  </div>
                  <pre
                    style={{
                      background: '#0d0d0d',
                      padding: '8px',
                      borderRadius: '4px',
                      margin: 0,
                      fontSize: '9px',
                      lineHeight: '1.4',
                    }}
                  >
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(event.attributes).filter(
                          ([key]) => key !== 'code.filepath' && key !== 'code.lineno'
                        )
                      ),
                      null,
                      2
                    )}
                  </pre>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div
        style={{
          marginTop: '20px',
          paddingTop: '15px',
          borderTop: '1px solid #333',
          fontSize: '10px',
          color: '#888',
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          <strong>Total tests:</strong> {spans.length}
        </div>
        <div style={{ marginBottom: '8px' }}>
          <strong>Pattern:</strong> One span per test + event timeline
        </div>
        <div>
          <strong>Status:</strong>{' '}
          <span style={{ color: '#4ade80' }}>All Passed ✓</span>
        </div>
      </div>
    </div>
  );
};
