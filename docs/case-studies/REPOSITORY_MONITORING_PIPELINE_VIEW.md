# Case Study: Repository Monitoring Pipeline View

A game-like visualization for understanding the Repository Monitoring Server's data flow, resource usage, and event emission in real-time.

## Overview

The Repository Monitoring Server is an Electron utility process that watches git repositories and maintains in-memory caches of their state. This case study explores how to visualize its internals as an engaging, informative UI.

## What the Server Does

### Core Purpose

Monitors registered git repositories and provides:
- Real-time git state (branch, SHA, dirty status)
- File tree with git metadata
- Monorepo package detection
- Quality metrics enrichment (ESLint, TypeScript, Jest, Knip)
- Remote sync status (ahead/behind upstream)

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    DISK     │ ──▶ │   WATCHER   │ ──▶ │    CACHE    │ ──▶ │   EVENTS    │
│   .git/*    │     │   Adapter   │     │  Registry   │     │    → IPC    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### 4 Cache Slices

| Slice | Contents | Invalidation |
|-------|----------|--------------|
| `gitStatus` | Staged/unstaged/untracked/deleted files | TTL-based |
| `fileTree` | Directory structure with git metadata | SHA-based |
| `packages` | Monorepo packages with quality metrics | SHA-based |
| `gitRemote` | Remote URL, branches, ahead/behind | TTL-based |

### Events Emitted

| Event | Trigger |
|-------|---------|
| `commit` | HEAD SHA changed |
| `branch-switch` | Branch name changed |
| `merge` | MERGE_HEAD file detected |
| `dirty-state-change` | Working tree dirty status toggled |
| `cache-sync` | Any cache slice updated |
| `workspace-changed` | File system changes detected |

## What Users Care About

### Immediate Awareness (Glanceable)
- Server health: memory usage, CPU
- How many repos are being watched
- Which repos are active vs idle

### Activity Context
- When did each repo last emit an event?
- What type of event was it?
- How frequently are events occurring?

### System Understanding
- How does data flow through the system?
- Where is memory being used?
- Is the cache working effectively?

## Visualization Design

### Pipeline View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Repository Monitoring Server            RAM: 127 MB  CPU: 2%          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐   │
│   │   DISK   │ ───▶ │  WATCH   │ ───▶ │  CACHE   │ ───▶ │  EVENTS  │   │
│   │  .git/*  │  ⚡   │ adapter  │  ⚡   │ registry │  ⚡   │  → IPC   │   │
│   └──────────┘      └──────────┘      └──────────┘      └──────────┘   │
│        │                 │                  │                 │         │
│   ┌────┴────┐       ┌────┴────┐        ┌────┴────┐       ┌────┴────┐   │
│   │ 3 repos │       │ minimal │        │ 12 slices│      │ 47 today│   │
│   └─────────┘       └─────────┘        │  4.2 MB  │       └─────────┘   │
│                                        └─────────┘                      │
├─────────────────────────────────────────────────────────────────────────┤
│  REPOSITORIES                                                           │
│  ┌───────────────────────────────────────────────────────────┬────────┐│
│  │ principal-view-core-library                               │ 2m ago ││
│  │ ○──○──○──●                                     branch-switch       ││
│  ├───────────────────────────────────────────────────────────┼────────┤│
│  │ desktop-app                                               │ 5m ago ││
│  │ ○──○──●                                              dirty-change ││
│  ├───────────────────────────────────────────────────────────┼────────┤│
│  │ claude-code                                               │ 1h ago ││
│  │ ●                                                           commit ││
│  └───────────────────────────────────────────────────────────┴────────┘│
│                                                                         │
│  EVENT STREAM                                              ▼ live      │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │ 14:32:01  principal-view...  commit      abc1234 → def5678         │
│  │ 14:31:45  desktop-app        dirty       +3 files                  │
│  │ 14:30:12  principal-view...  branch      main → feature/game-ui    │
│  └─────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘
```

### Visual Elements

#### 1. Pipeline Header
Shows the 4-stage data flow with real-time indicators:
- **DISK**: Source of truth (`.git/` directory)
- **WATCH**: File system watcher adapter
- **CACHE**: In-memory cache registry
- **EVENTS**: IPC broadcast to renderer

Animated particles or pulses flow through when data moves.

#### 2. Aggregate Stats
Below each pipeline stage:
- DISK: Number of registered repos
- WATCH: Current watching mode (minimal/fallback/none)
- CACHE: Total slices cached, memory size
- EVENTS: Event count (today/session)

#### 3. Repository List
Each registered repo shows:
- Repository name/path
- Mini timeline of recent events (dots that light up)
- Last event type + relative time ("2m ago")
- Visual indicator of activity level

#### 4. Event Stream
Live-scrolling log of events as they occur:
- Timestamp
- Repository (abbreviated)
- Event type
- Event details (SHA change, file count, etc.)

### Game-Like Elements

1. **Animated Flow**: Particles move through pipeline when events occur
2. **Pulse Effects**: Active stages glow/pulse
3. **Timeline Sparklines**: Dots "light up" as events flow through
4. **Activity Heat**: More active repos could have warmer colors
5. **Idle Detection**: Repos that haven't emitted events fade slightly

## Data Requirements

### Currently Available

From `MonitoringStatus`:
```typescript
interface MonitoringStatus {
  repositories: RepositoryInfo[];  // List with watching details
  currentMemory: number;           // RSS in bytes
  currentCpu: number;              // CPU percentage
  history: ResourceSnapshot[];     // Last 30 snapshots (1 min)
}

interface RepositoryInfo {
  path: string;
  isWatching: boolean;
  watchReferenceCount: number;
  fsMonitorEnabled: boolean;
  watchingMode: 'minimal' | 'fallback' | 'none';
}
```

### Telemetry Needed

To power the full visualization, we need additional telemetry:

#### Per-Repository Event History
```typescript
interface RepositoryEventInfo {
  repoPath: string;
  lastEventTime: number;           // Unix timestamp
  lastEventType: GitEventType;     // commit, branch-switch, etc.
  eventCountToday: number;
  recentEvents: RecentEvent[];     // Last N events for timeline
}

interface RecentEvent {
  timestamp: number;
  type: GitEventType;
  details?: {
    fromSha?: string;
    toSha?: string;
    fromBranch?: string;
    toBranch?: string;
    fileCount?: number;
  };
}
```

#### Cache Metrics
```typescript
interface CacheMetrics {
  totalSlices: number;             // Sum across all repos
  memorySizeBytes: number;         // Estimated cache memory
  hitCount: number;                // Cache hits since start
  missCount: number;               // Cache misses since start
  rebuildCount: number;            // Number of rebuilds triggered
  perSlice: {
    [slice: string]: {
      count: number;               // How many repos have this slice
      totalSize: number;           // Estimated bytes
    };
  };
}
```

#### Pipeline Throughput
```typescript
interface PipelineMetrics {
  watcherEventsReceived: number;   // Raw FS events
  cacheUpdatesTriggered: number;   // Cache rebuilds
  ipcEventsBroadcast: number;      // Events sent to renderer

  // Per-stage latency (optional, for debugging)
  avgWatcherLatencyMs?: number;
  avgCacheRebuildMs?: number;
}
```

## Implementation Considerations

### Where to Emit Telemetry

1. **RepositoryCacheRegistry**: Already emits `cacheUpdated` events
   - Add: memory estimation, rebuild counts

2. **GitWatcherAdapter**: Receives FS events
   - Add: event counting, last event time per repo

3. **RepositoryMonitoringServer**: Orchestrates everything
   - Add: aggregate metrics endpoint

### OpenTelemetry Integration

This could be instrumented with spans:
- `repository.watch.event` - When FS change detected
- `repository.cache.rebuild` - When cache slice rebuilds
- `repository.event.broadcast` - When IPC event sent

Events could include:
- `repository.commit`
- `repository.branch_switch`
- `repository.dirty_state_change`

### Memory Estimation

Cache memory can be estimated by:
```typescript
function estimateCacheSize(snapshot: RepositoryCacheSnapshot): number {
  return JSON.stringify(snapshot).length * 2; // Rough UTF-16 estimate
}
```

## Telemetry Architecture

### Hybrid Approach: Real-time + Historical

The Pipeline View requires both real-time updates (for animations) and historical data (for replay and aggregates). We use a hybrid approach:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  REPOSITORY MONITORING SERVER (instrumented)                            │
│                                                                         │
│   GitWatcher ──────────▶ CacheRegistry ──────────▶ IPC Broadcast       │
│       │                       │                         │               │
│    span:                   span:                     span:              │
│    watch.event            cache.rebuild             event.broadcast     │
└───────┼───────────────────────┼─────────────────────────┼───────────────┘
        │                       │                         │
        ▼                       ▼                         ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  PipelineViewSpanProcessor (in-process)                     │
   │                                                             │
   │  ┌─────────────┐              ┌─────────────┐              │
   │  │ IPC Emit    │              │ SQLite      │              │
   │  │ (real-time) │              │ (storage)   │              │
   │  └──────┬──────┘              └──────┬──────┘              │
   └─────────┼────────────────────────────┼──────────────────────┘
             │                            │
             ▼                            ▼
   ┌─────────────────┐          ┌─────────────────┐
   │  Live UI        │          │  Replay Engine  │
   │  (animations)   │          │  (time-control) │
   └─────────────────┘          └─────────────────┘
```

### Instrumentation Points

#### Spans (for latency/throughput)

```typescript
// In GitWatcherAdapter - when FS change detected
tracer.startSpan('watch.fs_event', {
  attributes: {
    'repo.path': repoPath,
    'event.type': 'change',        // change, add, unlink
    'file.path': relativePath,
  }
});

// In RepositoryCacheRegistry - when cache rebuilds
tracer.startSpan('cache.rebuild', {
  attributes: {
    'repo.path': repoPath,
    'cache.slice': 'fileTree',     // gitStatus, fileTree, packages, gitRemote
    'cache.version': newVersion,
  }
});

// In IPC broadcast - when event sent to renderer
tracer.startSpan('event.broadcast', {
  attributes: {
    'repo.path': repoPath,
    'event.type': 'commit',        // commit, branch-switch, dirty-state-change
  }
});
```

#### Events (for discrete occurrences)

```typescript
span.addEvent('repository.registered', {
  'repo.path': repoPath,
  'watch.mode': 'minimal',
});

span.addEvent('cache.hit', {
  'cache.slice': 'fileTree',
  'cache.age_ms': Date.now() - entry.timestamp,
});

span.addEvent('cache.miss', {
  'cache.slice': 'packages',
});
```

### Pipeline Event Schema

Store pipeline events as first-class data for replay:

```sql
CREATE TABLE pipeline_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,          -- Unix ms

  -- Pipeline stage
  stage TEXT NOT NULL,                 -- 'disk', 'watch', 'cache', 'event'

  -- Context
  repo_path TEXT NOT NULL,
  event_type TEXT NOT NULL,            -- 'fs_change', 'cache_rebuild', 'commit', etc.

  -- Details (JSON for flexibility)
  details_json TEXT,

  -- Optional: link to full OTEL span
  trace_id TEXT,
  span_id TEXT
);

CREATE INDEX idx_pipeline_timestamp ON pipeline_events(timestamp);
CREATE INDEX idx_pipeline_repo ON pipeline_events(repo_path, timestamp);
```

#### Example Data

```
timestamp     stage   repo_path              event_type       details
───────────────────────────────────────────────────────────────────────────
1712345678001 disk    /Users/me/project      fs_change        {"file":".git/HEAD"}
1712345678003 watch   /Users/me/project      detected         {"type":"branch-switch"}
1712345678015 cache   /Users/me/project      rebuild_start    {"slice":"gitStatus"}
1712345678047 cache   /Users/me/project      rebuild_end      {"slice":"gitStatus","duration_ms":32}
1712345678048 event   /Users/me/project      broadcast        {"type":"branch-switch","from":"main","to":"feature/x"}
```

---

## Replay Architecture

### Core Abstraction: EventSource

The UI doesn't care where events come from - live or replay:

```typescript
interface PipelineEvent {
  timestamp: number;
  stage: 'disk' | 'watch' | 'cache' | 'event';
  repo: string;
  type: string;
  details?: Record<string, unknown>;
}

interface EventSource {
  subscribe(handler: (event: PipelineEvent) => void): () => void;
}
```

### Live Event Source

```typescript
class LiveEventSource implements EventSource {
  subscribe(handler: (e: PipelineEvent) => void) {
    return ipc.on('pipeline:event', handler);
  }
}
```

### Replay Event Source

```typescript
class ReplayEventSource implements EventSource {
  constructor(
    private db: Database,
    private timeRange: { start: number; end: number },
    private speed: number = 1  // 1x, 2x, 10x
  ) {}

  subscribe(handler: (e: PipelineEvent) => void) {
    const events = this.loadEvents();
    return this.playback(events, handler);
  }

  private loadEvents(): PipelineEvent[] {
    return this.db.prepare(`
      SELECT timestamp, stage, repo_path as repo, event_type as type, details_json
      FROM pipeline_events
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `).all(this.timeRange.start, this.timeRange.end);
  }

  private playback(events: PipelineEvent[], handler: (e: PipelineEvent) => void) {
    let index = 0;
    let startWallTime = Date.now();
    let startEventTime = events[0]?.timestamp ?? 0;

    const tick = () => {
      const elapsed = (Date.now() - startWallTime) * this.speed;
      const targetTime = startEventTime + elapsed;

      while (index < events.length && events[index].timestamp <= targetTime) {
        handler(events[index]);
        index++;
      }

      if (index < events.length) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
    return () => { index = events.length; };
  }
}
```

### UI Component

```typescript
function PipelineView({ eventSource }: { eventSource: EventSource }) {
  useEffect(() => {
    return eventSource.subscribe((event: PipelineEvent) => {
      animatePipeline(event);      // Flow particle through stages
      updateTimeline(event);        // Update repo timeline
      appendToStream(event);        // Add to event log
    });
  }, [eventSource]);

  // ... render pipeline visualization
}
```

### Replay Controls

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ◉ Live   ○ Replay                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│  [|◀]  [▶]  [▶▶]     ──●────────────────────────  1x  2x  10x          │
│  start play fast      ↑ scrubber                  speed                 │
│                       │                                                 │
│                    14:32:01                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Replay Use Cases

| Use Case | Description |
|----------|-------------|
| **Demo mode** | Replay a recorded session to showcase the system |
| **Incident review** | "What happened at 3am?" - replay that time window |
| **Debugging** | Step through events to find where things went wrong |
| **Testing** | Record a session, replay to verify UI behavior |
| **Time travel** | Scrub to any point, see state at that moment |

### Stats at Replay Time

During replay, show aggregate stats "as of" the current replay time:

```typescript
function getStatsAtTime(db: Database, repoPath: string, asOfTime: number) {
  const startOfDay = new Date(asOfTime).setHours(0, 0, 0, 0);

  return {
    eventCountToday: db.prepare(`
      SELECT COUNT(*) as count FROM pipeline_events
      WHERE repo_path = ?
        AND timestamp >= ?
        AND timestamp <= ?
    `).get(repoPath, startOfDay, asOfTime).count,

    lastEvent: db.prepare(`
      SELECT stage, event_type, timestamp FROM pipeline_events
      WHERE repo_path = ? AND timestamp <= ?
      ORDER BY timestamp DESC LIMIT 1
    `).get(repoPath, asOfTime),
  };
}
```

---

## Summary

The hybrid approach provides:

| Capability | Source | Latency |
|------------|--------|---------|
| Live animations | IPC events | <10ms |
| Historical aggregates | SQLite queries | ~10ms |
| Replay | SQLite → ReplayEngine | Controlled |
| Time-travel scrubbing | SQLite point queries | ~10ms |

This architecture separates **observation** (OTEL spans) from **visualization** (pipeline events), while keeping them linked via trace/span IDs for drill-down.

---

## Next Steps

1. Define the telemetry schema (spans + events)
2. Add instrumentation to the server
3. Create the UI components
4. Connect via existing IPC or new metrics endpoint

## Related Documents

- [DASHBOARD_METRICS_DESIGN.md](./DASHBOARD_METRICS_DESIGN.md)
- [OPENTELEMETRY_OVERVIEW.md](./OPENTELEMETRY_OVERVIEW.md)
- [EVENT_SYSTEM.md](./EVENT_SYSTEM.md)
