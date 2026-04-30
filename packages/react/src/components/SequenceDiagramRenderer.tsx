/**
 * Sequence Diagram Renderer
 *
 * Renders events in swimlane-based sequence diagram layout.
 * Uses namespaces to determine swimlanes and event order for vertical positioning.
 */

import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  ReactFlowProvider,
  Panel,
  useViewport,
  useStore,
  Handle,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type NodeTypes,
  type EdgeTypes,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
// CSS import removed - consumers should import '@xyflow/react/dist/style.css' in their app
import {
  useSequenceLayout,
  type SequenceEvent,
  type SequenceEdge,
  type UseSequenceLayoutOptions,
  type Swimlane,
} from '../hooks/useSequenceLayout';

/**
 * Minimal marker node for arrow-centric sequence diagrams
 * Invisible - just used for positioning, selection is shown on edge labels
 * Can optionally show a label for better clickability
 */
function SequenceMarkerNode({ data, selected }: NodeProps) {
  const { theme } = useTheme();
  const showLabel = data.showEventLabels === true; // Only show if explicitly enabled
  const label = data.label as string | undefined;

  // If labels are shown on nodes, render them
  if (showLabel && label) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title={data.fullName as string}
      >
        <div
          style={{
            padding: '6px 12px',
            background: selected ? theme.colors.primary : theme.colors.background,
            color: selected ? theme.colors.background : theme.colors.text,
            border: `2px solid ${selected ? theme.colors.primary : theme.colors.border}`,
            borderRadius: 4,
            fontSize: theme.fontSizes[1],
            fontWeight: selected ? theme.fontWeights.bold : theme.fontWeights.medium,
            fontFamily: theme.fonts.body,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            userSelect: 'none',
            transition: 'all 0.2s ease',
            boxShadow: selected ? `0 2px 8px ${theme.colors.primary}40` : 'none',
          }}
        >
          {label}
        </div>
        <Handle
          type="target"
          position={Position.Top}
          style={{ visibility: 'hidden' }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ visibility: 'hidden' }}
        />
      </div>
    );
  }

  // Default: invisible node (selection shown on edge labels)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
      }}
      title={data.fullName as string}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ visibility: 'hidden' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ visibility: 'hidden' }}
      />
    </div>
  );
}

/**
 * Sequence arrow edge with label (dot to dot)
 */
function SequenceArrowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
}: EdgeProps) {
  const { theme } = useTheme();

  // Use a straight line for same-lane, bezier for cross-lane
  const isSameLane = !data?.crossesLanes;
  const isSourceSelected = data?.isSourceSelected === true;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: isSameLane ? 0.5 : 0.25,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: theme.colors.primary,
          strokeWidth: 2,
        }}
        markerEnd="url(#sequence-arrow)"
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: isSourceSelected ? theme.colors.primary : theme.colors.background,
              padding: isSourceSelected ? '4px 10px' : '2px 8px',
              borderRadius: 4,
              fontSize: theme.fontSizes[0],
              fontWeight: isSourceSelected ? theme.fontWeights.bold : theme.fontWeights.medium,
              fontFamily: theme.fonts.body,
              color: isSourceSelected ? theme.colors.background : theme.colors.text,
              border: `${isSourceSelected ? 2 : 1}px solid ${isSourceSelected ? theme.colors.primary : theme.colors.border}`,
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: isSourceSelected ? `0 2px 8px ${theme.colors.primary}60` : 'none',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/**
 * Participant-to-participant arrow edge (or activation bar for same-lane)
 * Draws from source participant lifeline to target participant lifeline
 */
function SequenceArrowParticipantEdge({
  id,
  sourceY,
  targetY,
  label,
  data,
}: EdgeProps) {
  const { theme } = useTheme();

  // Use participant X positions from data (swimlane centers)
  const sourceX = (data?.sourceParticipantX ?? 0) as number;
  const targetX = (data?.targetParticipantX ?? 0) as number;
  const safeSourceY = (sourceY ?? 0) as number;
  const safeTargetY = (targetY ?? 0) as number;

  // Check if this is same-lane (activation bar) or cross-lane (arrow)
  const isSameLane = sourceX === targetX;
  const isLastEvent = data?.isLastEvent === true;

  // Style based on whether it's a move event (IPC) or transform event (internal)
  const isMoveEvent = data?.isMoveEvent === true;
  const isSourceSelected = data?.isSourceSelected === true;
  const strokeColor = isMoveEvent ? (theme.colors.accent || '#f48771') : theme.colors.primary;

  // Same lane: render as activation bar
  if (isSameLane) {
    const barWidth = 12;
    const eventSpacing = (data?.eventSpacing ?? 80) as number;

    // For last event, use half the event spacing for bar height
    let barHeight: number;
    let barY: number;

    if (isLastEvent) {
      barHeight = eventSpacing / 2;
      barY = safeSourceY; // Start at the event position
    } else {
      // Normal case: bar from source to target
      const calculatedHeight = Math.abs(safeTargetY - safeSourceY);
      // Ensure minimum height if events are at same position
      barHeight = calculatedHeight > 0 ? calculatedHeight : eventSpacing / 2;
      barY = Math.min(safeSourceY, safeTargetY);
    }

    const barX = sourceX - barWidth / 2;

    return (
      <>
        {/* Activation bar */}
        <svg>
          <rect
            x={barX}
            y={barY}
            width={barWidth}
            height={barHeight}
            fill={strokeColor}
            stroke={strokeColor}
            strokeWidth={2}
            rx={2}
          />
        </svg>
        {label && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-100%, -50%) translate(${sourceX - 7}px,${barY + barHeight / 2}px)`,
                background: isSourceSelected ? strokeColor : theme.colors.background,
                padding: '2px 8px',
                borderTopLeftRadius: 4,
                borderTopRightRadius: 0,
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 0,
                fontSize: theme.fontSizes[0],
                fontWeight: isSourceSelected ? theme.fontWeights.bold : theme.fontWeights.medium,
                fontFamily: theme.fonts.body,
                color: isSourceSelected ? theme.colors.background : strokeColor,
                borderTop: `${isSourceSelected ? 2 : 1}px solid ${strokeColor}`,
                borderLeft: `${isSourceSelected ? 2 : 1}px solid ${strokeColor}`,
                borderBottom: `${isSourceSelected ? 2 : 1}px solid ${strokeColor}`,
                borderRight: `1px solid ${strokeColor}`,
                pointerEvents: 'all',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isSourceSelected ? `0 2px 8px ${strokeColor}60` : 'none',
              }}
              className="nodrag nopan"
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  }

  // Cross-lane: render as horizontal arrow at midpoint
  const strokeWidth = isMoveEvent ? 2.5 : 2;
  const markerEnd = isMoveEvent ? 'url(#sequence-arrow-move)' : 'url(#sequence-arrow)';

  // Draw horizontal arrow at the midpoint between source and target Y positions
  const arrowY = (safeSourceY + safeTargetY) / 2;
  // Inset arrow endpoints so they stop just before the lifelines instead of crossing them
  const lifelineInset = 6;
  const direction = targetX > sourceX ? 1 : -1;
  const startX = sourceX + direction * lifelineInset;
  const endX = targetX - direction * lifelineInset;
  const path = `M ${startX} ${arrowY} L ${endX} ${arrowY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = arrowY;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        }}
        markerEnd={markerEnd}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 12}px)`,
              background: isSourceSelected ? strokeColor : theme.colors.background,
              padding: isMoveEvent ? '3px 10px' : '2px 8px',
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              fontSize: theme.fontSizes[0],
              fontWeight: isSourceSelected ? theme.fontWeights.bold : (isMoveEvent ? theme.fontWeights.bold : theme.fontWeights.medium),
              fontFamily: theme.fonts.body,
              color: isSourceSelected ? theme.colors.background : strokeColor,
              borderTop: `${isSourceSelected ? 3 : (isMoveEvent ? 2 : 1)}px solid ${strokeColor}`,
              borderLeft: `${isSourceSelected ? 3 : (isMoveEvent ? 2 : 1)}px solid ${strokeColor}`,
              borderRight: `${isSourceSelected ? 3 : (isMoveEvent ? 2 : 1)}px solid ${strokeColor}`,
              borderBottom: `${isMoveEvent ? 2 : 1}px solid ${strokeColor}`,
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: isSourceSelected ? `0 4px 12px ${strokeColor}60` : 'none',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/**
 * Default node types including sequence marker
 */
const defaultSequenceNodeTypes: NodeTypes = {
  sequenceMarker: SequenceMarkerNode,
};

/**
 * Default edge types including sequence arrow and participant arrow
 */
const defaultSequenceEdgeTypes: EdgeTypes = {
  sequenceArrow: SequenceArrowEdge,
  sequenceArrowParticipant: SequenceArrowParticipantEdge,
};

/**
 * Props for the swimlane layer
 */
interface SwimlaneLayerProps {
  swimlanes: Swimlane[];
  laneWidth: number;
  headerHeight: number;
  totalHeight: number;
  onToggleCollapse?: (namespace: string) => void;
  stickyHeaders?: boolean;
  /** When true, render lane and header backgrounds as transparent. */
  transparent?: boolean;
}

/**
 * Swimlane layer that renders behind nodes and transforms with viewport
 */
function SwimlaneLayer({
  swimlanes,
  laneWidth,
  headerHeight,
  totalHeight,
  transparent = false,
}: SwimlaneLayerProps) {
  const { x, y, zoom } = useViewport();
  const viewportHeight = useStore((s) => s.height);
  const { theme } = useTheme();

  // Extend lanes to cover the viewport bottom even when content is short.
  // In flow-coord space, the visible viewport is `viewportHeight / zoom` tall.
  const extendedHeight = Math.max(totalHeight + 20, viewportHeight / zoom + 100);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transformOrigin: '0 0',
        transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      {/* Lane backgrounds */}
      {swimlanes.map((lane, index) => {
        const isEven = index % 2 === 0;
        const laneBackground = transparent
          ? 'transparent'
          : isEven
            ? theme.colors.muted
            : theme.colors.background;
        return (
          <div
            key={`bg-${lane.namespace}`}
            style={{
              position: 'absolute',
              left: lane.x - laneWidth / 2,
              top: 0,
              width: laneWidth,
              height: extendedHeight,
              backgroundColor: laneBackground,
              borderRight: `1px solid ${theme.colors.border}`,
            }}
          />
        );
      })}

      {/* Vertical lifelines */}
      {swimlanes.map((lane) => (
        <div
          key={`lifeline-${lane.namespace}`}
          style={{
            position: 'absolute',
            left: lane.x,
            top: headerHeight,
            width: 2,
            height: extendedHeight - headerHeight,
            backgroundColor: 'rgba(255, 255, 255, 0.4)',
            transform: 'translateX(-1px)',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Swimlane headers layer that renders on top of nodes for clickability
 */
function SwimlaneHeadersLayer({
  swimlanes,
  laneWidth,
  headerHeight,
  onToggleCollapse,
  stickyHeaders = true,
  transparent = false,
}: SwimlaneLayerProps) {
  const { x, y, zoom } = useViewport();
  const { theme } = useTheme();

  // When sticky headers are enabled, compensate for vertical viewport panning
  // to keep headers at the top of the screen
  const headerTop = stickyHeaders ? -y / zoom : 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transformOrigin: '0 0',
        transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      {/* Lane headers */}
      {swimlanes.map((lane) => {
        const hasChildren = lane.children.length > 0;
        return (
          <div
            key={`header-${lane.namespace}`}
            style={{
              position: 'absolute',
              left: lane.x - laneWidth / 2,
              top: headerTop,
              width: laneWidth,
              height: headerHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 8px',
              boxSizing: 'border-box',
              backgroundColor: transparent ? 'transparent' : theme.colors.muted,
              borderBottom: `2px solid ${theme.colors.border}`,
              fontWeight: theme.fontWeights.semibold,
              fontSize: theme.fontSizes[2],
              fontFamily: theme.fonts.heading,
              color: theme.colors.text,
              pointerEvents: 'auto',
              cursor: hasChildren ? 'pointer' : 'default',
              userSelect: 'none',
            }}
            onClick={() => hasChildren && onToggleCollapse?.(lane.namespace)}
          >
            {hasChildren && (
              <span style={{ marginRight: 6, fontSize: 10 }}>
                {lane.isCollapsed ? '▼' : '▶'}
              </span>
            )}
            <span
              style={{
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                lineHeight: 1.2,
                textAlign: 'center',
              }}
              title={lane.label}
            >
              {lane.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Props for SequenceDiagramRenderer
 */
export interface SequenceDiagramRendererProps {
  /** Events to display in the diagram */
  events: SequenceEvent[];

  /** Edges connecting events */
  edges: SequenceEdge[];

  /** Layout options */
  layoutOptions?: UseSequenceLayoutOptions;

  /** Optional custom node types */
  nodeTypes?: NodeTypes;

  /** Optional custom edge types */
  edgeTypes?: EdgeTypes;

  /** Callback when a namespace collapse state is toggled */
  onToggleCollapse?: (namespace: string) => void;

  /** Callback when a node is clicked */
  onNodeClick?: (nodeId: string, event: React.MouseEvent) => void;

  /** ID of the currently selected node (for visual highlighting) */
  selectedNodeId?: string;

  /** Optional class name */
  className?: string;

  /** Optional width */
  width?: number | string;

  /** Optional height */
  height?: number | string;

  /** Whether to show controls */
  showControls?: boolean;

  /** Whether to show background grid */
  showBackground?: boolean;

  /** Whether swimlane headers should stick to the top when scrolling vertically (default: true) */
  stickyHeaders?: boolean;

  /** Whether to show event labels on nodes (default: false, labels already shown on edges) */
  showEventLabels?: boolean;

  /**
   * When true, render the diagram chrome (canvas background, swimlane fills,
   * header backgrounds) as transparent so the diagram can be composited over
   * an arbitrary backdrop. Lifelines, borders, edges, and label pills keep
   * their theme colors so the diagram stays legible. Defaults to `false`.
   */
  transparent?: boolean;
}

/**
 * Inner component that uses React Flow hooks
 */
function SequenceDiagramInner({
  events,
  edges: sequenceEdges,
  layoutOptions = {},
  nodeTypes: customNodeTypes,
  edgeTypes: customEdgeTypes,
  onToggleCollapse,
  onNodeClick,
  showControls = true,
  showBackground = false, // Default to false since swimlanes provide visual structure
  stickyHeaders = true,
  selectedNodeId,
  showEventLabels = false, // Default to false - labels already shown on edges
  transparent = false,
}: SequenceDiagramRendererProps) {
  const { theme } = useTheme();

  // Extract layout params
  const { laneWidth = 250, headerHeight = 60 } = layoutOptions;

  // Merge custom node/edge types with sequence defaults
  const nodeTypes = useMemo(
    () => ({ ...defaultSequenceNodeTypes, ...customNodeTypes }),
    [customNodeTypes]
  );
  const edgeTypes = useMemo(
    () => ({ ...defaultSequenceEdgeTypes, ...customEdgeTypes }),
    [customEdgeTypes]
  );

  // Compute layout
  const { nodes: layoutNodes, edges, swimlanes, totalWidth, totalHeight } = useSequenceLayout(
    events,
    sequenceEdges,
    layoutOptions
  );

  // Mark selected node and add showEventLabels to node data
  const nodes = useMemo(() => {
    return layoutNodes.map(node => ({
      ...node,
      selected: node.id === selectedNodeId,
      data: {
        ...node.data,
        showEventLabels,
      },
    }));
  }, [layoutNodes, selectedNodeId, showEventLabels]);

  // Add selectedNodeId to edge data so edges can highlight their labels
  const edgesWithSelection = useMemo(() => {
    return edges.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        isSourceSelected: edge.source === selectedNodeId,
      },
    }));
  }, [edges, selectedNodeId]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      onNodeClick?.(node.id, _event);
    },
    [onNodeClick]
  );

  // Handle edge click - extract source event from edge and trigger node selection
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: { id: string; source: string; target: string }) => {
      // When clicking an edge, select the source event (the label describes the source)
      // The edge label comes from the source event, so clicking it should select that event
      onNodeClick?.(edge.source, _event);
    },
    [onNodeClick]
  );

  // Clamp horizontal and vertical panning to content bounds so swimlanes and
  // headers stay in view. When sticky headers are disabled, allow a small
  // negative top buffer for visual breathing room.
  const translateExtent = useMemo(() => {
    const xMin = 0;
    const xMax = totalWidth;
    const yMin = stickyHeaders ? 0 : -20;
    const yMax = stickyHeaders ? totalHeight + 1000 : totalHeight + 20;
    return [
      [xMin, yMin],
      [xMax, yMax],
    ] as [[number, number], [number, number]];
  }, [stickyHeaders, totalWidth, totalHeight]);

  // When sticky headers are enabled, use defaultViewport to ensure we start at y=0
  // This prevents the snap-to-position issue on initial load
  const viewportConfig = useMemo(() => {
    if (stickyHeaders) {
      // Start with top-aligned view (y=0) and reasonable zoom
      return {
        fitView: false,
        defaultViewport: { x: 0, y: 0, zoom: 0.8 },
      };
    }
    // Use fitView for non-sticky mode
    return {
      fitView: true,
      fitViewOptions: {
        padding: 0.1,
        minZoom: 0.5,
        maxZoom: 1.5,
      },
    };
  }, [stickyHeaders]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edgesWithSelection}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      {...viewportConfig}
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
      panOnScroll
      zoomOnScroll
      translateExtent={translateExtent}
      style={{ background: transparent ? 'transparent' : theme.colors.background }}
    >
      {/* SVG defs for arrow markers */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          {/* Standard arrow for transform events */}
          <marker
            id="sequence-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill={theme.colors.primary}
            />
          </marker>
          {/* Accent arrow for move events (IPC calls) */}
          <marker
            id="sequence-arrow-move"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              fill={theme.colors.accent || '#f48771'}
            />
          </marker>
        </defs>
      </svg>

      {showBackground && (
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      )}
      {showControls && <Controls />}

      {/* Swimlane layer - renders behind nodes */}
      <SwimlaneLayer
        swimlanes={swimlanes}
        laneWidth={laneWidth}
        headerHeight={headerHeight}
        totalHeight={totalHeight}
        transparent={transparent}
      />

      {/* Swimlane headers layer - renders on top for clickability */}
      <SwimlaneHeadersLayer
        swimlanes={swimlanes}
        laneWidth={laneWidth}
        headerHeight={headerHeight}
        totalHeight={totalHeight}
        onToggleCollapse={onToggleCollapse}
        stickyHeaders={stickyHeaders}
        transparent={transparent}
      />

      {/* Collapse toggle panel (for namespaces with children) */}
      {swimlanes.some((s) => s.children.length > 0) && (
        <Panel position="top-right">
          <div
            style={{
              background: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: theme.fontSizes[0],
              fontFamily: theme.fonts.body,
              color: theme.colors.textSecondary,
            }}
          >
            Click lane headers to expand/collapse
          </div>
        </Panel>
      )}
    </ReactFlow>
  );
}

/**
 * Sequence Diagram Renderer
 *
 * Renders events as a sequence diagram with swimlanes based on namespaces.
 *
 * @example
 * ```tsx
 * <SequenceDiagramRenderer
 *   events={[
 *     { id: '1', name: 'auth.validation.started' },
 *     { id: '2', name: 'auth.validation.completed' },
 *     { id: '3', name: 'database.query.executed' },
 *   ]}
 *   edges={[
 *     { id: 'e1', fromEvent: '1', toEvent: '2' },
 *     { id: 'e2', fromEvent: '2', toEvent: '3' },
 *   ]}
 * />
 * ```
 */
export function SequenceDiagramRenderer(props: SequenceDiagramRendererProps) {
  const { className, width = '100%', height = 600 } = props;

  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: 'relative',
      }}
    >
      <ReactFlowProvider>
        <SequenceDiagramInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
