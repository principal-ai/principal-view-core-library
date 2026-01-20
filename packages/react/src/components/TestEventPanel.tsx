import React, { useState, useMemo } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { HelpCircle } from 'lucide-react';
import yaml from 'js-yaml';
import type { NarrativeTemplate, JsonValue } from '@principal-ai/principal-view-core/browser';
import { NarrativeRenderer } from './NarrativeRenderer';
import { convertToOtelEvents } from '../utils/narrative-converter';

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

// OTEL Log types
export type OtelSeverity = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface OtelLog {
  timestamp: number;
  severity: OtelSeverity;
  body: string | Record<string, unknown>;
  resource: Record<string, string | number>;
  attributes?: Record<string, JsonValue>;
  traceId?: string;
  spanId?: string;
}

// Timeline item (event or log)
interface TimelineItem {
  type: 'event' | 'log';
  time: number;
  // For events
  name?: string;
  attributes?: Record<string, JsonValue>;
  // For logs
  severity?: OtelSeverity;
  body?: string | Record<string, unknown>;
  resource?: Record<string, string | number>;
}

// View mode type
export type ViewMode = 'raw' | 'narrative';

export interface TestEventPanelProps {
  spans: TestSpan[];
  logs?: OtelLog[]; // Optional for backward compatibility
  currentSpanIndex: number;
  currentEventIndex: number;
  highlightedPhase?: string; // 'setup' | 'execution' | 'assertion'
  onSpanIndexChange?: (index: number) => void;

  // Narrative view props
  viewMode?: ViewMode;
  narrativeTemplate?: NarrativeTemplate;
  onViewModeChange?: (mode: ViewMode) => void;
  showNarrativeMetadata?: boolean;
}

// Helper functions for log severity
function getSeverityColor(severity: OtelSeverity): string {
  const colors = {
    TRACE: '#6b7280',
    DEBUG: '#60a5fa',
    INFO: '#4ade80',
    WARN: '#fbbf24',
    ERROR: '#f87171',
    FATAL: '#dc2626',
  };
  return colors[severity] || '#9ca3af';
}

function getSeverityIcon(severity: OtelSeverity): string {
  const icons = {
    TRACE: '○',
    DEBUG: '◐',
    INFO: '●',
    WARN: '⚠',
    ERROR: '✕',
    FATAL: '☠',
  };
  return icons[severity] || '•';
}

export const TestEventPanel: React.FC<TestEventPanelProps> = ({
  spans,
  logs = [],
  currentSpanIndex,
  currentEventIndex,
  highlightedPhase,
  onSpanIndexChange,
  viewMode = 'raw',
  narrativeTemplate,
  onViewModeChange,
  showNarrativeMetadata = false,
}) => {
  const { theme } = useTheme();
  const [showHelp, setShowHelp] = useState(false);

  const currentSpan = spans[currentSpanIndex];

  // Convert current span to OtelEvents for narrative rendering
  const otelEvents = useMemo(() => {
    if (!currentSpan || viewMode !== 'narrative') return [];
    return convertToOtelEvents(currentSpan, logs);
  }, [currentSpan, logs, viewMode]);

  const handlePrevTest = () => {
    if (currentSpanIndex > 0 && onSpanIndexChange) {
      onSpanIndexChange(currentSpanIndex - 1);
    }
  };

  const handleNextTest = () => {
    if (currentSpanIndex < spans.length - 1 && onSpanIndexChange) {
      onSpanIndexChange(currentSpanIndex + 1);
    }
  };

  // Build interleaved timeline
  const timeline = useMemo(() => {
    if (!currentSpan) return [];

    const items: TimelineItem[] = [
      // Span events
      ...currentSpan.events.slice(0, currentEventIndex + 1).map((event) => ({
        type: 'event' as const,
        time: event.time,
        name: event.name,
        attributes: event.attributes,
      })),

      // Correlated logs (matching current span's traceId)
      ...logs
        .filter((log) => log.traceId === currentSpan.id)
        .map((log) => ({
          type: 'log' as const,
          time: typeof log.timestamp === 'number' ? log.timestamp : new Date(log.timestamp).getTime(),
          severity: log.severity,
          body: log.body,
          resource: log.resource,
          attributes: log.attributes,
        })),
    ].sort((a, b) => a.time - b.time);

    return items;
  }, [currentSpan, currentEventIndex, logs]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.monospace,
        fontSize: '14px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Static Header */}
      <div
        style={{
          padding: '20px 20px 0 20px',
          backgroundColor: theme.colors.background,
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        {/* Test Navigation - replacing title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handlePrevTest}
              disabled={currentSpanIndex === 0}
              style={{
                padding: '4px 12px',
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '4px',
                color: currentSpanIndex === 0 ? theme.colors.textMuted : theme.colors.text,
                cursor: currentSpanIndex === 0 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: currentSpanIndex === 0 ? 0.5 : 1,
              }}
            >
              ← Prev
            </button>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
              Test {currentSpanIndex + 1} of {spans.length}
            </div>
            <button
              onClick={handleNextTest}
              disabled={currentSpanIndex === spans.length - 1}
              style={{
                padding: '4px 12px',
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '4px',
                color: currentSpanIndex === spans.length - 1 ? theme.colors.textMuted : theme.colors.text,
                cursor: currentSpanIndex === spans.length - 1 ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                opacity: currentSpanIndex === spans.length - 1 ? 0.5 : 1,
              }}
            >
              Next →
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: theme.colors.textMuted }}>
              <span style={{ color: '#4ade80' }}>All Passed ✓</span>
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
        </div>

        {/* View Mode Toggle */}
        {narrativeTemplate && onViewModeChange && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => onViewModeChange('raw')}
              style={{
                padding: '6px 12px',
                background: viewMode === 'raw' ? theme.colors.primary : theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '4px',
                color: viewMode === 'raw' ? '#ffffff' : theme.colors.text,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: viewMode === 'raw' ? 'bold' : 'normal',
              }}
            >
              Raw Events
            </button>
            <button
              onClick={() => onViewModeChange('narrative')}
              style={{
                padding: '6px 12px',
                background: viewMode === 'narrative' ? theme.colors.primary : theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '4px',
                color: viewMode === 'narrative' ? '#ffffff' : theme.colors.text,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: viewMode === 'narrative' ? 'bold' : 'normal',
              }}
            >
              Narrative
            </button>
          </div>
        )}

        <div style={{ fontSize: '13px', color: theme.colors.textMuted, marginBottom: '15px' }}>
          Test: {currentSpan?.name || 'Loading...'}
        </div>
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
                <strong>Timeline shows both events and logs:</strong>
              </p>
              <ul style={{ marginLeft: '20px', marginBottom: '16px' }}>
                <li style={{ marginBottom: '8px' }}>
                  <span style={{ color: '#f59e0b' }}>🟧 Events</span> - Structured lifecycle points
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <span style={{ color: '#4ade80' }}>● Logs</span> - Standalone log records (color = severity)
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <span style={{ color: '#60a5fa' }}>Blue = Test file</span>
                </li>
                <li>
                  <span style={{ color: '#4ade80' }}>Green → Code under test</span>
                </li>
              </ul>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: theme.colors.primary,
                color: '#ffffff',
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

      {/* Scrollable Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: viewMode === 'narrative' ? '0' : '20px',
        }}
      >
        {/* Narrative View */}
        {viewMode === 'narrative' && narrativeTemplate && currentSpan ? (
          <NarrativeRenderer
            template={narrativeTemplate}
            events={otelEvents}
            showMetadata={showNarrativeMetadata}
          />
        ) : viewMode === 'narrative' && !narrativeTemplate ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: theme.colors.textMuted,
            }}
          >
            <div style={{ fontSize: '16px', marginBottom: '12px' }}>ⓘ No narrative template available</div>
            <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
              Create a narrative template to see a human-readable
              <br />
              summary of this test execution.
            </div>
            <button
              onClick={() => onViewModeChange?.('raw')}
              style={{
                marginTop: '20px',
                padding: '8px 16px',
                background: theme.colors.primary,
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              View Raw Events
            </button>
          </div>
        ) : null}

        {/* Raw Events View (Timeline) */}
        {viewMode === 'raw' && currentSpan && (
          <div>
            {timeline.map((item, idx) => {
            if (item.type === 'event') {
              // SPAN EVENT RENDERING
              const filepath = item.attributes?.['code.filepath'] as string;
              const lineno = item.attributes?.['code.lineno'] as number;
              const isCodeUnderTest = filepath && filepath !== 'GraphConverter.test.ts';

              // Determine which phase this event belongs to
              const eventPhase = item.name?.split('.')[0]; // 'setup', 'execution', 'assertion'
              const isHighlighted = highlightedPhase === eventPhase;

              return (
                <div
                  key={idx}
                  style={{
                    marginBottom: '12px',
                    paddingBottom: '12px',
                    paddingLeft: '12px',
                    borderBottom: idx < timeline.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                    borderLeft: '3px solid #f59e0b',
                    opacity: highlightedPhase && !isHighlighted ? 0.4 : 1,
                    transition: 'opacity 0.2s ease',
                    transform: isHighlighted ? 'scale(1.02)' : 'scale(1)',
                    backgroundColor: isHighlighted ? theme.colors.surface : 'transparent',
                    padding: isHighlighted ? '8px 8px 8px 12px' : '0 0 12px 12px',
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
                    <div style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 'bold', flexShrink: 0 }}>
                      EVENT: {item.name}
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
                      fontSize: '13px',
                      lineHeight: '1.5',
                      overflow: 'auto',
                      maxWidth: '100%',
                    }}
                  >
                    {yaml.dump(
                      Object.fromEntries(
                        Object.entries(item.attributes || {}).filter(
                          ([key]) => key !== 'code.filepath' && key !== 'code.lineno'
                        )
                      ),
                      { indent: 2, lineWidth: -1 }
                    )}
                  </pre>
                </div>
              );
            } else {
              // OTEL LOG RENDERING
              const serviceName = item.resource?.['service.name'];
              const severityColor = getSeverityColor(item.severity!);

              return (
                <div
                  key={idx}
                  style={{
                    marginBottom: '12px',
                    paddingBottom: '12px',
                    paddingLeft: '12px',
                    borderBottom: idx < timeline.length - 1 ? `1px solid ${theme.colors.border}` : 'none',
                    borderLeft: `3px solid ${severityColor}`,
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
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '16px' }}>{getSeverityIcon(item.severity!)}</span>
                      <span
                        style={{
                          color: severityColor,
                          fontSize: '13px',
                          fontWeight: 'bold',
                        }}
                      >
                        LOG: {item.severity}
                      </span>
                    </div>
                    {serviceName && (
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#9ca3af',
                          background: '#1e293b',
                          padding: '2px 6px',
                          borderRadius: '3px',
                        }}
                      >
                        {serviceName}
                      </div>
                    )}
                  </div>

                  {/* Log body */}
                  <div
                    style={{
                      background: theme.colors.surface,
                      padding: '8px',
                      borderRadius: '4px',
                      marginBottom: item.attributes && Object.keys(item.attributes).length > 0 ? '8px' : '0',
                      fontSize: '13px',
                    }}
                  >
                    {typeof item.body === 'string' ? (
                      item.body
                    ) : (
                      <pre style={{ margin: 0, fontSize: '13px', lineHeight: '1.5' }}>
                        {yaml.dump(item.body, { indent: 2, lineWidth: -1 })}
                      </pre>
                    )}
                  </div>

                  {/* Log attributes */}
                  {item.attributes && Object.keys(item.attributes).length > 0 && (
                    <pre
                      style={{
                        background: theme.colors.surface,
                        padding: '8px',
                        borderRadius: '4px',
                        margin: 0,
                        fontSize: '12px',
                        lineHeight: '1.5',
                        opacity: 0.8,
                      }}
                    >
                      {yaml.dump(item.attributes, { indent: 2, lineWidth: -1 })}
                    </pre>
                  )}
                </div>
              );
            }
          })}
          </div>
        )}
      </div>
    </div>
  );
};
