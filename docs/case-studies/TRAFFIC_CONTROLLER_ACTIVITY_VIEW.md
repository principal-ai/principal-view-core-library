# Case Study: Traffic Controller Activity View

A real-time visualization for understanding the Repository Traffic Controller's load, occupancy, and activity throughput.

## Overview

The Repository Traffic Controller is a WebSocket-based collaboration server that enables multiple developers to work on the same repository without conflicts. This case study explores how to visualize its operational state with a focus on **aggregate awareness** rather than detailed collaboration state.

## What the Server Does

### Core Purpose

Real-time collaboration infrastructure providing:
- **Room management** - Repository-scoped collaboration spaces
- **Presence tracking** - Who's online, which repo, which branch
- **Branch-aware locking** - File locks scoped to Git branches
- **Patch transfer** - WebRTC peer-to-peer sharing of unsaved changes
- **GitHub webhook processing** - External push/install events

### Key Entities

| Entity | Description |
|--------|-------------|
| **Room** | A repository collaboration space (e.g., `myorg/backend`) |
| **User** | Authenticated GitHub user |
| **Agent** | A specific device/client instance of a user |
| **Lock** | Branch-aware file/directory reservation |
| **Sync Event** | Git status, file changes, commits broadcast to room |

### Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Clients   │◄───►│  WebSocket  │◄───►│   Rooms     │
│  (Agents)   │     │   Server    │     │  (Repos)    │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │   Presence  │
                    │   + Locks   │
                    │   + Sync    │
                    └─────────────┘
```

---

## What Users Care About

For this visualization, we focus on **operational awareness**:

### Immediate (Glanceable)
- How many repos are currently active?
- How many users are connected?
- Is the system busy or idle?

### Load Understanding
- Which repos have the most users?
- What's the collaboration density (users per repo)?
- Are there any "hot" repos with unusual activity?

### Activity Throughput
- How many git status updates are flowing?
- Is activity spiking or steady?
- What does normal vs abnormal look like?

---

## Visualization Design

### Activity View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Repository Traffic Controller                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐   │
│   │  REPOS   │      │  USERS   │      │ DENSITY  │      │ ACTIVITY │   │
│   │    12    │      │    47    │      │  3.9/repo│      │  ████░░  │   │
│   │   open   │      │ connected│      │  avg     │      │ 142/min  │   │
│   └──────────┘      └──────────┘      └──────────┘      └──────────┘   │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  REPOS BY OCCUPANCY                          SYNC THROUGHPUT            │
│  ┌─────────────────────────────────────┐    ┌─────────────────────────┐│
│  │ myorg/backend        ●●●●●  5       │    │ ▁▂▄▆█▇▅▃▂▁▂▄▆█▇▅▃▂▁   ││
│  │ myorg/frontend       ●●●    3       │    │         last 5 min      ││
│  │ myorg/shared-lib     ●●●●●●●● 8     │    │                         ││
│  │ myorg/docs           ●      1       │    │  peak: 312/min          ││
│  │ ...                                 │    │  now:  142/min          ││
│  └─────────────────────────────────────┘    └─────────────────────────┘│
│                                                                         │
│  RECENT ACTIVITY                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │ 14:32  alice → myorg/backend     │  14:31  bob → myorg/frontend    │
│  │ 14:30  charlie → myorg/shared    │  14:28  diana → myorg/backend   │
│  └─────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘
```

### Visual Elements

#### 1. Aggregate Gauges (Top Row)
Four key metrics at a glance:
- **REPOS**: Count of active rooms
- **USERS**: Count of connected agents
- **DENSITY**: Average users per repo (users / repos)
- **ACTIVITY**: Sync events per minute with mini progress bar

#### 2. Repos by Occupancy
Sorted list of active repos showing:
- Repository name
- User dots (visual count)
- Numeric count
- Optionally: activity indicator per repo

#### 3. Sync Throughput Sparkline
Rolling time-series of sync events:
- Last 5 minutes of activity
- Peak and current rate
- Visual pattern recognition (spiky vs steady)

#### 4. Recent Activity Feed
Compact log of recent events:
- User joins/leaves
- High-activity moments
- Helps understand "who's doing what"

### Animation & Real-time Updates

| Element | Animation |
|---------|-----------|
| User count | Increment/decrement with brief highlight |
| Repo list | Slide in/out as rooms open/close |
| Occupancy dots | Pop in/fade out as users join/leave |
| Sparkline | Smooth scroll left, new data appears right |
| Activity feed | New items slide in from top |

---

## Telemetry Architecture

### Same Hybrid Pattern

Like the Pipeline View, we use a hybrid approach for real-time + historical:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TRAFFIC CONTROLLER (instrumented)                                      │
│                                                                         │
│   Room Join ──────────▶ Presence Update ──────────▶ Sync Broadcast     │
│       │                       │                         │               │
│    span:                   span:                     span:              │
│    room.join              presence.update           sync.broadcast      │
└───────┼───────────────────────┼─────────────────────────┼───────────────┘
        │                       │                         │
        ▼                       ▼                         ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  ActivityViewSpanProcessor                                  │
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

#### Spans

```typescript
// Room lifecycle
tracer.startSpan('room.join', {
  attributes: {
    'room.id': 'myorg/backend',
    'user.id': 'alice',
    'agent.id': 'agent-123',
    'room.user_count': currentCount + 1,
  }
});

tracer.startSpan('room.leave', {
  attributes: {
    'room.id': 'myorg/backend',
    'user.id': 'alice',
    'agent.id': 'agent-123',
    'room.user_count': currentCount - 1,
  }
});

// Sync events
tracer.startSpan('sync.broadcast', {
  attributes: {
    'room.id': 'myorg/backend',
    'sync.type': 'git_status',      // git_status, file_change, commit
    'sync.recipients': recipientCount,
  }
});
```

#### Events

```typescript
span.addEvent('room.created', {
  'room.id': roomId,
});

span.addEvent('room.deleted', {
  'room.id': roomId,
  'room.lifetime_seconds': lifetime,
});

span.addEvent('presence.heartbeat', {
  'user.id': userId,
  'rooms.count': userRoomCount,
});
```

### Storage Schema

```sql
CREATE TABLE traffic_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,

  -- Event classification
  event_type TEXT NOT NULL,        -- 'room.join', 'room.leave', 'sync.broadcast'

  -- Context
  room_id TEXT,                    -- 'myorg/backend'
  user_id TEXT,
  agent_id TEXT,

  -- Metrics at time of event
  room_user_count INTEGER,         -- Users in room after this event
  total_rooms INTEGER,             -- Total active rooms
  total_users INTEGER,             -- Total connected users

  -- For sync events
  sync_type TEXT,                  -- 'git_status', 'file_change', 'commit'
  sync_recipients INTEGER,         -- How many users received this

  -- Flexible details
  details_json TEXT,

  -- Link to OTEL
  trace_id TEXT,
  span_id TEXT
);

CREATE INDEX idx_traffic_timestamp ON traffic_events(timestamp);
CREATE INDEX idx_traffic_room ON traffic_events(room_id, timestamp);
CREATE INDEX idx_traffic_type ON traffic_events(event_type, timestamp);
```

### Example Data

```
timestamp     event_type      room_id           user_id   room_count  sync_type
──────────────────────────────────────────────────────────────────────────────────
1712345678001 room.join       myorg/backend     alice     5           -
1712345678015 sync.broadcast  myorg/backend     alice     -           git_status
1712345678023 sync.broadcast  myorg/backend     bob       -           file_change
1712345678045 room.join       myorg/frontend    charlie   3           -
1712345678089 room.leave      myorg/backend     alice     4           -
```

---

## Replay Architecture

### Same EventSource Abstraction

```typescript
interface TrafficEvent {
  timestamp: number;
  eventType: 'room.join' | 'room.leave' | 'sync.broadcast';
  roomId?: string;
  userId?: string;
  roomUserCount?: number;
  totalRooms?: number;
  totalUsers?: number;
  syncType?: string;
}

interface EventSource {
  subscribe(handler: (event: TrafficEvent) => void): () => void;
}
```

### Live Event Source

```typescript
class LiveTrafficEventSource implements EventSource {
  subscribe(handler: (e: TrafficEvent) => void) {
    return ipc.on('traffic:event', handler);
  }
}
```

### Replay Event Source

```typescript
class ReplayTrafficEventSource implements EventSource {
  constructor(
    private db: Database,
    private timeRange: { start: number; end: number },
    private speed: number = 1
  ) {}

  subscribe(handler: (e: TrafficEvent) => void) {
    const events = this.db.prepare(`
      SELECT timestamp, event_type, room_id, user_id,
             room_user_count, total_rooms, total_users, sync_type
      FROM traffic_events
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC
    `).all(this.timeRange.start, this.timeRange.end);

    return this.playback(events, handler);
  }

  private playback(events: TrafficEvent[], handler: (e: TrafficEvent) => void) {
    // Same time-controlled playback as Pipeline View
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

### State Reconstruction for Replay

During replay, we need to reconstruct aggregate state at any point in time:

```typescript
interface TrafficState {
  activeRooms: Map<string, { userCount: number; users: Set<string> }>;
  totalUsers: number;
  syncRatePerMinute: number;
}

class TrafficStateAccumulator {
  private state: TrafficState = {
    activeRooms: new Map(),
    totalUsers: 0,
    syncRatePerMinute: 0,
  };

  private recentSyncs: number[] = []; // timestamps

  apply(event: TrafficEvent): TrafficState {
    switch (event.eventType) {
      case 'room.join':
        this.handleJoin(event);
        break;
      case 'room.leave':
        this.handleLeave(event);
        break;
      case 'sync.broadcast':
        this.handleSync(event);
        break;
    }

    this.updateSyncRate(event.timestamp);
    return this.getState();
  }

  private handleJoin(event: TrafficEvent) {
    if (!event.roomId || !event.userId) return;

    if (!this.state.activeRooms.has(event.roomId)) {
      this.state.activeRooms.set(event.roomId, { userCount: 0, users: new Set() });
    }

    const room = this.state.activeRooms.get(event.roomId)!;
    if (!room.users.has(event.userId)) {
      room.users.add(event.userId);
      room.userCount++;
      this.state.totalUsers++;
    }
  }

  private handleLeave(event: TrafficEvent) {
    if (!event.roomId || !event.userId) return;

    const room = this.state.activeRooms.get(event.roomId);
    if (room && room.users.has(event.userId)) {
      room.users.delete(event.userId);
      room.userCount--;
      this.state.totalUsers--;

      if (room.userCount === 0) {
        this.state.activeRooms.delete(event.roomId);
      }
    }
  }

  private handleSync(event: TrafficEvent) {
    this.recentSyncs.push(event.timestamp);
  }

  private updateSyncRate(now: number) {
    const oneMinuteAgo = now - 60000;
    this.recentSyncs = this.recentSyncs.filter(t => t > oneMinuteAgo);
    this.state.syncRatePerMinute = this.recentSyncs.length;
  }

  getState(): TrafficState {
    return {
      activeRooms: new Map(this.state.activeRooms),
      totalUsers: this.state.totalUsers,
      syncRatePerMinute: this.state.syncRatePerMinute,
    };
  }
}
```

### UI Component

```typescript
function TrafficActivityView({ eventSource }: { eventSource: EventSource }) {
  const [state, setState] = useState<TrafficState>(initialState);
  const accumulator = useRef(new TrafficStateAccumulator());

  useEffect(() => {
    return eventSource.subscribe((event: TrafficEvent) => {
      const newState = accumulator.current.apply(event);
      setState(newState);
    });
  }, [eventSource]);

  return (
    <div className="traffic-view">
      <AggregateGauges
        repos={state.activeRooms.size}
        users={state.totalUsers}
        density={state.totalUsers / Math.max(1, state.activeRooms.size)}
        syncRate={state.syncRatePerMinute}
      />
      <RepoOccupancyList rooms={state.activeRooms} />
      <SyncThroughputSparkline rate={state.syncRatePerMinute} />
      <RecentActivityFeed />
    </div>
  );
}
```

---

## Replay Use Cases

| Use Case | Description |
|----------|-------------|
| **Load analysis** | Replay a busy hour to see peak usage patterns |
| **Incident review** | "What happened when the server slowed down?" |
| **Capacity planning** | Review historical load to plan scaling |
| **Demo mode** | Show stakeholders what collaboration looks like |
| **Pattern recognition** | Identify typical vs unusual activity patterns |

---

## Comparison with Pipeline View

| Aspect | Pipeline View (Monitoring) | Activity View (Traffic) |
|--------|---------------------------|------------------------|
| **Focus** | Data flow through stages | Aggregate system state |
| **Users** | Single user | Multi-user |
| **Primary metric** | Latency/throughput per stage | Counts and rates |
| **Visualization** | Linear pipeline | Dashboard gauges |
| **Events** | System internal | User actions |
| **Replay value** | "How did data flow?" | "How busy was the system?" |

### Shared Patterns

Both case studies share:
1. **Hybrid architecture** - Real-time IPC + SQLite storage
2. **EventSource abstraction** - UI doesn't know live vs replay
3. **State accumulation** - Reconstruct state from event stream
4. **Same replay engine** - Time-controlled playback with speed control

---

## Summary

The Traffic Controller Activity View demonstrates that the hybrid telemetry pattern generalizes beyond pipeline visualizations to aggregate monitoring:

| Capability | Implementation |
|------------|----------------|
| Live gauges | IPC events update counters |
| Historical queries | SQLite aggregations |
| Replay | Event stream + state accumulator |
| Sparklines | Rolling window from event timestamps |

The key insight: **store events, derive state**. Whether it's a pipeline or an activity dashboard, the same event-sourcing pattern enables both real-time updates and historical replay.

---

## Next Steps

1. Instrument Traffic Controller with OTEL spans
2. Add IPC emission for real-time UI updates
3. Create SQLite storage for traffic events
4. Build UI components (gauges, repo list, sparkline)
5. Implement replay with state accumulator

## Related Documents

- [REPOSITORY_MONITORING_PIPELINE_VIEW.md](./REPOSITORY_MONITORING_PIPELINE_VIEW.md) - Pipeline visualization case study
- [LOCAL_METRICS_STORAGE_DESIGN.md](../LOCAL_METRICS_STORAGE_DESIGN.md) - SQLite storage architecture
- [OPENTELEMETRY_OVERVIEW.md](../OPENTELEMETRY_OVERVIEW.md) - OTEL instrumentation patterns
