import React, { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { HelpCircle } from 'lucide-react';

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
  const { theme } = useTheme();
  const [showHelp, setShowHelp] = useState(false);
  const currentSpan = spans[currentSpanIndex];
  const eventsUpToNow = currentSpan?.events.slice(0, currentEventIndex + 1) || [];

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        padding: '20px',
        fontFamily: theme.fonts.monospace,
        fontSize: '14px',
        overflow: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
          Wide Event Pattern - Code Journey
        </div>
        <button
          onClick={() => setShowHelp(true)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            color: theme.colors.textMuted,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = theme.colors.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = theme.colors.textMuted;
          }}
        >
          <HelpCircle size={20} />
        </button>
      </div>
      <div style={{ fontSize: '13px', color: theme.colors.textMuted, marginBottom: '15px' }}>
        Test: {currentSpan?.name || 'Loading...'}
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            style={{
              backgroundColor: theme.colors.background,
              color: theme.colors.text,
              padding: '24px',
              borderRadius: '8px',
              maxWidth: '600px',
              border: `1px solid ${theme.colors.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '16px' }}>
              How to Read This Panel
            </div>
            <div style={{ fontSize: '14px', marginBottom: '16px', lineHeight: '1.6' }}>
              <p style={{ marginBottom: '12px' }}>
                <strong>Watch how execution flows through files:</strong>
              </p>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li style={{ marginBottom: '8px' }}>
                  <span style={{ color: '#60a5fa' }}>Blue = Test file</span>
                </li>
                <li>
                  <span style={{ color: '#4ade80' }}>Green → Code under test</span>
                </li>
              </ul>
              <p style={{ marginBottom: '12px' }}>
                <strong>Span Context (Static)</strong>
              </p>
              <pre
                style={{
                  background: theme.colors.surface,
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  overflow: 'auto',
                }}
              >
{`{
  "test.file": "GraphConverter.test.ts",
  "test.suite": "GraphConverter",
  "test.result": "pass"
}`}
              </pre>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: theme.colors.primary,
                color: theme.colors.background,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {currentSpan && (
        <>
          {/* Event Timeline (context mutations) */}
          <div>
            <div
              style={{
                color: '#4ade80',
                fontWeight: 'bold',
                marginBottom: '8px',
                fontSize: '15px',
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
                    borderBottom: idx < eventsUpToNow.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                    opacity: highlightedPhase && !isHighlighted ? 0.4 : 1,
                    transition: 'opacity 0.2s ease',
                    transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
                    backgroundColor: isHighlighted ? theme.colors.surface : 'transparent',
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
                      gap: '8px',
                    }}
                  >
                    <div style={{ color: '#f59e0b', fontSize: '13px', flexShrink: 0 }}>
                      {idx + 1}. {event.name}
                    </div>
                    {filepath && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: isCodeUnderTest ? '#4ade80' : '#60a5fa',
                          fontFamily: 'monospace',
                          background: isCodeUnderTest ? '#064e3b' : '#1e3a8a',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          flexShrink: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isCodeUnderTest && '→ '}
                        {filepath}:{lineno}
                      </div>
                    )}
                  </div>
                  <pre
                    style={{
                      background: theme.colors.surface,
                      padding: '8px',
                      borderRadius: '4px',
                      margin: 0,
                      fontSize: '12px',
                      lineHeight: '1.4',
                      overflow: 'auto',
                      maxWidth: '100%',
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
          borderTop: `1px solid ${theme.colors.border}`,
          fontSize: '13px',
          color: theme.colors.textMuted,
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
