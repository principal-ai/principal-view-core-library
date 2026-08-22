/**
 * Subsystem component-graph data model + converters.
 *
 * A subsystem snapshot (see the "Subsystem artifact: facets" topic) is captured
 * as component nodes (kind-tagged source units), file refs, integration edges,
 * and entry points. This module defines the minimal document shape for the
 * *graph* facet and converts it to React Flow nodes/edges — packages render as
 * subgraphs, only cross-package edges leave the box, and shared seams
 * (registries/barrels/facades) are edge targets, never member nodes.
 *
 * Self-contained in this package (not yet promoted to `@principal-ai/core`), so
 * we can iterate on the UI + story without publishing a dependency.
 */

import {
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react';
import { computeElkLayout } from '../utils/elkLayout';
import type { GraphifyComponentDetail } from '../graphify';

export type SubsystemComponentKind =
  | 'class'
  | 'function'
  | 'type'
  | 'module'
  | 'external';

export type SubsystemEdgeMechanism =
  | 'imports'
  | 'imports_from'
  | 're_exports'
  | 'defines'
  | 'calls'
  | 'extends'
  | 'inherits'
  | 'implements'
  | 'mixes_in'
  | 'uses'
  | 'method'
  | 'references'
  | 'contains'
  | 'feeds'
  | 'produces'
  | 'registers-into';

/** A component node — the named unit, kind-tagged; `file` is its location. */
export interface SubsystemComponent {
  id: string;
  name: string;
  kind: SubsystemComponentKind;
  /** Source location the component lives in (repo-root-relative path). */
  file: string;
  /** PURL identifying the repo or package this component lives in (for subgraph grouping). */
  purl: string;
  /** One-line purpose shown on the node. */
  purpose?: string;
  /** A symbol this component exposes / is (the node's identity). */
  symbol?: string;
  /**
   * Semantic layer/phase for the layout (e.g. `1` = input, `2` = processing,
   * `3` = output). When set, ELK places the component in this layer so the
   * graph reads as a left-to-right pipeline and *conveys the idea* rather than
   * letting ELK guess the order.
   */
  layer?: number;
  /**
   * How this session *occupied* the component — `edited` (modified it) vs
   * `analyzed` (read deeply / built an understanding) vs `referenced`
   * (touched in passing). Drives clustering: edits strengthen a subsystem,
   * but a read-only investigation can still form one around an analyzed seam.
   */
  capture?: 'edited' | 'analyzed' | 'referenced';
  /**
   * Graphify drill-down detail for this component, when the facet is anchored
   * to a graphify node. Discriminated by kind (class/function/type/module/
   * external); rendered in the detail panel on click.
   */
  detail?: GraphifyComponentDetail;
}

/** A cross-component edge in the subsystem graph. */
export interface SubsystemComponentEdge {
  id: string;
  from: string; // component id
  to: string; // component id or external target label
  mechanism: SubsystemEdgeMechanism;
  /** Concrete file/symbol refs backing the edge (the seam). */
  refs?: string[];
}

/**
 * Derive a consistent display `name` from a code `symbol` + kind.
 *
 * `symbol` is the source of truth (fully-qualified code identity). For most
 * kinds the name is the symbol itself or its last dotted segment:
 *  - class/type/module/function/script/...  symbol → symbol (e.g. `SessionReader`)
 *  - method                               `Owner.method` → last segment (e.g. `SessionReader.normalize` → `normalize`)
 *  - module, no symbol → basename of `file` (e.g. `transcript.ts` → `transcript`) —
 *    a common-sense convention for whole-file modules, not a real TS name
 *  - otherwise                          no symbol → fall back to an existing name
 */
export function deriveNameFromSymbol(
  symbol: string | undefined,
  kind: SubsystemComponentKind,
  existingName?: string,
  file?: string,
): string {
  if (symbol && symbol.trim()) {
    return symbol;
  }
  // Module nodes without a symbol are whole files → use the file basename.
  if (kind === 'module' && file) {
    const base = file.split('/').pop() ?? '';
    const clean = base.replace(/\.[^.]+$/, ''); // strip extension
    if (clean) return clean;
  }
  return existingName ?? 'untitled';
}

export interface SubsystemGraphDocument {
  components: SubsystemComponent[];
  edges: SubsystemComponentEdge[];
}

// ---------------------------------------------------------------------------
// React Flow conversion
// ---------------------------------------------------------------------------

export type SubsystemGraphNodeType = 'subsystem-component' | 'subsystem-group';

export interface SubsystemGraphNodeData extends Record<string, unknown> {
  component: SubsystemComponent;
}

export type SubsystemGraphNode = Node<SubsystemGraphNodeData, SubsystemGraphNodeType>;

export interface SubsystemGraphEdgeData extends Record<string, unknown> {
  mechanism: SubsystemEdgeMechanism;
  refs?: string[];
  /** True while another edge is selected — render this edge (and its label)
   *  dimmed to focus the selected relationship. */
  dimmed?: boolean;
  /** ELK-computed label midpoint (from the actual edge path, not node centers). */
  labelX?: number;
  labelY?: number;
  /** ELK-computed SVG edge path (overrides React Flow's default path). */
  elkPath?: string;
}

export type SubsystemGraphEdge = Edge<SubsystemGraphEdgeData>;

export const MECHANISM_COLOR: Record<SubsystemEdgeMechanism, string> = {
  imports: '#0893d2', // blue
  imports_from: '#5aa9e6', // light blue
  re_exports: '#3aa5c9', // cyan-blue
  defines: '#2e86ab', // steel blue
  calls: '#4ec9b0', // teal
  extends: '#b48ead', // purple
  inherits: '#9b6fd0', // purple
  implements: '#c586c0', // magenta
  mixes_in: '#d474a8', // pink-magenta
  uses: '#e3b341', // gold
  method: '#c586c0', // magenta
  references: '#e07a5f', // terracotta
  contains: '#6c5ce7', // indigo
  feeds: '#22c55e', // green — data-flow into a processor
  produces: '#e07a5f', // terracotta — emits an output type
  'registers-into': '#ff6b35', // orange
};

const MECHANISM_STYLE: Record<SubsystemEdgeMechanism, 'solid' | 'dashed' | 'dotted'> = {
  imports: 'solid',
  imports_from: 'solid',
  re_exports: 'solid',
  defines: 'solid',
  calls: 'solid',
  extends: 'dashed',
  inherits: 'dashed',
  implements: 'dashed',
  mixes_in: 'dashed',
  uses: 'solid',
  method: 'solid',
  references: 'dotted',
  contains: 'solid',
  feeds: 'solid',
  produces: 'solid',
  'registers-into': 'dashed',
};

/** Package color palette (derived deterministically from the package name). */
export function packageColor(name: string): string {
  const palette = [
    '#0893d2',
    '#4ec9b0',
    '#ff6b35',
    '#b48ead',
    '#e3b341',
    '#5aa9e6',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Color per component kind — the informative signal (rather than package). */
export const KIND_COLOR: Record<SubsystemComponentKind, string> = {
  class: '#0893d2', // blue
  function: '#6c5ce7', // indigo
  type: '#e07a5f', // terracotta
  module: '#4ec9b0', // teal
  external: '#b48ead', // purple
};

/**
 * Convert a subsystem graph document into React Flow nodes. We render **flat**
 * (no React Flow parent/group nodes) for robustness: package regions are laid
 * out in a grid and each component carries its package + a `pkgBounds`
 * rectangle on its node data so the group wrapper (drawn by the graph
 * component) can frame it. Only components' real positions matter to React
 * Flow; the package boundary is a visual region, not a sub-flow node.
 */
export function convertSubsystemToNodes(
  doc: SubsystemGraphDocument,
  opts: { maxNodeWidth?: number } = {},
): SubsystemGraphNode[] {
  const { maxNodeWidth } = opts;
  // Group components by package.
  const byPkg = new Map<string, SubsystemComponent[]>();
  for (const c of doc.components) {
    const list = byPkg.get(c.purl) ?? [];
    list.push(c);
    byPkg.set(c.purl, list);
  }

  const nodes: SubsystemGraphNode[] = [];
  const COLS = 2;
  const COL_W = 240;
  const ROW_H = 150;
  const PAD = 30;
  const GROUP_GAP = 60;

  let cursorY = PAD;
  for (const comps of byPkg.values()) {
    const rows = Math.ceil(comps.length / COLS);
    const heightPx = ROW_H * rows;

    comps.forEach((c, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      // Estimate rendered node width from the longest text line so ELK reserves
      // the right space (names can wrap, so we cap at the configurable max).
      const text = [c.symbol, c.name, c.file.split('/').pop() ?? '']
        .filter((t): t is string => !!t)
        .sort((a, b) => b.length - a.length)[0];
      const cap = maxNodeWidth ?? 300;
      const textWidth = Math.min(cap, Math.max(60, (text?.length ?? 10) * 8));
      // Account for CSS minWidth and padding/border so ELK's port positions match
      // the actual rendered node boundaries.
      const cssMinWidth = 150;
      const cssPadding = 20; // horizontal padding (left + right)
      const cssBorder = 4; // 2px border each side
      const rawWidth = Math.max(cssMinWidth, textWidth + cssPadding + cssBorder);
      const nodeWidth = Math.max(cssMinWidth, Math.min(cap, rawWidth));
      nodes.push({
        id: c.id,
        type: 'subsystem-component',
        position: { x: PAD + col * COL_W, y: cursorY + row * ROW_H },
        width: nodeWidth,
        height: 84,
        data: { component: c },
      });
    });
    cursorY += heightPx + PAD * 2 + GROUP_GAP;
  }
  return nodes;
}

/**
 * Convert a subsystem graph document into React Flow edges. Edges whose target
 * is an external label (not a component id) point at a synthetic stub so the
 * relationship is visible without a member node.
 */
export function convertSubsystemToEdges(doc: SubsystemGraphDocument): SubsystemGraphEdge[] {
  const compIds = new Set(doc.components.map((c) => c.id));
  const edges: SubsystemGraphEdge[] = [];

  for (const e of doc.edges) {
    const color = MECHANISM_COLOR[e.mechanism];
    const style = MECHANISM_STYLE[e.mechanism];
    // If `to` is a real component, connect directly; otherwise point at a stub node.
    const isExternal = !compIds.has(e.to);
    const targetId = isExternal ? `external:${e.to}` : e.to;

    edges.push({
      id: e.id,
      source: e.from,
      target: targetId,
      data: { mechanism: e.mechanism, refs: e.refs },
      type: 'subsystem-edge',
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      style: { color, stroke: color, strokeDasharray: style === 'dashed' ? '6 4' : undefined },
      // `label` feeds ELK's label-space reservation only; the visible label is
      // rendered by the custom SubsystemEdge as an HTML overlay.
      label: e.mechanism,
      // Mechanism label rendered via the custom SubsystemEdge (an HTML overlay
      // above the SVG edges, so it can't be hidden behind other edge lines).
    });
  }
  return edges;
}

/**
 * Build the full React Flow graph (nodes + edges) using **ELK auto-layout** to
 * position every node (including external stub targets), so the graph is
 * layered with minimized crossings.
 */
export async function buildSubsystemGraph(
  doc: SubsystemGraphDocument,
  opts: { maxNodeWidth?: number; showEdgeLabels?: boolean; measuredWidths?: Map<string, number>; measuredHeights?: Map<string, number> } = {},
): Promise<{
  nodes: SubsystemGraphNode[];
  edges: SubsystemGraphEdge[];
}> {
  const { maxNodeWidth, showEdgeLabels, measuredWidths, measuredHeights } = opts;
  const nodes = convertSubsystemToNodes(doc, { maxNodeWidth });
  const edges = convertSubsystemToEdges(doc);

  // External edge targets that aren't real components → create stub nodes so
  // cross-package edges have something to land on.
  const realIds = new Set(doc.components.map((c) => c.id));
  const externalIds: string[] = [];
  for (const e of doc.edges) {
    if (!realIds.has(e.to)) {
      const extId = `external:${e.to}`;
      if (!externalIds.includes(extId)) externalIds.push(extId);
    }
  }
  for (const extId of externalIds) {
      const label = extId.replace(/^external:/, '');
      const extTextWidth = Math.min(300, Math.max(150, label.length * 8));
      nodes.push({
        id: extId,
        type: 'subsystem-component',
        position: { x: 0, y: 0 },
        width: Math.max(150, extTextWidth + 24),
      height: 60,
      data: {
        component: {
          id: extId,
          name: label,
          kind: 'external',
          purl: 'external',
          file: '',
          purpose: 'cross-package integration target (not a member node)',
        },
      },
      draggable: false,
    });
  }

  // Apply measured dimensions (second pass) so ELK gets the real node sizes.
  if (measuredWidths && measuredWidths.size > 0) {
    for (const n of nodes) {
      const mw = measuredWidths.get(n.id);
      if (mw) n.width = mw;
    }
  }
  if (measuredHeights && measuredHeights.size > 0) {
    for (const n of nodes) {
      const mh = measuredHeights.get(n.id);
      if (mh) n.height = mh;
    }
  }

  // ELK auto-layout: position nodes (layered, minimized crossings).
  let placedNodes = nodes;
  let labelPositions = new Map<string, { x: number; y: number }>();
  let elkPathStrings = new Map<string, string>();
  if (nodes.length > 0) {
    try {
      const result = await computeElkLayout(nodes, edges, {
        routingStyle: 'orthogonal',
        direction: 'RIGHT',
        nodeSpacing: 60,
        edgeSpacing: 30,
        edgeNodeSpacing: 60,
        interLayerSpacing: 120,
        preserveNodePositions: false,
        edgeLabels: showEdgeLabels === false ? { enabled: false } : { enabled: true, placement: 'CENTER' },
      });
      placedNodes = result.nodes as SubsystemGraphNode[];
      labelPositions = result.edgeLabelPositions;
      elkPathStrings = result.edgePaths;
    } catch (err) {
      // Fall back to the (unpositioned) grid if ELK is unavailable.
      console.warn('[subsystem-graph] ELK layout failed, using manual positions:', err);
    }
  }

  // Stamp ELK-computed label midpoints onto edge data so the overlay can
  // position labels at the actual path midpoint (not the node-center midpoint).
  for (const e of edges) {
    const pos = labelPositions.get(e.id);
    if (pos) {
      const d = (e as SubsystemGraphEdge).data as SubsystemGraphEdgeData;
      d.labelX = pos.x;
      d.labelY = pos.y;
    }
    const elkP = elkPathStrings.get(e.id);
    if (elkP) {
      const d = (e as SubsystemGraphEdge).data as SubsystemGraphEdgeData;
      d.elkPath = elkP;
    }
  }

  return { nodes: placedNodes, edges };
}
