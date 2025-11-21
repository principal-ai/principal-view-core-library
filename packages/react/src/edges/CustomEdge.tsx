import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { EdgeTypeDefinition } from '@principal-ai/visual-validation-core';

export interface CustomEdgeData extends Record<string, unknown> {
  typeDefinition: EdgeTypeDefinition;
  hasViolations?: boolean;
  data?: Record<string, unknown>;
}

/**
 * Custom edge component for xyflow that renders based on EdgeTypeDefinition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CustomEdge: React.FC<EdgeProps<any>> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}) => {
  const edgeProps = data as CustomEdgeData | undefined;
  const { typeDefinition, hasViolations, data: edgeData } = edgeProps || ({} as CustomEdgeData);

  if (!typeDefinition) {
    return null;
  }

  const color = hasViolations ? '#D0021B' : (typeDefinition.color || '#888');
  const width = typeDefinition.width || 2;

  // Get Bezier path
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Style based on edge type
  const getStrokeStyle = () => {
    switch (typeDefinition.style) {
      case 'dashed':
        return '5 5';
      case 'dotted':
        return '2 2';
      default:
        return 'none';
    }
  };

  // Label configuration
  const labelConfig = typeDefinition.label;
  const labelField = labelConfig?.field;
  const labelText = labelField && edgeData?.[labelField] ? String(edgeData[labelField]) : '';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd as string}
        style={{
          stroke: color,
          strokeWidth: selected ? width + 1 : width,
          strokeDasharray: getStrokeStyle(),
          opacity: typeDefinition.style === 'animated' ? 0.7 : 1,
        }}
      />

      {/* Animated overlay for animated edges */}
      {typeDefinition.style === 'animated' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width}
          strokeDasharray="5 5"
          style={{
            animation: 'dashdraw 0.5s linear infinite',
          }}
        />
      )}

      {/* Label */}
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              backgroundColor: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 500,
              border: `1px solid ${color}`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {labelText}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Add CSS animation for dashed line */}
      <style>{`
        @keyframes dashdraw {
          to {
            stroke-dashoffset: -10;
          }
        }
      `}</style>
    </>
  );
};
