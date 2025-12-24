import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface OtelInfo {
  kind: 'type' | 'service' | 'instance';
  category?: string;
  isNew?: boolean;
}

export interface NodeTooltipProps {
  description?: string;
  otel?: OtelInfo;
  visible: boolean;
  /** Reference to the node element for positioning */
  nodeRef?: React.RefObject<HTMLDivElement>;
}

/**
 * Tooltip component for displaying node information on hover
 * Uses a portal to render above all other elements
 */
export const NodeTooltip: React.FC<NodeTooltipProps> = ({ description, otel, visible, nodeRef }) => {
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

  // Don't show tooltip if no useful info
  if (!description && !otel) return null;

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

  const tooltipContent = (
    <div
      style={{
        position: usePortal ? 'fixed' : 'absolute',
        top: usePortal ? (position?.top ?? 0) : '100%',
        left: usePortal ? (position?.left ?? 0) : '50%',
        transform: 'translateX(-50%)',
        marginTop: usePortal ? 0 : '8px',
        padding: '8px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        borderRadius: '6px',
        fontSize: '11px',
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
              fontSize: '9px',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {getKindLabel(otel.kind)}
          </span>
          {otel.category && (
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px' }}>{otel.category}</span>
          )}
          {otel.isNew && (
            <span
              style={{
                backgroundColor: '#F5A623',
                color: 'white',
                padding: '1px 4px',
                borderRadius: '3px',
                fontSize: '8px',
                fontWeight: 600,
              }}
            >
              NEW
            </span>
          )}
        </div>
      )}

      {/* Description */}
      {description && (
        <div style={{ lineHeight: '1.4', color: 'rgba(255,255,255,0.9)' }}>{description}</div>
      )}
    </div>
  );

  // Use portal to render at body level when nodeRef is provided, otherwise render inline
  if (usePortal) {
    return createPortal(tooltipContent, document.body);
  }
  return tooltipContent;
};
