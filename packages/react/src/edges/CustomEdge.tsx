import React, { useState, useEffect, useRef } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import type { EdgeProps } from '@xyflow/react';
import type { EdgeTypeDefinition } from '@principal-ai/visual-validation-core';

export interface CustomEdgeData extends Record<string, unknown> {
  typeDefinition: EdgeTypeDefinition;
  hasViolations?: boolean;
  data?: Record<string, unknown>;
  // Animation control
  animationType?: 'flow' | 'particle' | 'pulse' | 'glow' | null;
  animationDuration?: number;
  animationDirection?: 'forward' | 'backward' | 'bidirectional';
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
  const {
    typeDefinition,
    hasViolations,
    data: edgeData,
    animationType,
    animationDuration = 1000,
    animationDirection = 'forward'
  } = edgeProps || ({} as CustomEdgeData);

  const [particlePosition, setParticlePosition] = useState(0);
  const pathRef = useRef<SVGPathElement>(null);

  if (!typeDefinition) {
    return null;
  }

  const color = hasViolations ? '#D0021B' : (typeDefinition.color || '#888');
  const width = typeDefinition.width || 2;

  // Particle animation effect
  useEffect(() => {
    if (animationType !== 'particle') return;

    const animate = () => {
      setParticlePosition((prev) => {
        const next = prev + (100 / animationDuration) * 16; // ~60fps
        return next >= 100 ? 0 : next;
      });
    };

    const intervalId = setInterval(animate, 16);
    return () => clearInterval(intervalId);
  }, [animationType, animationDuration]);

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

  // Animation-specific rendering helpers
  const getAnimationClass = () => {
    if (!animationType) {
      return typeDefinition.style === 'animated' ? 'edge-flow-forward' : '';
    }

    switch (animationType) {
      case 'flow':
        return animationDirection === 'backward'
          ? 'edge-flow-backward'
          : animationDirection === 'bidirectional'
          ? 'edge-flow-bidirectional'
          : 'edge-flow-forward';
      case 'pulse':
        return 'edge-pulse';
      case 'glow':
        return 'edge-glow';
      default:
        return '';
    }
  };

  const getAnimationDurationStyle = () => {
    if (!animationType) return {};
    return {
      animationDuration: `${animationDuration}ms`,
    };
  };

  // Calculate particle position along path using SVG path methods
  const getParticleTransform = () => {
    if (!pathRef.current) {
      // Fallback to linear interpolation if path ref not available yet
      const progress = animationDirection === 'backward' ? 1 - particlePosition / 100 : particlePosition / 100;
      const x = sourceX + (targetX - sourceX) * progress;
      const y = sourceY + (targetY - sourceY) * progress;
      return { x, y };
    }

    // Use actual path to get point along the curve
    const pathLength = pathRef.current.getTotalLength();
    const progress = animationDirection === 'backward' ? 1 - particlePosition / 100 : particlePosition / 100;
    const distance = pathLength * progress;
    const point = pathRef.current.getPointAtLength(distance);

    return { x: point.x, y: point.y };
  };

  const particlePos = animationType === 'particle' ? getParticleTransform() : null;

  return (
    <>
      {/* Hidden path for particle position calculation */}
      <path
        ref={pathRef}
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={0}
        style={{ pointerEvents: 'none' }}
      />

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd as string}
        style={{
          stroke: color,
          strokeWidth: selected ? width + 1 : width,
          strokeDasharray: getStrokeStyle(),
          opacity: animationType ? 0.7 : 1,
        }}
      />

      {/* Flow Animation - Animated dashed overlay */}
      {animationType === 'flow' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width}
          strokeDasharray="10 5"
          className={getAnimationClass()}
          style={{
            ...getAnimationDurationStyle(),
            opacity: 0.8,
          }}
        />
      )}

      {/* Pulse Animation - Wave effect */}
      {animationType === 'pulse' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width + 2}
          className={getAnimationClass()}
          style={{
            ...getAnimationDurationStyle(),
          }}
        />
      )}

      {/* Glow Animation - Brief highlight */}
      {animationType === 'glow' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width + 4}
          className={getAnimationClass()}
          style={{
            ...getAnimationDurationStyle(),
            filter: 'blur(3px)',
          }}
        />
      )}

      {/* Particle Animation - Traveling dot */}
      {animationType === 'particle' && particlePos && (
        <circle
          cx={particlePos.x}
          cy={particlePos.y}
          r={width * 1.5}
          fill={typeDefinition.animation?.color || color}
          style={{
            filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.3))',
          }}
        />
      )}

      {/* Fallback: Legacy animated style support */}
      {!animationType && typeDefinition.style === 'animated' && (
        <path
          d={edgePath}
          fill="none"
          stroke={typeDefinition.animation?.color || color}
          strokeWidth={width}
          strokeDasharray="5 5"
          className="edge-flow-forward"
          style={{
            animationDuration: '500ms',
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

      {/* CSS animations for all edge animation types */}
      <style>{`
        /* Flow animation - forward direction */
        .edge-flow-forward {
          animation: flow-forward linear infinite;
        }

        @keyframes flow-forward {
          to {
            stroke-dashoffset: -15;
          }
        }

        /* Flow animation - backward direction */
        .edge-flow-backward {
          animation: flow-backward linear infinite;
        }

        @keyframes flow-backward {
          to {
            stroke-dashoffset: 15;
          }
        }

        /* Flow animation - bidirectional (alternating) */
        .edge-flow-bidirectional {
          animation: flow-bidirectional linear infinite alternate;
        }

        @keyframes flow-bidirectional {
          0% {
            stroke-dashoffset: -15;
          }
          100% {
            stroke-dashoffset: 15;
          }
        }

        /* Pulse animation - wave effect */
        .edge-pulse {
          animation: pulse ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 0.3;
            stroke-width: inherit;
          }
          50% {
            opacity: 1;
            stroke-width: calc(inherit + 2);
          }
        }

        /* Glow animation - brief highlight */
        .edge-glow {
          animation: glow ease-out forwards;
        }

        @keyframes glow {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
};
