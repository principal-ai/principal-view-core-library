import React, { useMemo } from 'react';
import { renderNarrative } from '@principal-ai/principal-view-core/browser';
import type { NarrativeTemplate, OtelEvent } from '@principal-ai/principal-view-core/browser';
import { useTheme } from '@principal-ade/industry-theme';

export interface NarrativeRendererProps {
  /** Narrative template to use for rendering */
  template: NarrativeTemplate;

  /** OTEL events to render */
  events: OtelEvent[];

  /** Optional CSS class name */
  className?: string;

  /** Optional custom style */
  style?: React.CSSProperties;

  /** Show metadata panel */
  showMetadata?: boolean;
}

/**
 * Renders OTEL events as a human-readable narrative using a template
 */
export const NarrativeRenderer: React.FC<NarrativeRendererProps> = ({
  template,
  events,
  className,
  style,
  showMetadata = false,
}) => {
  const { theme } = useTheme();

  // Render the narrative
  const result = useMemo(() => {
    try {
      return renderNarrative(template, events);
    } catch (error) {
      return {
        text: `Error rendering narrative: ${error instanceof Error ? error.message : 'Unknown error'}`,
        scenarioId: 'error',
        metadata: {
          eventCount: events.length,
          spanCount: 0,
          logCount: 0,
        },
      };
    }
  }, [template, events]);

  // Parse narrative text to add syntax highlighting
  const renderHighlightedText = (text: string) => {
    const lines = text.split('\n');

    return lines.map((line, idx) => {
      // Determine line style based on content
      let lineStyle: React.CSSProperties = {};
      let content = line;

      // Status indicators (✅ ❌ ⚠️ 📋)
      if (/^[✅❌⚠️📋]/.test(line)) {
        lineStyle = {
          fontWeight: 'bold',
          fontSize: '16px',
          marginTop: idx > 0 ? '8px' : '0',
          marginBottom: '4px',
        };
      }
      // Separators (━━━━)
      else if (/^━+/.test(line)) {
        lineStyle = {
          color: theme.colors.border,
          opacity: 0.6,
        };
      }
      // Arrow items (→)
      else if (/^(\s*)→/.test(line)) {
        const indent = line.match(/^(\s*)/)?.[1] || '';
        lineStyle = {
          color: theme.colors.text,
          fontWeight: indent.length === 0 ? 'bold' : 'normal',
          marginTop: indent.length === 0 ? '12px' : '4px',
        };
      }
      // Bullet items (•)
      else if (/^\s+•/.test(line)) {
        lineStyle = {
          color: theme.colors.textMuted,
          paddingLeft: '8px',
        };
      }
      // Section headers (UPPERCASE at start)
      else if (/^[A-Z\s]+:/.test(line)) {
        lineStyle = {
          fontWeight: 'bold',
          marginTop: '8px',
          color: theme.colors.text,
        };
      }

      return (
        <div key={idx} style={lineStyle}>
          {content}
        </div>
      );
    });
  };

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {/* Narrative Text */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          fontFamily: theme.fonts.monospace,
          fontSize: '14px',
          lineHeight: '1.6',
          color: theme.colors.text,
          backgroundColor: theme.colors.background,
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
        }}
      >
        {renderHighlightedText(result.text)}
      </div>

      {/* Metadata Panel (optional) */}
      {showMetadata && (
        <div
          style={{
            borderTop: `1px solid ${theme.colors.border}`,
            padding: '12px 20px',
            backgroundColor: theme.colors.surface,
            fontSize: '12px',
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.monospace,
          }}
        >
          <div style={{ marginBottom: '4px' }}>
            <strong style={{ color: theme.colors.text }}>Template:</strong> {template.name}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong style={{ color: theme.colors.text }}>Scenario:</strong> {result.scenarioId}
          </div>
          <div>
            <strong style={{ color: theme.colors.text }}>Events:</strong> {result.metadata.eventCount} total
            ({result.metadata.spanCount} spans, {result.metadata.logCount} logs)
          </div>
          {result.metadata.timeRange && (
            <div style={{ marginTop: '4px' }}>
              <strong style={{ color: theme.colors.text }}>Duration:</strong>{' '}
              {Number(result.metadata.timeRange.end) - Number(result.metadata.timeRange.start)}ms
            </div>
          )}
        </div>
      )}
    </div>
  );
};
