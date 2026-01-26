import React from 'react';
import type { EdgeState, EdgeTypeDefinition } from '@principal-ai/principal-view-core';
import { useTheme } from '@principal-ade/industry-theme';

export interface EdgeInfoPanelProps {
  edge: EdgeState;
  typeDefinition: EdgeTypeDefinition;
  sourceNodeId: string;
  targetNodeId: string;
  onClose: () => void;
  /** Optional callback to delete the edge. If not provided, delete button is hidden. */
  onDelete?: (edgeId: string) => void;
  /** Optional callback to update edge sides. If not provided, side selectors are disabled. */
  onUpdateSides?: (edgeId: string, fromSide: string, toSide: string) => void;
}

/**
 * Panel that displays information about a selected edge
 */
const SIDE_OPTIONS = ['top', 'right', 'bottom', 'left'] as const;

export const EdgeInfoPanel: React.FC<EdgeInfoPanelProps> = ({
  edge,
  typeDefinition,
  sourceNodeId,
  targetNodeId,
  onClose,
  onDelete,
  onUpdateSides,
}) => {
  const { theme } = useTheme();
  const edgeColor = typeDefinition.color || theme.colors.primary;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderTop: `2px solid ${edgeColor}`,
        boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
        padding: '16px 24px',
        zIndex: 1000,
        maxHeight: '40%',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          <div style={{ fontWeight: theme.fontWeights.bold, fontSize: theme.fontSizes[2], fontFamily: theme.fonts.body, color: edgeColor }}>
            Edge Information
          </div>
          <div style={{ fontSize: theme.fontSizes[0], fontFamily: theme.fonts.body, color: theme.colors.textMuted }}>
            {edge.type}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: theme.fontSizes[3],
            fontFamily: theme.fonts.body,
            color: theme.colors.textSecondary,
            padding: '4px',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.colors.muted;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          ×
        </button>
      </div>

      {/* Content - use horizontal layout */}
      <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>

        {/* Left section - Connection Info */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: theme.fontSizes[0], fontFamily: theme.fonts.body, color: theme.colors.textSecondary, marginBottom: '4px' }}>
              Connection
            </div>
            <div style={{ fontSize: theme.fontSizes[0], fontFamily: theme.fonts.body }}>
              <span
                style={{
                  fontFamily: theme.fonts.monospace,
                  backgroundColor: theme.colors.muted,
                  padding: '2px 6px',
                  borderRadius: '3px',
                }}
              >
                {sourceNodeId}
              </span>
              <span style={{ margin: '0 8px', color: theme.colors.textMuted }}>→</span>
              <span
                style={{
                  fontFamily: theme.fonts.monospace,
                  backgroundColor: theme.colors.muted,
                  padding: '2px 6px',
                  borderRadius: '3px',
                }}
              >
                {targetNodeId}
              </span>
            </div>
          </div>

          {/* Metadata */}
          <div
            style={{
              fontSize: theme.fontSizes[0],
              fontFamily: theme.fonts.body,
              color: theme.colors.textMuted,
            }}
          >
            ID: {edge.id}
          </div>
        </div>

        {/* Center section - Connection Sides */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: theme.fontSizes[0], fontFamily: theme.fonts.body, color: theme.colors.textSecondary, marginBottom: '8px' }}>
            Connection Sides
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: theme.fontSizes[0], fontFamily: theme.fonts.body, color: theme.colors.textMuted, marginBottom: '4px' }}>
                From Side
              </div>
              <select
                value={(edge.data?.fromSide as string) || 'right'}
                onChange={(e) => {
                  if (onUpdateSides) {
                    onUpdateSides(edge.id, e.target.value, (edge.data?.toSide as string) || 'left');
                  }
                }}
                disabled={!onUpdateSides}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: theme.fontSizes[0],
                  fontFamily: theme.fonts.body,
                  borderRadius: '4px',
                  border: `1px solid ${theme.colors.border}`,
                  backgroundColor: theme.colors.background,
                  color: theme.colors.text,
                  cursor: onUpdateSides ? 'pointer' : 'not-allowed',
                  opacity: onUpdateSides ? 1 : 0.6,
                }}
              >
                {SIDE_OPTIONS.map((side) => (
                  <option key={side} value={side}>
                    {side}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: theme.fontSizes[0], fontFamily: theme.fonts.body, color: theme.colors.textMuted, marginBottom: '4px' }}>
                To Side
              </div>
              <select
                value={(edge.data?.toSide as string) || 'left'}
                onChange={(e) => {
                  if (onUpdateSides) {
                    onUpdateSides(
                      edge.id,
                      (edge.data?.fromSide as string) || 'right',
                      e.target.value
                    );
                  }
                }}
                disabled={!onUpdateSides}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: theme.fontSizes[0],
                  fontFamily: theme.fonts.body,
                  borderRadius: '4px',
                  border: `1px solid ${theme.colors.border}`,
                  backgroundColor: theme.colors.background,
                  color: theme.colors.text,
                  cursor: onUpdateSides ? 'pointer' : 'not-allowed',
                  opacity: onUpdateSides ? 1 : 0.6,
                }}
              >
                {SIDE_OPTIONS.map((side) => (
                  <option key={side} value={side}>
                    {side}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right section - Delete Button */}
        {onDelete && (
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              onClick={() => {
                onDelete(edge.id);
                onClose();
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: theme.colors.error,
                color: theme.colors.background,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: theme.fontSizes[0],
                fontFamily: theme.fonts.body,
                fontWeight: theme.fontWeights.bold,
              }}
            >
              Delete Edge
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
