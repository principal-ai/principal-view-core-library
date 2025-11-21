import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphConfiguration, NodeState, EdgeState, Violation } from '@principal-ai/visual-validation-core';
import { CustomNode } from '../nodes/CustomNode';
import type { CustomNodeData } from '../nodes/CustomNode';
import { CustomEdge } from '../edges/CustomEdge';
import { convertToXYFlowNodes, convertToXYFlowEdges, autoLayoutNodes } from '../utils/graphConverter';

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
}

// Define custom node types
const nodeTypes = {
  custom: CustomNode,
};

// Define custom edge types
const edgeTypes = {
  custom: CustomEdge,
};

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
}) => {
  // Convert our data format to xyflow format
  const xyflowNodes = useMemo(() => {
    const converted = convertToXYFlowNodes(nodes, configuration, violations);
    const layoutType = configuration.display?.layout || 'hierarchical';
    return autoLayoutNodes(converted, [], layoutType);
  }, [nodes, configuration, violations]);

  const xyflowEdges = useMemo(() => {
    return convertToXYFlowEdges(edges, configuration, violations);
  }, [edges, configuration, violations]);

  return (
    <div className={className} style={{ width, height }}>
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
    </div>
  );
};
