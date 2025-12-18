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
        top: '60px',
        right: '20px',
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '16px',
        minWidth: '250px',
        maxWidth: '350px',
        zIndex: 1000,
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: `2px solid ${edgeColor}`,
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '14px', color: edgeColor }}>Edge Information</div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: theme.colors.textSecondary,
            padding: '0',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Edge Type */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '4px' }}>
          Type
        </div>
        <div
          style={{
            fontSize: '12px',
            padding: '4px 8px',
            backgroundColor: edgeColor,
            color: theme.colors.background,
            borderRadius: '4px',
            display: 'inline-block',
          }}
        >
          {edge.type}
        </div>
      </div>

      {/* Connection Info */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '4px' }}>
          Connection
        </div>
        <div style={{ fontSize: '12px' }}>
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

      {/* Connection Sides */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '8px' }}>
          Connection Sides
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '10px', color: theme.colors.textMuted, marginBottom: '4px' }}>
              From Side
            </div>
            <select
              value={(edge.data?.fromSide as string) || 'right'}
              onChange={(e) => {
                if (onUpdateSides) {
                  onUpdateSides(
                    edge.id,
                    e.target.value,
                    (edge.data?.toSide as string) || 'left'
                  );
                }
              }}
              disabled={!onUpdateSides}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
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
            <div style={{ fontSize: '10px', color: theme.colors.textMuted, marginBottom: '4px' }}>
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
                fontSize: '12px',
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


      {/* Metadata */}
      <div
        style={{
          fontSize: '10px',
          color: theme.colors.textMuted,
          marginTop: '12px',
          paddingTop: '8px',
          borderTop: `1px solid ${theme.colors.border}`,
        }}
      >
        ID: {edge.id}
      </div>

      {/* Delete Button */}
      {onDelete && (
        <button
          onClick={() => {
            onDelete(edge.id);
            onClose();
          }}
          style={{
            marginTop: '12px',
            width: '100%',
            padding: '8px 12px',
            backgroundColor: theme.colors.error,
            color: theme.colors.background,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
          }}
        >
          Delete Edge
        </button>
      )}
    </div>
  );
};
