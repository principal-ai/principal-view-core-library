import React from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { NodeTypeDefinition } from '@principal-ai/visual-validation-core';
import { resolveIcon } from '../utils/iconResolver';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  typeDefinition: NodeTypeDefinition;
  state?: string;
  hasViolations?: boolean;
  data: Record<string, unknown>;
  // Animation control
  animationType?: 'pulse' | 'flash' | 'shake' | 'entry' | null;
  animationDuration?: number;
}

/**
 * Custom node component for xyflow that renders based on NodeTypeDefinition
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CustomNode: React.FC<NodeProps<any>> = ({ data, selected }) => {
  const nodeProps = data as CustomNodeData;
  const {
    typeDefinition,
    state,
    hasViolations,
    data: nodeData,
    animationType,
    animationDuration = 1000
  } = nodeProps;

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

  // Get animation class based on type
  const getAnimationClass = () => {
    switch (animationType) {
      case 'pulse':
        return 'node-pulse';
      case 'flash':
        return 'node-flash';
      case 'shake':
        return 'node-shake';
      case 'entry':
        return 'node-entry';
      default:
        return '';
    }
  };

  const animationClass = getAnimationClass();

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
      animationDuration: animationType ? `${animationDuration}ms` : undefined,
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
      {/* Input handles - multiple connection points */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        style={{ background: color }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        style={{ background: color }}
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right"
        style={{ background: color }}
      />

      <div style={getShapeStyles()} className={animationClass}>
        {/* Inner content (rotated back if diamond) */}
        <div style={isDiamond ? { transform: 'rotate(-45deg)' } : {}}>
          {icon && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{resolveIcon(icon, 20)}</div>}
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

      {/* Output handles - multiple connection points */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        style={{ background: color }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-out"
        style={{ background: color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-out"
        style={{ background: color }}
      />

      {/* CSS animations for node animation types */}
      <style>{`
        /* Processing pulse - continuous breathing effect */
        .node-pulse {
          animation: node-pulse ease-in-out infinite;
        }

        @keyframes node-pulse {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          50% {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2), 0 0 0 4px rgba(59, 130, 246, 0.3);
          }
        }

        /* Success flash - brief green glow */
        .node-flash {
          animation: node-flash ease-out forwards;
        }

        @keyframes node-flash {
          0% {
            box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.8);
            background-color: rgba(34, 197, 94, 0.1);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(34, 197, 94, 0);
            background-color: rgba(34, 197, 94, 0.2);
          }
          100% {
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            background-color: white;
          }
        }

        /* Error shake - vibrate effect */
        .node-shake {
          animation: node-shake ease-in-out;
        }

        @keyframes node-shake {
          0%, 100% {
            transform: translateX(0);
          }
          10%, 30%, 50%, 70%, 90% {
            transform: translateX(-4px);
          }
          20%, 40%, 60%, 80% {
            transform: translateX(4px);
          }
        }

        /* Entry animation - scale up and fade in */
        .node-entry {
          animation: node-entry ease-out forwards;
        }

        @keyframes node-entry {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        /* Special handling for diamond shape with shake */
        .node-shake[style*="rotate(45deg)"] {
          animation: node-shake-diamond ease-in-out;
        }

        @keyframes node-shake-diamond {
          0%, 100% {
            transform: rotate(45deg) translateX(0);
          }
          10%, 30%, 50%, 70%, 90% {
            transform: rotate(45deg) translateX(-4px);
          }
          20%, 40%, 60%, 80% {
            transform: rotate(45deg) translateX(4px);
          }
        }
      `}</style>
    </>
  );
};
