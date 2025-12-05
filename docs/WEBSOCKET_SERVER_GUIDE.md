# WebSocket Server Implementation Guide

This guide explains how to implement a WebSocket server in your host application (e.g., electron-app, web-ade) to receive logs from test runners and feed them to the EventRecorderService for visualization.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Test Runner (e.g., bun test, jest)                                 │
│  ┌─────────────────────┐                                            │
│  │  EnhancedLogger     │                                            │
│  │  + WebSocketTransport│                                           │
│  └──────────┬──────────┘                                            │
│             │ WebSocket                                             │
│             ▼                                                       │
├─────────────────────────────────────────────────────────────────────┤
│  Host Application (electron-app / web-ade)                          │
│  ┌─────────────────────┐      ┌─────────────────────┐              │
│  │  WebSocket Server   │ ───▶ │ EventRecorderService│              │
│  │  (you implement)    │      │ (from core library) │              │
│  └─────────────────────┘      └──────────┬──────────┘              │
│                                          │                          │
│                                          ▼                          │
│                               ┌─────────────────────┐              │
│                               │ EventRecorderPanel  │              │
│                               │ (UI component)      │              │
│                               └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

## Protocol Messages

The EventRecorderService expects messages in this format:

### Incoming Messages (Client → Server)

#### session_start
Starts a new recording session.

```typescript
{
  type: 'session_start',
  timestamp: number,
  requestId?: string,  // If provided, server sends ack
  payload: {
    name: string,
    id?: string,       // Optional custom session ID
    metadata?: {
      testFile?: string,
      testName?: string,
      testSuite?: string,
      tags?: string[]
    }
  }
}
```

#### session_end
Ends the current recording session.

```typescript
{
  type: 'session_end',
  timestamp: number,
  requestId?: string,
  payload: {
    sessionId: string,
    result?: 'pass' | 'fail' | 'skip',
    error?: string
  }
}
```

#### log
Sends a single log entry.

```typescript
{
  type: 'log',
  timestamp: number,
  requestId?: string,
  payload: {
    message: string,
    metadata: {
      timestamp: number,
      level: 'debug' | 'info' | 'warn' | 'error',
      source?: {
        file: string,
        line?: number,
        column?: number
      },
      instanceId?: string  // For multi-instance components
    }
  }
}
```

#### log_batch
Sends multiple log entries at once.

```typescript
{
  type: 'log_batch',
  timestamp: number,
  requestId?: string,
  payload: {
    logs: Array<{
      message: string,
      metadata: { ... }
    }>
  }
}
```

#### ping
Keepalive message.

```typescript
{
  type: 'ping',
  timestamp: number
}
```

### Outgoing Messages (Server → Client)

#### ack
Acknowledgment for a request.

```typescript
{
  type: 'ack',
  timestamp: number,
  payload: {
    requestId: string,
    sessionId?: string  // Included for session_start
  }
}
```

#### error
Error response.

```typescript
{
  type: 'error',
  timestamp: number,
  payload: {
    code: string,
    message: string,
    requestId?: string
  }
}
```

#### pong
Response to ping.

```typescript
{
  type: 'pong',
  timestamp: number
}
```

## Implementation Example (Electron with Bun)

### 1. Install Dependencies

```bash
# In your electron-app
bun add @principal-ai/visual-validation-core
```

### 2. Create the WebSocket Server

```typescript
// src/services/LogRecorderServer.ts
import { EventRecorderService } from '@principal-ai/visual-validation-core';
import type {
  IncomingMessage,
  OutgoingMessage,
  PathBasedGraphConfiguration,
} from '@principal-ai/visual-validation-core';

export class LogRecorderServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private service: EventRecorderService;
  private connections = new Map<string, WebSocket>();

  constructor(graphConfig: PathBasedGraphConfiguration) {
    this.service = new EventRecorderService({
      graphConfig,
      recordingMode: 'manual',
    });
  }

  /**
   * Start the WebSocket server
   */
  public start(port: number = 8765): void {
    this.server = Bun.serve({
      port,
      fetch(req, server) {
        // Upgrade HTTP to WebSocket
        const success = server.upgrade(req);
        if (success) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      },
      websocket: {
        open: (ws) => {
          const connectionId = this.generateConnectionId();
          (ws as any).connectionId = connectionId;
          this.connections.set(connectionId, ws);
          this.service.registerConnection(connectionId);
          console.log(`Client connected: ${connectionId}`);
        },
        message: (ws, message) => {
          const connectionId = (ws as any).connectionId;
          try {
            const parsed = JSON.parse(message.toString()) as IncomingMessage;
            const response = this.service.processMessage(parsed, connectionId);

            if (response) {
              ws.send(JSON.stringify(response));
            }
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'error',
              timestamp: Date.now(),
              payload: {
                code: 'PARSE_ERROR',
                message: 'Failed to parse message',
              },
            }));
          }
        },
        close: (ws) => {
          const connectionId = (ws as any).connectionId;
          this.connections.delete(connectionId);
          this.service.unregisterConnection(connectionId);
          console.log(`Client disconnected: ${connectionId}`);
        },
      },
    });

    console.log(`Log recorder server running on ws://localhost:${port}`);
  }

  /**
   * Stop the server
   */
  public stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    this.service.dispose();
  }

  /**
   * Get the EventRecorderService for UI integration
   */
  public getService(): EventRecorderService {
    return this.service;
  }

  private generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 3. Integrate with Your UI

```typescript
// src/main/index.ts (Electron main process)
import { LogRecorderServer } from './services/LogRecorderServer';
import { loadGraphConfig } from './config';

const graphConfig = loadGraphConfig(); // Load your VGC config
const logServer = new LogRecorderServer(graphConfig);

// Start server when app is ready
app.whenReady().then(() => {
  logServer.start(8765);

  // Pass service to renderer via IPC or expose methods
  ipcMain.handle('get-sessions', () => {
    return logServer.getService().listSessions();
  });

  ipcMain.handle('get-active-session', () => {
    return logServer.getService().getActiveSession();
  });
});

// Cleanup
app.on('before-quit', () => {
  logServer.stop();
});
```

### 4. Connect the UI Panel

```tsx
// src/renderer/components/RecorderPanel.tsx
import { EventRecorderPanel } from '@industry-theme/visual-validation-panel';
import { useEffect, useState } from 'react';

export function RecorderPanel() {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    // Subscribe to session updates via IPC
    const unsubscribe = window.electron.onSessionsChange((sessions) => {
      setSessions(sessions);
    });

    // Initial load
    window.electron.getSessions().then(setSessions);

    return unsubscribe;
  }, []);

  return (
    <EventRecorderPanel
      sessions={sessions}
      isRecording={sessions.some(s => s.status === 'recording')}
      onPlaySession={(id, events) => {
        // Send events to graph renderer
      }}
    />
  );
}
```

## Implementation Example (Node.js with ws)

If you're not using Bun, you can use the `ws` package:

```typescript
// src/services/LogRecorderServer.ts
import { WebSocketServer, WebSocket } from 'ws';
import { EventRecorderService } from '@principal-ai/visual-validation-core';

export class LogRecorderServer {
  private wss: WebSocketServer | null = null;
  private service: EventRecorderService;
  private connections = new Map<string, WebSocket>();

  constructor(graphConfig: PathBasedGraphConfiguration) {
    this.service = new EventRecorderService({
      graphConfig,
      recordingMode: 'manual',
    });
  }

  public start(port: number = 8765): void {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      const connectionId = this.generateConnectionId();
      (ws as any).connectionId = connectionId;
      this.connections.set(connectionId, ws);
      this.service.registerConnection(connectionId);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          const response = this.service.processMessage(message, connectionId);

          if (response) {
            ws.send(JSON.stringify(response));
          }
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            timestamp: Date.now(),
            payload: { code: 'PARSE_ERROR', message: 'Failed to parse message' },
          }));
        }
      });

      ws.on('close', () => {
        this.connections.delete(connectionId);
        this.service.unregisterConnection(connectionId);
      });
    });

    console.log(`Log recorder server running on ws://localhost:${port}`);
  }

  public stop(): void {
    this.wss?.close();
    this.service.dispose();
  }

  public getService(): EventRecorderService {
    return this.service;
  }

  private generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## Client Side (Test Runner)

### Using WebSocketTransport

```typescript
// test/setup.ts
import { EnhancedLogger, WebSocketTransport } from '@principal-ai/visual-validation-logger';

// Create logger with WebSocket transport
const logger = new EnhancedLogger({
  projectRoot: process.cwd(),
  captureSource: true,
});

const wsTransport = new WebSocketTransport({
  url: 'ws://localhost:8765',
  autoReconnect: true,
  onConnectionChange: (state) => {
    console.log(`VVF connection: ${state}`);
  },
});

// Connect before tests
beforeAll(async () => {
  await wsTransport.connect();
  await wsTransport.startSession('Test Run');
  logger.addTransport(wsTransport.getTransport());
});

// End session after tests
afterAll(async () => {
  await wsTransport.endSession('pass');
  wsTransport.disconnect();
});

export { logger };
```

### Using in Your Code

```typescript
// src/lock-manager.ts
import { logger } from '../test/setup';

export class LockManager {
  async acquireLock(lockId: string): Promise<void> {
    logger.info(`Acquiring lock: ${lockId}`);
    // ... implementation
    logger.info(`Lock acquired: ${lockId}`);
  }

  async releaseLock(lockId: string): Promise<void> {
    logger.info(`Releasing lock: ${lockId}`);
    // ... implementation
    logger.info(`Lock released: ${lockId}`);
  }
}
```

## Event Flow Summary

1. **Test starts** → WebSocketTransport sends `session_start`
2. **Code logs** → Logger captures source location → WebSocketTransport sends `log`
3. **Server receives** → EventRecorderService processes → Events added to session
4. **UI updates** → Panel shows live events and session list
5. **Test ends** → WebSocketTransport sends `session_end` with result
6. **Playback** → User selects session → Events replayed to graph

## Troubleshooting

### Events not appearing

1. Check WebSocket connection status
2. Verify source paths in logs match VGC config patterns
3. Ensure recording is started (session active)

### Wrong component matched

1. Check your VGC config source patterns
2. Ensure paths are relative to project root
3. Use glob patterns for flexibility (e.g., `src/client/*.ts`)

### Performance issues with many logs

1. Use `createBufferedRecorderTransport` for batching
2. Increase `flushIntervalMs` for less frequent updates
3. Use `filter` to exclude debug-level logs

## Related Files

- `packages/core/src/EventRecorderService.ts` - Message handling
- `packages/core/src/SessionManager.ts` - Session management
- `packages/logger/src/transports/WebSocketTransport.ts` - Client transport
- `industry-themed-visual-validation-panel/src/panels/EventRecorderPanel.tsx` - UI component
