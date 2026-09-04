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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Map as MapIcon } from 'lucide-react';
import { IndustryMarkdownSlide } from 'themed-markdown';
import {
  buildSubsystemGraph,
  MECHANISM_COLOR,
  subsystemGraphLayoutKey,
  type SubsystemComponentEdge,
  type SubsystemComponent,
  type SubsystemEdgeMechanism,
} from './model';
import type { SubsystemOpenFileOptions } from './declarationRef';
import { SubsystemComponentNode, SubsystemEdge, SUBSYSTEM_CALLBACKS } from './nodes';
import { SubsystemFileTree } from './SubsystemFileTree';
import { GraphLayoutCover } from './GraphLayoutCover';
import { ComponentDeclaration } from './ComponentDeclaration';
import type { ComponentVerificationState } from './ComponentDeclaration';
import { FileDrawer } from './FileDrawer';
import { EdgeLegendModal, MECHANISM_DESCRIPTIONS } from './EdgeLegendModal';
import { buildRepoGroups, repoAvatarUrl, type RepoGroup } from './paths';

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
  renderFileViewer?: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
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
  /** Verify the selected component against graphify (declaration panel). */
  onVerifyComponent?: (componentId: string) => void;
  /** Live verification status for the selected component. */
  componentVerification?: ComponentVerificationState | null;
}

const nodeTypes: NodeTypes = {
  'subsystem-component': SubsystemComponentNode,
};

const edgeTypes: EdgeTypes = {
  'subsystem-edge': SubsystemEdge,
};

// Memoized drawer body: only rebuilds children when the open file changes.
// Inner re-renders on every viewport pan/zoom and hover; recreating host
// elements then would churn their readFile closures and flash the file
// viewer's loading state on each render.
const DrawerContent = memo(function DrawerContent({
  render,
  file,
  startLine,
}: {
  render: (file: string, opts?: SubsystemOpenFileOptions) => ReactNode;
  file: string | null;
  startLine?: number;
}) {
  if (!file) return null;
  return <>{render(file, startLine != null ? { startLine } : undefined)}</>;
});

interface InnerProps extends SubsystemComponentGraphProps {
  measured: { w: number; h: number } | null;
}

function Inner({ components, edges, onSelect, onEdgeSelect, measured: _measured, maxNodeWidth, showEdgeLabels, title, description, canvasOverlay, sidebarExtra, sidebarAfterDescription, renderFileView, renderFileViewer, onFileSelect, onVerifyComponent, componentVerification }: InnerProps) {
  const { theme } = useTheme();
  const { fitView } = useReactFlow();
  const viewport = useViewport();
  const [built, setBuilt] = useState<{ nodes: Node[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  });
  const [layoutReady, setLayoutReady] = useState(false);
  const [selected, setSelected] = useState<SubsystemComponent | null>(null);
  /** File shown in the bottom drawer + optional declaration scroll target. */
  const [openFileTarget, setOpenFileTarget] = useState<{
    file: string;
    startLine?: number;
  } | null>(null);
  const openFile = openFileTarget?.file ?? null;
  const openFileStartLine = openFileTarget?.startLine;
  // Edge-legend modal visibility (opened from the canvas's top-left button).
  const [legendOpen, setLegendOpen] = useState(false);
  // Component the pointer is over (null on leave) → transient tree highlight.
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);
  // Ref mirror of `selected` so the SUBSYSTEM_CALLBACKS click handler (a
  // closure over the effect deps) can toggle without a stale value.
  const selectedRef = useRef<SubsystemComponent | null>(null);
  selectedRef.current = selected;
  // Ref mirror of `openFile` for the tree-click toggle.
  const openFileRef = useRef<{ file: string; startLine?: number } | null>(null);
  openFileRef.current = openFileTarget;

  // Refresh selected component when the components list updates (e.g. verify
  // writes back declarationRef).
  useEffect(() => {
    if (!selected) return;
    const fresh = components.find((c) => c.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [components, selected]);

  // Pass 1: build with estimated widths so React Flow can measure the DOM.
  // The pane stays hidden until Pass 2 completes. Key off layout-affecting
  // fields only — declarationRef updates after verify must not re-run ELK.
  const layoutKey = useMemo(
    () => subsystemGraphLayoutKey({ components, edges }),
    [components, edges],
  );
  const componentsRef = useRef(components);
  const edgesRef = useRef(edges);
  componentsRef.current = components;
  edgesRef.current = edges;

  useEffect(() => {
    let alive = true;
    pass2DoneRef.current = false;
    measuredDimsRef.current = new Map();
    prevMeasuredSigRef.current = '';
    const doc = { components: componentsRef.current, edges: edgesRef.current };
    void buildSubsystemGraph(doc, { maxNodeWidth, showEdgeLabels })
      .then(({ nodes, edges: e }) => {
        if (!alive) return;
        setBuilt({ nodes, edges: e as Edge[] });
        setLayoutReady(false);
      })
      .catch((err) => {
        console.warn('[subsystem-graph] initial layout failed:', err);
        if (!alive) return;
        // Reveal the cover even on failure so the UI is not stuck forever.
        setBuilt({ nodes: [], edges: [] });
        setLayoutReady(true);
      });
    return () => { alive = false; };
  }, [layoutKey, maxNodeWidth, showEdgeLabels]);

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
        // Selection is independent of the file drawer — nodes never open it.
        if (selectedRef.current?.id === comp.id) {
          setSelected(null);
          setSelectedEdgeId(null);
          return;
        }
        setSelected(comp);
        setSelectedEdgeId(null);
        onSelect?.(id);
      }
    };
    SUBSYSTEM_CALLBACKS.onEdgeSelect = selectEdge;
    SUBSYSTEM_CALLBACKS.maxNodeWidth = maxNodeWidth;
    SUBSYSTEM_CALLBACKS.onHover = setHoveredComponentId;
    return () => {
      SUBSYSTEM_CALLBACKS.onSelect = undefined;
      SUBSYSTEM_CALLBACKS.onEdgeSelect = undefined;
      SUBSYSTEM_CALLBACKS.maxNodeWidth = undefined;
      SUBSYSTEM_CALLBACKS.onHover = undefined;
    };
  }, [components, onSelect, maxNodeWidth, selectEdge]);

  const { nodes, edges: convertedEdges } = built;
  const xyflowNodesBase = nodes as Node[];
  const baseEdges = convertedEdges as Edge[];

  // While a file is open in the drawer, tag each node with whether its
  // component lives in that file — the node renderer spotlights matches and
  // dims non-matches (mirrors the edge-dimming behavior on selection).
  // `isSelected` rides in data because the node's stopPropagation() keeps
  // React Flow's own selection state from ever updating.
  const dispNodes = useMemo(() => {
    return xyflowNodesBase.map((n) => {
      const comp = (n.data as { component?: SubsystemComponent } | undefined)?.component;
      const fileMatch = openFile ? comp?.file === openFile : undefined;
      const isSelected = selected?.id !== undefined && comp?.id === selected.id;
      if (fileMatch === undefined && !isSelected) {
        const { fileMatch: _f, isSelected: _s, ...rest } = n.data as Record<string, unknown>;
        return { ...n, data: rest };
      }
      return {
        ...n,
        data: { ...(n.data as object), ...(fileMatch !== undefined && { fileMatch }), ...(isSelected && { isSelected }) },
      };
    });
  }, [xyflowNodesBase, openFile, selected]);

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

  // When the file drawer opens or closes the canvas is resized but the
  // camera stays put — no refit/zoom. Spotlight + dimming already convey
  // which nodes belong to the open file.
  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node: Node) => {
      const comp = (node.data as { component?: SubsystemComponent } | undefined)?.component;
      setSelectedEdgeId(null);
      if (node.type === 'subsystem-component' && comp) {
        // Clicking the already-selected node unselects it (toggle off).
        // Selection is independent of the file drawer — nodes never open it.
        if (selected?.id === comp.id) {
          setSelected(null);
          return;
        }
        setSelected(comp);
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
  }, []);

  // Sidebar file trees — one per repo on multi-repo graphs, each under its
  // own owner-avatar header. Clicking a header collapses that repo's tree.
  const repoGroups = useMemo(() => buildRepoGroups(components), [components]);
  const [collapsedRepos, setCollapsedRepos] = useState<Set<string>>(new Set());
  const toggleRepoCollapsed = useCallback((key: string) => {
    setCollapsedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const treeFiles = useMemo(
    () => repoGroups.groups.flatMap((g) => g.entries.map((e) => e.file)),
    [repoGroups],
  );
  const onTreeSelectFile = useCallback(
    (file: string) => {
      if (openFileRef.current?.file === file && openFileRef.current.startLine == null) {
        setOpenFileTarget(null);
        return;
      }
      setOpenFileTarget({ file });
      onFileSelect?.(file);
    },
    [onFileSelect],
  );

  const onOpenDeclarationFile = useCallback(
    (file: string, opts?: SubsystemOpenFileOptions) => {
      const startLine = opts?.startLine;
      if (
        openFileRef.current?.file === file &&
        openFileRef.current.startLine === startLine
      ) {
        setOpenFileTarget(null);
        return;
      }
      setOpenFileTarget({ file, startLine });
      onFileSelect?.(file);
    },
    [onFileSelect],
  );

  // Filename-badge clicks on nodes open the drawer through the same path as
  // the declaration panel's file link (toggle + tree sync, no start line).
  useEffect(() => {
    SUBSYSTEM_CALLBACKS.onOpenFile = (componentId: string) => {
      const comp = components.find((c) => c.id === componentId);
      if (comp?.file) onOpenDeclarationFile(comp.file);
    };
    return () => {
      SUBSYSTEM_CALLBACKS.onOpenFile = undefined;
    };
  }, [components, onOpenDeclarationFile]);

  // Detail-panel links: related-name clicks select the matching component —
  // resolved by id, name, or symbol (call labels may carry a trailing `()`).
  const resolveRelatedComponent = useCallback(
    (ref: string) => {
      const clean = ref.replace(/\(\)$/, '');
      const comp = components.find(
        (c) =>
          c.id === clean ||
          c.name === clean ||
          c.symbol === clean ||
          c.symbol?.replace(/\(\)$/, '') === clean,
      );
      if (!comp || comp.id === selectedRef.current?.id) return;
      setSelected(comp);
      setSelectedEdgeId(null);
      onSelect?.(comp.id);
    },
    [components, onSelect],
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

  // Unique source files across components → sidebar file trees.
  const treeFilePaths = treeFiles;

  // The hovered node's file (null when not hovering / file-less component).
  const hoveredFile = useMemo(() => {
    if (!hoveredComponentId) return null;
    return components.find((c) => c.id === hoveredComponentId)?.file ?? null;
  }, [components, hoveredComponentId]);

  // Drawer content renderer: prefer the path-keyed viewer; fall back to the
  // legacy component-keyed one via a file → first-component lookup.
  const fileViewer = useMemo(() => {
    if (renderFileViewer) return renderFileViewer;
    if (renderFileView) {
      const byFile = new Map(
        components.filter((c) => c.file).map((c) => [c.file, c] as const),
      );
      return (file: string, _opts?: SubsystemOpenFileOptions) => {
        const comp = byFile.get(file);
        return comp ? renderFileView(comp) : null;
      };
    }
    return renderFileViewer;
  }, [renderFileViewer, renderFileView, components]);

  const fileViewerRef = useRef(fileViewer);
  fileViewerRef.current = fileViewer;
  const renderDrawerContent = useCallback(
    (file: string, opts?: SubsystemOpenFileOptions) =>
      fileViewerRef.current?.(file, opts) ?? null,
    [],
  );

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'row' }}>
      {/* Sidebar: scrollable title/description on top, file tree pinned to the bottom half */}
      {(title || description || sidebarExtra || sidebarAfterDescription || treeFilePaths.length > 0) && (
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
          </div>
          {treeFilePaths.length > 0 && (
            <div
              style={{
                height: '50%',
                minHeight: 160,
                flexShrink: 0,
                borderTop: `1px solid ${theme.colors.border}`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {repoGroups.groups.map((group, i) => {
                const groupKey = group.repoKey ?? '__no-repo__';
                const collapsed = collapsedRepos.has(groupKey);
                return (
                  <div
                    key={groupKey}
                    style={{
                      flex: collapsed ? '0 0 auto' : 1,
                      minHeight: collapsed ? 0 : undefined,
                      display: 'flex',
                      flexDirection: 'column',
                      borderTop: i > 0 ? `1px solid ${theme.colors.border}` : undefined,
                    }}
                  >
                    {repoGroups.multiRepo && (
                      <RepoGroupHeader
                        group={group}
                        collapsed={collapsed}
                        onToggle={() => toggleRepoCollapsed(groupKey)}
                      />
                    )}
                    {!collapsed && (
                      <SubsystemFileTree
                        files={group.entries.map((e) => e.displayPath)}
                        selectedFile={selected?.file ?? openFile}
                        hoveredFile={hoveredFile}
                        onSelectFile={onTreeSelectFile}
                        headerless={repoGroups.multiRepo}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Graph area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Canvas box — the edge-label overlay and legend anchor here, so
            overlays shift with the canvas, not the labels. */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
      {/* Legend button — top-left overlay on the canvas; opens the modal. */}
      {usedMechanisms.size > 0 && (
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            zIndex: 7,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            fontSize: theme.fontSizes[0],
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
            background: theme.colors.backgroundSecondary ?? theme.colors.background,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 6,
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          }}
        >
          <MapIcon size={13} />
          Legend
        </button>
      )}
        {/* Selected-component declaration — floating card over the canvas
            (top-right, clear of the top-left legend button). The graph never
            moves for it. */}
        {selected && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: 8,
              width: 'min(560px, 70%)',
              maxHeight: '46%',
              overflowY: 'auto',
              background: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            <ComponentDeclaration
              component={selected}
              onOpenFile={onOpenDeclarationFile}
              onRelatedSelect={resolveRelatedComponent}
              onVerify={onVerifyComponent}
              verification={componentVerification}
            />
          </div>
        )}
        </div>
        <EdgeLegendModal
          open={legendOpen}
          mechanisms={usedMechanisms}
          onClose={() => setLegendOpen(false)}
        />
      <FileDrawer file={openFile} onClose={() => setOpenFileTarget(null)}>
        <DrawerContent
          render={renderDrawerContent}
          file={openFile}
          startLine={openFileStartLine}
        />
      </FileDrawer>
      {/* Startup cover — hides measurement, layout swap, and camera settle. */}
      <GraphLayoutCover revealed={layoutReady} />
      {canvasOverlay}
      </div>
    </div>
  );
}

/** Sidebar header for one repo's tree: owner avatar + repo name + file count.
 *  Clicking toggles the tree's visibility. */
function RepoGroupHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: RepoGroup;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const avatar = repoAvatarUrl(group.repoKey);
  const label = group.repo ?? 'No repo';
  return (
    <div
      role="button"
      aria-expanded={!collapsed}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={collapsed ? 'Show files' : 'Hide files'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px 4px',
        flexShrink: 0,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {avatar ? (
        <img
          src={avatar}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          style={{ borderRadius: 4, flexShrink: 0, background: theme.colors.border }}
        />
      ) : group.owner ? (
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            fontFamily: theme.fonts.monospace,
            color: theme.colors.text,
            background: theme.colors.border,
          }}
        >
          {group.owner.charAt(0).toUpperCase()}
        </span>
      ) : null}
      <span
        style={{
          fontSize: theme.fontSizes[1],
          fontFamily: theme.fonts.monospace,
          color: theme.colors.text,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
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
