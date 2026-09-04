/**
 * Subsystem component/group node + edge renderers.
 *
 * Lightweight, purpose-built for the subsystem component graph: a component
 * renders its name (kind-tagged, colored by package) plus its symbol/purpose.
 * Groups render as package containers. Clicking
 * a component calls `onSelect` (to open the entry point / file).
 */

import { useState } from 'react';
import {
  Handle,
  Position,
  type NodeProps,
  type EdgeProps,
} from '@xyflow/react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  MECHANISM_COLOR,
  MECHANISM_STYLE,
  ROLE_LABEL,
  deriveNameFromSymbol,
  type SubsystemGraphNode,
  type SubsystemGraphEdge,
} from './model';
import { constructColorsFromPierreTheme } from '../pierre/constructColors';
import { resolvePierreSyntaxThemeName } from '../pierre/pierreSyntaxTheme';

export const CONSTRUCT_LABEL: Record<string, string> = {
  class: 'class',
  function: 'function',
  method: 'method',
  type: 'type',
  module: 'module',
  store: 'store',
  external: 'external',
};

/** Insert zero-width spaces at identifier word boundaries so long names wrap
 *  on naming conventions (snake_case `foo_`|`bar`, camelCase `foo`|`Bar`,
 *  PascalCase `Foo`|`Bar`, acronym `ABC`|`Def`) instead of mid-character. */
function breakWords(s: string): string {
  const zwsp = '\u200b';
  return s
    // camelCase: lower/digit → Upper  (and the boundary before it holds)
    .replace(/([a-z0-9])([A-Z])/g, `$1${zwsp}$2`)
    // acronym → word: `ABC`|`Def` (two Uppercase then a lowercase)
    .replace(/([A-Z])([A-Z][a-z])/g, `$1${zwsp}$2`)
    // separators: break after `_`, `-`, `.`
    .replace(/([_\-.])([^_\-.\u200b])/g, `$1${zwsp}$2`);
}

export interface SubsystemGraphCallbacks {
  /** Click a component — open its file/entry point. */
  onSelect?: (componentId: string) => void;
  /** Click an edge (or its label) — select the relationship. */
  onEdgeSelect?: (edgeId: string) => void;
  /** Hover a component (null on leave) — associates it with the file tree. */
  onHover?: (componentId: string | null) => void;
  /** Upper bound for node width; nodes grow with content up to this, then wrap. */
  maxNodeWidth?: number;
}

/** Root callbacks carried through node data (injected by the graph component). */
export const SUBSYSTEM_CALLBACKS: SubsystemGraphCallbacks = {};

export function SubsystemComponentNode(props: NodeProps<SubsystemGraphNode>) {
  const { theme, mode } = useTheme();
  const { data, selected, width: nodeWidth, height: nodeHeight } = props;
  const c = data.component;
  // Construct owns node color, derived from the active Pierre syntax theme —
  // the same palette the declaration panel and file drawer render with. Role
  // shows as the hover badge, not as color — for now; a role glyph/accent may
  // come later.
  const color = constructColorsFromPierreTheme(resolvePierreSyntaxThemeName(mode))[c.construct];
  const [hover, setHover] = useState(false);
  const configuredMax = SUBSYSTEM_CALLBACKS.maxNodeWidth;
  const maxWidth = configuredMax ?? 300;
  // `symbol` is the source of truth; `name` is derived from it consistently.
  const displayName = deriveNameFromSymbol(c.symbol, c.construct, c.name, c.file);
  // Set while a file is open in the drawer: true → spotlight, false → dim,
  // absent (no file open) → neutral.
  const fileMatch = data.fileMatch as boolean | undefined;
  // Selection is stamped into data by the graph component — React Flow's own
  // `selected` never updates because the node stops click propagation.
  const isSelected = selected || (data.isSelected as boolean | undefined) === true;

  return (
    <div
      onMouseEnter={() => {
        setHover(true);
        SUBSYSTEM_CALLBACKS.onHover?.(c.id);
      }}
      onMouseLeave={() => {
        setHover(false);
        SUBSYSTEM_CALLBACKS.onHover?.(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        SUBSYSTEM_CALLBACKS.onSelect?.(c.id);
      }}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box',
        width: nodeWidth,
        height: nodeHeight,
        minWidth: 150,
        maxWidth,
        padding: '6px 10px',
        borderRadius: 8,
        background: theme.colors.backgroundSecondary ?? theme.colors.background,
        // Selected / file-matched nodes get a thicker border; kind colors are
        // kept for selection (thickness only). The file-open spotlight keeps
        // its primary tint.
        border: `${isSelected || fileMatch ? 4 : 2}px solid ${fileMatch ? theme.colors.primary : color}`,
        boxShadow: fileMatch
          ? `0 1px 4px rgba(0,0,0,0.25), 0 0 12px ${theme.colors.primary}55`
          : '0 1px 4px rgba(0,0,0,0.25)',
        opacity: fileMatch === false ? 0.18 : 1,
        transition: 'opacity 150ms ease',
        cursor: 'pointer',
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Kind + package tooltip, shown at the top on hover */}
      {hover && (
        <div
          style={{
            position: 'absolute',
            top: -26,
            left: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            fontSize: theme.fontSizes[0] * 0.8,
            fontFamily: theme.fonts.monospace,
            letterSpacing: 0.5,
            color,
            background: theme.colors.background,
            border: `1px solid ${theme.colors.border}`,
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          <span style={{ textTransform: 'uppercase' }}>
            {c.role ? `${ROLE_LABEL[c.role]} · ` : ''}
            {CONSTRUCT_LABEL[c.construct] ?? c.construct}
          </span>
          {c.file ? ` · ${c.file.split('/').pop()}` : ''}
          {c.capture && c.capture !== 'edited' ? ` · ${c.capture}` : ''}
        </div>
      )}

      {/* Purpose is no longer shown as a hover tooltip below the node — it
          lives in the declaration panel and the graphify detail payload. */}

      <div
        style={{
          fontSize: theme.fontSizes[2],
          fontWeight: 600,
          color: theme.colors.text,
          lineHeight: 1.2,
          textAlign: 'center',
          // Let long names wrap within the node's capped width (instead of
          // truncating), but cap each line so the node doesn't grow unbounded.
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          maxWidth: '100%',
          fontFamily: theme.fonts.body,
        }}
      >
        {breakWords(displayName)}
      </div>

      {/* Hide the identity line when the symbol is just the title without the
          executable `()` decoration — only show it when it adds information
          (e.g. the dotted host on methods, or a different code identity). */}
      {c.symbol && c.symbol !== displayName && `${c.symbol}()` !== displayName && (
        <div
          style={{
            fontSize: theme.fontSizes[0] * 0.82,
            fontFamily: theme.fonts.monospace,
            color: color,
            marginTop: 1,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%',
          }}
          title={c.symbol}
        >
          {c.symbol}
        </div>
      )}

      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

/** Subsystem edge — SVG path only. The mechanism label is rendered as an
 *  absolutely-positioned HTML overlay OUTSIDE the ReactFlow tree (by the
 *  parent Inner component) so it sits above the pane and receives pointer
 *  events. */
export function SubsystemEdge({
  data,
  markerEnd,
}: EdgeProps<SubsystemGraphEdge>) {
  const path = data?.elkPath ?? '';
  const mechanism = data?.mechanism ?? 'imports';
  const color = MECHANISM_COLOR[mechanism] ?? '#888';
  // Dash style comes from the mechanism table (dashed = inverted-control or
  // observational relationships: hierarchy, registration, watches).
  const isDashed = MECHANISM_STYLE[mechanism] === 'dashed';
  const dimmed = data?.dimmed === true;
  const opacity = dimmed ? 0.15 : 1;

  return (
    <>
      {/* Invisible wide interaction path — React Flow's pane uses this for
          hit-testing onEdgeClick. Must be pointer-events:stroke so the pane
          delegates the click to onEdgeClick. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />
      {/* Visible edge line — pointer-events:none so it never intercepts the
          HTML label overlay rendered by the parent component. */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={isDashed ? '6 4' : undefined}
        opacity={opacity}
        markerEnd={markerEnd}
        style={{ pointerEvents: 'none' }}
      />
    </>
  );
}

