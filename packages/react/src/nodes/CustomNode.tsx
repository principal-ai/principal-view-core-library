import React, { useState, useRef } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { NodeTypeDefinition } from '@principal-ai/principal-view-core';
import { useTheme } from '@principal-ade/industry-theme';
import { resolveIcon } from '../utils/iconResolver';
import { NodeTooltip } from '../components/NodeTooltip';
import type { OtelInfo } from '../components/NodeTooltip';

/**
 * Converts a hex color to a lighter/tinted version (opaque, not transparent)
 * @param hexColor - Hex color string (e.g., "#FF5733" or "#888")
 * @param lightness - How much to lighten (0-1), defaults to 0.88 (88% white mixed in)
 * @returns hex color string
 */
function hexToLightColor(hexColor: string, lightness = 0.88): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');

  // Parse hex to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Mix with white based on lightness factor
  // lightness of 0.88 means 88% white + 12% original color
  const newR = Math.round(r + (255 - r) * lightness);
  const newG = Math.round(g + (255 - g) * lightness);
  const newB = Math.round(b + (255 - b) * lightness);

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
}

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
  // Whether tooltips are enabled (defaults to true)
  tooltipsEnabled?: boolean;
  // Whether shift key is currently pressed (for tooltip control)
  shiftKeyPressed?: boolean;
  // Whether this node is highlighted (e.g., during execution playback)
  isHighlighted?: boolean;
  // Whether this node is active (involved in current execution scenario)
  // If false, node will be dimmed to de-emphasize it
  isActive?: boolean;
  // Whether this node is hidden by user (shift-click)
  // If true, node will be dimmed less than inactive nodes
  isHidden?: boolean;
}

/**
 * Custom node component for xyflow that renders based on NodeTypeDefinition
 */
export const CustomNode: React.FC<NodeProps<Node<CustomNodeData>>> = ({ data, selected, dragging }) => {
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const nodeProps = data;
  const {
    typeDefinition,
    state,
    hasViolations,
    data: nodeData,
    animationType,
    animationDuration = 1000,
    editable = false,
    tooltipsEnabled = true,
    shiftKeyPressed = false,
    isHighlighted = false,
    isActive = true, // Default to active if not specified
    isHidden = false, // Default to not hidden
  } = nodeProps;

  // Calculate opacity based on node state
  // Hidden nodes (shift-clicked) are dimmed to 0.4
  // Inactive nodes (scenario filtering) are dimmed to 0.1
  const nodeOpacity = isHidden ? 0.4 : isActive ? 1 : 0.1;

  // Only show tooltip when hovering, not dragging, and shift key is pressed
  const showTooltip = isHovered && !dragging && shiftKeyPressed;

  // Extract OTEL info, description, and sources for tooltip
  const otelInfo = nodeData?.otel as OtelInfo | undefined;
  const description = nodeData?.description as string | undefined;
  const sources = nodeData?.sources as string[] | undefined;

  // Get badge shape styles based on node shape
  const getBadgeShapeStyles = (): React.CSSProperties => {
    const shape = typeDefinition.shape;
    const baseSize = 18;

    switch (shape) {
      case 'circle':
        return {
          width: baseSize,
          height: baseSize,
          borderRadius: '50%',
        };
      case 'diamond':
        return {
          width: baseSize - 4,
          height: baseSize - 4,
          borderRadius: 0,
          transform: 'rotate(45deg)',
        };
      case 'hexagon':
        return {
          width: baseSize,
          height: baseSize,
          borderRadius: 0,
          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
        };
      case 'rectangle':
      default:
        return {
          width: baseSize,
          height: baseSize,
          borderRadius: 0,
        };
    }
  };

  // Render Sources badge (top-right)
  const renderSourcesBadge = () => {
    const sources = nodeData?.sources as string[] | undefined;
    if (!sources || sources.length === 0) return null;

    const shapeStyles = getBadgeShapeStyles();

    return (
      <div
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          ...shapeStyles,
          backgroundColor: '#10b981', // Green for sources
          color: 'white',
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.bold,
          fontFamily: theme.fonts.body,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          zIndex: 10,
          opacity: nodeOpacity,
        }}
        title={`Sources: ${sources.join(', ')}`}
      >
        <span style={{ transform: shapeStyles.transform ? 'rotate(-45deg)' : undefined }}>S</span>
      </div>
    );
  };

  // Render Status badge (top-left)
  const renderStatusBadge = () => {
    const status = nodeData?.status as 'draft' | 'approved' | 'implemented' | undefined;
    if (!status) return null;

    // Color mapping for status
    const statusColors = {
      draft: '#6b7280', // Gray
      approved: '#3b82f6', // Blue
      implemented: '#10b981', // Green
    };

    const statusLabels = {
      draft: 'D',
      approved: 'A',
      implemented: 'I',
    };

    const statusTitles = {
      draft: 'Draft - Design phase',
      approved: 'Approved - Ready for implementation',
      implemented: 'Implemented - Code exists',
    };

    const shapeStyles = getBadgeShapeStyles();

    return (
      <div
        style={{
          position: 'absolute',
          top: -6,
          left: -6,
          ...shapeStyles,
          backgroundColor: statusColors[status],
          color: 'white',
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.bold,
          fontFamily: theme.fonts.body,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          zIndex: 10,
          opacity: nodeOpacity,
        }}
        title={statusTitles[status]}
      >
        <span style={{ transform: shapeStyles.transform ? 'rotate(-45deg)' : undefined }}>
          {statusLabels[status]}
        </span>
      </div>
    );
  };

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
  const baseStrokeColor = nodeDataStroke || typeDefinition.stroke || fillColor;

  // Apply status-based border styling
  const status = nodeData?.status as 'draft' | 'approved' | 'implemented' | undefined;
  const strokeColor = baseStrokeColor;

  // Use fillColor as the primary "color" for backwards compatibility
  const color = fillColor;

  // Get display name - use name from props (falls back to node.id in converter)
  const displayName = nodeProps.name;

  // Extract event name if present
  const eventData = nodeData?.event as { name?: string; description?: string; attributes?: Record<string, unknown> } | undefined;
  const eventName = eventData?.name;

  // Show event name if it differs from display name
  const showEventName = eventName && eventName !== displayName;

  // Helper component for rendering name with optional event name
  const renderNameWithEvent = (centered: boolean = true) => (
    <div style={{ textAlign: centered ? 'center' : 'left', wordBreak: 'break-word' }}>
      <div>{displayName}</div>
      {showEventName && (
        <div
          style={{
            fontSize: theme.fontSizes[0] * 0.75, // 75% of the main font size
            color: 'rgba(0, 0, 0, 0.5)', // 50% opacity for subtle appearance
            marginTop: '2px',
            fontFamily: theme.fonts.monospace,
          }}
        >
          {eventName}
        </div>
      )}
    </div>
  );

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
    const borderStyle = status === 'draft' ? 'dotted' : status === 'approved' ? 'dashed' : 'solid';
    const baseStyles = {
      padding: '12px 16px',
      backgroundColor: isGroup ? 'rgba(255, 255, 255, 0.7)' : hexToLightColor(fillColor),
      color: '#000',
      border: `2px ${borderStyle} ${hasViolations ? '#D0021B' : strokeColor}`,
      fontSize: theme.fontSizes[0],
      fontWeight: theme.fontWeights.medium,
      fontFamily: theme.fonts.body,
      // Use 100% width/height to fill the node container (for resizing support)
      width: '100%',
      height: '100%',
      // Use small absolute minimums - typeDefinition.size is the default, not the minimum
      minWidth: 20,
      minHeight: 20,
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: isGroup ? 'flex-start' : 'center',
      gap: '4px',
      boxShadow: isHighlighted
        ? `0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)`
        : selected
        ? `0 0 0 2px ${strokeColor}`
        : '0 2px 4px rgba(0,0,0,0.1)',
      opacity: nodeOpacity,
      transition: 'box-shadow 0.2s ease, opacity 0.3s ease',
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
          borderRadius: '0',
        };
    }
  };

  const isDiamond = typeDefinition.shape === 'diamond';
  const isHexagon = typeDefinition.shape === 'hexagon';
  const isCircle = typeDefinition.shape === 'circle';

  // Determine if aspect ratio should be locked (circles should maintain square aspect)
  const keepAspectRatio = isCircle;

  // Minimum dimensions for resizing - use small absolute values, not typeDefinition.size
  const minWidth = 40;
  const minHeight = isCircle ? 40 : 30;

  // Hexagon border wrapper styles (outer shape that acts as border)
  // Hexagon with gentle diagonals
  const hexagonClipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
  // Note: Dotted/dashed borders not supported for hexagon shape (CSS limitation with clip-path)
  // All statuses use 2px solid border for hexagons
  const hexagonBorderWidth = 2;
  const hexagonBorderStyle: React.CSSProperties = isHexagon
    ? {
        position: 'relative',
        clipPath: hexagonClipPath,
        backgroundColor: hasViolations ? '#D0021B' : strokeColor,
        // Use 100% to fill container for resizing support
        width: '100%',
        height: '100%',
        // Use small absolute minimums - typeDefinition.size is the default, not the minimum
        minWidth: 20,
        minHeight: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        opacity: nodeOpacity,
        transition: 'opacity 0.3s ease',
        boxSizing: 'border-box',
      }
    : {};

  // Hexagon inner fill styles (light color background inset from border)
  const hexagonInnerStyle: React.CSSProperties = isHexagon
    ? {
        position: 'absolute',
        top: hexagonBorderWidth,
        left: hexagonBorderWidth,
        right: hexagonBorderWidth,
        bottom: hexagonBorderWidth,
        clipPath: hexagonClipPath,
        backgroundColor: hexToLightColor(fillColor),
        color: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: theme.fontSizes[0],
        fontWeight: theme.fontWeights.medium,
        fontFamily: theme.fonts.body,
        gap: '4px',
      }
    : {};

  // Diamond clip-path
  const diamondClipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
  // Note: Dotted/dashed borders not supported for diamond shape (CSS limitation with clip-path)
  // All statuses use 2px solid border for diamonds
  const diamondBorderWidth = 2;

  // Diamond border wrapper styles (outer shape that acts as border)
  const diamondBorderStyle: React.CSSProperties = isDiamond
    ? {
        position: 'relative',
        clipPath: diamondClipPath,
        backgroundColor: hasViolations ? '#D0021B' : strokeColor,
        width: '100%',
        height: '100%',
        // Use small absolute minimums - typeDefinition.size is the default, not the minimum
        minWidth: 20,
        minHeight: 20,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        opacity: nodeOpacity,
        transition: 'opacity 0.3s ease',
        boxSizing: 'border-box',
      }
    : {};

  // Diamond inner fill styles (light color background inset from border)
  const diamondInnerStyle: React.CSSProperties = isDiamond
    ? {
        position: 'absolute',
        top: diamondBorderWidth,
        left: diamondBorderWidth,
        right: diamondBorderWidth,
        bottom: diamondBorderWidth,
        clipPath: diamondClipPath,
        backgroundColor: hexToLightColor(fillColor),
        color: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: theme.fontSizes[0],
        fontWeight: theme.fontWeights.medium,
        fontFamily: theme.fonts.body,
        gap: '4px',
      }
    : {};

  // Handle styles - larger and more visible in edit mode, hidden otherwise
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
        opacity: 0,
        pointerEvents: 'none' as const,
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
      <Handle
        type="target"
        position={Position.Bottom}
        id="bottom"
        style={getHandleStyle('bottom')}
      />
      <Handle type="target" position={Position.Left} id="left" style={getHandleStyle('left')} />
      <Handle type="target" position={Position.Right} id="right" style={getHandleStyle('right')} />

      {/* Hexagon and Diamond need a wrapper for proper border rendering */}
      {isHexagon ? (
        <div
          ref={nodeRef}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            boxShadow: isHighlighted
              ? `0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)`
              : selected
              ? `0 0 0 2px ${strokeColor}`
              : 'none',
            transition: 'box-shadow 0.2s ease',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {renderStatusBadge()}
          {renderSourcesBadge()}
          <div style={hexagonBorderStyle} className={animationClass}>
            <div style={hexagonInnerStyle}>
              {icon && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {resolveIcon(icon, 20)}
                </div>
              )}
              {renderNameWithEvent()}
              {state && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
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
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    color: '#D0021B',
                    fontWeight: theme.fontWeights.bold,
                  }}
                >
                  ⚠️
                </div>
              )}
            </div>
          </div>
          {tooltipsEnabled && (
            <NodeTooltip
              description={description}
              otel={otelInfo}
              sources={sources}
              visible={showTooltip}
              nodeRef={nodeRef}
            />
          )}
        </div>
      ) : isDiamond ? (
        <div
          ref={nodeRef}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            boxShadow: isHighlighted
              ? `0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)`
              : selected
              ? `0 0 0 2px ${strokeColor}`
              : 'none',
            transition: 'box-shadow 0.2s ease',
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {renderStatusBadge()}
          {renderSourcesBadge()}
          <div style={diamondBorderStyle} className={animationClass}>
            <div style={diamondInnerStyle}>
              {icon && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {resolveIcon(icon, 20)}
                </div>
              )}
              {renderNameWithEvent()}
              {state && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
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
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    color: '#D0021B',
                    fontWeight: theme.fontWeights.bold,
                  }}
                >
                  ⚠️
                </div>
              )}
            </div>
          </div>
          {tooltipsEnabled && (
            <NodeTooltip
              description={description}
              otel={otelInfo}
              sources={sources}
              visible={showTooltip}
              nodeRef={nodeRef}
            />
          )}
        </div>
      ) : (
        <div
          ref={nodeRef}
          style={{ position: 'relative', width: '100%', height: '100%' }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {renderStatusBadge()}
          {renderSourcesBadge()}
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
                  {renderNameWithEvent(false)}
                </div>
              ) : (
                <>
                  {icon && (
                    <div
                      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    >
                      {resolveIcon(icon, 20)}
                    </div>
                  )}
                  {renderNameWithEvent()}
                </>
              )}
              {state && (
                <div
                  style={{
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
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
                    fontSize: theme.fontSizes[0],
                    fontFamily: theme.fonts.body,
                    color: '#D0021B',
                    fontWeight: theme.fontWeights.bold,
                  }}
                >
                  ⚠️
                </div>
              )}
            </div>
          </div>
          {tooltipsEnabled && (
            <NodeTooltip
              description={description}
              otel={otelInfo}
              sources={sources}
              visible={showTooltip}
              nodeRef={nodeRef}
            />
          )}
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
