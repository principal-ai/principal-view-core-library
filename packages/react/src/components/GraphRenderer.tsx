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
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  useViewport,
  applyNodeChanges,
  applyEdgeChanges,
  type Edge,
  type EdgeChange,
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
  NodeEvent,
  EdgeEvent,
  StateEvent,
  ExtendedCanvas,
  ComponentLibrary,
  JsonValue,
} from '@principal-ai/principal-view-core/browser';
import { CanvasConverter } from '@principal-ai/principal-view-core/browser';
import { useTheme } from '@principal-ade/industry-theme';
import { CustomNode } from '../nodes/CustomNode';
import type { CustomNodeData } from '../nodes/CustomNode';
import { CustomEdge } from '../edges/CustomEdge';
import type { CustomEdgeData } from '../edges/CustomEdge';
import {
  convertToXYFlowNodes,
  convertToXYFlowEdges,
} from '../utils/graphConverter';
import { EdgeInfoPanel } from './EdgeInfoPanel';
import { NodeInfoPanel } from './NodeInfoPanel';
import { SelectionSidebar } from './SelectionSidebar';

/** Position change event for tracking node movements */
export interface NodePositionChange {
  nodeId: string;
  position: { x: number; y: number };
}

/** Dimension change event for tracking node resizing */
export interface NodeDimensionChange {
  nodeId: string;
  dimensions: { width: number; height: number };
}

/** All pending changes that can be saved */
export interface PendingChanges {
  /** Node position changes */
  positionChanges: NodePositionChange[];
  /** Node dimension changes (from resizing) */
  dimensionChanges: NodeDimensionChange[];
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
   * Duration of the fitView animation in milliseconds.
   * Set to 0 for instant positioning (no animation).
   * Defaults to 200.
   */
  fitViewDuration?: number;

  /**
   * Whether to show tooltips on hover for nodes and edges.
   * Defaults to true.
   */
  showTooltips?: boolean;

  /**
   * Optional node ID to highlight (e.g., when playing back execution events).
   * Highlighted nodes will have a special visual treatment.
   */
  highlightedNodeId?: string | null;

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

  /**
   * Background variant style.
   * - 'dots': Small dots pattern (default)
   * - 'lines': Grid lines
   * - 'cross': Cross pattern
   */
  backgroundVariant?: 'dots' | 'lines' | 'cross';

  /**
   * Gap between background pattern elements in pixels.
   * Defaults to 16 for dots, 50 for lines/cross.
   */
  backgroundGap?: number;

  /**
   * Whether to show a center indicator at the canvas origin (0,0).
   * Useful for visualizing where the center point is when items aren't centered.
   * Defaults to false.
   */
  showCenterIndicator?: boolean;

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

  /**
   * Callback when a source is clicked in the node info panel.
   * Receives the node ID and the source path that was clicked.
   */
  onSourceClick?: (nodeId: string, source: string) => void;

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
  custom: CustomNode as any,
};

// Define custom edge types
const edgeTypes = {
  custom: CustomEdge as any,
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
  dimensionChanges: Map<string, { width: number; height: number }>;
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
  dimensionChanges: new Map(),
  nodeUpdates: new Map(),
  deletedNodeIds: new Set(),
  createdEdges: [],
  deletedEdges: [],
});

/**
 * Center indicator component that shows a crosshair at the canvas origin (0,0).
 * Uses viewport transform to position correctly regardless of pan/zoom.
 */
const CenterIndicator: React.FC<{ color: string }> = ({ color }) => {
  const { x, y } = useViewport();

  // Size of the crosshair in screen pixels (stays constant regardless of zoom)
  const size = 20;
  const strokeWidth = 1.5;

  // The viewport transform places origin (0,0) at screen position (x, y)
  const screenX = x;
  const screenY = y;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {/* Vertical line */}
      <line
        x1={screenX}
        y1={screenY - size}
        x2={screenX}
        y2={screenY + size}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.7}
      />
      {/* Horizontal line */}
      <line
        x1={screenX - size}
        y1={screenY}
        x2={screenX + size}
        y2={screenY}
        stroke={color}
        strokeWidth={strokeWidth}
        opacity={0.7}
      />
      {/* Center dot */}
      <circle
        cx={screenX}
        cy={screenY}
        r={3}
        fill={color}
        opacity={0.7}
      />
    </svg>
  );
};

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
  backgroundVariant?: 'dots' | 'lines' | 'cross';
  backgroundGap?: number;
  showCenterIndicator?: boolean;
  showTooltips?: boolean;
  fitViewDuration?: number;
  highlightedNodeId?: string | null;
  events?: GraphEvent[];
  onEventProcessed?: (event: GraphEvent) => void;
  editable?: boolean;
  onPendingChangesChange?: (hasChanges: boolean) => void;
  onEditStateChange?: (editState: EditState) => void;
  editStateRef: React.MutableRefObject<EditState>;
  onSourceClick?: (nodeId: string, source: string) => void;
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
  showMinimap = false,
  showControls = true,
  showBackground = true,
  backgroundVariant = 'dots',
  backgroundGap,
  showCenterIndicator = false,
  showTooltips = true,
  fitViewDuration = 200,
  highlightedNodeId,
  events = [],
  onEventProcessed,
  editable = false,
  onPendingChangesChange,
  onEditStateChange,
  editStateRef,
  onSourceClick,
}) => {
  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { theme } = useTheme();

  // Track shift key state for tooltip control
  const [shiftKeyPressed, setShiftKeyPressed] = useState(false);

  // Setup keyboard event listeners for shift key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftKeyPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setShiftKeyPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Track active animations
  const [animationState, setAnimationState] = useState<AnimationState>({
    nodeAnimations: {},
    edgeAnimations: {},
  });

  // Track selected edges for info panel (supports multi-select)
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(new Set());

  // Track selected nodes for info panel (supports multi-select)
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  // Track whether panel should be shown (only on explicit clicks, not after dragging)
  const [showNodePanel, setShowNodePanel] = useState(false);
  const [showEdgePanel, setShowEdgePanel] = useState(false);

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
      // Debug: Log sync events
      if (process.env.NODE_ENV === 'development') {
        console.log('[GraphRenderer] Syncing local state with props:', {
          prevNodesKey: propNodesKeyRef.current,
          newNodesKey,
          prevEdgesKey: propEdgesKeyRef.current,
          newEdgesKey,
          propNodesCount: propNodes.length,
          propEdgesCount: propEdges.length,
        });
      }
      propNodesKeyRef.current = newNodesKey;
      propEdgesKeyRef.current = newEdgesKey;
      setLocalNodes(propNodes);
      setLocalEdges(propEdges);
      // Reset edit state when props change
      editStateRef.current = createEmptyEditState();
      onEditStateChange?.(editStateRef.current);
      onPendingChangesChange?.(false);
      // Clear animation state to prevent stale animations from affecting new edges
      setAnimationState({ nodeAnimations: {}, edgeAnimations: {} });
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
      state.dimensionChanges.size > 0 ||
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

  // Handle edge click (toggle selection, supports Shift for multi-select)
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (event.shiftKey && editable) {
        // Shift+click: toggle edge in selection
        setSelectedEdgeIds((prev) => {
          const next = new Set(prev);
          if (next.has(edge.id)) {
            next.delete(edge.id);
          } else {
            next.add(edge.id);
          }
          return next;
        });
        setShowEdgePanel(true);
      } else {
        // Regular click: single select (replace selection)
        const shouldDeselect = selectedEdgeIds.size === 1 && selectedEdgeIds.has(edge.id);
        if (shouldDeselect) {
          setSelectedEdgeIds(new Set());
          setShowEdgePanel(false);
        } else {
          setSelectedEdgeIds(new Set([edge.id]));
          setShowEdgePanel(true);
        }
        setSelectedNodeIds(new Set());
        setShowNodePanel(false);
      }
    },
    [editable, selectedEdgeIds]
  );

  // Handle node click (toggle selection, supports Shift for multi-select)
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.shiftKey && editable) {
        // Shift+click: toggle node in selection
        setSelectedNodeIds((prev) => {
          const next = new Set(prev);
          if (next.has(node.id)) {
            next.delete(node.id);
          } else {
            next.add(node.id);
          }
          return next;
        });
        setShowNodePanel(true);
      } else {
        // Regular click: single select (replace selection)
        const shouldDeselect = selectedNodeIds.size === 1 && selectedNodeIds.has(node.id);
        if (shouldDeselect) {
          setSelectedNodeIds(new Set());
          setShowNodePanel(false);
        } else {
          setSelectedNodeIds(new Set([node.id]));
          setShowNodePanel(true);
        }
        setSelectedEdgeIds(new Set());
        setShowEdgePanel(false);
      }
    },
    [editable, selectedNodeIds]
  );

  // Handle close edge info panel
  const onCloseEdgeInfoPanel = useCallback(() => {
    setSelectedEdgeIds(new Set());
    setShowEdgePanel(false);
  }, []);

  // Handle edge side updates from EdgeInfoPanel
  const handleUpdateEdgeSides = useCallback((edgeId: string, fromSide: string, toSide: string) => {
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
  }, []);

  // Handle close node info panel
  const onCloseNodeInfoPanel = useCallback(() => {
    setSelectedNodeIds(new Set());
    setShowNodePanel(false);
  }, []);

  // Handle pane click (clear selection when clicking empty space)
  const onPaneClick = useCallback(() => {
    setSelectedNodeIds(new Set());
    setSelectedEdgeIds(new Set());
    setShowNodePanel(false);
    setShowEdgePanel(false);
  }, []);

  // Handle selection change from ReactFlow (box selection)
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) => {
      if (editable) {
        setSelectedNodeIds(new Set(selectedNodes.map((n) => n.id)));
        setSelectedEdgeIds(new Set(selectedEdges.map((e) => e.id)));
        // Box selection is an explicit action, so show panels
        if (selectedNodes.length > 0) {
          setShowNodePanel(true);
        }
        if (selectedEdges.length > 0) {
          setShowEdgePanel(true);
        }
      }
    },
    [editable]
  );

  // Handle node update (internal - updates local state only)
  const handleNodeUpdate = useCallback(
    (nodeId: string, updates: { type?: string; data?: Record<string, JsonValue> }) => {
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
        // Remove any dimension changes for this node
        const newDimensions = new Map(prev.dimensionChanges);
        newDimensions.delete(nodeId);
        // Remove created edges that involve this node
        const newCreatedEdges = prev.createdEdges.filter(
          (e) => e.from !== nodeId && e.to !== nodeId
        );
        return {
          ...prev,
          deletedNodeIds: newDeletedNodes,
          nodeUpdates: newUpdates,
          positionChanges: newPositions,
          dimensionChanges: newDimensions,
          createdEdges: newCreatedEdges,
        };
      });

      setSelectedNodeIds(new Set());
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

      setSelectedEdgeIds(new Set());
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

  // Helper to convert handle ID back to side name
  const handleToSide = useCallback((handle: string | null | undefined, isSource: boolean): string | undefined => {
    if (!handle) return undefined;
    // Source handles are like "right-out", target handles are like "left"
    if (isSource) {
      return handle.replace('-out', '');
    }
    return handle;
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

      // Find source and target nodes for validation
      const sourceNode = nodes.find((n) => n.id === newConnection.source);
      const targetNode = nodes.find((n) => n.id === newConnection.target);
      if (!sourceNode || !targetNode) return;

      // Check if the new connection is valid for this edge type
      // Note: allowedConnections uses node IDs as the from/to values
      const isValidConnection = configuration.allowedConnections.some(
        (ac) =>
          ac.from === sourceNode.id && ac.to === targetNode.id && ac.via === originalEdge.type
      );

      if (!isValidConnection) {
        console.warn(
          `Cannot reconnect: ${originalEdge.type} edge not allowed from ${sourceNode.id} to ${targetNode.id}`
        );
        return;
      }

      // Mark as successful before updating
      edgeReconnectSuccessful.current = true;

      // Convert handles back to sides for edge data
      const newFromSide = handleToSide(newConnection.sourceHandle, true);
      const newToSide = handleToSide(newConnection.targetHandle, false);

      // Update local edges - manually update the edge to preserve its type and id
      setLocalEdges((prev) =>
        prev.map((edge) => {
          if (edge.id === oldEdge.id) {
            // Build data object, filtering out undefined values
            const updatedData = { ...edge.data };
            if (newFromSide !== undefined) updatedData.fromSide = newFromSide;
            if (newToSide !== undefined) updatedData.toSide = newToSide;

            return {
              ...edge,
              from: newConnection.source!,
              to: newConnection.target!,
              sourceHandle: newConnection.sourceHandle ?? undefined,
              targetHandle: newConnection.targetHandle ?? undefined,
              data: updatedData,
              updatedAt: Date.now(),
            };
          }
          return edge;
        })
      );

      // Also update the visual edge state directly to reflect the reconnection immediately
      setXyflowLocalEdges((prev) =>
        prev.map((edge) => {
          if (edge.id === oldEdge.id) {
            return {
              ...edge,
              source: newConnection.source!,
              target: newConnection.target!,
              sourceHandle: newConnection.sourceHandle ?? undefined,
              targetHandle: newConnection.targetHandle ?? undefined,
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
    [editable, localEdges, nodes, configuration.allowedConnections, updateEditState, handleToSide]
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

  // Get first selected edge (for single-selection info panel)
  const selectedEdgeId = useMemo(() => {
    if (selectedEdgeIds.size === 0) return null;
    return selectedEdgeIds.values().next().value;
  }, [selectedEdgeIds]);

  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId) return null;
    return edges.find((e) => e.id === selectedEdgeId);
  }, [selectedEdgeId, edges]);

  const selectedEdgeTypeDefinition = useMemo(() => {
    if (!selectedEdge) return null;
    return configuration.edgeTypes[selectedEdge.type];
  }, [selectedEdge, configuration.edgeTypes]);

  // Get first selected node (for single-selection info panel)
  const selectedNodeId = useMemo(() => {
    if (selectedNodeIds.size === 0) return null;
    return selectedNodeIds.values().next().value;
  }, [selectedNodeIds]);

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
      const edgeEvent = latestEvent.payload as EdgeEvent;
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
      const stateEvent = latestEvent.payload as StateEvent;
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
      const nodeEvent = latestEvent.payload as NodeEvent;
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
  // ============================================


  // ============================================
  // XYFLOW CONVERSION
  // ============================================

  const xyflowNodesBase = useMemo(() => {
    const converted = convertToXYFlowNodes(localNodes, configuration, violations);

    return converted.map((node) => {
      const animation = animationState.nodeAnimations[node.id];
      // Apply any pending position changes
      const pendingPosition = editStateRef.current.positionChanges.get(node.id);
      return {
        ...node,
        ...(pendingPosition ? { position: pendingPosition } : {}),
        data: {
          ...node.data,
          editable,
          tooltipsEnabled: showTooltips,
          shiftKeyPressed,
          isHighlighted: highlightedNodeId === node.id,
          ...(animation
            ? {
                animationType: animation.type,
                animationDuration: animation.duration,
              }
            : {}),
        } as CustomNodeData,
      };
    });
  }, [localNodes, configuration, violations, animationState.nodeAnimations, editable, showTooltips, highlightedNodeId, editStateRef, shiftKeyPressed]);

  const baseNodesKey = useMemo(() => {
    return nodes
      .map((n) => n.id)
      .sort()
      .join(',');
  }, [nodes]);

  const baseEdgesKey = useMemo(() => {
    return edges
      .map((e) => e.id)
      .sort()
      .join(',');
  }, [edges]);

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

      // Reset ReactFlow's internal state for all nodes to prevent NaN errors
      // This ensures ReactFlow remeasures nodes and updates drag tracking
      setTimeout(() => {
        xyflowNodesBase.forEach((node) => {
          updateNodeInternals(node.id);
        });
      }, 0);
    }
    prevEditableRef.current = editable;
  }, [editable, xyflowNodesBase, updateNodeInternals]);

  const xyflowNodes = editable ? xyflowLocalNodes : xyflowNodesBase;

  // Handle node changes (drag and resize events)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!editable) return;

      setXyflowLocalNodes((nds) => applyNodeChanges(changes, nds) as Node<CustomNodeData>[]);

      // Check if dragging started - hide panel when dragging starts
      const hasDragging = changes.some(
        (change) =>
          change.type === 'position' &&
          'dragging' in change &&
          change.dragging === true
      );

      if (hasDragging) {
        // Hide panel when dragging starts - it won't show again until an explicit click
        setShowNodePanel(false);
      }

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

      // Track dimension changes (from NodeResizer)
      const dimensionChanges = changes.filter(
        (
          change
        ): change is NodeChange & {
          type: 'dimensions';
          dimensions: { width: number; height: number };
          resizing: boolean;
        } =>
          change.type === 'dimensions' &&
          'dimensions' in change &&
          change.dimensions !== undefined &&
          'resizing' in change &&
          change.resizing === false
      );

      if (dimensionChanges.length > 0) {
        updateEditState((prev) => {
          const newDimensions = new Map(prev.dimensionChanges);
          for (const change of dimensionChanges) {
            if (change.dimensions) {
              newDimensions.set(change.id, {
                width: Math.round(change.dimensions.width),
                height: Math.round(change.dimensions.height),
              });
            }
          }
          return { ...prev, dimensionChanges: newDimensions };
        });
      }

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
      }
    },
    [editable, updateEditState]
  );

  const xyflowEdgesBase = useMemo(() => {
    const converted = convertToXYFlowEdges(edges, configuration, violations);

    // Debug: Log edge counts to help diagnose disappearing edges
    if (process.env.NODE_ENV === 'development') {
      console.log('[GraphRenderer] xyflowEdges computed:', {
        inputEdges: edges.length,
        convertedEdges: converted.length,
        editable,
        propEdgesCount: propEdges.length,
        localEdgesCount: localEdges.length,
      });
    }

    const mappedEdges = converted.map((edge) => {
      const animation = animationState.edgeAnimations[edge.id];
      const isSelected = selectedEdgeIds.has(edge.id);
      return {
        ...edge,
        data: {
          ...edge.data,
          tooltipsEnabled: showTooltips,
          shiftKeyPressed,
          ...(animation
            ? {
                animationType: animation.type,
                animationDuration: animation.duration,
                animationDirection: animation.direction,
              }
            : {}),
        } as CustomEdgeData,
        // Add z-index to help with stacking (selected edges get higher values)
        zIndex: isSelected ? 1000 : 0,
      };
    });

    // Sort edges so selected ones appear last (on top in SVG)
    return mappedEdges.sort((a, b) => {
      const aSelected = selectedEdgeIds.has(a.id);
      const bSelected = selectedEdgeIds.has(b.id);
      if (aSelected && !bSelected) return 1; // a comes after b (rendered on top)
      if (!aSelected && bSelected) return -1; // b comes after a (rendered on top)
      return 0; // maintain original order
    });
  }, [edges, configuration, violations, animationState.edgeAnimations, showTooltips, selectedEdgeIds, shiftKeyPressed]);

  // Local xyflow edges state for reconnection
  const [xyflowLocalEdges, setXyflowLocalEdges] = useState<Edge<CustomEdgeData>[]>(xyflowEdgesBase);

  // Sync when base edges change (structure changes like add/remove)
  const prevBaseEdgesKeyRef2 = useRef(baseEdgesKey);
  useEffect(() => {
    if (prevBaseEdgesKeyRef2.current !== baseEdgesKey) {
      prevBaseEdgesKeyRef2.current = baseEdgesKey;
      setXyflowLocalEdges(xyflowEdgesBase);
    }
  }, [baseEdgesKey, xyflowEdgesBase]);

  // Use local edges in edit mode, base edges otherwise
  const xyflowEdges = editable ? xyflowLocalEdges : xyflowEdgesBase;

  // Handle edge changes (selection, reconnection, etc.)
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!editable) return;

      setXyflowLocalEdges((eds) => applyEdgeChanges(changes, eds) as Edge<CustomEdgeData>[]);
    },
    [editable]
  );

  // Fit view on mount and structure changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fitView({
        padding: 0.2,
        includeHiddenNodes: false,
        minZoom: 0.1,
        maxZoom: 1.5,
        duration: fitViewDuration,
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [baseNodesKey, baseEdgesKey, fitView, fitViewDuration]);

  // ============================================
  // RENDER
  // ============================================

  return (
    <>
      <ReactFlow
        key={`${baseNodesKey}-${baseEdgesKey}`}
        nodes={xyflowNodes}
        edges={xyflowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
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
        reconnectRadius={25}
        elevateEdgesOnSelect={true}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onReconnectStart={handleReconnectStart}
        onReconnect={handleReconnect}
        onReconnectEnd={handleReconnectEnd}
        onPaneClick={onPaneClick}
        onSelectionChange={handleSelectionChange}
        panOnDrag={true}
        selectionOnDrag={false}
        selectionKeyCode={editable ? 'Shift' : null}
        multiSelectionKeyCode="Shift"
      >
        {showBackground && (
          <Background
            color={backgroundVariant === 'dots' ? theme.colors.border : theme.colors.textMuted}
            gap={backgroundGap ?? (backgroundVariant === 'dots' ? 16 : 50)}
            size={backgroundVariant === 'dots' ? 1 : 0.5}
            variant={
              backgroundVariant === 'dots'
                ? BackgroundVariant.Dots
                : backgroundVariant === 'lines'
                  ? BackgroundVariant.Lines
                  : BackgroundVariant.Cross
            }
          />
        )}
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
        {showCenterIndicator && <CenterIndicator color={theme.colors.textMuted} />}
      </ReactFlow>

      {/* Multi-selection sidebar - shown when 2+ nodes are selected via explicit click/box select */}
      {selectedNodeIds.size >= 2 && showNodePanel && (
        <SelectionSidebar
          selectedNodeIds={selectedNodeIds}
          nodes={nodes}
          nodeTypeDefinitions={configuration.nodeTypes}
          onClose={onCloseNodeInfoPanel}
        />
      )}

      {/* Single edge info panel - shown only on explicit click */}
      {selectedEdgeIds.size === 1 && selectedEdge && selectedEdgeTypeDefinition && showEdgePanel && (
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

      {/* Single node info panel - shown only on explicit click */}
      {selectedNodeIds.size === 1 && selectedNode && selectedNodeTypeDefinition && showNodePanel && (
        <NodeInfoPanel
          node={selectedNode}
          typeDefinition={selectedNodeTypeDefinition}
          availableNodeTypes={configuration.nodeTypes}
          onClose={onCloseNodeInfoPanel}
          onDelete={editable ? handleNodeDelete : undefined}
          onUpdate={editable ? handleNodeUpdate : undefined}
          onSourceClick={onSourceClick}
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
          <div
            style={{ fontSize: '12px', color: theme.colors.textSecondary, marginBottom: '12px' }}
          >
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

      // Store allowed connections using node IDs
      allowedConnections.push({
        from: edge.fromNode,
        to: edge.toNode,
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

  // Debug: Log canvas data to help diagnose disappearing edges
  if (process.env.NODE_ENV === 'development') {
    console.log('[GraphRenderer] Canvas data:', {
      hasCanvas: !!canvas,
      canvasEdgesCount: canvas?.edges?.length ?? 0,
      hasCanvasData: !!canvasData,
      convertedNodesCount: canvasData?.nodes.length ?? 0,
      convertedEdgesCount: canvasData?.edges.length ?? 0,
    });
  }

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
          dimensionChanges: Array.from(state.dimensionChanges.entries()).map(
            ([nodeId, dimensions]) => ({
              nodeId,
              dimensions,
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
            state.dimensionChanges.size > 0 ||
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
          state.dimensionChanges.size > 0 ||
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
    backgroundVariant,
    backgroundGap,
    showCenterIndicator,
    showTooltips,
    fitViewDuration,
    highlightedNodeId,
    events,
    onEventProcessed,
    editable,
    onPendingChangesChange,
    onSourceClick,
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
          backgroundVariant={backgroundVariant}
          backgroundGap={backgroundGap}
          showCenterIndicator={showCenterIndicator}
          showTooltips={showTooltips}
          fitViewDuration={fitViewDuration}
          highlightedNodeId={highlightedNodeId}
          events={events}
          onEventProcessed={onEventProcessed}
          editable={editable}
          onPendingChangesChange={onPendingChangesChange}
          editStateRef={editStateRef}
          onSourceClick={onSourceClick}
        />
      </ReactFlowProvider>
    </div>
  );
});

GraphRenderer.displayName = 'GraphRenderer';
