# Path-Based Component Association

> **Key Insight**: Associate logs with components based on their SOURCE (file path), not their CONTENT (pattern matching).
> **Benefit**: Simple, automatic, and matches how developers actually organize code.

**Last Updated**: 2025-11-23
**Status**: Implemented (v0.3.0+)

> **Note**: All configuration examples in this document should be saved in the `.vgc/` folder at your project root. The framework now supports multiple configurations for different visualization needs. See [.vgc/README.md](../.vgc/README.md) and [CONFIGURATION_REFERENCE.md](./CONFIGURATION_REFERENCE.md) for details.

---

## The Core Idea

### Instead of Pattern Matching Content:
```
❌ Parse "Order 12345 created" → Extract order ID → Create node
```

### Associate Based on Source:
```
✅ Log from `services/order-service.ts` → order-service component
✅ Log from `lib/lock-manager.ts` → lock-manager component
✅ Log from `database/postgres.ts` → database component
```

**All logs from that path automatically belong to that component.**

---

## Why This Makes Sense

### 1. **Matches Code Organization**

Developers already organize code by component:
```
services/
  ├── order-service.ts       → "order-service" component
  ├── payment-service.ts     → "payment-service" component
  └── notification-service.ts → "notification-service" component
```

Just map files → components in config!

### 2. **Captures ALL Activity**

Don't need perfect log messages - you see everything:
```
// All of these become visible for "order-service"
logger.info('Processing order 123');
logger.debug('Connecting to database');
logger.warn('Retry attempt 2');
logger.error('Payment failed');
```

### 3. **Optional Refinement**

Start broad (all logs), then add specific patterns for actions:
```yaml
components:
  order-service:
    sources:
      - "services/order-service.ts"  # All logs included

    # OPTIONAL: Extract specific actions
    actions:
      - pattern: "Processing order {id}"
        type: "order_processing"
```

---

## Configuration Design

### Minimal Configuration

**File**: `.vgc/order-processing.yaml`

```yaml
metadata:
  name: "Order Processing System"
  version: "1.0.0"

# Map components to source paths
components:
  order-service:
    type: service
    shape: rectangle
    color: "#4A90E2"
    sources:
      - "services/order-service.ts"
      - "services/order/**/*.ts"  # Glob pattern

  payment-service:
    type: service
    shape: rectangle
    color: "#10B981"
    sources:
      - "services/payment-service.ts"

  database:
    type: infrastructure
    shape: circle
    color: "#7B68EE"
    sources:
      - "database/**/*.ts"
      - "lib/db-client.ts"

  lock-manager:
    type: service
    shape: diamond
    color: "#F59E0B"
    sources:
      - "lib/lock-manager.ts"
      - "lib/branch-aware-lock-manager.ts"
```

**That's it!** Parser sees log from `lib/lock-manager.ts` → associates with "lock-manager" component.

---

## How Logs Flow

### 1. Structured Logs (Best Case)

```javascript
// services/order-service.ts
logger.info('Processing order', {
  orderId: 123,
  source: __filename  // 'services/order-service.ts'
});
```

Parser sees:
- `source: "services/order-service.ts"`
- Config says: `order-service.sources = ["services/order-service.ts"]`
- → Associates log with `order-service` component

### 2. Stack Trace Capture

```javascript
// Automatically add source to logs
const logger = {
  info: (...args) => {
    const stack = new Error().stack;
    const source = extractCallerPath(stack);
    console.log(JSON.stringify({
      level: 'info',
      message: args,
      source: source  // Auto-captured!
    }));
  }
};
```

### 3. Process-Level Association

For separate processes:
```bash
# Run with component identifier
VVF_COMPONENT=order-service node services/order-service.js
```

All logs from this process → `order-service` component.

### 4. Sidecar with File Watching

```
order-service logs → stdout → Sidecar
Sidecar knows: "This process = order-service"
All logs → order-service component
```

---

## Complete Example: Repository Traffic Controller

### Configuration

```yaml
metadata:
  name: "Repository Traffic Controller"
  version: "1.0.0"
  description: "WebSocket collaboration server"

# Define components and their source files
components:
  # Main server
  server:
    type: service
    shape: hexagon
    color: "#4A90E2"
    icon: "Server"
    sources:
      - "server-control-tower.ts"

  # Lock management system
  lock-manager:
    type: service
    shape: diamond
    color: "#F59E0B"
    icon: "Lock"
    sources:
      - "lib/lock-manager.ts"
      - "lib/branch-aware-lock-manager.ts"

  # Presence tracking
  presence:
    type: service
    shape: rectangle
    color: "#10B981"
    icon: "Users"
    sources:
      - "lib/presence/**/*.ts"

  # Authentication
  auth:
    type: service
    shape: rectangle
    color: "#7B68EE"
    icon: "Shield"
    sources:
      - "lib/adapters/JWTAuthAdapter.ts"

  # API routes
  api:
    type: interface
    shape: rectangle
    color: "#EC4899"
    icon: "Globe"
    sources:
      - "app/api/**/*.ts"

# OPTIONAL: Define how components connect
connections:
  - from: server
    to: lock-manager
    type: uses

  - from: server
    to: presence
    type: uses

  - from: server
    to: auth
    type: uses

  - from: api
    to: server
    type: calls

# OPTIONAL: Extract specific actions from logs
actions:
  lock-manager:
    - pattern: "Lock acquired"
      event: lock_acquired
      state: acquired

    - pattern: "Lock released"
      event: lock_released
      state: released

  auth:
    - pattern: "authenticated as {userId}"
      event: authenticated
      extract:
        userId: userId
```

### How It Works

**Scenario 1: Basic association**
```javascript
// lib/lock-manager.ts
logger.info('Lock acquired: file.txt');
```

Parser receives:
```json
{
  "level": "info",
  "message": "Lock acquired: file.txt",
  "source": "lib/lock-manager.ts",
  "timestamp": "2025-11-21T12:00:00Z"
}
```

Parser logic:
1. Check `source` field → `"lib/lock-manager.ts"`
2. Match against config → `lock-manager.sources = ["lib/lock-manager.ts"]`
3. Create activity event for `lock-manager` component

**Scenario 2: With action extraction**
```javascript
// lib/lock-manager.ts
logger.info('Lock acquired: file.txt');
```

Parser:
1. Associates with `lock-manager` (from path)
2. Checks action patterns for `lock-manager`
3. Matches "Lock acquired" → Creates `lock_acquired` event with state

---

## Event Types

### Component Activity Event (Default)

When log has no matching action pattern:

```typescript
{
  id: "evt-1732204800000",
  type: "component_activity",
  timestamp: 1732204800000,
  category: "data",
  operation: "update",
  payload: {
    targetId: "lock-manager",
    targetType: "node",
    updates: {
      lastActivity: 1732204800000,
      lastLog: "Lock acquired: file.txt",
      logLevel: "info"
    }
  }
}
```

**Visual Effect**: Component node pulses/highlights to show activity.

### Action Event (When Pattern Matches)

When log matches an action pattern:

```typescript
{
  id: "evt-1732204800000",
  type: "lock_acquired",
  timestamp: 1732204800000,
  category: "state",
  operation: "update",
  payload: {
    nodeId: "lock-manager",
    newState: "acquired",
    data: {
      // extracted from log
    }
  }
}
```

**Visual Effect**: State change animation, color change, etc.

---

## Implementation: Logger with Auto-Source

### Enhance Existing Logger

```typescript
// lib/logger.ts (modified)
import path from 'path';

function getCallerSource(): string {
  const stack = new Error().stack || '';
  const lines = stack.split('\n');

  // Find first line that's not in logger.ts
  for (const line of lines) {
    if (!line.includes('logger.ts')) {
      const match = line.match(/\((.+?):(\d+):(\d+)\)/);
      if (match) {
        const filePath = match[1];
        // Make relative to project root
        return path.relative(process.cwd(), filePath);
      }
    }
  }

  return 'unknown';
}

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const prefix = (level: string, args: unknown[]) =>
  [new Date().toISOString(), `[${level}]`, ...args];

export const logger: Logger = {
  info: (...args: unknown[]) => {
    const source = getCallerSource();
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: args,
      source: source,  // AUTO-ADDED
    }));
  },

  warn: (...args: unknown[]) => {
    const source = getCallerSource();
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: args,
      source: source,
    }));
  },

  error: (...args: unknown[]) => {
    const source = getCallerSource();
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: args,
      source: source,
      stack: new Error().stack,
    }));
  },
};
```

**Change Required**: Just swap logger implementation - no changes to log calls!

---

## Parser Implementation

```typescript
// packages/core/src/PathBasedParser.ts

interface ComponentConfig {
  type: string;
  shape: string;
  color: string;
  sources: string[];  // File path patterns
  actions?: ActionPattern[];
}

interface ActionPattern {
  pattern: string | RegExp;
  event: string;
  state?: string;
  extract?: Record<string, string>;
}

interface PathBasedConfig {
  metadata: {
    name: string;
    version: string;
  };
  components: Record<string, ComponentConfig>;
  connections?: Array<{ from: string; to: string; type: string }>;
}

export class PathBasedParser {
  private config: PathBasedConfig;
  private pathIndex: Map<string, string>; // path → component name

  constructor(config: PathBasedConfig) {
    this.config = config;
    this.pathIndex = this.buildPathIndex();
  }

  private buildPathIndex(): Map<string, string> {
    const index = new Map<string, string>();

    for (const [componentName, component] of Object.entries(this.config.components)) {
      for (const sourcePattern of component.sources) {
        // Support glob patterns
        if (sourcePattern.includes('*')) {
          // Store as pattern for matching later
          index.set(sourcePattern, componentName);
        } else {
          // Exact match
          index.set(sourcePattern, componentName);
        }
      }
    }

    return index;
  }

  parse(log: StructuredLog): GraphEvent[] {
    const events: GraphEvent[] = [];

    // 1. Find component from source path
    const componentName = this.findComponent(log.source);
    if (!componentName) {
      return events; // Unknown source, skip
    }

    // 2. Create activity event (always)
    events.push(this.createActivityEvent(componentName, log));

    // 3. Check for action patterns (optional)
    const actionEvent = this.extractActionEvent(componentName, log);
    if (actionEvent) {
      events.push(actionEvent);
    }

    return events;
  }

  private findComponent(sourcePath: string): string | null {
    // Try exact match first
    if (this.pathIndex.has(sourcePath)) {
      return this.pathIndex.get(sourcePath)!;
    }

    // Try glob patterns
    for (const [pattern, componentName] of this.pathIndex) {
      if (pattern.includes('*')) {
        if (this.matchGlob(sourcePath, pattern)) {
          return componentName;
        }
      }
    }

    return null;
  }

  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob to regex
    const regex = new RegExp(
      '^' + pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.')
      + '$'
    );
    return regex.test(path);
  }

  private createActivityEvent(
    componentName: string,
    log: StructuredLog
  ): GraphEvent {
    return {
      id: `evt-${Date.now()}-${componentName}`,
      type: 'component_activity',
      timestamp: new Date(log.timestamp).getTime(),
      category: 'data',
      operation: 'update',
      payload: {
        targetId: componentName,
        targetType: 'node',
        updates: {
          lastActivity: Date.now(),
          lastLog: this.formatMessage(log.message),
          logLevel: log.level,
          source: log.source,
        }
      },
      metadata: {
        source: 'path-based-parser',
        logLine: JSON.stringify(log),
      }
    };
  }

  private extractActionEvent(
    componentName: string,
    log: StructuredLog
  ): GraphEvent | null {
    const component = this.config.components[componentName];
    if (!component.actions) {
      return null;
    }

    const message = this.formatMessage(log.message);

    for (const action of component.actions) {
      const match = this.matchPattern(message, action.pattern);
      if (match) {
        return {
          id: `evt-${Date.now()}-action-${componentName}`,
          type: action.event,
          timestamp: new Date(log.timestamp).getTime(),
          category: action.state ? 'state' : 'system',
          operation: 'update',
          payload: action.state ? {
            nodeId: componentName,
            newState: action.state,
            data: match.extracted,
          } : {
            action: action.event,
            data: match.extracted,
          }
        };
      }
    }

    return null;
  }

  private formatMessage(message: any): string {
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join(' ');
    return JSON.stringify(message);
  }

  private matchPattern(text: string, pattern: string | RegExp) {
    if (pattern instanceof RegExp) {
      const match = text.match(pattern);
      return match ? { matched: true, extracted: match.groups || {} } : null;
    }

    // Simple string match
    if (text.includes(pattern)) {
      return { matched: true, extracted: {} };
    }

    return null;
  }

  getStats() {
    return {
      totalComponents: Object.keys(this.config.components).length,
      totalSources: this.pathIndex.size,
      componentsWithActions: Object.values(this.config.components)
        .filter(c => c.actions && c.actions.length > 0).length,
    };
  }
}

interface StructuredLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string | unknown[];
  source: string;
  [key: string]: any;
}
```

---

## Visualization: Component Activity

### Default Behavior

Components show activity with visual feedback:

```typescript
// In GraphRenderer
{
  nodes: [
    {
      id: 'lock-manager',
      type: 'service',
      data: {
        label: 'Lock Manager',
        lastActivity: Date.now(),
        logLevel: 'info',
        lastLog: 'Lock acquired: file.txt',

        // Visual indicators
        activityIndicator: 'pulse',  // Pulse animation
        activityColor: '#10B981',    // Green for info
      }
    }
  ]
}
```

**Visual Effects**:
- **Pulse**: Node pulses when log received
- **Color**: Border color based on log level (info=green, warn=yellow, error=red)
- **Tooltip**: Hover shows recent logs
- **Badge**: Show log count

---

## Integration Steps: Repository Traffic Controller

### Step 1: Create Component Config

```yaml
# vvf-rtc.yaml
metadata:
  name: "Repository Traffic Controller"
  version: "1.0.0"

components:
  server:
    type: service
    shape: hexagon
    color: "#4A90E2"
    sources:
      - "server-control-tower.ts"

  lock-manager:
    type: service
    shape: diamond
    color: "#F59E0B"
    sources:
      - "lib/lock-manager.ts"
      - "lib/branch-aware-lock-manager.ts"

  presence:
    type: service
    shape: rectangle
    color: "#10B981"
    sources:
      - "lib/presence/**/*.ts"
```

### Step 2: Enhance Logger (One File Change)

```typescript
// lib/logger.ts
// Add auto-source capture (see implementation above)
```

### Step 3: Start Parser

```bash
# Watch logs and parse
node server-control-tower.ts | vvf parse --config vvf-rtc.yaml
```

Or programmatically:

```typescript
// Add to server startup
import { PathBasedParser } from '@vvf/path-parser';

const parser = new PathBasedParser(config);

// Intercept logger
const originalInfo = logger.info;
logger.info = (...args) => {
  originalInfo(...args);

  const log = {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: args,
    source: getCallerSource(),
  };

  const events = parser.parse(log);
  events.forEach(event => visualValidation.processEvent(event));
};
```

### Step 4: View Graph

Open VVF server → See components light up with activity!

---

## Benefits

### 1. **Zero Configuration for Basic Visualization**

Just list files → components. Done.

### 2. **Captures ALL Activity**

Don't miss logs because pattern doesn't match.

### 3. **Natural Organization**

Matches how code is already structured.

### 4. **Progressive Enhancement**

Start simple (all logs → activity), add patterns for specific actions later.

### 5. **Works with Any Log Format**

Just need `source` field - content doesn't matter for basic association.

---

## Advanced: Log Aggregation

Show aggregate stats per component:

```typescript
{
  id: 'lock-manager',
  data: {
    label: 'Lock Manager',
    stats: {
      totalLogs: 1523,
      errorCount: 3,
      warnCount: 12,
      infoCount: 1508,
      logsPerMinute: 25,
      recentErrors: ['Lock timeout', 'Invalid agent ID'],
    }
  }
}
```

---

## Summary

**Key Simplification**: Associate logs with components by SOURCE PATH, not content parsing.

**Configuration**:
```yaml
components:
  my-service:
    sources:
      - "services/my-service.ts"
```

**Parser Logic**:
```
Log from "services/my-service.ts" → my-service component
```

**Optional Enhancement**:
```yaml
components:
  my-service:
    sources: ["services/my-service.ts"]
    actions:
      - pattern: "Started"  # OPTIONAL
        event: service_started
```

**Benefits**:
- ✅ Simple configuration
- ✅ Automatic association
- ✅ Captures all activity
- ✅ Matches code organization
- ✅ Optional refinement

**Next Steps**:
1. Extend logger to capture `source`
2. Build `PathBasedParser`
3. Test with repository-traffic-controller
4. Add optional action patterns

**Timeline**: 3-5 days for working prototype

---

**Document Owner**: Development Team
**Last Updated**: 2025-11-21
**Status**: Design Proposal - Ready for Implementation
