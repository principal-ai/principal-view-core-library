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
import '@xyflow/react/dist/style.css';
import {
  useSequenceLayout,
  type SequenceEvent,
  type SequenceEdge,
  type UseSequenceLayoutOptions,
  type Swimlane,
} from '../hooks/useSequenceLayout';

/**
 * Minimal marker node for arrow-centric sequence diagrams
 */
function SequenceMarkerNode({ data }: NodeProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--sequence-marker-bg, #6495ED)',
        borderRadius: '50%',
        border: '2px solid var(--sequence-marker-border, #4169E1)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
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
 * Sequence arrow edge with label
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
  // Use a straight line for same-lane, bezier for cross-lane
  const isSameLane = !data?.crossesLanes;

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
          stroke: 'var(--sequence-arrow-color, #4169E1)',
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
              background: 'var(--sequence-label-bg, rgba(255, 255, 255, 0.95))',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--sequence-label-text, #333)',
              border: '1px solid var(--sequence-label-border, #ddd)',
              pointerEvents: 'all',
              whiteSpace: 'nowrap',
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
 * Default edge types including sequence arrow
 */
const defaultSequenceEdgeTypes: EdgeTypes = {
  sequenceArrow: SequenceArrowEdge,
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
}

/**
 * Swimlane layer that renders behind nodes and transforms with viewport
 */
function SwimlaneLayer({
  swimlanes,
  laneWidth,
  headerHeight,
  totalHeight,
  onToggleCollapse,
}: SwimlaneLayerProps) {
  const { x, y, zoom } = useViewport();

  // Calculate the visible area height (use a large value to ensure lanes extend)
  const extendedHeight = Math.max(totalHeight, 2000);

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
        return (
          <div
            key={`bg-${lane.namespace}`}
            style={{
              position: 'absolute',
              left: lane.x - laneWidth / 2,
              top: 0,
              width: laneWidth,
              height: extendedHeight,
              backgroundColor: isEven
                ? 'var(--sequence-lane-even, rgba(100, 149, 237, 0.08))'
                : 'var(--sequence-lane-odd, rgba(100, 149, 237, 0.03))',
              borderRight: '1px solid var(--sequence-lane-border, rgba(100, 149, 237, 0.2))',
            }}
          />
        );
      })}

      {/* Lane headers */}
      {swimlanes.map((lane) => {
        const hasChildren = lane.children.length > 0;
        return (
          <div
            key={`header-${lane.namespace}`}
            style={{
              position: 'absolute',
              left: lane.x - laneWidth / 2,
              top: 0,
              width: laneWidth,
              height: headerHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--sequence-header-bg, rgba(100, 149, 237, 0.15))',
              borderBottom: '2px solid var(--sequence-header-border, rgba(100, 149, 237, 0.4))',
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--sequence-header-text, #333)',
              pointerEvents: 'auto',
              cursor: hasChildren ? 'pointer' : 'default',
              userSelect: 'none',
            }}
            onClick={() => hasChildren && onToggleCollapse?.(lane.namespace)}
          >
            {hasChildren && (
              <span style={{ marginRight: 6, fontSize: 10 }}>
                {lane.isCollapsed ? '▶' : '▼'}
              </span>
            )}
            <span>{lane.label}</span>
            {lane.eventIds.length > 1 && (
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>
                ({lane.eventIds.length})
              </span>
            )}
          </div>
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
            backgroundColor: 'var(--sequence-lifeline, rgba(100, 149, 237, 0.3))',
            transform: 'translateX(-1px)',
          }}
        />
      ))}
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
}: SequenceDiagramRendererProps) {
  // Extract layout params
  const { laneWidth = 200, headerHeight = 60, arrowCentric = false } = layoutOptions;

  // Merge custom node/edge types with sequence defaults
  const nodeTypes = useMemo(
    () => ({ ...defaultSequenceNodeTypes, ...customNodeTypes }),
    [customNodeTypes]
  );
  const edgeTypes = useMemo(
    () => ({ ...defaultSequenceEdgeTypes, ...customEdgeTypes }),
    [customEdgeTypes]
  );

  // Compute layout (pass arrowCentric through layoutOptions)
  const { nodes, edges, swimlanes, totalHeight } = useSequenceLayout(
    events,
    sequenceEdges,
    { ...layoutOptions, arrowCentric }
  );

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      onNodeClick?.(node.id, _event);
    },
    [onNodeClick]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{
        padding: 0.2,
        minZoom: 0.5,
        maxZoom: 1.5,
      }}
      minZoom={0.1}
      maxZoom={2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={true}
      panOnScroll
      zoomOnScroll
    >
      {/* SVG defs for arrow marker */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
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
              fill="var(--sequence-arrow-color, #4169E1)"
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
        onToggleCollapse={onToggleCollapse}
      />

      {/* Collapse toggle panel (for namespaces with children) */}
      {swimlanes.some((s) => s.children.length > 0) && (
        <Panel position="top-right">
          <div
            style={{
              background: 'var(--sequence-panel-bg, rgba(255, 255, 255, 0.95))',
              border: '1px solid var(--sequence-panel-border, #ddd)',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 11,
              color: '#666',
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
