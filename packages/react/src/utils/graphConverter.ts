import { MarkerType, type Node, type Edge } from '@xyflow/react';
import type {
  NodeState,
  EdgeState,
  GraphConfiguration,
  Violation,
} from '@principal-ai/principal-view-core';
import type { CustomNodeData } from '../nodes/CustomNode';
import type { CustomEdgeData } from '../edges/CustomEdge';

/**
 * Convert our NodeState to xyflow Node format
 */
export function convertToXYFlowNodes(
  nodes: NodeState[],
  configuration: GraphConfiguration,
  violations: Violation[] = []
): Node<CustomNodeData>[] {
  return nodes.map((node) => {
    const typeDefinition = configuration.nodeTypes[node.type];

    // Warn if node type is not defined in configuration
    if (!typeDefinition) {
      console.warn(`Node type "${node.type}" not found in configuration for node "${node.id}"`);
    }

    const hasViolations = violations.some((v) => v.context?.nodeId === node.id);

    return {
      id: node.id,
      type: 'custom',
      position: node.position || { x: 0, y: 0 },
      data: {
        name: (node.data.name as string) || node.id,
        typeDefinition,
        state: node.state,
        hasViolations,
        data: node.data,
      },
    };
  });
}

/** Extended edge state with optional handle information for ReactFlow */
export interface EdgeStateWithHandles extends EdgeState {
  sourceHandle?: string;
  targetHandle?: string;
}

/**
 * Convert our EdgeState to xyflow Edge format
 */
export function convertToXYFlowEdges(
  edges: (EdgeState | EdgeStateWithHandles)[],
  configuration: GraphConfiguration,
  violations: Violation[] = []
): Edge<CustomEdgeData>[] {
  return edges.map((edge) => {
    const typeDefinition = configuration.edgeTypes[edge.type];

    // Warn if edge type is not defined in configuration
    if (!typeDefinition) {
      console.warn(`Edge type "${edge.type}" not found in configuration for edge "${edge.id}"`);
    }

    const hasViolations = violations.some((v) => v.context?.edgeId === edge.id);
    const edgeWithHandles = edge as EdgeStateWithHandles;

    // Add arrow marker if edge type is directed
    // Color priority: edge data color > type definition color > default
    const edgeColor = edge.data?.color as string | undefined;
    const markerEnd =
      typeDefinition?.directed !== false
        ? {
            type: MarkerType.ArrowClosed,
            color: edgeColor || typeDefinition?.color || '#888',
            width: 20,
            height: 20,
          }
        : undefined;

    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      sourceHandle: edgeWithHandles.sourceHandle,
      targetHandle: edgeWithHandles.targetHandle,
      type: 'custom',
      animated: typeDefinition?.style === 'animated',
      markerEnd,
      data: {
        typeDefinition,
        hasViolations,
        data: edge.data,
      },
    };
  });
}

/**
 * Auto-layout nodes if they don't have positions
 */
export function autoLayoutNodes<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  layoutType: 'hierarchical' | 'force-directed' | 'circular' | 'manual' = 'hierarchical'
): Node<T>[] {
  // Skip if all nodes have positions
  const hasPositions = nodes.every((n) => n.position.x !== 0 || n.position.y !== 0);
  if (hasPositions || layoutType === 'manual') {
    return nodes;
  }

  switch (layoutType) {
    case 'hierarchical':
      return applyHierarchicalLayout(nodes, edges);
    case 'circular':
      return applyCircularLayout(nodes);
    case 'force-directed':
      // For now, use hierarchical as fallback
      // TODO: Implement force-directed with elkjs
      return applyHierarchicalLayout(nodes, edges);
    default:
      return nodes;
  }
}

/**
 * Simple hierarchical layout algorithm
 */
function applyHierarchicalLayout<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[]
): Node<T>[] {
  // Build adjacency list
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  nodes.forEach((node) => {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  });

  edges.forEach((edge) => {
    const targets = adjacency.get(edge.source) || [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  });

  // Topological sort to determine layers
  const layers: string[][] = [];
  const queue: string[] = [];

  // Start with nodes that have no incoming edges
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentLayer: string[] = [];
    const layerSize = queue.length;

    for (let i = 0; i < layerSize; i++) {
      const nodeId = queue.shift()!;
      currentLayer.push(nodeId);
      visited.add(nodeId);

      const neighbors = adjacency.get(nodeId) || [];
      neighbors.forEach((neighbor) => {
        const degree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, degree);
        if (degree === 0 && !visited.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }

    if (currentLayer.length > 0) {
      layers.push(currentLayer);
    }
  }

  // Handle any remaining nodes (cycles or disconnected)
  const remainingNodes = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  if (remainingNodes.length > 0) {
    layers.push(remainingNodes);
  }

  // Position nodes based on layers
  const LAYER_HEIGHT = 150;
  const NODE_WIDTH = 200;

  return nodes.map((node) => {
    const layerIndex = layers.findIndex((layer) => layer.includes(node.id));
    const layer = layers[layerIndex] || [];
    const positionInLayer = layer.indexOf(node.id);
    const layerWidth = layer.length * NODE_WIDTH;

    return {
      ...node,
      position: {
        x: positionInLayer * NODE_WIDTH + NODE_WIDTH / 2 - layerWidth / 2,
        y: layerIndex * LAYER_HEIGHT,
      },
    };
  });
}

/**
 * Simple circular layout algorithm
 */
function applyCircularLayout<T extends Record<string, unknown>>(nodes: Node<T>[]): Node<T>[] {
  const radius = Math.max(200, nodes.length * 30);
  const angleStep = (2 * Math.PI) / nodes.length;

  return nodes.map((node, index) => {
    const angle = index * angleStep;
    return {
      ...node,
      position: {
        x: radius * Math.cos(angle) + radius,
        y: radius * Math.sin(angle) + radius,
      },
    };
  });
}
