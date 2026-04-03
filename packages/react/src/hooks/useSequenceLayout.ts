/**
 * React hook for sequence diagram layout
 *
 * Computes swimlane-based positioning for events based on their namespaces.
 */

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';

/**
 * Input event for sequence layout
 */
export interface SequenceEvent {
  /** Unique event identifier */
  id: string;
  /** Event name with namespace (e.g., "auth.validation.started") */
  name: string;
  /** Optional display label (defaults to name) */
  label?: string;
  /** Optional event type for styling */
  type?: string;
  /** Additional data to pass through to the node */
  data?: Record<string, unknown>;
}

/**
 * Input edge for sequence layout
 */
export interface SequenceEdge {
  /** Unique edge identifier */
  id: string;
  /** Source event ID */
  fromEvent: string;
  /** Target event ID */
  toEvent: string;
  /** Optional edge label */
  label?: string;
  /** Optional edge type for styling */
  type?: string;
}

/**
 * Swimlane information computed from events
 */
export interface Swimlane {
  /** Namespace identifier */
  namespace: string;
  /** Display label for the lane header */
  label: string;
  /** X position of the lane center */
  x: number;
  /** Parent namespace (for hierarchical lanes) */
  parentNamespace?: string;
  /** Whether this lane is collapsed */
  isCollapsed: boolean;
  /** Child namespaces */
  children: string[];
  /** Events in this lane */
  eventIds: string[];
}

/**
 * Namespace extraction strategy
 */
export type NamespaceStrategy =
  | 'first' // First segment only (auth.validation.started -> auth)
  | 'all-but-last' // All but last segment (auth.validation.started -> auth.validation)
  | number // Specific depth (2 -> auth.validation)
  | ((name: string) => string); // Custom function

/**
 * Options for sequence layout
 */
export interface UseSequenceLayoutOptions {
  /**
   * How to extract namespace from event name
   * @default 'all-but-last'
   */
  namespaceStrategy?: NamespaceStrategy;

  /**
   * Width of each swimlane
   * @default 200
   */
  laneWidth?: number;

  /**
   * Gap between swimlanes
   * @default 50
   */
  laneGap?: number;

  /**
   * Vertical spacing between events
   * @default 80
   */
  eventSpacing?: number;

  /**
   * Height reserved for lane headers
   * @default 60
   */
  headerHeight?: number;

  /**
   * Node marker width
   * @default 14
   */
  nodeWidth?: number;

  /**
   * Node marker height
   * @default 14
   */
  nodeHeight?: number;

  /**
   * Namespaces to collapse (show as single lane)
   */
  collapsedNamespaces?: string[];
}

/**
 * Result from sequence layout computation
 */
export interface UseSequenceLayoutResult {
  /** Positioned nodes for React Flow */
  nodes: Node[];
  /** Edges for React Flow */
  edges: Edge[];
  /** Computed swimlane information */
  swimlanes: Swimlane[];
  /** Total width of the diagram */
  totalWidth: number;
  /** Total height of the diagram */
  totalHeight: number;
}

/**
 * Extract namespace from event name based on strategy
 */
function extractNamespace(name: string, strategy: NamespaceStrategy): string {
  if (typeof strategy === 'function') {
    return strategy(name);
  }

  const segments = name.split('.');

  if (segments.length <= 1) {
    return name;
  }

  if (strategy === 'first') {
    return segments[0];
  }

  if (strategy === 'all-but-last') {
    return segments.slice(0, -1).join('.');
  }

  if (typeof strategy === 'number') {
    return segments.slice(0, strategy).join('.');
  }

  return segments.slice(0, -1).join('.');
}

/**
 * Get parent namespace (one level up)
 */
function getParentNamespace(namespace: string): string | undefined {
  const segments = namespace.split('.');
  if (segments.length <= 1) {
    return undefined;
  }
  return segments.slice(0, -1).join('.');
}

/**
 * Hook for computing sequence diagram layout
 *
 * @param events - Events to layout
 * @param edges - Edges between events
 * @param options - Layout options
 * @returns Layout result with positioned nodes, edges, and swimlane info
 *
 * @example
 * ```tsx
 * const { nodes, edges, swimlanes } = useSequenceLayout(
 *   [
 *     { id: '1', name: 'auth.validation.started' },
 *     { id: '2', name: 'auth.validation.completed' },
 *     { id: '3', name: 'database.query.executed' },
 *   ],
 *   [
 *     { id: 'e1', fromEvent: '1', toEvent: '2' },
 *     { id: 'e2', fromEvent: '2', toEvent: '3' },
 *   ]
 * );
 * ```
 */
export function useSequenceLayout(
  events: SequenceEvent[],
  sequenceEdges: SequenceEdge[],
  options: UseSequenceLayoutOptions = {}
): UseSequenceLayoutResult {
  const {
    namespaceStrategy = 'all-but-last',
    laneWidth = 200,
    laneGap = 50,
    eventSpacing = 80,
    headerHeight = 60,
    collapsedNamespaces = [],
    nodeWidth = 14,
    nodeHeight = 14,
  } = options;

  return useMemo(() => {
    if (events.length === 0) {
      return {
        nodes: [],
        edges: [],
        swimlanes: [],
        totalWidth: 0,
        totalHeight: 0,
      };
    }

    // Step 1: Extract namespaces and group events
    const eventNamespaces = new Map<string, string>();
    const namespaceEvents = new Map<string, string[]>();

    for (const event of events) {
      const namespace = extractNamespace(event.name, namespaceStrategy);
      eventNamespaces.set(event.id, namespace);

      if (!namespaceEvents.has(namespace)) {
        namespaceEvents.set(namespace, []);
      }
      namespaceEvents.get(namespace)!.push(event.id);
    }

    // Step 2: Build namespace hierarchy and determine visible lanes
    const allNamespaces = Array.from(namespaceEvents.keys()).sort();
    const collapsedSet = new Set(collapsedNamespaces);

    // For collapsed namespaces, merge children into parent
    const visibleNamespaces: string[] = [];
    const namespaceToVisible = new Map<string, string>();

    for (const ns of allNamespaces) {
      // Check if any ancestor is collapsed
      let visibleNs = ns;
      let current: string | undefined = ns;

      while (current) {
        if (collapsedSet.has(current)) {
          visibleNs = current;
        }
        current = getParentNamespace(current);
      }

      namespaceToVisible.set(ns, visibleNs);

      if (!visibleNamespaces.includes(visibleNs)) {
        visibleNamespaces.push(visibleNs);
      }
    }

    // Step 3: Create swimlanes with positions
    const swimlanes: Swimlane[] = visibleNamespaces.map((namespace, index) => {
      const x = index * (laneWidth + laneGap) + laneWidth / 2;

      // Find all events that map to this visible namespace
      const eventIds: string[] = [];
      for (const [eventId, eventNs] of eventNamespaces) {
        if (namespaceToVisible.get(eventNs) === namespace) {
          eventIds.push(eventId);
        }
      }

      // Find children (namespaces that have this as parent)
      const children = allNamespaces.filter(
        (ns) => getParentNamespace(ns) === namespace
      );

      return {
        namespace,
        label: namespace.split('.').pop() || namespace,
        x,
        parentNamespace: getParentNamespace(namespace),
        isCollapsed: collapsedSet.has(namespace),
        children,
        eventIds,
      };
    });

    // Create lookup for swimlane by namespace
    const swimlaneByNamespace = new Map<string, Swimlane>();
    for (const lane of swimlanes) {
      swimlaneByNamespace.set(lane.namespace, lane);
    }

    // Step 4: Position events using global time layers
    // Each event gets a Y position based on its index in the overall sequence
    // This creates horizontal "time layers" across all swimlanes
    const nodes: Node[] = [];

    // Build event lookup for edge label resolution
    const eventById = new Map(events.map((e) => [e.id, e]));

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const originalNamespace = eventNamespaces.get(event.id)!;
      const visibleNamespace = namespaceToVisible.get(originalNamespace)!;
      const lane = swimlaneByNamespace.get(visibleNamespace)!;

      // Global Y position based on event order (time layer)
      const y = headerHeight + i * eventSpacing;

      nodes.push({
        id: event.id,
        type: 'sequenceMarker',
        position: {
          x: lane.x - nodeWidth / 2,
          y: y - nodeHeight / 2, // Center vertically on the time layer
        },
        data: {
          label: event.label || event.name.split('.').pop() || event.name,
          fullName: event.name,
          namespace: originalNamespace,
          visibleNamespace,
          timeLayer: i,
          ...event.data,
        },
        style: {
          width: nodeWidth,
          height: nodeHeight,
        },
      });
    }

    // Step 5: Create edges with labels derived from target event
    const edges: Edge[] = sequenceEdges.map((edge) => {
      const sourceNamespace = eventNamespaces.get(edge.fromEvent);
      const targetNamespace = eventNamespaces.get(edge.toEvent);
      const crossesLanes =
        namespaceToVisible.get(sourceNamespace!) !==
        namespaceToVisible.get(targetNamespace!);

      const targetEvent = eventById.get(edge.toEvent);
      const edgeLabel = edge.label || targetEvent?.label || targetEvent?.name.split('.').pop() || '';

      return {
        id: edge.id,
        source: edge.fromEvent,
        target: edge.toEvent,
        type: 'sequenceArrow',
        label: edgeLabel,
        labelStyle: { fontSize: 12, fontWeight: 500 },
        labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
        data: {
          crossesLanes,
          sourceNamespace,
          targetNamespace,
        },
      };
    });

    // Step 6: Compute total dimensions
    const totalWidth =
      swimlanes.length * (laneWidth + laneGap) - laneGap + laneWidth;
    // Total height based on number of events (time layers)
    const totalHeight = headerHeight + events.length * eventSpacing + eventSpacing;

    return {
      nodes,
      edges,
      swimlanes,
      totalWidth,
      totalHeight,
    };
  }, [
    events,
    sequenceEdges,
    namespaceStrategy,
    laneWidth,
    laneGap,
    eventSpacing,
    headerHeight,
    nodeWidth,
    nodeHeight,
    collapsedNamespaces,
  ]);
}
