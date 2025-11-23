import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphConfiguration, NodeState, EdgeState, Violation, GraphEvent } from '@principal-ai/visual-validation-core';
import { CustomNode } from '../nodes/CustomNode';
import type { CustomNodeData } from '../nodes/CustomNode';
import { CustomEdge } from '../edges/CustomEdge';
import type { CustomEdgeData } from '../edges/CustomEdge';
import { convertToXYFlowNodes, convertToXYFlowEdges, autoLayoutNodes } from '../utils/graphConverter';
import { EdgeInfoPanel } from './EdgeInfoPanel';

export interface GraphRendererProps {
  /** Configuration for the graph */
  configuration: GraphConfiguration;

  /** Current nodes in the graph */
  nodes: NodeState[];

  /** Current edges in the graph */
  edges: EdgeState[];

  /** Optional violations to highlight */
  violations?: Violation[];

  /** Optional class name */
  className?: string;

  /** Optional width */
  width?: number | string;

  /** Optional height */
  height?: number | string;

  /** Whether to show minimap */
  showMinimap?: boolean;

  /** Whether to show controls */
  showControls?: boolean;

  /** Whether to show background */
  showBackground?: boolean;

  /** Optional event stream for triggering animations */
  events?: GraphEvent[];

  /** Optional callback when an event is processed */
  onEventProcessed?: (event: GraphEvent) => void;
}

// Define custom node types
const nodeTypes = {
  custom: CustomNode,
};

// Define custom edge types
const edgeTypes = {
  custom: CustomEdge,
};

// Animation state for nodes and edges
interface AnimationState {
  nodeAnimations: Record<string, { type: 'pulse' | 'flash' | 'shake' | 'entry'; duration: number; timestamp: number }>;
  edgeAnimations: Record<string, { type: 'flow' | 'particle' | 'pulse' | 'glow'; duration: number; direction?: 'forward' | 'backward' | 'bidirectional'; timestamp: number }>;
}

/**
 * Core graph visualization component using xyflow
 */
export const GraphRenderer: React.FC<GraphRendererProps> = ({
  configuration,
  nodes,
  edges,
  violations = [],
  className,
  width = '100%',
  height = '100%',
  showMinimap = true,
  showControls = true,
  showBackground = true,
  events = [],
  onEventProcessed,
}) => {
  // Track active animations
  const [animationState, setAnimationState] = useState<AnimationState>({
    nodeAnimations: {},
    edgeAnimations: {},
  });

  // Track selected edge for info panel
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Handle edge click
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  // Handle close info panel
  const onCloseInfoPanel = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  // Get selected edge data
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return edges.find(e => e.id === selectedEdgeId);
  }, [selectedEdgeId, edges]);

  const selectedEdgeTypeDefinition = useMemo(() => {
    if (!selectedEdge) return null;
    return configuration.edgeTypes[selectedEdge.type];
  }, [selectedEdge, configuration.edgeTypes]);

  // Process events and trigger animations
  useEffect(() => {
    if (events.length === 0) return;

    const latestEvent = events[events.length - 1];

    // Process animation events
    if (latestEvent.operation === 'animate' && latestEvent.category === 'edge') {
      const edgeEvent = latestEvent.payload as any;
      const edgeId = edgeEvent.edgeId;
      const animation = edgeEvent.animation;

      if (animation && edgeId) {
        setAnimationState(prev => ({
          ...prev,
          edgeAnimations: {
            ...prev.edgeAnimations,
            [edgeId]: {
              type: 'flow', // Default to flow, can be customized
              duration: animation.duration || 1000,
              direction: animation.direction || 'forward',
              timestamp: Date.now(),
            },
          },
        }));

        // Clear animation after duration
        const duration = animation.duration || 1000;
        setTimeout(() => {
          setAnimationState(prev => {
            const newEdgeAnimations = { ...prev.edgeAnimations };
            delete newEdgeAnimations[edgeId];
            return { ...prev, edgeAnimations: newEdgeAnimations };
          });
        }, duration);

        onEventProcessed?.(latestEvent);
      }
    }

    // Process state change events for node animations
    if (latestEvent.category === 'state') {
      const stateEvent = latestEvent.payload as any;
      const nodeId = stateEvent.nodeId;
      const newState = stateEvent.newState;

      if (nodeId && newState) {
        // Map states to animations
        const stateToAnimation: Record<string, 'pulse' | 'flash' | 'shake'> = {
          processing: 'pulse',
          completed: 'flash',
          error: 'shake',
        };

        const animationType = stateToAnimation[newState];
        if (animationType) {
          const duration = animationType === 'pulse' ? 1500 : animationType === 'flash' ? 1000 : 500;

          setAnimationState(prev => ({
            ...prev,
            nodeAnimations: {
              ...prev.nodeAnimations,
              [nodeId]: {
                type: animationType,
                duration,
                timestamp: Date.now(),
              },
            },
          }));

          // Clear non-continuous animations
          if (animationType !== 'pulse') {
            setTimeout(() => {
              setAnimationState(prev => {
                const newNodeAnimations = { ...prev.nodeAnimations };
                delete newNodeAnimations[nodeId];
                return { ...prev, nodeAnimations: newNodeAnimations };
              });
            }, duration);
          }

          onEventProcessed?.(latestEvent);
        }
      }
    }

    // Process node create events for entry animation
    if (latestEvent.category === 'node' && latestEvent.operation === 'create') {
      const nodeEvent = latestEvent.payload as any;
      const nodeId = nodeEvent.nodeId;

      if (nodeId) {
        setAnimationState(prev => ({
          ...prev,
          nodeAnimations: {
            ...prev.nodeAnimations,
            [nodeId]: {
              type: 'entry',
              duration: 600,
              timestamp: Date.now(),
            },
          },
        }));

        setTimeout(() => {
          setAnimationState(prev => {
            const newNodeAnimations = { ...prev.nodeAnimations };
            delete newNodeAnimations[nodeId];
            return { ...prev, nodeAnimations: newNodeAnimations };
          });
        }, 600);

        onEventProcessed?.(latestEvent);
      }
    }
  }, [events, onEventProcessed]);

  // Convert our data format to xyflow format with animations
  const xyflowNodes = useMemo(() => {
    const converted = convertToXYFlowNodes(nodes, configuration, violations);
    const layoutType = configuration.display?.layout || 'hierarchical';
    const positioned = autoLayoutNodes(converted, [], layoutType);

    // Inject animation state into node data
    return positioned.map(node => {
      const animation = animationState.nodeAnimations[node.id];
      if (animation) {
        return {
          ...node,
          data: {
            ...node.data,
            animationType: animation.type,
            animationDuration: animation.duration,
          } as CustomNodeData,
        };
      }
      return node;
    });
  }, [nodes, configuration, violations, animationState.nodeAnimations]);

  const xyflowEdges = useMemo(() => {
    const converted = convertToXYFlowEdges(edges, configuration, violations);

    // Inject animation state into edge data
    return converted.map(edge => {
      const animation = animationState.edgeAnimations[edge.id];
      if (animation) {
        return {
          ...edge,
          data: {
            ...edge.data,
            animationType: animation.type,
            animationDuration: animation.duration,
            animationDirection: animation.direction,
          } as CustomEdgeData,
        };
      }
      return edge;
    });
  }, [edges, configuration, violations, animationState.edgeAnimations]);

  return (
    <div className={className} style={{ width, height, position: 'relative' }}>
      <ReactFlow
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes={xyflowNodes as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edges={xyflowEdges as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeTypes={nodeTypes as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edgeTypes={edgeTypes as any}
        fitView
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{
          type: 'custom',
        }}
        onEdgeClick={onEdgeClick}
        proOptions={{ hideAttribution: true }}
      >
        {showBackground && (
          <Background
            color="#e5e5e5"
            gap={16}
            size={1}
          />
        )}

        {showControls && (
          <Controls
            showZoom
            showFitView
            showInteractive
          />
        )}

        {showMinimap && (
          <MiniMap
            nodeColor={(node) => {
              const nodeData = node.data as CustomNodeData;
              return nodeData?.typeDefinition?.color || '#888';
            }}
            nodeBorderRadius={2}
            pannable
            zoomable
          />
        )}

        {/* Info Panel */}
        <Panel position="top-left" style={{
          backgroundColor: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          fontSize: '12px',
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            {configuration.metadata.name}
          </div>
          <div style={{ color: '#666' }}>
            {nodes.length} nodes • {edges.length} edges
            {violations.length > 0 && (
              <span style={{ color: '#D0021B', marginLeft: '8px' }}>
                • {violations.length} violations
              </span>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {/* Edge Info Panel */}
      {selectedEdge && selectedEdgeTypeDefinition && (
        <EdgeInfoPanel
          edge={selectedEdge}
          typeDefinition={selectedEdgeTypeDefinition}
          sourceNodeId={selectedEdge.from}
          targetNodeId={selectedEdge.to}
          onClose={onCloseInfoPanel}
        />
      )}
    </div>
  );
};
