import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { NodeTypeDefinition } from '@principal-ai/visual-validation-core';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  typeDefinition: NodeTypeDefinition;
  state?: string;
  hasViolations?: boolean;
  data: Record<string, unknown>;
}

/**
 * Custom node component for xyflow that renders based on NodeTypeDefinition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CustomNode: React.FC<NodeProps<any>> = ({ data, selected }) => {
  const nodeProps = data as CustomNodeData;
  const { typeDefinition, state, hasViolations, data: nodeData } = nodeProps;

  // Guard against missing typeDefinition
  if (!typeDefinition) {
    return (
      <div style={{ padding: '10px', border: '2px solid red', borderRadius: '4px' }}>
        <div style={{ fontSize: '12px', color: 'red' }}>
          Error: Missing node type definition
        </div>
      </div>
    );
  }

  // Get color based on state or default
  const baseColor = typeDefinition.color || '#888';
  const stateColor = state && typeDefinition.states?.[state]?.color;
  const color = stateColor || baseColor;

  // Get label from data schema
  const labelField = Object.entries(typeDefinition.dataSchema).find(
    ([, schema]) => schema.displayInLabel
  )?.[0];
  const displayLabel = labelField && nodeData[labelField] ? String(nodeData[labelField]) : nodeProps.label;

  // Icon from state or default
  const icon = state && typeDefinition.states?.[state]?.icon
    ? typeDefinition.states[state].icon
    : typeDefinition.icon;

  // Shape-specific styles
  const getShapeStyles = () => {
    const baseStyles = {
      padding: '12px 16px',
      backgroundColor: 'white',
      border: `2px solid ${hasViolations ? '#D0021B' : color}`,
      fontSize: '12px',
      fontWeight: 500,
      minWidth: typeDefinition.size?.width || 80,
      minHeight: typeDefinition.size?.height || 40,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      boxShadow: selected ? `0 0 0 2px ${color}` : '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'all 0.2s ease',
    };

    switch (typeDefinition.shape) {
      case 'circle':
        return {
          ...baseStyles,
          borderRadius: '50%',
          width: typeDefinition.size?.width || 80,
          height: typeDefinition.size?.height || 80,
          padding: '8px',
        };
      case 'hexagon':
        return {
          ...baseStyles,
          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
          minWidth: typeDefinition.size?.width || 100,
        };
      case 'diamond':
        return {
          ...baseStyles,
          transform: 'rotate(45deg)',
          minWidth: typeDefinition.size?.width || 80,
          minHeight: typeDefinition.size?.height || 80,
        };
      case 'rectangle':
      default:
        return {
          ...baseStyles,
          borderRadius: '8px',
        };
    }
  };

  const isDiamond = typeDefinition.shape === 'diamond';

  return (
    <>
      {/* Input handle */}
      <Handle type="target" position={Position.Top} style={{ background: color }} />

      <div style={getShapeStyles()}>
        {/* Inner content (rotated back if diamond) */}
        <div style={isDiamond ? { transform: 'rotate(-45deg)' } : {}}>
          {icon && <div style={{ fontSize: '20px' }}>{icon}</div>}
          <div style={{ textAlign: 'center', wordBreak: 'break-word' }}>
            {displayLabel}
          </div>
          {state && (
            <div style={{
              fontSize: '10px',
              backgroundColor: color,
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
            }}>
              {typeDefinition.states?.[state]?.label || state}
            </div>
          )}
          {hasViolations && (
            <div style={{
              fontSize: '10px',
              color: '#D0021B',
              fontWeight: 'bold',
            }}>
              ⚠️
            </div>
          )}
        </div>
      </div>

      {/* Output handle */}
      <Handle type="source" position={Position.Bottom} style={{ background: color }} />
    </>
  );
};
