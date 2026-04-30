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
  /** Whether this is a move event (crosses participant boundaries) */
  moveEvent?: boolean;
  /** Participant this event belongs to (for move events, this is the target) */
  participant?: string;
  /**
   * Optional source-file path this event originated from, expressed
   * relative to the repository root (e.g.
   * `auth-server/src/lib/auth-provider.ts`). Surfaced on the React Flow
   * node `data` so downstream renderers (file-city overlays, jump-to-source,
   * IDE bridges) can react to selection without reaching into `data`.
   */
  sourcePath?: string;
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
   * @default 250
   */
  laneWidth?: number;

  /**
   * Gap between swimlanes
   * @default 10
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
    laneWidth = 250,
    laneGap = 0,
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

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const originalNamespace = eventNamespaces.get(event.id)!;
      const visibleNamespace = namespaceToVisible.get(originalNamespace)!;
      const lane = swimlaneByNamespace.get(visibleNamespace)!;

      // Global Y position based on event order (time layer)
      // Start first event closer to header with small offset
      const y = headerHeight + 40 + i * eventSpacing;

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
          isMoveEvent: event.moveEvent === true,
          sourcePath: event.sourcePath,
          ...event.data,
        },
        style: {
          width: nodeWidth,
          height: nodeHeight,
        },
      });
    }

    // Step 5: Create edges - one per event, showing how to get to the NEXT event
    // Each edge looks forward to determine what to render
    const edges: Edge[] = [];

    for (let i = 0; i < events.length; i++) {
      const currentEvent = events[i];
      const currentNamespace = eventNamespaces.get(currentEvent.id)!;
      const currentVisibleNs = namespaceToVisible.get(currentNamespace)!;
      const currentLane = swimlaneByNamespace.get(currentVisibleNs)!;

      // Look at the next event (if any)
      if (i < events.length - 1) {
        const nextEvent = events[i + 1];
        const nextNamespace = eventNamespaces.get(nextEvent.id)!;
        const nextVisibleNs = namespaceToVisible.get(nextNamespace)!;
        const nextLane = swimlaneByNamespace.get(nextVisibleNs)!;
        const nextIsMoveEvent = nextEvent.moveEvent === true;
        const crossesLanes = currentVisibleNs !== nextVisibleNs;

        // Label is from the CURRENT event (the one creating this edge)
        const edgeLabel = currentEvent.label || currentEvent.name.split('.').pop() || currentEvent.name;

        edges.push({
          id: `edge-${currentEvent.id}-to-${nextEvent.id}`,
          source: currentEvent.id,
          target: nextEvent.id,
          type: 'sequenceArrowParticipant',
          label: edgeLabel,
          labelStyle: { fontSize: 12, fontWeight: 500 },
          labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          data: {
            crossesLanes,
            sourceNamespace: currentNamespace,
            targetNamespace: nextNamespace,
            isMoveEvent: nextIsMoveEvent,
            sourceEvent: currentEvent,
            targetEvent: nextEvent,
            sourceParticipantX: currentLane.x,
            targetParticipantX: nextLane.x,
          },
        });
      } else {
        // Last event - render small activation bar to show it exists
        const currentIsMoveEvent = currentEvent.moveEvent === true;
        const edgeLabel = currentEvent.label || currentEvent.name.split('.').pop() || currentEvent.name;

        edges.push({
          id: `edge-${currentEvent.id}-end`,
          source: currentEvent.id,
          target: currentEvent.id,
          type: 'sequenceArrowParticipant',
          label: edgeLabel,
          labelStyle: { fontSize: 12, fontWeight: 500 },
          labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          data: {
            crossesLanes: false,
            sourceNamespace: currentNamespace,
            targetNamespace: currentNamespace,
            isMoveEvent: currentIsMoveEvent,
            sourceEvent: currentEvent,
            targetEvent: currentEvent,
            sourceParticipantX: currentLane.x,
            targetParticipantX: currentLane.x,
            isLastEvent: true,
            eventSpacing,
          },
        });
      }
    }

    // Step 6: Compute total dimensions
    const totalWidth =
      swimlanes.length * laneWidth + (swimlanes.length - 1) * laneGap;
    // Total height based on number of events (time layers)
    const totalHeight = headerHeight + 40 + events.length * eventSpacing;

    // Step 7: Add invisible boundary nodes to ensure fitView includes full diagram width
    if (swimlanes.length > 0) {
      const leftmostLane = swimlanes[0];
      const rightmostLane = swimlanes[swimlanes.length - 1];

      // Add boundary nodes at the corners
      nodes.push(
        {
          id: '__boundary_left__',
          type: 'default',
          position: { x: leftmostLane.x - laneWidth / 2, y: 0 },
          data: {},
          style: { width: 1, height: 1, opacity: 0 },
          draggable: false,
          selectable: false,
        },
        {
          id: '__boundary_right__',
          type: 'default',
          position: { x: rightmostLane.x + laneWidth / 2, y: totalHeight },
          data: {},
          style: { width: 1, height: 1, opacity: 0 },
          draggable: false,
          selectable: false,
        }
      );
    }

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
