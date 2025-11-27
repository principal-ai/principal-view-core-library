import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type Node,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphConfiguration, NodeState, EdgeState, Violation, GraphEvent } from '@principal-ai/visual-validation-core';
import { CustomNode } from '../nodes/CustomNode';
import type { CustomNodeData } from '../nodes/CustomNode';
import { CustomEdge } from '../edges/CustomEdge';
import type { CustomEdgeData } from '../edges/CustomEdge';
import { convertToXYFlowNodes, convertToXYFlowEdges, autoLayoutNodes } from '../utils/graphConverter';
import { EdgeInfoPanel } from './EdgeInfoPanel';
import { NodeInfoPanel } from './NodeInfoPanel';

/** Position change event for tracking node movements */
export interface NodePositionChange {
  nodeId: string;
  position: { x: number; y: number };
}

export interface GraphRendererProps {
  /** Configuration for the graph */
  configuration: GraphConfiguration;

  /** Current nodes in the graph */
  nodes: NodeState[];

  /** Current edges in the graph */
  edges: EdgeState[];

  /** Optional violations to highlight */
  violations?: Violation[];

  /** Optional configuration name for identification (used with multi-config setups) */
  configName?: string;

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

  /** Whether nodes can be dragged (enables position editing) */
  draggable?: boolean;

  /** Callback when node positions change (only called when draggable=true) */
  onNodePositionsChange?: (changes: NodePositionChange[]) => void;

  /** Callback when an edge is deleted */
  onEdgeDelete?: (edgeId: string) => void;

  /** Callback when a new edge is created via drag connection */
  onEdgeCreate?: (edge: {
    from: string;
    to: string;
    type: string;
    sourceHandle?: string;
    targetHandle?: string;
  }) => void;

  /** Callback when a node is deleted */
  onNodeDelete?: (nodeId: string) => void;

  /** Callback when a node is updated (type or data changed) */
  onNodeUpdate?: (nodeId: string, updates: { type?: string; data?: Record<string, unknown> }) => void;
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
 * Inner component that uses ReactFlow hooks
 */
const GraphRendererInner: React.FC<Omit<GraphRendererProps, 'className' | 'width' | 'height'>> = ({
  configuration,
  nodes,
  edges,
  violations = [],
  configName: _configName,
  showMinimap = true,
  showControls = true,
  showBackground = true,
  events = [],
  onEventProcessed,
  draggable = false,
  onNodePositionsChange,
  onEdgeDelete,
  onEdgeCreate,
  onNodeDelete,
  onNodeUpdate,
}) => {
  const { fitView } = useReactFlow();
  // Track active animations
  const [animationState, setAnimationState] = useState<AnimationState>({
    nodeAnimations: {},
    edgeAnimations: {},
  });

  // Track selected edge for info panel
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Track selected node for info panel
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Track pending connection for edge type picker
  const [pendingConnection, setPendingConnection] = useState<{
    from: string;
    to: string;
    sourceHandle?: string;
    targetHandle?: string;
    validTypes: string[];
  } | null>(null);

  // Handle edge click
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null); // Close node panel when edge is selected
  }, []);

  // Handle node click
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null); // Close edge panel when node is selected
  }, []);

  // Handle close edge info panel
  const onCloseEdgeInfoPanel = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  // Handle close node info panel
  const onCloseNodeInfoPanel = useCallback(() => {
    setSelectedNodeId(null);
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

  // Get selected node data
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId);
  }, [selectedNodeId, nodes]);

  const selectedNodeTypeDefinition = useMemo(() => {
    if (!selectedNode) return null;
    return configuration.nodeTypes[selectedNode.type];
  }, [selectedNode, configuration.nodeTypes]);

  // Handle new connection from drag
  const handleConnect = useCallback((connection: Connection) => {
    if (!onEdgeCreate || !connection.source || !connection.target) return;

    // Find source and target node types
    const sourceNode = nodes.find(n => n.id === connection.source);
    const targetNode = nodes.find(n => n.id === connection.target);
    if (!sourceNode || !targetNode) return;

    // Find valid edge types for this connection based on allowedConnections
    const validTypes = configuration.allowedConnections
      .filter(ac => ac.from === sourceNode.type && ac.to === targetNode.type)
      .map(ac => ac.via);

    // Remove duplicates
    const uniqueTypes = [...new Set(validTypes)];

    if (uniqueTypes.length === 0) {
      // No valid connection types - connection not allowed
      console.warn(`No valid edge types for connection from ${sourceNode.type} to ${targetNode.type}`);
      return;
    }

    if (uniqueTypes.length === 1) {
      // Only one valid type - create edge immediately
      onEdgeCreate({
        from: connection.source,
        to: connection.target,
        type: uniqueTypes[0],
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      });
    } else {
      // Multiple valid types - show picker
      setPendingConnection({
        from: connection.source,
        to: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        validTypes: uniqueTypes,
      });
    }
  }, [onEdgeCreate, nodes, configuration.allowedConnections]);

  // Handle edge type selection from picker
  const handleEdgeTypeSelect = useCallback((type: string) => {
    if (!pendingConnection || !onEdgeCreate) return;
    onEdgeCreate({
      from: pendingConnection.from,
      to: pendingConnection.to,
      type,
      sourceHandle: pendingConnection.sourceHandle,
      targetHandle: pendingConnection.targetHandle,
    });
    setPendingConnection(null);
  }, [pendingConnection, onEdgeCreate]);

  // Cancel edge type picker
  const handleCancelEdgeTypePicker = useCallback(() => {
    setPendingConnection(null);
  }, []);

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

  // Determine if we're in edit mode (can create edges)
  const editable = Boolean(onEdgeCreate);

  // Convert our data format to xyflow format with animations
  const xyflowNodesBase = useMemo(() => {
    const converted = convertToXYFlowNodes(nodes, configuration, violations);
    const layoutType = configuration.display?.layout || 'hierarchical';
    const positioned = autoLayoutNodes(converted, [], layoutType);

    // Inject animation state and editable flag into node data
    return positioned.map(node => {
      const animation = animationState.nodeAnimations[node.id];
      return {
        ...node,
        data: {
          ...node.data,
          editable,
          ...(animation ? {
            animationType: animation.type,
            animationDuration: animation.duration,
          } : {}),
        } as CustomNodeData,
      };
    });
  }, [nodes, configuration, violations, animationState.nodeAnimations, editable]);

  // Stable key for base nodes - only changes when node IDs change
  const baseNodesKey = useMemo(() => {
    return nodes.map(n => n.id).sort().join(',');
  }, [nodes]);

  // Stable key for node content - changes when node data/type changes
  const nodesContentKey = useMemo(() => {
    return nodes.map(n => `${n.id}:${n.type}:${JSON.stringify(n.data)}`).sort().join('|');
  }, [nodes]);

  // Local state for node positions when dragging is enabled
  const [localNodes, setLocalNodes] = useState(xyflowNodesBase);

  // Track previous draggable state to detect when entering edit mode
  const prevDraggableRef = React.useRef(draggable);

  // Sync local nodes with base nodes when:
  // 1. Base node IDs change (config reload)
  // 2. Entering draggable mode (need fresh positions)
  // 3. Node data/type changes (need to update visuals while preserving positions)
  // When not in draggable mode, we use xyflowNodesBase directly (see line below)
  const prevBaseNodesKeyRef = React.useRef(baseNodesKey);
  const prevNodesContentKeyRef = React.useRef(nodesContentKey);
  useEffect(() => {
    const baseNodesChanged = prevBaseNodesKeyRef.current !== baseNodesKey;
    const enteringDraggable = draggable && !prevDraggableRef.current;
    const contentChanged = prevNodesContentKeyRef.current !== nodesContentKey;

    prevBaseNodesKeyRef.current = baseNodesKey;
    prevNodesContentKeyRef.current = nodesContentKey;
    prevDraggableRef.current = draggable;

    if (baseNodesChanged || enteringDraggable) {
      setLocalNodes(xyflowNodesBase);
    } else if (draggable && contentChanged) {
      // Update node data while preserving dragged positions
      setLocalNodes(prev => {
        return xyflowNodesBase.map(baseNode => {
          const localNode = prev.find(n => n.id === baseNode.id);
          if (localNode) {
            // Preserve local position but update data (type, name, etc.)
            return {
              ...baseNode,
              position: localNode.position,
              measured: localNode.measured,
            };
          }
          return baseNode;
        });
      });
    }
  }, [baseNodesKey, nodesContentKey, xyflowNodesBase, draggable]);

  // Use local nodes when draggable, base nodes otherwise
  const xyflowNodes = draggable ? localNodes : xyflowNodesBase;

  // Handle node changes (drag events, dimension updates, selection, etc.)
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (!draggable) return;

    // Use ReactFlow's helper to apply all changes properly
    setLocalNodes(nds => applyNodeChanges(changes, nds) as Node<CustomNodeData>[]);

    // Notify parent only on drag end
    if (onNodePositionsChange) {
      const positionChanges = changes
        .filter((change): change is NodeChange & {
          type: 'position';
          position: { x: number; y: number };
          dragging: boolean
        } =>
          change.type === 'position' &&
          'position' in change &&
          change.position !== undefined &&
          'dragging' in change &&
          change.dragging === false
        )
        .map(change => ({
          nodeId: change.id,
          position: {
            x: Math.round(change.position.x),
            y: Math.round(change.position.y),
          },
        }));

      if (positionChanges.length > 0) {
        onNodePositionsChange(positionChanges);
      }
    }
  }, [draggable, onNodePositionsChange]);

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

  // Call fitView after mount and when base node structure changes (not during dragging)
  // Use setTimeout to ensure the container has been sized and avoid loops
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fitView({
        padding: 0.2,
        includeHiddenNodes: false,
        minZoom: 0.1,
        maxZoom: 1.5,
        duration: 200,
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [baseNodesKey, fitView]);

  return (
    <>
      <ReactFlow
        // Key forces remount when node structure changes, avoiding internal store sync issues
        key={baseNodesKey}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes={xyflowNodes as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edges={xyflowEdges as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeTypes={nodeTypes as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edgeTypes={edgeTypes as any}
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{
          type: 'custom',
        }}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={draggable}
        elementsSelectable={draggable || editable}
        nodesConnectable={editable}
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        // Ensure panning doesn't interfere with node dragging
        panOnDrag={!draggable && !editable}
        selectionOnDrag={false}
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
          onClose={onCloseEdgeInfoPanel}
          onDelete={onEdgeDelete}
        />
      )}

      {/* Node Info Panel */}
      {selectedNode && selectedNodeTypeDefinition && (
        <NodeInfoPanel
          node={selectedNode}
          typeDefinition={selectedNodeTypeDefinition}
          availableNodeTypes={configuration.nodeTypes}
          onClose={onCloseNodeInfoPanel}
          onDelete={onNodeDelete}
          onUpdate={onNodeUpdate}
        />
      )}

      {/* Edge Type Picker */}
      {pendingConnection && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '16px',
            minWidth: '200px',
            zIndex: 1000,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '14px' }}>
            Select Edge Type
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
            {pendingConnection.from} → {pendingConnection.to}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingConnection.validTypes.map(type => {
              const typeDefinition = configuration.edgeTypes[type];
              return (
                <button
                  key={type}
                  onClick={() => handleEdgeTypeSelect(type)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: typeDefinition?.color || '#888',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textAlign: 'left',
                  }}
                >
                  {type}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleCancelEdgeTypePicker}
            style={{
              marginTop: '12px',
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#f0f0f0',
              color: '#666',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </>
  );
};

/**
 * Core graph visualization component using xyflow
 */
export const GraphRenderer: React.FC<GraphRendererProps> = (props) => {
  const { className, width = '100%', height = '100%', ...rest } = props;

  return (
    <div className={className} style={{ width, height, position: 'relative' }}>
      <ReactFlowProvider>
        <GraphRendererInner {...rest} />
      </ReactFlowProvider>
    </div>
  );
};
