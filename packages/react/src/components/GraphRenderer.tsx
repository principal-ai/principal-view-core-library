import React from 'react';
import type { GraphConfiguration, NodeState, EdgeState } from '@principal-ai/visual-validation-core';

export interface GraphRendererProps {
  /** Configuration for the graph */
  configuration: GraphConfiguration;

  /** Current nodes in the graph */
  nodes: NodeState[];

  /** Current edges in the graph */
  edges: EdgeState[];

  /** Optional class name */
  className?: string;

  /** Optional width */
  width?: number | string;

  /** Optional height */
  height?: number | string;
}

/**
 * Core graph visualization component using xyflow
 * TODO: Implement full xyflow integration
 */
export const GraphRenderer: React.FC<GraphRendererProps> = ({
  configuration,
  nodes,
  edges,
  className,
  width = '100%',
  height = '100%',
}) => {
  return (
    <div className={className} style={{ width, height, border: '1px solid #ccc' }}>
      <div style={{ padding: '20px' }}>
        <h3>Graph Renderer (TODO)</h3>
        <p>Configuration: {configuration.metadata.name}</p>
        <p>Nodes: {nodes.length}</p>
        <p>Edges: {edges.length}</p>
        <div>
          <strong>TODO:</strong>
          <ul>
            <li>Integrate @xyflow/react</li>
            <li>Render nodes based on NodeTypeDefinition</li>
            <li>Render edges based on EdgeTypeDefinition</li>
            <li>Apply layout algorithm (hierarchical/force-directed/etc)</li>
            <li>Handle node/edge interactions</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
