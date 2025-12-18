import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  type Edge,
  type NodeChange,
  type Node,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  GraphConfiguration,
  NodeState,
  EdgeState,
  Violation,
  GraphEvent,
  ExtendedCanvas,
  ComponentLibrary,
} from '@principal-ai/principal-view-core';
import { CanvasConverter } from '@principal-ai/principal-view-core';
import { useTheme } from '@principal-ade/industry-theme';
import { CustomNode } from '../nodes/CustomNode';
import type { CustomNodeData } from '../nodes/CustomNode';
import { CustomEdge } from '../edges/CustomEdge';
import type { CustomEdgeData } from '../edges/CustomEdge';
import {
  convertToXYFlowNodes,
  convertToXYFlowEdges,
  autoLayoutNodes,
  hasCycleBetweenNodes,
  computeOptimalEdgeSides,
} from '../utils/graphConverter';
import { EdgeInfoPanel } from './EdgeInfoPanel';
import { NodeInfoPanel } from './NodeInfoPanel';

/** Position change event for tracking node movements */
export interface NodePositionChange {
  nodeId: string;
  position: { x: number; y: number };
}

/** All pending changes that can be saved */
export interface PendingChanges {
  /** Node position changes */
  positionChanges: NodePositionChange[];
  /** Node updates (type, data changes) */
  nodeUpdates: Array<{
    nodeId: string;
    updates: { type?: string; data?: Record<string, unknown> };
  }>;
  /** Deleted node IDs */
  deletedNodeIds: string[];
  /** New edges created (with optional handle info for connection points) */
  createdEdges: Array<{
    from: string;
    to: string;
    type: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
  /** Deleted edges (with full connection info for config removal) */
  deletedEdges: Array<{ from: string; to: string; type: string }>;
  /** Whether there are any changes */
  hasChanges: boolean;
}

/** Ref handle for imperative actions */
export interface GraphRendererHandle {
  /** Get all pending changes */
  getPendingChanges: () => PendingChanges;
  /** Reset edit state to match current props */
  resetEditState: () => void;
  /** Check if there are unsaved changes */
  hasUnsavedChanges: () => boolean;
}

/** Base props shared by all render modes */
interface GraphRendererBaseProps {
  /** Optional violations to highlight */
  violations?: Violation[];

  /**
   * Whether to automatically update edge sides (fromSide/toSide) when nodes are moved.
   * Only updates edges where there is no cycle between the connected nodes.
   * Uses position-based logic to determine optimal connection sides.
   */
  autoUpdateEdgeSides?: boolean;

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

  /**
   * Whether edit mode is enabled.
   * When true, nodes can be dragged, edited, deleted, and edges can be created/deleted.
   * All changes are tracked internally and can be retrieved via ref.getPendingChanges()
   */
  editable?: boolean;

  /**
   * Callback when pending changes state changes.
   * Called with true when there are unsaved changes, false when there are none.
   * Use this to enable/disable save buttons in the parent component.
   */
  onPendingChangesChange?: (hasChanges: boolean) => void;
}

/** GraphRenderer props - canvas format only */
export interface GraphRendererProps extends GraphRendererBaseProps {
  /** Extended Canvas document */
  canvas: ExtendedCanvas;

  /**
   * Optional component library containing reusable node and edge type definitions.
   * Types from the library are merged with canvas-level types, with canvas types taking precedence.
   * This allows sharing type definitions across multiple canvas files via a library.yaml file.
   */
  library?: ComponentLibrary;
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
  nodeAnimations: Record<
    string,
    { type: 'pulse' | 'flash' | 'shake' | 'entry'; duration: number; timestamp: number }
  >;
  edgeAnimations: Record<
    string,
    {
      type: 'flow' | 'particle' | 'pulse' | 'glow';
      duration: number;
      direction?: 'forward' | 'backward' | 'bidirectional';
      timestamp: number;
    }
  >;
}

// Internal edit state tracking
interface EditState {
  positionChanges: Map<string, { x: number; y: number }>;
  nodeUpdates: Map<string, { type?: string; data?: Record<string, unknown> }>;
  deletedNodeIds: Set<string>;
  createdEdges: Array<{
    id: string;
    from: string;
    to: string;
    type: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
  deletedEdges: Array<{ id: string; from: string; to: string; type: string }>;
}

const createEmptyEditState = (): EditState => ({
  positionChanges: new Map(),
  nodeUpdates: new Map(),
  deletedNodeIds: new Set(),
  createdEdges: [],
  deletedEdges: [],
});

/** Inner component receives normalized legacy format */
interface GraphRendererInnerProps {
  configuration: GraphConfiguration;
  nodes: NodeState[];
  edges: EdgeState[];
  violations?: Violation[];
  configName?: string;
  showMinimap?: boolean;
  showControls?: boolean;
  showBackground?: boolean;
  events?: GraphEvent[];
  onEventProcessed?: (event: GraphEvent) => void;
  editable?: boolean;
  autoUpdateEdgeSides?: boolean;
  onPendingChangesChange?: (hasChanges: boolean) => void;
  onEditStateChange?: (editState: EditState) => void;
  editStateRef: React.MutableRefObject<EditState>;
}

/**
 * Inner component that uses ReactFlow hooks
 */
const GraphRendererInner: React.FC<GraphRendererInnerProps> = ({
  configuration,
  nodes: propNodes,
  edges: propEdges,
  violations = [],
  configName: _configName,
  showMinimap = true,
  showControls = true,
  showBackground = true,
  events = [],
  onEventProcessed,
  editable = false,
  autoUpdateEdgeSides = false,
  onPendingChangesChange,
  onEditStateChange,
  editStateRef,
}) => {
  const { fitView } = useReactFlow();
  const { theme } = useTheme();

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

  // ============================================
  // INTERNAL EDIT STATE
  // ============================================

  // Local copies of nodes and edges for editing
  const [localNodes, setLocalNodes] = useState<NodeState[]>(propNodes);
  const [localEdges, setLocalEdges] = useState<EdgeState[]>(propEdges);

  // Track the prop values to detect external changes
  const propNodesKeyRef = useRef(
    propNodes
      .map((n) => n.id)
      .sort()
      .join(',')
  );
  const propEdgesKeyRef = useRef(
    propEdges
      .map((e) => e.id)
      .sort()
      .join(',')
  );

  // Sync local state with props when props change (e.g., config reload)
  // This only happens when the structure changes, not during editing
  useEffect(() => {
    const newNodesKey = propNodes
      .map((n) => n.id)
      .sort()
      .join(',');
    const newEdgesKey = propEdges
      .map((e) => e.id)
      .sort()
      .join(',');

    if (newNodesKey !== propNodesKeyRef.current || newEdgesKey !== propEdgesKeyRef.current) {
      propNodesKeyRef.current = newNodesKey;
      propEdgesKeyRef.current = newEdgesKey;
      setLocalNodes(propNodes);
      setLocalEdges(propEdges);
      // Reset edit state when props change
      editStateRef.current = createEmptyEditState();
      onEditStateChange?.(editStateRef.current);
      onPendingChangesChange?.(false);
    }
  }, [propNodes, propEdges, editStateRef, onEditStateChange, onPendingChangesChange]);

  // Always use localNodes for rendering - it syncs with props when structure changes
  // and receives state_changed event updates. localEdges only used in edit mode.
  const nodes = localNodes;
  const edges = editable ? localEdges : propEdges;

  // Helper to check if there are pending changes
  const checkHasChanges = useCallback((state: EditState): boolean => {
    return (
      state.positionChanges.size > 0 ||
      state.nodeUpdates.size > 0 ||
      state.deletedNodeIds.size > 0 ||
      state.createdEdges.length > 0 ||
      state.deletedEdges.length > 0
    );
  }, []);

  // Helper to update edit state and notify parent
  const updateEditState = useCallback(
    (updater: (prev: EditState) => EditState) => {
      const newState = updater(editStateRef.current);
      editStateRef.current = newState;
      onEditStateChange?.(newState);
      onPendingChangesChange?.(checkHasChanges(newState));
    },
    [editStateRef, onEditStateChange, onPendingChangesChange, checkHasChanges]
  );

  // ============================================
  // EVENT HANDLERS
  // ============================================

  // Handle edge click
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  // Handle node click
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  // Handle close edge info panel
  const onCloseEdgeInfoPanel = useCallback(() => {
    setSelectedEdgeId(null);
  }, []);

  // Handle edge side updates from EdgeInfoPanel
  const handleUpdateEdgeSides = useCallback(
    (edgeId: string, fromSide: string, toSide: string) => {
      setLocalEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  fromSide,
                  toSide,
                },
              }
            : edge
        )
      );
    },
    []
  );

  // Handle close node info panel
  const onCloseNodeInfoPanel = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Handle node update (internal - updates local state only)
  const handleNodeUpdate = useCallback(
    (nodeId: string, updates: { type?: string; data?: Record<string, unknown> }) => {
      if (!editable) return;

      // Update local nodes
      setLocalNodes((prev) =>
        prev.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              type: updates.type ?? node.type,
              data: updates.data ? { ...node.data, ...updates.data } : node.data,
            };
          }
          return node;
        })
      );

      // Track the change
      updateEditState((prev) => {
        const newUpdates = new Map(prev.nodeUpdates);
        const existing = newUpdates.get(nodeId) || {};
        newUpdates.set(nodeId, {
          type: updates.type ?? existing.type,
          data: updates.data ? { ...existing.data, ...updates.data } : existing.data,
        });
        return { ...prev, nodeUpdates: newUpdates };
      });
    },
    [editable, updateEditState]
  );

  // Handle node delete (internal)
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      if (!editable) return;

      // Remove from local state
      setLocalNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setLocalEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));

      // Track the change
      updateEditState((prev) => {
        const newDeletedNodes = new Set(prev.deletedNodeIds);
        newDeletedNodes.add(nodeId);
        // Remove any pending updates for this node
        const newUpdates = new Map(prev.nodeUpdates);
        newUpdates.delete(nodeId);
        // Remove any position changes for this node
        const newPositions = new Map(prev.positionChanges);
        newPositions.delete(nodeId);
        // Remove created edges that involve this node
        const newCreatedEdges = prev.createdEdges.filter(
          (e) => e.from !== nodeId && e.to !== nodeId
        );
        return {
          ...prev,
          deletedNodeIds: newDeletedNodes,
          nodeUpdates: newUpdates,
          positionChanges: newPositions,
          createdEdges: newCreatedEdges,
        };
      });

      setSelectedNodeId(null);
    },
    [editable, updateEditState]
  );

  // Handle edge delete (internal)
  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      if (!editable) return;

      // Find the edge before removing it so we can track its full info
      const edgeToDelete = localEdges.find((e) => e.id === edgeId);

      // Remove from local state
      setLocalEdges((prev) => prev.filter((e) => e.id !== edgeId));

      // Track the change
      updateEditState((prev) => {
        // Check if this was a newly created edge
        const createdEdgeIndex = prev.createdEdges.findIndex((e) => e.id === edgeId);
        if (createdEdgeIndex >= 0) {
          // Just remove it from created edges
          const newCreatedEdges = [...prev.createdEdges];
          newCreatedEdges.splice(createdEdgeIndex, 1);
          return { ...prev, createdEdges: newCreatedEdges };
        }
        // Otherwise mark as deleted with full edge info
        if (edgeToDelete) {
          const newDeletedEdges = [
            ...prev.deletedEdges,
            {
              id: edgeId,
              from: edgeToDelete.from,
              to: edgeToDelete.to,
              type: edgeToDelete.type,
            },
          ];
          return { ...prev, deletedEdges: newDeletedEdges };
        }
        return prev;
      });

      setSelectedEdgeId(null);
    },
    [editable, updateEditState, localEdges]
  );

  // Handle new connection from drag
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!editable || !connection.source || !connection.target) return;

      // Find source and target node types
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      // Find valid edge types for this connection
      const validTypes = configuration.allowedConnections
        .filter((ac) => ac.from === sourceNode.type && ac.to === targetNode.type)
        .map((ac) => ac.via);

      const uniqueTypes = [...new Set(validTypes)];

      if (uniqueTypes.length === 0) {
        console.warn(
          `No valid edge types for connection from ${sourceNode.type} to ${targetNode.type}`
        );
        return;
      }

      if (uniqueTypes.length === 1) {
        // Create edge immediately with handle information
        createEdge(
          connection.source,
          connection.target,
          uniqueTypes[0],
          connection.sourceHandle ?? undefined,
          connection.targetHandle ?? undefined
        );
      } else {
        // Show picker
        setPendingConnection({
          from: connection.source,
          to: connection.target,
          sourceHandle: connection.sourceHandle ?? undefined,
          targetHandle: connection.targetHandle ?? undefined,
          validTypes: uniqueTypes,
        });
      }
    },
    [editable, nodes, configuration.allowedConnections]
  );

  // Create edge helper
  const createEdge = useCallback(
    (from: string, to: string, type: string, sourceHandle?: string, targetHandle?: string) => {
      const edgeId = `${from}-${to}-${type}-${Date.now()}`;

      // Add to local state with handle information
      const newEdge: EdgeState & { sourceHandle?: string; targetHandle?: string } = {
        id: edgeId,
        type,
        from,
        to,
        data: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sourceHandle,
        targetHandle,
      };
      setLocalEdges((prev) => [...prev, newEdge]);

      // Track the change
      updateEditState((prev) => ({
        ...prev,
        createdEdges: [
          ...prev.createdEdges,
          { id: edgeId, from, to, type, sourceHandle, targetHandle },
        ],
      }));
    },
    [updateEditState]
  );

  // Handle edge type selection from picker
  const handleEdgeTypeSelect = useCallback(
    (type: string) => {
      if (!pendingConnection) return;
      createEdge(
        pendingConnection.from,
        pendingConnection.to,
        type,
        pendingConnection.sourceHandle,
        pendingConnection.targetHandle
      );
      setPendingConnection(null);
    },
    [pendingConnection, createEdge]
  );

  // Cancel edge type picker
  const handleCancelEdgeTypePicker = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // Track whether reconnection succeeded
  const edgeReconnectSuccessful = useRef(true);

  // Called when user starts dragging an edge endpoint
  const handleReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  // Handle edge reconnection (dragging edge endpoint to new node)
  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!editable || !newConnection.source || !newConnection.target) return;

      // Find the original edge in our local state
      const originalEdge = localEdges.find((e) => e.id === oldEdge.id);
      if (!originalEdge) return;

      // Find source and target node types for validation
      const sourceNode = nodes.find((n) => n.id === newConnection.source);
      const targetNode = nodes.find((n) => n.id === newConnection.target);
      if (!sourceNode || !targetNode) return;

      // Check if the new connection is valid for this edge type
      const isValidConnection = configuration.allowedConnections.some(
        (ac) =>
          ac.from === sourceNode.type && ac.to === targetNode.type && ac.via === originalEdge.type
      );

      if (!isValidConnection) {
        console.warn(
          `Cannot reconnect: ${originalEdge.type} edge not allowed from ${sourceNode.type} to ${targetNode.type}`
        );
        return;
      }

      // Mark as successful before updating
      edgeReconnectSuccessful.current = true;

      // Update local edges - manually update the edge to preserve its type and id
      setLocalEdges((prev) =>
        prev.map((edge) => {
          if (edge.id === oldEdge.id) {
            return {
              ...edge,
              from: newConnection.source!,
              to: newConnection.target!,
              sourceHandle: newConnection.sourceHandle ?? undefined,
              targetHandle: newConnection.targetHandle ?? undefined,
              updatedAt: Date.now(),
            };
          }
          return edge;
        })
      );

      // Track the change - remove old edge and add new one
      updateEditState((prev) => {
        // Check if this was a newly created edge
        const createdEdgeIndex = prev.createdEdges.findIndex((e) => e.id === oldEdge.id);

        if (createdEdgeIndex >= 0) {
          // Update the created edge entry
          const newCreatedEdges = [...prev.createdEdges];
          newCreatedEdges[createdEdgeIndex] = {
            ...newCreatedEdges[createdEdgeIndex],
            from: newConnection.source!,
            to: newConnection.target!,
            sourceHandle: newConnection.sourceHandle ?? undefined,
            targetHandle: newConnection.targetHandle ?? undefined,
          };
          return { ...prev, createdEdges: newCreatedEdges };
        }

        // For existing edges, track as delete + create
        const newDeletedEdges = [
          ...prev.deletedEdges,
          {
            id: oldEdge.id,
            from: originalEdge.from,
            to: originalEdge.to,
            type: originalEdge.type,
          },
        ];

        const newCreatedEdges = [
          ...prev.createdEdges,
          {
            id: oldEdge.id,
            from: newConnection.source!,
            to: newConnection.target!,
            type: originalEdge.type,
            sourceHandle: newConnection.sourceHandle ?? undefined,
            targetHandle: newConnection.targetHandle ?? undefined,
          },
        ];

        return { ...prev, deletedEdges: newDeletedEdges, createdEdges: newCreatedEdges };
      });
    },
    [editable, localEdges, nodes, configuration.allowedConnections, updateEditState]
  );

  // Called when reconnection ends (whether successful or not)
  const handleReconnectEnd = useCallback(() => {
    // If reconnection wasn't successful, the edge was dropped in empty space
    // We need to keep the original edge (do nothing, it's still in localEdges)
    // Edge is still in localEdges, no action needed - ReactFlow will re-render with it
    edgeReconnectSuccessful.current = true;
  }, []);

  // ============================================
  // SELECTED ITEMS
  // ============================================

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return edges.find((e) => e.id === selectedEdgeId);
  }, [selectedEdgeId, edges]);

  const selectedEdgeTypeDefinition = useMemo(() => {
    if (!selectedEdge) return null;
    return configuration.edgeTypes[selectedEdge.type];
  }, [selectedEdge, configuration.edgeTypes]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId);
  }, [selectedNodeId, nodes]);

  const selectedNodeTypeDefinition = useMemo(() => {
    if (!selectedNode) return null;
    return configuration.nodeTypes[selectedNode.type];
  }, [selectedNode, configuration.nodeTypes]);

  // ============================================
  // ANIMATIONS
  // ============================================

  useEffect(() => {
    if (events.length === 0) return;

    const latestEvent = events[events.length - 1];

    if (latestEvent.operation === 'animate' && latestEvent.category === 'edge') {
      const edgeEvent = latestEvent.payload as any;
      const edgeId = edgeEvent.edgeId;
      const animation = edgeEvent.animation;

      if (animation && edgeId) {
        setAnimationState((prev) => ({
          ...prev,
          edgeAnimations: {
            ...prev.edgeAnimations,
            [edgeId]: {
              type: 'flow',
              duration: animation.duration || 1000,
              direction: animation.direction || 'forward',
              timestamp: Date.now(),
            },
          },
        }));

        const duration = animation.duration || 1000;
        setTimeout(() => {
          setAnimationState((prev) => {
            const newEdgeAnimations = { ...prev.edgeAnimations };
            delete newEdgeAnimations[edgeId];
            return { ...prev, edgeAnimations: newEdgeAnimations };
          });
        }, duration);

        onEventProcessed?.(latestEvent);
      }
    }

    if (latestEvent.category === 'state') {
      const stateEvent = latestEvent.payload as any;
      const nodeId = stateEvent.nodeId;
      const newState = stateEvent.newState;

      if (nodeId && newState) {
        // Update the node's state
        setLocalNodes((prev) =>
          prev.map((node) => (node.id === nodeId ? { ...node, state: newState } : node))
        );

        // Trigger animation based on state
        const stateToAnimation: Record<string, 'pulse' | 'flash' | 'shake'> = {
          processing: 'pulse',
          completed: 'flash',
          error: 'shake',
        };

        const animationType = stateToAnimation[newState];
        if (animationType) {
          const duration =
            animationType === 'pulse' ? 1500 : animationType === 'flash' ? 1000 : 500;

          setAnimationState((prev) => ({
            ...prev,
            nodeAnimations: {
              ...prev.nodeAnimations,
              [nodeId]: { type: animationType, duration, timestamp: Date.now() },
            },
          }));

          if (animationType !== 'pulse') {
            setTimeout(() => {
              setAnimationState((prev) => {
                const newNodeAnimations = { ...prev.nodeAnimations };
                delete newNodeAnimations[nodeId];
                return { ...prev, nodeAnimations: newNodeAnimations };
              });
            }, duration);
          }
        }

        onEventProcessed?.(latestEvent);
      }
    }

    if (latestEvent.category === 'node' && latestEvent.operation === 'create') {
      const nodeEvent = latestEvent.payload as any;
      const nodeId = nodeEvent.nodeId;

      if (nodeId) {
        setAnimationState((prev) => ({
          ...prev,
          nodeAnimations: {
            ...prev.nodeAnimations,
            [nodeId]: { type: 'entry', duration: 600, timestamp: Date.now() },
          },
        }));

        setTimeout(() => {
          setAnimationState((prev) => {
            const newNodeAnimations = { ...prev.nodeAnimations };
            delete newNodeAnimations[nodeId];
            return { ...prev, nodeAnimations: newNodeAnimations };
          });
        }, 600);

        onEventProcessed?.(latestEvent);
      }
    }
  }, [events, onEventProcessed]);

  // ============================================
  // XYFLOW CONVERSION
  // ============================================

  const xyflowNodesBase = useMemo(() => {
    const converted = convertToXYFlowNodes(nodes, configuration, violations);
    const layoutType = configuration.display?.layout || 'hierarchical';
    const positioned = autoLayoutNodes(converted, [], layoutType);

    return positioned.map((node) => {
      const animation = animationState.nodeAnimations[node.id];
      // Apply any pending position changes
      const pendingPosition = editStateRef.current.positionChanges.get(node.id);
      return {
        ...node,
        ...(pendingPosition ? { position: pendingPosition } : {}),
        data: {
          ...node.data,
          editable,
          ...(animation
            ? {
                animationType: animation.type,
                animationDuration: animation.duration,
              }
            : {}),
        } as CustomNodeData,
      };
    });
  }, [nodes, configuration, violations, animationState.nodeAnimations, editable, editStateRef]);

  const baseNodesKey = useMemo(() => {
    return nodes
      .map((n) => n.id)
      .sort()
      .join(',');
  }, [nodes]);

  // Local xyflow nodes state for dragging
  const [xyflowLocalNodes, setXyflowLocalNodes] = useState(xyflowNodesBase);

  // Sync when base changes
  const prevBaseNodesKeyRef = useRef(baseNodesKey);
  useEffect(() => {
    if (prevBaseNodesKeyRef.current !== baseNodesKey) {
      prevBaseNodesKeyRef.current = baseNodesKey;
      setXyflowLocalNodes(xyflowNodesBase);
    }
  }, [baseNodesKey, xyflowNodesBase]);

  // Also sync when entering edit mode or when base nodes change content
  const prevEditableRef = useRef(editable);
  useEffect(() => {
    if (editable && !prevEditableRef.current) {
      // Entering edit mode - sync positions
      setXyflowLocalNodes(xyflowNodesBase);
    }
    prevEditableRef.current = editable;
  }, [editable, xyflowNodesBase]);

  const xyflowNodes = editable ? xyflowLocalNodes : xyflowNodesBase;

  // Handle node changes (drag events)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!editable) return;

      setXyflowLocalNodes((nds) => applyNodeChanges(changes, nds) as Node<CustomNodeData>[]);

      // Track position changes on drag end
      const positionChanges = changes.filter(
        (
          change
        ): change is NodeChange & {
          type: 'position';
          position: { x: number; y: number };
          dragging: boolean;
        } =>
          change.type === 'position' &&
          'position' in change &&
          change.position !== undefined &&
          'dragging' in change &&
          change.dragging === false
      );

      if (positionChanges.length > 0) {
        updateEditState((prev) => {
          const newPositions = new Map(prev.positionChanges);
          for (const change of positionChanges) {
            newPositions.set(change.id, {
              x: Math.round(change.position.x),
              y: Math.round(change.position.y),
            });
          }
          return { ...prev, positionChanges: newPositions };
        });

        // Auto-update edge sides if enabled
        if (autoUpdateEdgeSides) {
          setXyflowLocalNodes((currentNodes) => {
            // Build a position map from current xyflow nodes
            const nodePositions = new Map<string, { x: number; y: number }>();
            for (const node of currentNodes) {
              nodePositions.set(node.id, node.position);
            }

            // Get moved node IDs
            const movedNodeIds = new Set(positionChanges.map((c) => c.id));

            // Update edges connected to moved nodes
            setLocalEdges((currentEdges) => {
              return currentEdges.map((edge) => {
                // Only process edges connected to moved nodes
                if (!movedNodeIds.has(edge.from) && !movedNodeIds.has(edge.to)) {
                  return edge;
                }

                // Check for cycles - skip if there's a cycle between these nodes
                const edgesWithoutCurrent = currentEdges.filter((e) => e.id !== edge.id);
                if (hasCycleBetweenNodes(edge.from, edge.to, edgesWithoutCurrent)) {
                  return edge; // Don't auto-update edges that are part of a cycle
                }

                // Get positions of both nodes
                const fromPos = nodePositions.get(edge.from);
                const toPos = nodePositions.get(edge.to);
                if (!fromPos || !toPos) {
                  return edge;
                }

                // Compute optimal sides
                const { fromSide, toSide } = computeOptimalEdgeSides(fromPos, toPos);

                // Update edge data with new sides
                return {
                  ...edge,
                  data: {
                    ...edge.data,
                    fromSide,
                    toSide,
                  },
                  updatedAt: Date.now(),
                };
              });
            });

            return currentNodes;
          });
        }
      }
    },
    [editable, autoUpdateEdgeSides, updateEditState]
  );

  const xyflowEdges = useMemo(() => {
    const converted = convertToXYFlowEdges(edges, configuration, violations);

    return converted.map((edge) => {
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

  // Fit view on mount and structure changes
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

  // ============================================
  // RENDER
  // ============================================

  return (
    <>
      <ReactFlow
        key={baseNodesKey}
        nodes={xyflowNodes as any}
        edges={xyflowEdges as any}
        nodeTypes={nodeTypes as any}
        edgeTypes={edgeTypes as any}
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{ type: 'custom' }}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={editable}
        elementsSelectable={true}
        nodesConnectable={editable}
        edgesReconnectable={editable}
        reconnectRadius={100}
        elevateEdgesOnSelect={true}
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        onReconnectStart={handleReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={handleReconnectEnd}
        panOnDrag
        selectionOnDrag={false}
      >
        {showBackground && <Background color={theme.colors.border} gap={16} size={1} />}
        {showControls && <Controls showZoom showFitView showInteractive />}
        {showMinimap && (
          <MiniMap
            nodeColor={(node) => {
              const nodeData = node.data as CustomNodeData;
              return nodeData?.typeDefinition?.color || theme.colors.secondary;
            }}
            nodeBorderRadius={2}
            pannable
            zoomable
          />
        )}
      </ReactFlow>

      {selectedEdge && selectedEdgeTypeDefinition && (
        <EdgeInfoPanel
          edge={selectedEdge}
          typeDefinition={selectedEdgeTypeDefinition}
          sourceNodeId={selectedEdge.from}
          targetNodeId={selectedEdge.to}
          onClose={onCloseEdgeInfoPanel}
          onDelete={editable ? handleEdgeDelete : undefined}
          onUpdateSides={editable ? handleUpdateEdgeSides : undefined}
        />
      )}

      {selectedNode && selectedNodeTypeDefinition && (
        <NodeInfoPanel
          node={selectedNode}
          typeDefinition={selectedNodeTypeDefinition}
          availableNodeTypes={configuration.nodeTypes}
          onClose={onCloseNodeInfoPanel}
          onDelete={editable ? handleNodeDelete : undefined}
          onUpdate={editable ? handleNodeUpdate : undefined}
        />
      )}

      {pendingConnection && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.colors.background,
            color: theme.colors.text,
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '16px',
            minWidth: '200px',
            zIndex: 1000,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '12px', fontSize: '14px' }}>
            Select Edge Type
          </div>
          <div style={{ fontSize: '12px', color: theme.colors.textSecondary, marginBottom: '12px' }}>
            {pendingConnection.from} → {pendingConnection.to}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pendingConnection.validTypes.map((type) => {
              const typeDefinition = configuration.edgeTypes[type];
              return (
                <button
                  key={type}
                  onClick={() => handleEdgeTypeSelect(type)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: typeDefinition?.color || theme.colors.secondary,
                    color: theme.colors.background,
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
              backgroundColor: theme.colors.surface,
              color: theme.colors.textSecondary,
              border: `1px solid ${theme.colors.border}`,
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
 * Convert canvas to legacy configuration format for internal use
 */
function useCanvasToLegacy(
  canvas: ExtendedCanvas | undefined,
  library?: ComponentLibrary
): {
  configuration: GraphConfiguration;
  nodes: NodeState[];
  edges: EdgeState[];
} | null {
  return useMemo(() => {
    if (!canvas) return null;

    const { nodes, edges } = CanvasConverter.canvasToGraph(canvas);

    // Build GraphConfiguration from canvas
    const nodeTypes: GraphConfiguration['nodeTypes'] = {};
    const edgeTypes: GraphConfiguration['edgeTypes'] = {};

    // First, add node types from library (lowest priority - can be overridden by canvas)
    if (library?.nodeComponents) {
      for (const [id, component] of Object.entries(library.nodeComponents)) {
        nodeTypes[id] = {
          description: component.description,
          shape: component.shape || 'rectangle',
          icon: component.icon,
          color: component.color,
          size: component.size,
          dataSchema: component.dataSchema || {},
          states: component.states,
          layout: component.layout,
        };
      }
    }

    // Then, add edge types from library
    if (library?.edgeComponents) {
      for (const [id, component] of Object.entries(library.edgeComponents)) {
        edgeTypes[id] = {
          style: component.style || 'solid',
          color: component.color,
          width: component.width,
          directed: component.directed,
          animation: component.animation,
        };
      }
    }

    // Next, add node types from canvas vv.nodeTypes (overrides library)
    if (canvas.pv?.nodeTypes) {
      for (const [id, def] of Object.entries(canvas.pv.nodeTypes)) {
        nodeTypes[id] = {
          description: def.description,
          shape: def.shape || 'rectangle',
          icon: def.icon,
          color: def.color,
          dataSchema: {},
        };
      }
    }

    // Then extract node types from canvas nodes (for nodes that define their own types)
    for (const node of canvas.nodes || []) {
      const vv = node.pv;
      const nodeType = vv?.nodeType || node.type;

      if (!nodeTypes[nodeType]) {
        // Color priority: vv.fill > node.color > vv.states.idle.color
        const fillColor =
          vv?.fill ||
          (typeof node.color === 'string' ? node.color : undefined) ||
          vv?.states?.idle?.color;

        // Derive description from text content (everything after line 1) for text nodes
        let nodeDescription = `${nodeType} node`;
        if (node.type === 'text' && 'text' in node) {
          const lines = node.text.split('\n');
          const descFromText = lines.slice(1).join('\n').trim();
          if (descFromText) {
            nodeDescription = descFromText;
          }
        }

        nodeTypes[nodeType] = {
          description: nodeDescription,
          shape: vv?.shape || 'rectangle',
          icon: vv?.icon,
          color: fillColor,
          stroke: vv?.stroke,
          size: { width: node.width, height: node.height },
          dataSchema: vv?.dataSchema || {},
          states: vv?.states,
          layout: vv?.layout,
        };
      }
    }

    // Extract edge types from canvas vv.edgeTypes
    if (canvas.pv?.edgeTypes) {
      for (const [id, def] of Object.entries(canvas.pv.edgeTypes)) {
        edgeTypes[id] = {
          style: def.style || 'solid',
          color: def.color,
          width: def.width,
          directed: def.directed,
          animation: def.animation,
          label: def.labelConfig,
        };
      }
    }

    // Build allowed connections from edges
    const allowedConnections: GraphConfiguration['allowedConnections'] = [];
    for (const edge of canvas.edges || []) {
      const edgeType = edge.pv?.edgeType || 'default';

      // Ensure edge type exists
      if (!edgeTypes[edgeType]) {
        edgeTypes[edgeType] = {
          style: edge.pv?.style || 'solid',
          color: typeof edge.color === 'string' ? edge.color : undefined,
          width: edge.pv?.width,
          directed: true,
        };
      }

      // Find node types for from/to
      const fromNode = canvas.nodes?.find((n) => n.id === edge.fromNode);
      const toNode = canvas.nodes?.find((n) => n.id === edge.toNode);
      const fromType = fromNode?.pv?.nodeType || edge.fromNode;
      const toType = toNode?.pv?.nodeType || edge.toNode;

      allowedConnections.push({
        from: fromType,
        to: toType,
        via: edgeType,
      });
    }

    // Build display config with required layout field
    const display: GraphConfiguration['display'] = canvas.pv?.display
      ? {
          layout: canvas.pv.display.layout || 'manual',
          theme: canvas.pv.display.theme,
          animations: canvas.pv.display.animations,
        }
      : { layout: 'manual' };

    const configuration: GraphConfiguration = {
      metadata: {
        name: canvas.pv?.name || 'Untitled',
        version: canvas.pv?.version || '1.0.0',
        description: canvas.pv?.description,
      },
      nodeTypes,
      edgeTypes,
      allowedConnections,
      display,
    };

    return { configuration, nodes, edges };
  }, [canvas, library]);
}

/**
 * Core graph visualization component using xyflow.
 *
 * Accepts an ExtendedCanvas document for rendering.
 *
 * When `editable` is true, the component manages its own edit state internally.
 * Use the ref to get pending changes when the user wants to save:
 *
 * ```tsx
 * <GraphRenderer canvas={myCanvas} />
 *
 * // With edit mode
 * const graphRef = useRef<GraphRendererHandle>(null);
 * <GraphRenderer
 *   ref={graphRef}
 *   canvas={myCanvas}
 *   editable={isEditMode}
 *   onPendingChangesChange={setHasUnsavedChanges}
 * />
 * ```
 */
export const GraphRenderer = forwardRef<GraphRendererHandle, GraphRendererProps>((props, ref) => {
  const { canvas, library, className, width = '100%', height = '100%' } = props;
  const { theme } = useTheme();

  // Convert canvas to internal format (merging library types if provided)
  const canvasData = useCanvasToLegacy(canvas, library);

  // Internal edit state ref - must be before any conditional returns
  const editStateRef = useRef<EditState>(createEmptyEditState());

  // Expose imperative handle - must be before any conditional returns
  useImperativeHandle(
    ref,
    () => ({
      getPendingChanges: (): PendingChanges => {
        const state = editStateRef.current;
        return {
          positionChanges: Array.from(state.positionChanges.entries()).map(
            ([nodeId, position]) => ({
              nodeId,
              position,
            })
          ),
          nodeUpdates: Array.from(state.nodeUpdates.entries()).map(([nodeId, updates]) => ({
            nodeId,
            updates,
          })),
          deletedNodeIds: Array.from(state.deletedNodeIds),
          createdEdges: state.createdEdges.map((e) => ({
            from: e.from,
            to: e.to,
            type: e.type,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
          deletedEdges: state.deletedEdges.map((e) => ({ from: e.from, to: e.to, type: e.type })),
          hasChanges:
            state.positionChanges.size > 0 ||
            state.nodeUpdates.size > 0 ||
            state.deletedNodeIds.size > 0 ||
            state.createdEdges.length > 0 ||
            state.deletedEdges.length > 0,
        };
      },
      resetEditState: () => {
        editStateRef.current = createEmptyEditState();
      },
      hasUnsavedChanges: (): boolean => {
        const state = editStateRef.current;
        return (
          state.positionChanges.size > 0 ||
          state.nodeUpdates.size > 0 ||
          state.deletedNodeIds.size > 0 ||
          state.createdEdges.length > 0 ||
          state.deletedEdges.length > 0
        );
      },
    }),
    []
  );

  // Validate we have required data
  if (!canvasData) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
          color: theme.colors.textSecondary,
        }}
      >
        <p>No canvas data provided.</p>
      </div>
    );
  }

  const { configuration, nodes, edges } = canvasData;

  // Extract only the props that inner component needs
  const {
    violations,
    configName,
    showMinimap,
    showControls,
    showBackground,
    events,
    onEventProcessed,
    editable,
    autoUpdateEdgeSides,
    onPendingChangesChange,
  } = props;

  return (
    <div className={className} style={{ width, height, position: 'relative' }}>
      <ReactFlowProvider>
        <GraphRendererInner
          configuration={configuration}
          nodes={nodes}
          edges={edges}
          violations={violations}
          configName={configName}
          showMinimap={showMinimap}
          showControls={showControls}
          showBackground={showBackground}
          events={events}
          onEventProcessed={onEventProcessed}
          editable={editable}
          autoUpdateEdgeSides={autoUpdateEdgeSides}
          onPendingChangesChange={onPendingChangesChange}
          editStateRef={editStateRef}
        />
      </ReactFlowProvider>
    </div>
  );
});

GraphRenderer.displayName = 'GraphRenderer';
