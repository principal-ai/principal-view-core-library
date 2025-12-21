import React from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { NodeTypeDefinition } from '@principal-ai/principal-view-core';
import { resolveIcon } from '../utils/iconResolver';

export interface CustomNodeData extends Record<string, unknown> {
  name: string;
  typeDefinition: NodeTypeDefinition;
  state?: string;
  hasViolations?: boolean;
  data: Record<string, unknown>;
  // Animation control
  animationType?: 'pulse' | 'flash' | 'shake' | 'entry' | null;
  animationDuration?: number;
  // Edit mode - shows larger connection handles
  editable?: boolean;
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
    animationDuration = 1000,
    editable = false,
  } = nodeProps;

  // Guard against missing typeDefinition
  if (!typeDefinition) {
    return (
      <div style={{ padding: '10px', border: '2px solid red', borderRadius: '4px' }}>
        <div style={{ fontSize: '12px', color: 'red' }}>Error: Missing node type definition</div>
      </div>
    );
  }

  // Get fill color based on state or default
  // Priority: state color > node data color > type definition color > default
  const nodeDataColor = nodeData.color as string | undefined;
  const baseColor = nodeDataColor || typeDefinition.color || '#888';
  // Check node's own states first (from pv.states), then fall back to type definition states
  const nodeDataStates = nodeData.states as
    | Record<string, { color?: string; label?: string; icon?: string }>
    | undefined;
  const stateColor =
    state && (nodeDataStates?.[state]?.color || typeDefinition.states?.[state]?.color);
  const fillColor = stateColor || baseColor;

  // Get stroke color - priority: node data stroke > type definition stroke > fill color
  const nodeDataStroke = nodeData.stroke as string | undefined;
  const strokeColor = nodeDataStroke || typeDefinition.stroke || fillColor;

  // Use fillColor as the primary "color" for backwards compatibility
  const color = fillColor;

  // Get display name - use name from props (falls back to node.id in converter)
  const displayName = nodeProps.name;

  // Icon priority: node data override > state icon (node data states first) > type definition icon
  const icon =
    (nodeData.icon as string) ||
    (state && (nodeDataStates?.[state]?.icon || typeDefinition.states?.[state]?.icon)) ||
    typeDefinition.icon;

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

  // Check if this is a group node
  const isGroup = nodeData.canvasType === 'group';

  // Shape-specific styles
  const getShapeStyles = () => {
    const baseStyles = {
      padding: '12px 16px',
      backgroundColor: isGroup ? 'rgba(255, 255, 255, 0.7)' : 'white',
      color: '#000',
      border: `2px solid ${hasViolations ? '#D0021B' : strokeColor}`,
      fontSize: '12px',
      fontWeight: 500,
      // Use 100% width/height to fill the node container (for resizing support)
      width: '100%',
      height: '100%',
      minWidth: typeDefinition.size?.width || 80,
      minHeight: typeDefinition.size?.height || 40,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: isGroup ? 'flex-start' : 'center',
      gap: '4px',
      boxShadow: selected ? `0 0 0 2px ${strokeColor}` : '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'box-shadow 0.2s ease',
      animationDuration: animationType ? `${animationDuration}ms` : undefined,
      boxSizing: 'border-box' as const,
    };

    switch (typeDefinition.shape) {
      case 'circle':
        return {
          ...baseStyles,
          borderRadius: '50%',
          padding: '8px',
        };
      case 'hexagon':
        // Hexagon uses wrapper approach for proper border - styles returned here are for inner fill
        // The outer border wrapper is rendered separately in the JSX
        return {
          ...baseStyles,
          border: 'none', // Border handled by wrapper
          clipPath: 'polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)',
          width: '100%',
          height: '100%',
          minWidth: 'unset',
          minHeight: 'unset',
          padding: '8px 20px',
          boxShadow: 'none', // Shadow handled by wrapper
        };
      case 'diamond':
        // Diamond uses wrapper approach for proper border - styles returned here are for inner fill
        // The outer border wrapper is rendered separately in the JSX
        return {
          ...baseStyles,
          border: 'none', // Border handled by wrapper
          clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          width: '100%',
          height: '100%',
          minWidth: 'unset',
          minHeight: 'unset',
          padding: '8px 16px',
          boxShadow: 'none', // Shadow handled by wrapper
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
  const isHexagon = typeDefinition.shape === 'hexagon';
  const isCircle = typeDefinition.shape === 'circle';

  // Determine if aspect ratio should be locked (circles should maintain square aspect)
  const keepAspectRatio = isCircle;

  // Minimum dimensions for resizing
  const minWidth = typeDefinition.size?.width || 80;
  const minHeight = typeDefinition.size?.height || (isCircle ? minWidth : 40);

  // Hexagon border wrapper styles (outer shape that acts as border)
  // Hexagon with gentle diagonals
  const hexagonClipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
  const hexagonBorderWidth = 2;
  const hexagonBorderStyle: React.CSSProperties = isHexagon
    ? {
        position: 'relative',
        clipPath: hexagonClipPath,
        backgroundColor: hasViolations ? '#D0021B' : strokeColor,
        // Use 100% to fill container for resizing support
        width: '100%',
        height: '100%',
        minWidth: typeDefinition.size?.width || 120,
        minHeight: typeDefinition.size?.height || 120,
        boxShadow: selected ? `0 0 0 2px ${strokeColor}` : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'box-shadow 0.2s ease',
        boxSizing: 'border-box',
      }
    : {};

  // Hexagon inner fill styles (white background inset from border)
  const hexagonInnerStyle: React.CSSProperties = isHexagon
    ? {
        position: 'absolute',
        top: hexagonBorderWidth,
        left: hexagonBorderWidth,
        right: hexagonBorderWidth,
        bottom: hexagonBorderWidth,
        clipPath: hexagonClipPath,
        backgroundColor: 'white',
        color: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 500,
        gap: '4px',
      }
    : {};

  // Diamond clip-path
  const diamondClipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
  const diamondBorderWidth = 2;

  // Diamond border wrapper styles (outer shape that acts as border)
  const diamondBorderStyle: React.CSSProperties = isDiamond
    ? {
        position: 'relative',
        clipPath: diamondClipPath,
        backgroundColor: hasViolations ? '#D0021B' : strokeColor,
        width: '100%',
        height: '100%',
        minWidth: typeDefinition.size?.width || 80,
        minHeight: typeDefinition.size?.height || 80,
        boxShadow: selected ? `0 0 0 2px ${strokeColor}` : '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'box-shadow 0.2s ease',
        boxSizing: 'border-box',
      }
    : {};

  // Diamond inner fill styles (white background inset from border)
  const diamondInnerStyle: React.CSSProperties = isDiamond
    ? {
        position: 'absolute',
        top: diamondBorderWidth,
        left: diamondBorderWidth,
        right: diamondBorderWidth,
        bottom: diamondBorderWidth,
        clipPath: diamondClipPath,
        backgroundColor: 'white',
        color: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 500,
        gap: '4px',
      }
    : {};

  // Handle styles - larger and more visible in edit mode
  const baseHandleStyle = editable
    ? {
        background: color,
        width: 12,
        height: 12,
        border: '2px solid white',
        boxShadow: '0 0 0 1px ' + color,
      }
    : {
        background: color,
        width: 8,
        height: 8,
      };

  const getHandleStyle = (_position: 'top' | 'bottom' | 'left' | 'right') => {
    if (!isDiamond && !isHexagon) return baseHandleStyle;

    const offsetStyle: React.CSSProperties = { ...baseHandleStyle };

    // Bring handles above the clip-path layers for hexagon and diamond
    if (isHexagon || isDiamond) {
      offsetStyle.zIndex = 10;
    }

    return offsetStyle;
  };

  return (
    <>
      {/* Node Resizer - only shown in edit mode */}
      {editable && (
        <NodeResizer
          color={strokeColor}
          isVisible={selected}
          minWidth={minWidth}
          minHeight={minHeight}
          keepAspectRatio={keepAspectRatio}
          handleStyle={{
            width: 8,
            height: 8,
            borderRadius: 2,
            zIndex: 20,
          }}
          lineStyle={{
            borderWidth: 1,
            zIndex: 20,
          }}
        />
      )}

      {/* Input handles - all 4 sides for incoming connections */}
      <Handle type="target" position={Position.Top} id="top" style={getHandleStyle('top')} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={getHandleStyle('bottom')} />
      <Handle type="target" position={Position.Left} id="left" style={getHandleStyle('left')} />
      <Handle type="target" position={Position.Right} id="right" style={getHandleStyle('right')} />

      {/* Hexagon and Diamond need a wrapper for proper border rendering */}
      {isHexagon ? (
        <div style={hexagonBorderStyle} className={animationClass}>
          <div style={hexagonInnerStyle}>
            {icon && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {resolveIcon(icon, 20)}
              </div>
            )}
            <div style={{ textAlign: 'center', wordBreak: 'break-word' }}>{displayName}</div>
            {state && (
              <div
                style={{
                  fontSize: '10px',
                  backgroundColor: color,
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  textAlign: 'center',
                }}
              >
                {nodeDataStates?.[state]?.label || typeDefinition.states?.[state]?.label || state}
              </div>
            )}
            {hasViolations && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#D0021B',
                  fontWeight: 'bold',
                }}
              >
                ⚠️
              </div>
            )}
          </div>
        </div>
      ) : isDiamond ? (
        <div style={diamondBorderStyle} className={animationClass}>
          <div style={diamondInnerStyle}>
            {icon && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {resolveIcon(icon, 20)}
              </div>
            )}
            <div style={{ textAlign: 'center', wordBreak: 'break-word' }}>{displayName}</div>
            {state && (
              <div
                style={{
                  fontSize: '10px',
                  backgroundColor: color,
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  textAlign: 'center',
                }}
              >
                {nodeDataStates?.[state]?.label || typeDefinition.states?.[state]?.label || state}
              </div>
            )}
            {hasViolations && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#D0021B',
                  fontWeight: 'bold',
                }}
              >
                ⚠️
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={getShapeStyles()} className={animationClass}>
          {/* Inner content */}
          <div
            style={{
              ...(isGroup ? { width: '100%' } : {}),
            }}
          >
            {/* Groups: icon and text inline, centered */}
            {isGroup ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                }}
              >
                {icon && resolveIcon(icon, 18)}
                <div style={{ wordBreak: 'break-word' }}>{displayName}</div>
              </div>
            ) : (
              <>
                {icon && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {resolveIcon(icon, 20)}
                  </div>
                )}
                <div style={{ textAlign: 'center', wordBreak: 'break-word' }}>{displayName}</div>
              </>
            )}
            {state && (
              <div
                style={{
                  fontSize: '10px',
                  backgroundColor: color,
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  textAlign: 'center',
                }}
              >
                {nodeDataStates?.[state]?.label || typeDefinition.states?.[state]?.label || state}
              </div>
            )}
            {hasViolations && (
              <div
                style={{
                  fontSize: '10px',
                  color: '#D0021B',
                  fontWeight: 'bold',
                }}
              >
                ⚠️
              </div>
            )}
          </div>
        </div>
      )}

      {/* Output handles - all 4 sides for outgoing connections */}
      <Handle type="source" position={Position.Top} id="top-out" style={getHandleStyle('top')} />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom-out"
        style={getHandleStyle('bottom')}
      />
      <Handle type="source" position={Position.Left} id="left-out" style={getHandleStyle('left')} />
      <Handle
        type="source"
        position={Position.Right}
        id="right-out"
        style={getHandleStyle('right')}
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

      `}</style>
    </>
  );
};
