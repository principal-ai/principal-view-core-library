import type { Meta, StoryObj } from '@storybook/react';
import React, { useCallback, useMemo, useState } from 'react';
import type {
  NormalizedPathInfo,
  RepoNormalizedUniversalAgentSessionEvent,
  V1RawEvent,
} from '@principal-ai/agent-monitoring';
import rawSession from './data/opencode-session-raw-events.json';

type AnyRecord = Record<string, unknown>;

/** Shared collapse state keyed by event id. */
function useCollapse(ids: string[], defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => (defaultCollapsed ? new Set(ids) : new Set<string>()),
  );
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setAll = useCallback(
    (value: boolean) => setCollapsed(value ? new Set(ids) : new Set<string>()),
    [ids],
  );
  return { collapsed, toggle, setAll };
}

/**
 * Prototype cards for raw agent events. The fixture is a snapshot of one real
 * opencode session's `event` table rows (see scripts/dump-opencode-session.ts).
 * No normalization — these render the raw V1 payloads exactly as sqlite stores
 * them, so we can see what the raw → card mapping should look like.
 */

const meta = {
  title: 'Agent Raw Events/Cards',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// =============================================================================
// Fixture
// =============================================================================

/** The fixture strips `raw` from normalized events (it duplicates `events[i]`). */
type NormalizedFixtureEvent = Omit<RepoNormalizedUniversalAgentSessionEvent, 'raw'>;

const fixture = rawSession as {
  session: { id: string; title: string; slug: string; timeCreated: number };
  events: V1RawEvent[];
  normalized: NormalizedFixtureEvent[];
};

const events = [...fixture.events].sort((a, b) => a.seq - b.seq);

/** Lookup raw event id → its repo-normalized form (fixture arrays are aligned). */
const normalizedById = new Map(events.map((e, i) => [e.id, fixture.normalized[i]]));

// =============================================================================
// Raw event → presentable pieces
// =============================================================================

function dataOf(e: V1RawEvent): AnyRecord {
  return (e.data ?? {}) as AnyRecord;
}

function partOf(e: V1RawEvent): AnyRecord | undefined {
  return dataOf(e).part as AnyRecord | undefined;
}

function eventTimestamp(e: V1RawEvent): number {
  const d = dataOf(e);
  if (typeof d.time === 'number') return d.time;
  const info = d.info as AnyRecord | undefined;
  const infoTime = info?.time as AnyRecord | undefined;
  if (typeof infoTime?.created === 'number') return infoTime.created;
  const part = partOf(e);
  if (typeof part?.time === 'number') return part.time;
  const state = part?.state as AnyRecord | undefined;
  const stateTime = state?.time as AnyRecord | undefined;
  if (typeof stateTime?.start === 'number') return stateTime.start;
  if (typeof stateTime?.end === 'number') return stateTime.end;
  return 0;
}

// =============================================================================
// Event categorization
// =============================================================================

/**
 * Raw events collapse into a small set of categories. The granular V1 event
 * types are many (session.created/updated, message.updated, part updated with
 * text/reasoning/tool/step/patch/compaction, ...) but they only describe a few
 * distinct things a viewer cares about. Categories let us build predefined
 * filters over the raw stream without chasing individual event types.
 */
type EventCategory = 'session' | 'conversation' | 'tool' | 'step' | 'patch' | 'compaction';

const ALL_CATEGORIES: EventCategory[] = [
  'session',
  'conversation',
  'tool',
  'step',
  'patch',
  'compaction',
];

function eventCategory(e: V1RawEvent): EventCategory {
  switch (e.type) {
    case 'session.created.1':
    case 'session.updated.1':
      return 'session';
    case 'message.updated.1':
    case 'message.removed.1':
    case 'message.part.updated.1': {
      const partType = partOf(e)?.type;
      switch (partType) {
        case 'text':
        case 'reasoning':
          return 'conversation';
        case 'tool':
          return 'tool';
        case 'step-start':
        case 'step-finish':
          return 'step';
        case 'patch':
          return 'patch';
        case 'compaction':
          return 'compaction';
        default:
          return 'conversation';
      }
    }
    default:
      return 'conversation';
  }
}

/**
 * Predefined filters = a named set of categories. "Activity" (what the agent
 * actually did) is the default because it drops the session bookkeeping,
 * step lifecycle, and compaction noise that isn't useful in a normal view.
 */
const PRESETS: Array<{ id: string; label: string; include: EventCategory[] }> = [
  { id: 'all', label: 'All', include: ALL_CATEGORIES },
  { id: 'activity', label: 'Activity', include: ['conversation', 'tool', 'patch'] },
  { id: 'conversation', label: 'Conversation', include: ['conversation'] },
  { id: 'tools', label: 'Tools', include: ['tool'] },
  { id: 'noise', label: 'Session & steps', include: ['session', 'step', 'compaction'] },
];

/** Granular key for a card (raw event type, or part type for parts). */
function eventKind(e: V1RawEvent): string {
  if (e.type === 'message.part.updated.1') {
    return `part:${partOf(e)?.type ?? 'unknown'}`;
  }
  return e.type;
}

function kindLabel(kind: string): string {
  if (kind.startsWith('part:')) return `part · ${kind.slice(5)}`;
  return kind;
}

const KIND_COLORS: Record<string, string> = {
  'session.created.1': '#64748b',
  'session.updated.1': '#94a3b8',
  'message.updated.1': '#06b6d4',
  'message.removed.1': '#ef4444',
  'part:text': '#10b981',
  'part:reasoning': '#8b5cf6',
  'part:tool': '#3b82f6',
  'part:step-start': '#f59e0b',
  'part:step-finish': '#f59e0b',
  'part:patch': '#ef4444',
  'part:compaction': '#ec4899',
  'part:unknown': '#6b7280',
};

function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? '#6b7280';
}

function describe(e: V1RawEvent): string {
  const d = dataOf(e);
  const info = d.info as AnyRecord | undefined;
  const part = partOf(e);
  const state = part?.state as AnyRecord | undefined;

  switch (e.type) {
    case 'session.created.1':
      return (info?.title as string) ?? 'Session created';
    case 'session.updated.1': {
      const bits: string[] = [];
      const tokens = info?.tokens as AnyRecord | undefined;
      if (typeof info?.cost === 'number') bits.push(`$${info.cost.toFixed(4)}`);
      if (typeof tokens?.input === 'number') bits.push(`${tokens.input} in`);
      if (typeof tokens?.output === 'number') bits.push(`${tokens.output} out`);
      return bits.length > 0 ? `Session updated · ${bits.join(' · ')}` : 'Session updated';
    }
    case 'message.updated.1': {
      const role = (info?.role as string) ?? 'message';
      const model = (info?.model as AnyRecord | undefined)?.modelID as string | undefined;
      return model ? `${role} message · ${model}` : `${role} message`;
    }
    case 'message.removed.1':
      return `Removed ${d.messageID as string}`;
    case 'message.part.updated.1': {
      const partType = part?.type as string;
      const toolName = part?.tool as string | undefined;
      const status = state?.status as string | undefined;
      switch (partType) {
        case 'text':
          return (part?.text as string) ?? 'Text';
        case 'reasoning':
          return (part?.text as string) || 'Reasoning';
        case 'tool':
          return [toolName, status].filter(Boolean).join(' · ') || 'Tool';
        case 'step-start':
          return 'Step start';
        case 'step-finish':
          return part?.reason
            ? `Step finish · ${part.reason as string}`
            : 'Step finish';
        case 'patch': {
          const files = part?.files as string[] | undefined;
          return `Patch · ${files?.length ?? 0} file${(files?.length ?? 0) === 1 ? '' : 's'}`;
        }
        case 'compaction':
          return `Compaction${part?.auto ? ' · auto' : ''}`;
        default:
          return partType ?? 'Part';
      }
    }
    default:
      return e.type;
  }
}

function toolSummary(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) return JSON.stringify(input).slice(0, 120);
  const obj = input as AnyRecord;
  for (const key of ['command', 'filePath', 'file_path', 'path', 'pattern', 'include', 'tool']) {
    if (typeof obj[key] === 'string' && obj[key] !== '') return obj[key] as string;
  }
  return JSON.stringify(input).slice(0, 120);
}

// =============================================================================
// RawEventCard
// =============================================================================

function formatTime(ts: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function RawEventCard({
  event,
  expanded,
  onToggle,
}: {
  event: V1RawEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const kind = eventKind(event);
  const d = dataOf(event);
  const part = partOf(event);
  const state = part?.state as AnyRecord | undefined;
  const color = kindColor(kind);

  const body = useMemo(
    () =>
      ((): React.ReactNode => {
        switch (event.type) {
      case 'session.created.1': {
        const info = d.info as AnyRecord | undefined;
        return (
          <MetaRows
            rows={[
              ['agent', info?.agent as string],
              ['model', ((info?.model as AnyRecord | undefined)?.id as string) ?? ((info?.model as AnyRecord | undefined)?.modelID as string)],
              ['directory', info?.directory as string],
              ['version', info?.version as string],
              ['slug', info?.slug as string],
            ]}
          />
        );
      }
      case 'session.updated.1': {
        const info = d.info as AnyRecord | undefined;
        return (
          <MetaRows
            rows={[
              ['cost', typeof info?.cost === 'number' ? `$${info.cost.toFixed(4)}` : undefined],
              ['tokens', info?.tokens as AnyRecord | undefined],
              ['title', info?.title as string],
            ]}
          />
        );
      }
      case 'message.updated.1': {
        const info = d.info as AnyRecord | undefined;
        return (
          <MetaRows
            rows={[
              ['role', info?.role as string],
              ['agent', info?.agent as string],
              ['model', info?.model as AnyRecord | undefined],
              ['tokens', info?.tokens as AnyRecord | undefined],
              ['messageID', info?.id as string],
            ]}
          />
        );
      }
      case 'message.removed.1':
        return <MetaRows rows={[['messageID', d.messageID as string]]} />;
      case 'message.part.updated.1': {
        switch (part?.type) {
          case 'text':
          case 'reasoning':
            return <TextView text={part?.text as string | undefined} />;
          case 'tool':
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  callID {String(part?.callID ?? '')} · {String(state?.status ?? '')}
                </div>
                <ToolIO
                  input={state?.input}
                  output={state?.status === 'error' ? state?.error : state?.output}
                />
              </div>
            );
          case 'step-start':
            return <MetaRows rows={[['snapshot', part?.snapshot as string]]} />;
          case 'step-finish':
            return (
              <MetaRows
                rows={[
                  ['reason', part?.reason as string],
                  ['cost', typeof part?.cost === 'number' ? `$${part.cost.toFixed(4)}` : undefined],
                  ['tokens', part?.tokens as AnyRecord | undefined],
                ]}
              />
            );
          case 'patch':
            return <MetaRows rows={[['files', part?.files as string[] | undefined], ['hash', part?.hash as string]]} />;
          case 'compaction':
            return (
              <MetaRows
                rows={[
                  ['auto', typeof part?.auto === 'boolean' ? String(part.auto) : undefined],
                  ['overflow', typeof part?.overflow === 'boolean' ? String(part.overflow) : undefined],
                ]}
              />
            );
          default:
            return <JsonView value={d} />;
        }
      }
      default:
        return <JsonView value={d} />;
      }
    })(),
    [event],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: expanded ? 8 : 0,
        padding: '10px 14px',
        borderRadius: 0,
        minWidth: 0,
        overflow: 'hidden',
        backgroundColor: expanded ? '#111827' : '#161b26',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>#{event.seq}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color,
            whiteSpace: 'nowrap',
          }}
        >
          {kindLabel(kind)}
        </span>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#e5e7eb',
          }}
        >
          {describe(event)}
        </span>
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
          {formatTime(eventTimestamp(event))}
        </span>
      </button>
      {expanded ? body : null}
    </div>
  );
}

// =============================================================================
// NormalizedEventCard
// =============================================================================

function prettifyEventType(t: string): string {
  return t.replace(/-/g, ' ');
}

function normalizedDescribe(n: NormalizedFixtureEvent): string {
  if (n.toolName) return [n.toolName, n.operation].filter(Boolean).join(' · ');
  if (n.operation) return n.operation;
  const d = n.data as AnyRecord | undefined;
  if (typeof d?.message === 'string') return d.message.slice(0, 90);
  return prettifyEventType(n.eventType);
}

function repoLabel(repo: {
  root?: string;
  owner?: string;
  repo?: string;
  remoteUrl?: string;
}): string {
  const identity = repo.owner && repo.repo ? `${repo.owner}/${repo.repo}` : repo.repo ?? '';
  return identity && repo.root ? `${identity} @ ${repo.root}` : repo.root ?? '';
}

function NormalizedEventCard({
  event,
  seq,
  color,
  expanded,
  onToggle,
}: {
  event: NormalizedFixtureEvent;
  seq: number;
  color: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: expanded ? 8 : 0,
        padding: '10px 14px',
        borderRadius: 0,
        minWidth: 0,
        overflow: 'hidden',
        backgroundColor: expanded ? '#0d1520' : '#101722',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>#{seq}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color,
            whiteSpace: 'nowrap',
          }}
        >
          {prettifyEventType(event.eventType)}
        </span>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#e5e7eb',
          }}
        >
          {normalizedDescribe(event)}
        </span>
        <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
          {formatTime(event.timestamp)}
        </span>
      </button>
      {expanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <MetaRows
            rows={[
              ['eventType', event.eventType],
              ['operation', event.operation],
              ['toolName', event.toolName],
              ['sessionId', event.sessionId],
              ['workingDir', event.normalizedWorkingDirectory],
              ['repository', event.repository ? repoLabel(event.repository) : undefined],
            ]}
          />
          {event.files && event.files.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                files ({event.files.length})
              </div>
              {event.files.map((file, i) => (
                <FileRow key={i} file={file} />
              ))}
            </div>
          ) : null}
          {event.toolInput !== undefined ? (
            <ToolIO input={event.toolInput} output={event.toolOutput} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FileRow({ file }: { file: NormalizedPathInfo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div
        style={{
          color: '#93c5fd',
          fontSize: 12,
          wordBreak: 'break-word',
          fontFamily: 'monospace',
        }}
      >
        {file.displayPath}
      </div>
      <div style={{ color: '#6b7280', fontSize: 11, wordBreak: 'break-word' }}>
        {file.context}
        {file.repository
          ? ` · ${file.repository.gitRoot} → ${file.repository.relativePath}`
          : ` · ${file.absolutePath}`}
      </div>
    </div>
  );
}

function TextView({ text }: { text?: string }) {
  if (!text) return <div style={{ color: '#6b7280', fontSize: 12 }}>(empty)</div>;
  return (
    <div
      style={{
        color: '#d1d5db',
        fontSize: 12.5,
        lineHeight: 1.5,
        maxHeight: 120,
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </div>
  );
}

function ToolIO({ input, output }: { input?: unknown; output?: unknown }) {
  const summary = toolSummary(input);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {summary ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>IN</span>
          <code style={{ color: '#93c5fd', fontSize: 12, wordBreak: 'break-word' }}>{summary}</code>
        </div>
      ) : null}
      {input !== undefined && input !== null && typeof input === 'object' ? (
        <CodeBlock value={JSON.stringify(input, null, 2)} />
      ) : null}
      {output !== undefined && output !== null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>OUT</span>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              {typeof output === 'string' ? `${output.length.toLocaleString()} chars` : 'object'}
            </span>
          </div>
          <CodeBlock value={typeof output === 'string' ? output : JSON.stringify(output, null, 2)} />
        </>
      ) : null}
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 8,
        borderRadius: 6,
        backgroundColor: '#0b1220',
        color: '#9ca3af',
        fontSize: 11.5,
        lineHeight: 1.45,
        maxHeight: 180,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {value}
    </pre>
  );
}

function MetaRows({ rows }: { rows: Array<[string, unknown]> }) {
  const present = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (present.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {present.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          <span style={{ color: '#6b7280', minWidth: 76, whiteSpace: 'nowrap' }}>{label}</span>
          <span
            style={{
              color: '#d1d5db',
              wordBreak: 'break-word',
              whiteSpace: typeof value === 'string' ? 'pre-wrap' : 'nowrap',
            }}
          >
            {typeof value === 'string'
              ? value
              : Array.isArray(value)
                ? (value as unknown[]).join(', ')
                : JSON.stringify(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function JsonView({ value }: { value: unknown }) {
  return <CodeBlock value={JSON.stringify(value, null, 2)} />;
}

// =============================================================================
// Feed with type filter
// =============================================================================

function CardFeed({ items }: { items: V1RawEvent[] }) {
  const ids = useMemo(() => items.map((e) => e.id), [items]);
  const { collapsed, toggle, setAll } = useCollapse(ids, true);

  const [active, setActive] = useState<string>('activity');

  const activePreset = PRESETS.find((p) => p.id === active) ?? PRESETS[0];
  const isVisible = (e: V1RawEvent) => activePreset.include.includes(eventCategory(e));
  const visibleEvents = items.filter(isVisible);

  const presetCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const preset of PRESETS) {
      map.set(preset.id, items.filter((e) => preset.include.includes(eventCategory(e))).length);
    }
    return map;
  }, [items]);

  const expandedCount = visibleEvents.filter((e) => !collapsed.has(e.id)).length;

  return (
    <div style={{ padding: 24, backgroundColor: '#0d1117', minHeight: '100vh' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          marginBottom: 4,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ margin: 0, color: '#f3f4f6', fontSize: 18, fontWeight: 600 }}>
          {fixture.session.title}
        </h1>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          {items.length} raw events · {visibleEvents.length} visible · {expandedCount} expanded
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          marginBottom: 16,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <FilterChip label="all" active={active === 'all'} onClick={() => setActive('all')} />
        {PRESETS.filter((p) => p.id !== 'all').map((preset) => (
          <FilterChip
            key={preset.id}
            label={`${preset.label} (${presetCounts.get(preset.id) ?? 0})`}
            active={active === preset.id}
            onClick={() => setActive(preset.id)}
          />
        ))}
        <span style={{ flex: 1 }} />
        <FilterChip label="Expand all" active={false} onClick={() => setAll(false)} />
        <FilterChip label="Collapse all" active={false} onClick={() => setAll(true)} />
      </div>
      <ColumnHeaders />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 1300 }}>
        {items.map((e) => (
          <EventRow
            key={e.id}
            raw={e}
            normalized={normalizedById.get(e.id)}
            visible={isVisible(e)}
            expanded={!collapsed.has(e.id)}
            onToggle={() => toggle(e.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Static/sticky column headers so the two columns stay labeled while the feed
 * scrolls: left = raw V1 event, right = its repo-normalized form.
 */
function ColumnHeaders() {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        maxWidth: 1300,
        padding: '8px 14px',
        marginBottom: 8,
        backgroundColor: '#0d1117',
        borderBottom: '1px solid #1f2937',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#9ca3af',
        }}
      >
        Raw event
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: '#9ca3af',
        }}
      >
        Repo-normalized
      </span>
    </div>
  );
}

/**
 * One chronological row: the raw event on the left, its repo-normalized form on
 * the right. When a preset filters the event out, the whole row collapses to a
 * thin line so the timeline structure is preserved.
 */
function EventRow({
  raw,
  normalized,
  visible,
  expanded,
  onToggle,
}: {
  raw: V1RawEvent;
  normalized?: NormalizedFixtureEvent;
  visible: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!visible) return <FilteredOutLine event={raw} />;
  const color = kindColor(eventKind(raw));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <RawEventCard event={raw} expanded={expanded} onToggle={onToggle} />
      {normalized ? (
        <NormalizedEventCard
          event={normalized}
          seq={raw.seq}
          color={color}
          expanded={expanded}
          onToggle={onToggle}
        />
      ) : null}
    </div>
  );
}

/**
 * When a preset filters an event out it doesn't disappear — it collapses to a
 * thin color-tinted line. The feed keeps its chronological structure (you can
 * still see where filtered content sits) while the filtered events stay out of
 * the way. Hovering shows what's hidden.
 */
function FilteredOutLine({ event }: { event: V1RawEvent }) {
  const color = kindColor(eventKind(event));
  return (
    <div
      title={describe(event)}
      style={{
        height: 2,
        backgroundColor: color,
        opacity: 0.16,
        cursor: 'default',
      }}
    />
  );
}

function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        border: `1px solid ${active ? color ?? '#3b82f6' : '#1f2937'}`,
        backgroundColor: active ? (color ?? '#3b82f6') + '22' : 'transparent',
        color: active ? '#f3f4f6' : '#9ca3af',
        fontSize: 11.5,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
}

// =============================================================================
// Stories
// =============================================================================

export const Feed: Story = {
  render: () => <CardFeed items={events} />,
};

export const Grouped: Story = {
  render: () => {
    const byKind = new Map<string, V1RawEvent[]>();
    for (const e of events) {
      const kind = eventKind(e);
      byKind.set(kind, [...(byKind.get(kind) ?? []), e]);
    }
    return (
      <div style={{ padding: 24, backgroundColor: '#0d1117', minHeight: '100vh' }}>
        <ColumnHeaders />
        {Array.from(byKind.entries())
          .sort((a, b) => b[1].length - a[1].length)
          .map(([kind, group]) => (
            <GroupSection key={kind} kind={kind} group={group} />
          ))}
      </div>
    );
  },
};

function GroupSection({ kind, group }: { kind: string; group: V1RawEvent[] }) {
  const ids = useMemo(() => group.map((e) => e.id), [group]);
  const { collapsed, toggle, setAll } = useCollapse(ids, true);

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <span style={{ color: kindColor(kind), fontWeight: 600, fontSize: 13 }}>
          {kindLabel(kind)}
        </span>
        <span style={{ color: '#6b7280', fontSize: 12 }}>{group.length}</span>
        <span style={{ flex: 1 }} />
        <FilterChip label="Expand all" active={false} onClick={() => setAll(false)} />
        <FilterChip label="Collapse all" active={false} onClick={() => setAll(true)} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 1300 }}>
        {group.map((e) => (
          <EventRow
            key={e.id}
            raw={e}
            normalized={normalizedById.get(e.id)}
            visible
            expanded={!collapsed.has(e.id)}
            onToggle={() => toggle(e.id)}
          />
        ))}
      </div>
    </div>
  );
}
