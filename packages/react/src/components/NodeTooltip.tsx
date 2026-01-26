import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@principal-ade/industry-theme';

export interface OtelInfo {
  kind: 'type' | 'service' | 'instance';
  category?: string;
  isNew?: boolean;
}

export interface NodeTooltipProps {
  description?: string;
  otel?: OtelInfo;
  sources?: string[];
  visible: boolean;
  /** Reference to the node element for positioning */
  nodeRef?: React.RefObject<HTMLDivElement>;
}

/**
 * Tooltip component for displaying node information on hover
 * Uses a portal to render above all other elements
 */
export const NodeTooltip: React.FC<NodeTooltipProps> = ({
  description,
  otel,
  sources,
  visible,
  nodeRef,
}) => {
  const { theme } = useTheme();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (visible && nodeRef?.current) {
      const rect = nodeRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8, // 8px below the node
        left: rect.left + rect.width / 2, // centered horizontally
      });
    } else if (!nodeRef) {
      // No ref provided - will use relative positioning (for storybook demos)
      setPosition({ top: 0, left: 0 });
    }
  }, [visible, nodeRef]);

  if (!visible) return null;

  // If no nodeRef, render inline (for storybook demos)
  const usePortal = Boolean(nodeRef);

  const getKindLabel = (kind: string) => {
    switch (kind) {
      case 'type':
        return 'Type';
      case 'service':
        return 'Service';
      case 'instance':
        return 'Instance';
      default:
        return kind;
    }
  };

  const getKindColor = (kind: string) => {
    switch (kind) {
      case 'type':
        return '#4A90E2'; // Blue
      case 'service':
        return '#7ED321'; // Green
      case 'instance':
        return '#9B59B6'; // Purple
      default:
        return '#888';
    }
  };

  const renderTooltipContent = (): React.JSX.Element => (
    <div
      style={{
        position: usePortal ? 'fixed' : 'absolute',
        top: usePortal ? position?.top ?? 0 : '100%',
        left: usePortal ? position?.left ?? 0 : '50%',
        transform: 'translateX(-50%)',
        marginTop: usePortal ? 0 : '8px',
        padding: '8px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        borderRadius: '6px',
        fontSize: theme.fontSizes[0],
        fontFamily: theme.fonts.body,
        maxWidth: '250px',
        zIndex: 99999,
        pointerEvents: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        whiteSpace: 'normal',
        opacity: usePortal ? (position ? 1 : 0) : 1,
      }}
    >
      {/* Arrow */}
      <div
        style={{
          position: 'absolute',
          top: '-6px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderBottom: '6px solid rgba(0, 0, 0, 0.9)',
        }}
      />

      {/* OTEL Badge */}
      {otel && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: description ? '6px' : 0,
          }}
        >
          <span
            style={{
              backgroundColor: getKindColor(otel.kind),
              color: 'white',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              fontFamily: theme.fonts.body,
              textTransform: 'uppercase',
            }}
          >
            {getKindLabel(otel.kind)}
          </span>
          {otel.category && (
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: theme.fontSizes[0], fontFamily: theme.fonts.body }}>
              {otel.category}
            </span>
          )}
          {otel.isNew && (
            <span
              style={{
                backgroundColor: '#F5A623',
                color: 'white',
                padding: '1px 4px',
                borderRadius: '3px',
                fontSize: theme.fontSizes[0],
                fontWeight: theme.fontWeights.semibold,
                fontFamily: theme.fonts.body,
              }}
            >
              NEW
            </span>
          )}
        </div>
      )}

      {/* Description */}
      <div style={{ lineHeight: '1.4', color: description ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)' }}>
        {description || 'No description'}
      </div>

      {/* Sources */}
      {sources && sources.length > 0 && (
        <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '6px' }}>
          <div style={{
            fontSize: theme.fontSizes[0],
            fontWeight: theme.fontWeights.semibold,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: '4px'
          }}>
            Sources:
          </div>
          <div style={{ fontSize: theme.fontSizes[0], color: 'rgba(255,255,255,0.8)' }}>
            {sources.map((source, index) => (
              <div key={index} style={{
                fontFamily: 'monospace',
                fontSize: theme.fontSizes[0],
                marginTop: index > 0 ? '2px' : 0,
                wordBreak: 'break-all'
              }}>
                {source}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Use portal to render at body level when nodeRef is provided, otherwise render inline
  if (usePortal) {
    return createPortal(renderTooltipContent(), document.body);
  }
  return renderTooltipContent();
};
