# Event Recording System Design

> **Purpose**: Capture, categorize, and replay test execution events for visual validation.
> **Status**: Design Phase
> **Last Updated**: 2025-11-27

---

## Overview

The Event Recording System enables capturing logs from test runs, categorizing them into graph events, organizing them by test case, and replaying them for visual validation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVENT RECORDING FLOW                               │
│                                                                              │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────────────┐  │
│  │  Log Source  │────▶│  Event Recorder  │────▶│  Session Store         │  │
│  │  (WebSocket) │     │  (categorize)    │     │  ┌──────────────────┐  │  │
│  └──────────────┘     └──────────────────┘     │  │ test-auth-flow   │  │  │
│                                                 │  │ [12 events]      │  │  │
│                                                 │  ├──────────────────┤  │  │
│                                                 │  │ test-websocket   │  │  │
│                                                 │  │ [8 events]       │  │  │
│                                                 │  └──────────────────┘  │  │
│                                                 └────────────────────────┘  │
│                                                              │               │
│                                                              ▼               │
│                                                 ┌────────────────────────┐  │
│                                                 │  Event Controller      │  │
│                                                 │  (playback)            │  │
│                                                 └────────────────────────┘  │
│                                                              │               │
│                                                              ▼               │
│                                                 ┌────────────────────────┐  │
│                                                 │  Graph Renderer        │  │
│                                                 │  (visualization)       │  │
│                                                 └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### 1. Sessions

A **Session** groups events by test case. Each test run creates a new session.

```typescript
interface EventSession {
  /** Unique session identifier */
  id: string;

  /** Human-readable name (e.g., test name) */
  name: string;

  /** When recording started */
  startedAt: number;

  /** When recording ended (undefined if still recording) */
  endedAt?: number;

  /** Status of the session */
  status: 'recording' | 'completed' | 'error';

  /** Recorded events */
  events: GraphEvent[];

  /** Test metadata */
  metadata: SessionMetadata;
}

interface SessionMetadata {
  /** Test file path */
  testFile?: string;

  /** Test case name */
  testName?: string;

  /** Test suite name */
  testSuite?: string;

  /** Custom tags for filtering */
  tags?: string[];

  /** Test result (set when session completes) */
  result?: 'pass' | 'fail' | 'skip';

  /** Error message if test failed */
  error?: string;
}
```

### 2. Recording Modes

The recorder can operate in different modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| `manual` | Start/stop controlled by user | Debugging, exploration |
| `auto-test` | Auto-creates session per test | CI integration |
| `continuous` | Single session, continuous capture | Long-running processes |

```typescript
type RecordingMode = 'manual' | 'auto-test' | 'continuous';

interface RecorderConfig {
  mode: RecordingMode;

  /** Graph configuration for event processing */
  graphConfig: PathBasedGraphConfiguration;

  /** Maximum events per session (prevents memory issues) */
  maxEventsPerSession?: number;

  /** Auto-cleanup sessions older than this (ms) */
  sessionRetention?: number;

  /** Filter: only record logs matching these levels */
  logLevels?: LogLevel[];

  /** Filter: only record logs from these source patterns */
  sourcePatterns?: string[];
}
```

### 3. Log Entry Format

Logs received from the test runner must include source information:

```typescript
interface LogEntry {
  /** Log message */
  message: string;

  /** Log level */
  level: LogLevel;

  /** Timestamp */
  timestamp: number;

  /** Source file path (required for component association) */
  source: {
    file: string;
    line?: number;
    column?: number;
    function?: string;
  };

  /**
   * Instance identifier for multi-instance components.
   * Used to differentiate between multiple nodes of the same type
   * (e.g., "client-1", "client-2" for components of type "client").
   */
  instanceId?: string;

  /** Additional structured data */
  data?: Record<string, unknown>;

  /** Test context (for auto-test mode) */
  testContext?: {
    testId: string;
    testName: string;
    testFile: string;
  };
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

### 4. Instance Resolution

When you have multiple nodes of the same type (e.g., multiple clients connecting to a server), you need a way to differentiate which node instance a log belongs to.

#### The Problem

Path-based association maps logs to **node types** (e.g., `client`), but not to specific **node instances** (e.g., `client-1`, `client-2`).

```
log from "src/client/BaseClient.ts" → "client" (node type)
                                   → but WHICH client?
```

#### Solution: Instance ID in Log Metadata

The log entry includes an `instanceId` field that specifies which node instance the log belongs to:

```typescript
// In your application code
logger.info('Connected to server', {
  _vvfInstanceId: this.clientId  // "client-1"
});

// Or using the EnhancedLogger directly
logger.info('Connected to server', {
  _vvfInstanceId: 'client-1'
});
```

#### How It Works

1. **Logger captures instanceId**: The `EnhancedLogger` extracts `_vvfInstanceId` from log metadata
2. **Processor passes it through**: `PathBasedEventProcessor` includes `instanceId` in events
3. **Events target specific nodes**: `ComponentActivityEvent` and `ComponentActionEvent` include `instanceId`
4. **Renderer animates correct node**: GraphRenderer uses `instanceId` to animate the specific node instance

#### Event Flow Example

```typescript
// 1. Application logs with instance ID
logger.info('Client connected', { _vvfInstanceId: 'client-1' });

// 2. EnhancedLogger creates LogEntry with instanceId
{
  message: 'Client connected',
  metadata: {
    timestamp: 1701234567890,
    level: 'info',
    source: { file: 'src/client/BaseClient.ts', line: 42 },
    instanceId: 'client-1'  // ← Extracted from _vvfInstanceId
  }
}

// 3. PathBasedEventProcessor creates event with instanceId
{
  type: 'component-activity',
  componentId: 'client',     // Node type
  instanceId: 'client-1',    // Specific instance
  timestamp: 1701234567890,
  level: 'info',
  message: 'Client connected',
  source: { file: 'src/client/BaseClient.ts', line: 42 }
}

// 4. GraphRenderer animates node with id "client-1"
```

#### Best Practices

1. **Use consistent instance IDs**: Use the same ID throughout the lifecycle of an instance
2. **Make IDs meaningful**: Use descriptive IDs like `client-alice`, `worker-1`, `db-primary`
3. **Instance ID is optional**: If not provided, events target the node type (for single-instance components)
4. **Set instance ID early**: Configure the instance ID when the component is created

```typescript
class Client {
  private clientId: string;
  private logger: EnhancedLogger;

  constructor(id: string) {
    this.clientId = id;
    this.logger = new EnhancedLogger();
  }

  // Helper method to include instance ID in all logs
  private log(level: LogLevel, message: string, data?: object) {
    this.logger[level](message, { ...data, _vvfInstanceId: this.clientId });
  }

  connect() {
    this.log('info', 'Connecting to server');
    // ... connection logic
    this.log('info', 'Connected successfully');
  }
}
```

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Test Runner / App                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  EnhancedLogger (captures source paths)                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ WebSocket
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EventRecorderService                               │
│                                                                              │
│  ┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐    │
│  │ WebSocketServer │───▶│ PathBasedEvent       │───▶│ SessionManager  │    │
│  │ (log receiver)  │    │ Processor            │    │                 │    │
│  └─────────────────┘    │ (log → GraphEvent)   │    │ ┌─────────────┐ │    │
│                         └──────────────────────┘    │ │ Session 1   │ │    │
│                                                      │ │ Session 2   │ │    │
│                                                      │ │ Session N   │ │    │
│                                                      │ └─────────────┘ │    │
│                                                      └─────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Events
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Panel UI                                           │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────┐ │
│  │ EventRecorderPanel  │───▶│ EventControllerPanel│───▶│ GraphRenderer   │ │
│  │ (session list,      │    │ (playback controls) │    │ (visualization) │ │
│  │  recording control) │    │                     │    │                 │ │
│  └─────────────────────┘    └─────────────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. TEST EXECUTION
   └─▶ Logger.info("Lock acquired", { lockId: "abc" })
       └─▶ EnhancedLogger captures source: "lib/lock-manager.ts:42"

2. TRANSPORT
   └─▶ WebSocket sends: { message, level, timestamp, source, testContext }

3. PROCESSING
   └─▶ EventRecorderService receives log
       └─▶ PathBasedEventProcessor converts to GraphEvent
           └─▶ Matches source "lib/lock-manager.ts" → component "lock-manager"
           └─▶ Matches action pattern "Lock acquired" → event type "lock_acquired"
           └─▶ Creates GraphEvent with animation trigger

4. STORAGE
   └─▶ SessionManager routes event to correct session
       └─▶ Based on testContext.testId or current active session

5. PLAYBACK
   └─▶ User selects session in EventRecorderPanel
       └─▶ Events passed to EventControllerPanel
           └─▶ Playback emits events to GraphRenderer
               └─▶ Animations play
```

---

## WebSocket Protocol

### Connection

```
ws://localhost:9876/vvf/events
```

### Message Types

#### Client → Server

```typescript
// Start a new session
interface StartSessionMessage {
  type: 'session:start';
  payload: {
    name: string;
    metadata?: SessionMetadata;
  };
}

// End current session
interface EndSessionMessage {
  type: 'session:end';
  payload: {
    sessionId: string;
    result?: 'pass' | 'fail' | 'skip';
    error?: string;
  };
}

// Send log entry
interface LogMessage {
  type: 'log';
  payload: LogEntry;
}

// Send batch of logs
interface LogBatchMessage {
  type: 'log:batch';
  payload: LogEntry[];
}
```

#### Server → Client

```typescript
// Session created confirmation
interface SessionCreatedMessage {
  type: 'session:created';
  payload: {
    sessionId: string;
    name: string;
  };
}

// Event processed (for debugging)
interface EventProcessedMessage {
  type: 'event:processed';
  payload: {
    sessionId: string;
    eventId: string;
    eventType: string;
  };
}

// Error occurred
interface ErrorMessage {
  type: 'error';
  payload: {
    code: string;
    message: string;
  };
}
```

### Example Flow

```typescript
// 1. Test starts - create session
ws.send({
  type: 'session:start',
  payload: {
    name: 'test-lock-acquisition',
    metadata: {
      testFile: 'tests/lock-manager.test.ts',
      testName: 'should acquire lock successfully',
      testSuite: 'LockManager'
    }
  }
});

// 2. Receive confirmation
// <- { type: 'session:created', payload: { sessionId: 'sess-123', name: '...' } }

// 3. Send logs during test
ws.send({
  type: 'log',
  payload: {
    message: 'Attempting to acquire lock',
    level: 'info',
    timestamp: Date.now(),
    source: { file: 'lib/lock-manager.ts', line: 42 },
    data: { lockId: 'lock-abc', resource: 'repo-xyz' }
  }
});

ws.send({
  type: 'log',
  payload: {
    message: 'Lock acquired successfully',
    level: 'info',
    timestamp: Date.now() + 100,
    source: { file: 'lib/lock-manager.ts', line: 58 },
    data: { lockId: 'lock-abc', duration: 100 }
  }
});

// 4. Test ends
ws.send({
  type: 'session:end',
  payload: {
    sessionId: 'sess-123',
    result: 'pass'
  }
});
```

---

## Session Manager

### API

```typescript
interface SessionManager {
  /** Create a new session */
  createSession(name: string, metadata?: SessionMetadata): EventSession;

  /** Get session by ID */
  getSession(id: string): EventSession | undefined;

  /** List all sessions */
  listSessions(): EventSession[];

  /** Add event to session */
  addEvent(sessionId: string, event: GraphEvent): void;

  /** End a session */
  endSession(sessionId: string, result?: SessionResult): void;

  /** Delete a session */
  deleteSession(id: string): void;

  /** Clear all sessions */
  clearSessions(): void;

  /** Export session to JSON */
  exportSession(id: string): string;

  /** Import session from JSON */
  importSession(json: string): EventSession;

  /** Subscribe to session changes */
  onSessionChange(callback: (sessions: EventSession[]) => void): () => void;
}

interface SessionResult {
  result: 'pass' | 'fail' | 'skip';
  error?: string;
  duration?: number;
}
```

### Implementation Notes

- Sessions stored in memory by default
- Max events per session to prevent memory bloat (default: 10,000)
- Auto-cleanup of sessions older than retention period
- Thread-safe for concurrent log ingestion

---

## Event Processing Pipeline

### Path-Based Association (Milestone 1)

Logs are automatically associated with components based on source file:

```yaml
# .vgc/config.yaml
nodeTypes:
  lock-manager:
    shape: rectangle
    color: "#f59e0b"
    sources:
      - "lib/lock-manager.ts"
      - "lib/branch-aware-lock-manager.ts"
```

When a log comes from `lib/lock-manager.ts`, it automatically triggers a node animation on the `lock-manager` component.

### Action Pattern Matching (Milestone 2)

Specific log messages can trigger specific events:

```yaml
nodeTypes:
  lock-manager:
    sources:
      - "lib/lock-manager.ts"
    actions:
      - pattern: "Lock acquired"
        event: lock_acquired
        state: acquired
      - pattern: "Lock released"
        event: lock_released
        state: idle
      - pattern: "Lock contention"
        event: lock_contention
        state: waiting

edgeTypes:
  lock-request:
    activatedBy:
      - action: lock_acquired
        animation: flow
        direction: forward
        duration: 1000
```

### Processing Flow

```typescript
// 1. Log entry received
const log: LogEntry = {
  message: 'Lock acquired',
  level: 'info',
  timestamp: Date.now(),
  source: { file: 'lib/lock-manager.ts', line: 42 }
};

// 2. PathBasedEventProcessor processes
const events = processor.processLog(log);

// 3. Results in GraphEvents:
// - ComponentActivityEvent (node pulse animation)
// - ComponentActionEvent (state change to 'acquired')
// - EdgeAnimationEvent (lock-request edge animates)
```

---

## UI Components

### EventRecorderPanel

Main panel for managing recording sessions:

```
┌─────────────────────────────────────────────────────────────┐
│  Event Recorder                                    [⚙️]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Status: ● Recording    Session: test-lock-acquisition      │
│                                                             │
│  [⏹ Stop]  [⏸ Pause]  [📋 New Session]                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Sessions                                    [🔍 Filter]    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● test-lock-acquisition           12 events  PASS   │   │
│  │   tests/lock-manager.test.ts      2.3s ago          │   │
│  │   [▶ Play] [📤 Export] [🗑️ Delete]                   │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ○ test-auth-flow                   8 events  FAIL   │   │
│  │   tests/auth.test.ts              5.1s ago          │   │
│  │   [▶ Play] [📤 Export] [🗑️ Delete]                   │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ ○ test-websocket-connection       15 events  PASS   │   │
│  │   tests/websocket.test.ts         12.4s ago         │   │
│  │   [▶ Play] [📤 Export] [🗑️ Delete]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Integration with EventControllerPanel

When user clicks "Play" on a session:

```typescript
// EventRecorderPanel
const handlePlaySession = (session: EventSession) => {
  onPlaySession(session.events);
};

// Parent component orchestrates
<EventRecorderPanel
  onPlaySession={(events) => setPlaybackEvents(events)}
/>
<EventControllerPanel
  events={playbackEvents}
  onEventsEmit={setGraphEvents}
/>
<GraphRenderer
  events={graphEvents}
/>
```

---

## Future Work

### Phase 1: Core Implementation (Current)
- [ ] WebSocket server for log ingestion
- [ ] SessionManager for organizing events
- [ ] EventRecorderPanel UI
- [ ] Integration with EventControllerPanel

### Phase 2: CI Integration
- [ ] Export sessions to JSON files
- [ ] CLI tool for recording test runs
- [ ] GitHub Action for capturing recordings
- [ ] PR comment with recording playback link

### Phase 3: Persistence
- [ ] Save recordings to `.vgc/recordings/` folder
- [ ] Load recordings from disk
- [ ] Recording file format specification
- [ ] Compression for large recordings

### Phase 4: Advanced Features
- [ ] Real-time streaming (live test visualization)
- [ ] Recording comparison (diff two test runs)
- [ ] Event filtering and search
- [ ] Recording annotations

---

## Configuration Reference

### Full RecorderConfig

```typescript
interface RecorderConfig {
  /** Recording mode */
  mode: 'manual' | 'auto-test' | 'continuous';

  /** Graph configuration for event processing */
  graphConfig: PathBasedGraphConfiguration;

  /** WebSocket server options */
  server?: {
    port: number;           // Default: 9876
    host: string;           // Default: 'localhost'
    path: string;           // Default: '/vvf/events'
  };

  /** Session options */
  sessions?: {
    maxPerSession: number;  // Default: 10000
    retention: number;      // Default: 3600000 (1 hour)
    autoCleanup: boolean;   // Default: true
  };

  /** Filtering options */
  filters?: {
    logLevels: LogLevel[]; // Default: ['info', 'warn', 'error']
    sourcePatterns: string[]; // Default: [] (all sources)
    excludePatterns: string[]; // Default: ['node_modules/**']
  };

  /** Processing options */
  processing?: {
    enableActionPatterns: boolean; // Default: true
    debounceMs: number;            // Default: 0
  };
}
```

### Example Configuration

```typescript
const recorderConfig: RecorderConfig = {
  mode: 'auto-test',
  graphConfig: loadConfig('.vgc/vvf.config.yaml'),

  server: {
    port: 9876,
    host: 'localhost',
    path: '/vvf/events'
  },

  sessions: {
    maxPerSession: 5000,
    retention: 1800000, // 30 minutes
    autoCleanup: true
  },

  filters: {
    logLevels: ['info', 'warn', 'error'],
    sourcePatterns: ['src/**/*.ts', 'lib/**/*.ts'],
    excludePatterns: ['node_modules/**', '**/*.test.ts']
  },

  processing: {
    enableActionPatterns: true,
    debounceMs: 50
  }
};
```

---

## Related Documents

- [EVENT_SYSTEM.md](./EVENT_SYSTEM.md) - Event types and processing
- [PATH_BASED_ASSOCIATION.md](./PATH_BASED_ASSOCIATION.md) - Log-to-component mapping
- [CONFIGURATION_REFERENCE.md](./CONFIGURATION_REFERENCE.md) - VVF configuration format
- [PANEL_INTEGRATION_PLAN.md](./PANEL_INTEGRATION_PLAN.md) - Panel architecture
