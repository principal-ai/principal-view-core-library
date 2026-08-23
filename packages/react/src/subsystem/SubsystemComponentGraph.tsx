/**
 * SubsystemComponentGraph — a clickable, read-only React Flow component graph
 * for a subsystem snapshot.
 *
 * Nodes are positioned with ELK auto-layout (layered, minimized crossings) and
 * colored by package. Only cross-package edges leave a package region. Clicking
 * a component invokes `onSelect`. (Package frames are deferred — nodes are
 * color-coded by package for now.)
 *
 * This is a focused fork of the package's `GraphRenderer` pipeline (same ELK
 * edge routing, delayed fitView, Background/Controls/MiniMap, node/edge type
 * injection, onNodeClick) adapted to the subsystem model — read-only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  useReactFlow,
  useViewport,
  type NodeTypes,
  type EdgeTypes,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
} from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
import { X } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import {
  buildSubsystemGraph,
  KIND_COLOR,
  MECHANISM_COLOR,
  deriveNameFromSymbol,
  type SubsystemComponentEdge,
  type SubsystemComponent,
  type SubsystemEdgeMechanism,
} from './model';
import type { GraphifyComponentDetail } from '../graphify';
import { SubsystemComponentNode, SubsystemEdge, SUBSYSTEM_CALLBACKS } from './nodes';
import { SubsystemFileTree } from './SubsystemFileTree';

const MECHANISM_DESCRIPTIONS: [SubsystemEdgeMechanism, string, boolean][] = [
  ['imports', 'import statement (code-level dependency)', true],
  ['imports_from', 'imported by (reverse dependency)', true],
  ['re_exports', 're-exports symbols from', true],
  ['defines', 'defines / declares symbol', true],
  ['calls', 'function/method call (call graph edge)', true],
  ['extends', 'class inheritance', true],
  ['inherits', 'class inheritance', true],
  ['implements', 'implements interface / protocol', true],
  ['mixes_in', 'applies mixin', true],
  ['uses', 'general dependency (import, call, or reference)', false],
  ['method', 'structural: has method / member', true],
  ['references', 'type / symbol reference (not a call)', true],
  ['contains', 'structural: contains / encapsulates', true],
  ['feeds', 'data flow: output feeds into input', false],
  ['produces', 'data flow: produces / outputs', false],
  ['registers-into', 'registration pattern', false],
];

export interface SubsystemComponentGraphProps {
  components: SubsystemComponent[];
  edges: SubsystemComponentEdge[];
  onSelect?: (componentId: string) => void;
  /** Called when an edge is clicked (relationship / mechanism + refs seam). */
  onEdgeSelect?: (edge: SubsystemComponentEdge) => void;
  /** Upper bound for node width in px; nodes grow with content up to this,
   *  then the name wraps. Defaults to 300 for components (320 for packages). */
  maxNodeWidth?: number;
  /** Show edge labels (mechanism names) on the graph. @default true */
  showEdgeLabels?: boolean;
  /** Subsystem title displayed in the sidebar. */
  title?: string;
  /** Markdown description rendered in the sidebar. */
  description?: string;
  /** Rendered over the graph canvas only (not the title/legend sidebar). */
  canvasOverlay?: ReactNode;
  /** Extra controls at the top of the title/legend sidebar. */
  sidebarExtra?: ReactNode;
  /** Rendered in the sidebar under the description (e.g. selection inspector). */
  sidebarAfterDescription?: ReactNode;
  /**
   * Host-injected reader/renderer for the bottom file drawer, keyed by
   * repo-root-relative path. Opening happens on node click (component with a
   * `file`) and sidebar file-tree click. Keeps this package free of fs and
   * code-view dependencies.
   */
  renderFileViewer?: (file: string) => ReactNode;
  /**
   * Legacy component-keyed variant, kept for backward compatibility. When
   * `renderFileViewer` is absent, drawer content resolves via the first
   * component whose `file` matches the opened path.
   */
  renderFileView?: (component: SubsystemComponent) => ReactNode;
  /**
   * Called when a file in the sidebar file tree is clicked (repo-root-relative
   * path). The tree is derived from the components' `file` values.
   */
  onFileSelect?: (file: string) => void;
}

const nodeTypes: NodeTypes = {
  'subsystem-component': SubsystemComponentNode,
};

const edgeTypes: EdgeTypes = {
  'subsystem-edge': SubsystemEdge,
};

interface InnerProps extends SubsystemComponentGraphProps {
  measured: { w: number; h: number } | null;
}

function Inner({ components, edges, onSelect, onEdgeSelect, measured: _measured, maxNodeWidth, showEdgeLabels, title, description, canvasOverlay, sidebarExtra, sidebarAfterDescription, renderFileView, renderFileViewer, onFileSelect }: InnerProps) {
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const viewport = useViewport();
  const [built, setBuilt] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
  const [layoutReady, setLayoutReady] = useState(false);
  const [selected, setSelected] = useState<SubsystemComponent | null>(null);
  // File currently shown in the bottom drawer (repo-root-relative path).
  const [openFile, setOpenFile] = useState<string | null>(null);
  // Ref mirror of `selected` so the SUBSYSTEM_CALLBACKS click handler (a
  // closure over the effect deps) can toggle without a stale value.
  const selectedRef = useRef<SubsystemComponent | null>(null);
  selectedRef.current = selected;
  // Ref mirror of `openFile` for the tree-click toggle.
  const openFileRef = useRef<string | null>(null);
  openFileRef.current = openFile;

  // Pass 1: build with estimated widths so React Flow can measure the DOM.
  // The pane stays hidden until Pass 2 completes.
  useEffect(() => {
    let alive = true;
    pass2DoneRef.current = false;
    measuredDimsRef.current = new Map();
    prevMeasuredSigRef.current = '';
    void buildSubsystemGraph({ components, edges }, { maxNodeWidth, showEdgeLabels }).then(({ nodes, edges: e }) => {
      if (!alive) return;
      setBuilt({ nodes, edges: e as Edge[] });
      setLayoutReady(false);
    });
    return () => { alive = false; };
  }, [components, edges]);

  // Track measured dimensions from React Flow's dimension changes.
  // These arrive as { type: 'dimensions', id, dimensions } in onNodesChange.
  const measuredDimsRef = useRef(new Map<string, { width: number; height: number }>());
  const pendingMeasuredRef = useRef(false);

  // Pass 2: once every node has a measured dimension, re-run ELK.
  const prevMeasuredSigRef = useRef('');
  const pass2DoneRef = useRef(false);
  const triggerPass2 = useCallback(() => {
    if (pass2DoneRef.current) return;
    const dims = measuredDimsRef.current;
    if (dims.size < built.nodes.length) return;
    const sig = built.nodes.map((n) => `${n.id}:${dims.get(n.id)?.width ?? '?'}`).join(',');
    if (sig.includes('?:')) return;
    if (sig === prevMeasuredSigRef.current) return;
    prevMeasuredSigRef.current = sig;
    pendingMeasuredRef.current = false;
    pass2DoneRef.current = true;

    const measuredWidths = new Map(built.nodes.map((n) => [n.id, dims.get(n.id)!.width]));
    const measuredHeights = new Map(built.nodes.map((n) => [n.id, dims.get(n.id)!.height]));
    let alive = true;
    void buildSubsystemGraph(
      { components, edges },
      { maxNodeWidth, showEdgeLabels, measuredWidths, measuredHeights },
    ).then(({ nodes, edges: e }) => {
      if (!alive) return;
      setBuilt({ nodes, edges: e as Edge[] });
      setLayoutReady(true);
    });
    return () => { alive = false; };
  }, [built.nodes, components, edges, maxNodeWidth, showEdgeLabels]);

  // Node components call SUBSYSTEM_CALLBACKS.onSelect on click (their inner
  // onClick stops React Flow propagation), so wire selection + width through it.
  // Lookup from edge id → the authored SubsystemComponentEdge (for onEdgeSelect).
  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);

  // Shared edge-selection logic used by both React Flow's onEdgeClick and the
  // clickable edge label (SUBSYSTEM_CALLBACKS.onEdgeSelect).
  const selectEdge = useCallback(
    (edgeId: string) => {
      if (selectedEdgeIdRef.current === edgeId) {
        setSelectedEdgeId(null);
        return;
      }
      const src = edgeById.get(edgeId);
      setSelectedEdgeId(edgeId);
      if (src) onEdgeSelect?.(src);
    },
    [edgeById, onEdgeSelect],
  );

  useEffect(() => {
    SUBSYSTEM_CALLBACKS.onSelect = (id: string) => {
      const comp = components.find((c) => c.id === id);
      if (comp) {
        // Clicking the already-selected node unselects it (toggle off).
        if (selectedRef.current?.id === comp.id) {
          setSelected(null);
          setSelectedEdgeId(null);
          setOpenFile(null);
          return;
        }
        setSelected(comp);
        setSelectedEdgeId(null);
        if (comp.file) setOpenFile(comp.file);
        onSelect?.(id);
      }
    };
    SUBSYSTEM_CALLBACKS.onEdgeSelect = selectEdge;
    SUBSYSTEM_CALLBACKS.maxNodeWidth = maxNodeWidth;
    return () => {
      SUBSYSTEM_CALLBACKS.onSelect = undefined;
      SUBSYSTEM_CALLBACKS.onEdgeSelect = undefined;
      SUBSYSTEM_CALLBACKS.maxNodeWidth = undefined;
    };
  }, [components, onSelect, maxNodeWidth, selectEdge]);

  const { nodes, edges: convertedEdges } = built;
  const xyflowNodesBase = nodes as Node[];
  const baseEdges = convertedEdges as Edge[];

  // While a file is open in the drawer, tag each node with whether its
  // component lives in that file — the node renderer spotlights matches and
  // dims non-matches (mirrors the edge-dimming behavior on selection).
  const dispNodes = useMemo(() => {
    if (!openFile) return xyflowNodesBase;
    return xyflowNodesBase.map((n) => {
      const comp = (n.data as { component?: SubsystemComponent } | undefined)?.component;
      return {
        ...n,
        data: { ...(n.data as object), fileMatch: comp?.file === openFile },
      };
    });
  }, [xyflowNodesBase, openFile]);

  const baseNodesKey = useMemo(() => nodes.map((n) => n.id).sort().join(','), [nodes]);
  const baseEdgesKey = useMemo(
    () => convertedEdges.map((e) => e.id).sort().join(','),
    [convertedEdges],
  );

  // When an edge is selected, dim every other edge + its label to focus it.
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Ref mirror so `selectEdge` (a useCallback over early deps) can toggle
  // without a stale closure value.
  const selectedEdgeIdRef = useRef<string | null>(null);
  selectedEdgeIdRef.current = selectedEdgeId;
  const dispEdges = useMemo(() => {
    if (!selectedEdgeId) return baseEdges;
    return baseEdges.map((e) => ({
      ...e,
      data: {
        ...(e.data as object),
        dimmed: e.id !== selectedEdgeId,
      },
    }));
  }, [baseEdges, selectedEdgeId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Capture dimension changes (React Flow's measurement callback).
      for (const ch of changes) {
        if (ch.type === 'dimensions' && ch.dimensions) {
          measuredDimsRef.current.set(ch.id, ch.dimensions);
          pendingMeasuredRef.current = true;
        }
      }
      const result = applyNodeChanges(changes, dispNodes);
      // After applying changes, check if we should trigger pass 2.
      if (pendingMeasuredRef.current) {
        // Use microtask so the state update from applyNodeChanges commits first.
        queueMicrotask(() => triggerPass2());
      }
      return result;
    },
    [dispNodes, triggerPass2],
  );
  const onEdgesChange = useCallback(
    (_changes: EdgeChange[]) => dispEdges,
    [dispEdges],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      fitView({ padding: 0.1, includeHiddenNodes: false, minZoom: 0.05, maxZoom: 2, duration: 200 });
    }, 200);
    return () => clearTimeout(t);
  }, [baseNodesKey, baseEdgesKey, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node: Node) => {
      const comp = (node.data as { component?: SubsystemComponent } | undefined)?.component;
      setSelectedEdgeId(null);
      if (node.type === 'subsystem-component' && comp) {
        // Clicking the already-selected node unselects it (toggle off).
        if (selected?.id === comp.id) {
          setSelected(null);
          setOpenFile(null);
          return;
        }
        setSelected(comp);
        if (comp.file) setOpenFile(comp.file);
        if (comp.id) onSelect?.(comp.id);
      }
    },
    [onSelect, selected],
  );

  // React Flow's edge click → the same shared selection logic as the label.
  const onEdgeClick = useCallback(
    (_e: ReactMouseEvent, edge: Edge) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setSelectedEdgeId(null);
    setOpenFile(null);
  }, []);

  // Sidebar file-tree click → toggle in the bottom drawer (+ host hook only
  // when opening, so hosts don't see close events).
  const onTreeSelectFile = useCallback(
    (file: string) => {
      if (openFileRef.current === file) {
        setOpenFile(null);
        return;
      }
      setOpenFile(file);
      onFileSelect?.(file);
    },
    [onFileSelect],
  );

  // Edge label data for the overlay (rendered OUTSIDE ReactFlow so the pane
  // doesn't intercept pointer events). Uses ELK-computed label midpoints from
  // the actual edge path (not node-center approximations).
  const edgeLabels = useMemo(() => {
    return dispEdges.map((e) => {
      const d = e.data as { mechanism?: string; dimmed?: boolean; labelX?: number; labelY?: number } | undefined;
      return {
        id: e.id,
        mechanism: d?.mechanism ?? 'imports',
        dimmed: d?.dimmed === true,
        midX: d?.labelX ?? 0,
        midY: d?.labelY ?? 0,
      };
    });
  }, [dispEdges]);

  const usedMechanisms = useMemo(() => {
    return new Set(edgeLabels.map((l) => l.mechanism));
  }, [edgeLabels]);

  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

  // Unique source files across components → sidebar file tree.
  const files = useMemo(
    () => Array.from(new Set(components.map((c) => c.file).filter(Boolean))).sort(),
    [components],
  );

  // Drawer content renderer: prefer the path-keyed viewer; fall back to the
  // legacy component-keyed one via a file → first-component lookup.
  const fileViewer = useMemo(() => {
    if (renderFileViewer) return renderFileViewer;
    if (renderFileView) {
      const byFile = new Map(
        components.filter((c) => c.file).map((c) => [c.file, c] as const),
      );
      return (file: string) => {
        const comp = byFile.get(file);
        return comp ? renderFileView(comp) : null;
      };
    }
    return undefined;
  }, [renderFileViewer, renderFileView, components]);

  return (
    <div style={{ visibility: layoutReady ? 'visible' : 'hidden', width: '100%', height: '100%', display: 'flex', flexDirection: 'row' }}>
      {/* Sidebar: scrollable title/description/legend on top, file tree pinned to the bottom half */}
      {(title || description || usedMechanisms.size > 0 || sidebarExtra || sidebarAfterDescription || files.length > 0) && (
        <div
          style={{
            width: 340,
            minWidth: 340,
            borderRight: `1px solid ${theme.colors.border}`,
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
          {sidebarExtra}
          {title && (
            <h2
              style={{
                margin: 0,
                fontSize: theme.fontSizes[2],
                fontWeight: 600,
                color: theme.colors.text,
                fontFamily: theme.fonts.heading,
              }}
            >
              {title}
            </h2>
          )}
          {description && (
            <div style={{ fontSize: theme.fontSizes[0], lineHeight: 1.5 }}>
              <IndustryMarkdownSlide
                content={description}
                slideIdPrefix="subsystem-desc"
                slideIndex={0}
                isVisible={true}
                theme={theme}
                disableScroll={true}
                fontSizeScale={0.9}
                enableKeyboardScrolling={false}
                autoFocusOnVisible={false}
              />
            </div>
          )}
          {sidebarAfterDescription}
          {usedMechanisms.size > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: theme.fontSizes[0] * 0.8, fontFamily: theme.fonts.monospace, textTransform: 'uppercase', color: muted, fontWeight: 600 }}>
                Edge Legend
              </span>
              {MECHANISM_DESCRIPTIONS.filter(([m]) => usedMechanisms.has(m)).map(([mechanism, desc, verifiable]) => (
                <div key={mechanism} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: theme.fontSizes[0] }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: verifiable ? '50%' : '30% 70% 70% 30% / 30% 30% 70% 70%',
                      background: MECHANISM_COLOR[mechanism],
                      border: verifiable ? 'none' : `1px dashed ${MECHANISM_COLOR[mechanism]}`,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontFamily: theme.fonts.monospace, color: MECHANISM_COLOR[mechanism], fontWeight: 500 }}>{mechanism}</span>
                  <span style={{ color: muted }}>{desc}</span>
                </div>
              ))}
            </div>
          )}
          </div>
          {files.length > 0 && (
            <SubsystemFileTree
              files={files}
              selectedFile={selected?.file ?? openFile}
              onSelectFile={onTreeSelectFile}
            />
          )}
        </div>
      )}
      
      {/* Graph area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Edge-label overlay — sits above the ReactFlow pane so clicks land. */}
        {showEdgeLabels !== false && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {edgeLabels.map((lbl) => {
            const mechanism = lbl.mechanism as SubsystemEdgeMechanism;
            const color = MECHANISM_COLOR[mechanism] ?? '#888';
            const verifiable = MECHANISM_DESCRIPTIONS.find(([m]) => m === mechanism)?.[2] ?? true;
            const screenX = lbl.midX * viewport.zoom + viewport.x;
            const screenY = lbl.midY * viewport.zoom + viewport.y;
            return (
              <div
                key={lbl.id}
              data-edge-label={lbl.id}
              title={verifiable ? undefined : 'Not directly verifiable with graphify'}
              onClick={(e) => {
                e.stopPropagation();
                selectEdge(lbl.id);
              }}
              style={{
                position: 'absolute',
                left: screenX,
                top: screenY,
                fontSize: 10,
                fontFamily: theme.fonts.monospace,
                fontWeight: 500,
                color,
                background: 'rgba(21,21,21,0.9)',
                border: verifiable ? `0.5px solid ${color}` : `1px dashed ${color}`,
                borderRadius: verifiable ? 4 : '10px 14px 12px 16px / 14px 10px 16px 12px',
                padding: '1px 5px',
                cursor: 'pointer',
                pointerEvents: 'auto',
                opacity: lbl.dimmed ? 0.15 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {lbl.mechanism}
            </div>
          );
        })}
      </div>
      )}
      <ReactFlow
        key={`${baseNodesKey}-${baseEdgesKey}`}
        nodes={dispNodes}
        edges={dispEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.05}
        maxZoom={4}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        onPaneClick={onPaneClick}
        panOnDrag
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        style={{
          width: '100%',
          height: '100%',
          flex: 1,
          minHeight: 0,
          background: theme.colors.background,
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showZoom showFitView showInteractive />
      </ReactFlow>
      {selected && <ComponentDetail component={selected} />}
      <FileDrawer file={openFile} onClose={() => setOpenFile(null)}>
        {fileViewer && openFile ? fileViewer(openFile) : null}
      </FileDrawer>
      {canvasOverlay}
      </div>
    </div>
  );
}

/** Detail panel for the selected component — the verifiable identity + sources
 *  moved off the canvas so nodes stay minimal. File content lives in the
 *  bottom FileDrawer, not here. */
function ComponentDetail({ component }: { component: SubsystemComponent }) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const color = KIND_COLOR[component.kind] ?? '#888';
  const displayName = deriveNameFromSymbol(component.symbol, component.kind, component.name, component.file);
  const rows: Array<[string, string]> = [];
  if (component.symbol) rows.push(['Symbol', component.symbol]);
  if (component.file) rows.push(['File', component.file]);
  if (component.purpose) rows.push(['Purpose', component.purpose]);
  rows.push(['PURL', component.purl]);

  return (
    <div
      style={{
        borderTop: `1px solid ${theme.colors.border}`,
        background: theme.colors.background,
        padding: '10px 12px',
        fontFamily: theme.fonts.body,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: theme.fontSizes[1],
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        <span style={{ color }}>{displayName}</span>
        <span
          style={{
            fontSize: theme.fontSizes[0] * 0.8,
            fontFamily: theme.fonts.monospace,
            textTransform: 'uppercase',
            color,
          }}
        >
          {component.kind}
        </span>
      </div>
      {rows.map(([k, v]) => (
        <div
          key={k}
          style={{ display: 'flex', gap: 8, fontSize: theme.fontSizes[0], lineHeight: 1.5 }}
        >
          <span
            style={{
              width: 64,
              flexShrink: 0,
              color: muted,
              fontFamily: theme.fonts.monospace,
              textTransform: 'uppercase',
              fontSize: theme.fontSizes[0] * 0.8,
            }}
          >
            {k}
          </span>
          <span style={{ color: theme.colors.text, fontFamily: theme.fonts.monospace }}>
            {v}
          </span>
        </div>
      ))}
      {component.detail && <GraphifyDetailSections detail={component.detail} />}
    </div>
  );
}

/** Bottom drawer that slides up over the graph canvas to show a file's
 *  contents — opened by node clicks and sidebar file-tree clicks alike.
 *  Stays mounted (translated off-screen) so open/close animates. */
function FileDrawer({
  file,
  onClose,
  children,
}: {
  file: string | null;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const open = file !== null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '45%',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        borderTop: `1px solid ${theme.colors.border}`,
        borderRadius: '8px 8px 0 0',
        background: theme.colors.background,
        boxShadow: '0 -8px 24px rgba(0,0,0,0.35)',
        transform: open ? 'translateY(0)' : 'translateY(102%)',
        transition: 'transform 200ms ease',
        pointerEvents: open ? 'auto' : 'none',
        visibility: open ? 'visible' : 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          borderBottom: `1px solid ${theme.colors.border}`,
          flexShrink: 0,
        }}
      >
        <span
          title={file ?? undefined}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: theme.fonts.monospace,
            fontSize: theme.fontSizes[0],
            color: muted,
          }}
        >
          {file}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close file"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            padding: 0,
            border: 'none',
            borderRadius: 4,
            background: 'transparent',
            color: theme.colors.text,
            cursor: 'pointer',
          }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{children}</div>
    </div>
  );
}

/** Renders the graphify drill-down payload for a component. */
function GraphifyDetailSections({ detail }: { detail: GraphifyComponentDetail }) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

  const label = (k: string) => (
    <span
      style={{
        width: 64,
        flexShrink: 0,
        color: muted,
        fontFamily: theme.fonts.monospace,
        textTransform: 'uppercase',
        fontSize: theme.fontSizes[0] * 0.8,
      }}
    >
      {k}
    </span>
  );
  const chip = (name: string, meta?: string, key?: string | number) => (
    <span
      key={key}
      style={{
        fontFamily: theme.fonts.monospace,
        fontSize: theme.fontSizes[0],
        color: theme.colors.text,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 4,
        padding: '1px 6px',
        marginRight: 6,
        marginBottom: 4,
        display: 'inline-block',
      }}
    >
      {name}
      {meta ? <span style={{ color: muted }}> {meta}</span> : ''}
    </span>
  );
  const row = (k: string, children: ReactNode) => (
    <div
      style={{ display: 'flex', gap: 8, fontSize: theme.fontSizes[0], lineHeight: 1.5, marginBottom: 4 }}
    >
      {label(k)}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );

  switch (detail.kind) {
    case 'class':
      return (
        <>
          {detail.methods.length > 0 &&
            row('methods', detail.methods.map((m, i) => chip(m.name, m.returnType, i)))}
          {detail.properties.length > 0 &&
            row('props', detail.properties.map((p, i) => chip(p.name, p.type, i)))}
          {detail.extends.length > 0 && row('extends', detail.extends.map((e, i) => chip(e, undefined, i)))}
          {detail.implements.length > 0 && row('impl', detail.implements.map((e, i) => chip(e, undefined, i)))}
          {detail.instantiations.length > 0 &&
            row('insts', detail.instantiations.map((i, idx) => chip(i.name, undefined, idx)))}
          {detail.references.length > 0 &&
            row('refs', detail.references.map((r, idx) => chip(r.name, undefined, idx)))}
        </>
      );
    case 'function':
      return (
        <>
          {detail.parameters.length > 0 &&
            row('params', detail.parameters.map((p, i) => chip(p.type, undefined, i)))}
          {detail.returnType && row('return', <span>{detail.returnType}</span>)}
          {detail.callers.length > 0 &&
            row('callers', detail.callers.map((c, i) => chip(c.name, undefined, i)))}
          {detail.callees.length > 0 &&
            row('callees', detail.callees.map((c, i) => chip(c.name, undefined, i)))}
        </>
      );
    case 'type':
      return (
        <>
          {detail.properties.length > 0 &&
            row('props', detail.properties.map((p, i) => chip(p.name, p.type, i)))}
          {detail.usedBy.length > 0 &&
            row('used by', detail.usedBy.map((u, i) => chip(u.name, undefined, i)))}
          {detail.implementors.length > 0 &&
            row('impl', detail.implementors.map((e, i) => chip(e, undefined, i)))}
        </>
      );
    case 'module':
      return (
        <>
          {detail.exports.length > 0 &&
            row('exports', detail.exports.map((e, i) => chip(e, undefined, i)))}
          {detail.imports.length > 0 &&
            row('imports', detail.imports.map((i, idx) => chip(i.name, undefined, idx)))}
          {detail.symbols.length > 0 &&
            row('symbols', detail.symbols.map((s, i) => chip(s, undefined, i)))}
        </>
      );
    case 'external':
      return row('source', <span>{detail.label}</span>);
  }
}

export function SubsystemComponentGraph(props: SubsystemComponentGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Measure the container so React Flow always has a real, non-zero pixel size
  // (responsive to the parent; avoids the %→0 blank canvas).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ReactFlowProvider>
          <Inner {...props} measured={size} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
