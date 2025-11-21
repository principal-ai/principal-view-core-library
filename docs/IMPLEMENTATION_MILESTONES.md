# Implementation Milestones: Path-Based Log Association

This document outlines a two-phase implementation plan for integrating the Visual Validation Framework into existing projects using path-based log association.

## Overview

The path-based association approach maps components to source file paths, allowing automatic visualization of component activity without requiring pattern matching or code changes. This provides a progressive enhancement path: start simple with basic activity tracking, then optionally refine with specific action patterns.

**Key Principle**: Configuration matches code organization. If a component exists in `lib/lock-manager.ts`, logs from that file automatically associate with the `lock-manager` component.

---

## Milestone 1: Core Path-Based Association

**Goal**: Enable basic component activity visualization with zero code changes to target projects.

### Deliverables

#### 1. Enhanced Logger Integration (`@vvf/logger`)

**Purpose**: Automatically capture log source information via stack trace analysis.

**Implementation**:
```typescript
interface LogMetadata {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  source?: {
    file: string;      // Relative path: "lib/lock-manager.ts"
    line?: number;
    column?: number;
  };
}

class EnhancedLogger {
  private captureSource(): LogMetadata['source'] {
    const stack = new Error().stack;
    // Parse stack trace to extract caller location
    // Return normalized relative path
  }

  log(level: string, message: string, ...args: any[]): void {
    const metadata: LogMetadata = {
      timestamp: Date.now(),
      level,
      source: this.captureSource()
    };

    this.emit({ message, metadata, args });
  }
}
```

**Features**:
- Drop-in wrapper for existing loggers (winston, bunyan, pino)
- Automatic source path capture via stack trace
- Normalized relative paths (handles both `/Users/x/project/lib/foo.ts` → `lib/foo.ts`)
- Transport to event processor

#### 2. Path-Based Configuration Schema

**Purpose**: Define component-to-source mappings in graph configuration.

**Schema Extension**:
```yaml
components:
  lock-manager:
    type: resource
    label: Lock Manager
    sources:
      - "lib/lock-manager.ts"
      - "lib/branch-aware-lock-manager.ts"  # Multiple files per component

  github-api:
    type: external-service
    label: GitHub API
    sources:
      - "lib/github-api-client.ts"
      - "services/github/*.ts"  # Glob patterns supported
```

**Validation**:
- Ensure all source paths are valid (warn on missing files)
- Detect overlapping paths (one log shouldn't match multiple components)
- Support glob patterns for directory-level mapping

#### 3. Path-Based Event Processor

**Purpose**: Associate logs with components and generate component activity events.

**Core Algorithm**:
```typescript
class PathBasedEventProcessor {
  private componentSourceMap: Map<string, string[]>; // componentId → source paths

  processLog(log: LogEntry): GraphEvent | null {
    const { message, metadata } = log;

    if (!metadata.source?.file) {
      return null; // Skip logs without source information
    }

    // Find component by matching source path
    const componentId = this.findComponentByPath(metadata.source.file);

    if (!componentId) {
      return null; // Log doesn't match any configured component
    }

    // Generate component activity event
    return {
      type: 'component-activity',
      componentId,
      timestamp: metadata.timestamp,
      level: metadata.level,
      message,
      source: metadata.source
    };
  }

  private findComponentByPath(logPath: string): string | null {
    for (const [componentId, sourcePaths] of this.componentSourceMap) {
      if (sourcePaths.some(pattern => this.matchesPattern(logPath, pattern))) {
        return componentId;
      }
    }
    return null;
  }
}
```

**Event Output**:
```typescript
interface ComponentActivityEvent {
  type: 'component-activity';
  componentId: string;      // "lock-manager"
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: {
    file: string;
    line?: number;
  };
}
```

#### 4. Default Visualization Behavior

**Purpose**: Render component activity events as visual pulses.

**Animation Mapping**:
- `debug` logs → subtle pulse (0.3 opacity, 800ms duration)
- `info` logs → standard pulse (0.5 opacity, 1000ms duration)
- `warn` logs → amber pulse (1.0 opacity, 1200ms duration)
- `error` logs → red flash (1.0 opacity, 1500ms duration, shake animation)

**React Integration**:
```typescript
function GraphRenderer({ config, events }: Props) {
  const handleComponentActivity = (event: ComponentActivityEvent) => {
    const animation = {
      type: mapLogLevelToAnimation(event.level),
      duration: mapLogLevelToDuration(event.level),
      timestamp: event.timestamp
    };

    updateNodeAnimation(event.componentId, animation);
  };
}
```

### Integration Example

**Scenario**: Integrate with `repository-traffic-controller` project.

**Step 1**: Wrap existing logger
```typescript
// lib/logger.ts (existing)
import winston from 'winston';
export const logger = winston.createLogger({ /* config */ });

// Add VVF integration (single import)
import { enhanceLogger } from '@vvf/logger';
enhanceLogger(logger, { projectRoot: __dirname });
```

**Step 2**: Define component sources in configuration
```yaml
# vvf.config.yaml
components:
  lock-manager:
    type: resource
    label: Lock Manager
    sources: ["lib/lock-manager.ts"]

  github-api:
    type: external-service
    label: GitHub API
    sources: ["lib/github-api-client.ts"]
```

**Step 3**: Run visualization
```bash
vvf watch --config vvf.config.yaml
```

**Result**: All logs from `lib/lock-manager.ts` create visual pulses on the lock-manager node.

### Success Criteria

- [ ] Enhanced logger captures source paths with 95%+ accuracy
- [ ] Glob pattern matching works for directory-level mappings
- [ ] Zero code changes required in target project (beyond logger wrapper)
- [ ] Component activity events generated for all matched logs
- [ ] Default animations render correctly for all log levels
- [ ] Performance: <10ms overhead per log entry
- [ ] Works with winston, bunyan, and pino logger libraries

---

## Milestone 2: Action Pattern Refinement

**Goal**: Enable specific state transitions and edge activations through optional pattern matching.

### Deliverables

#### 1. Action Pattern Schema

**Purpose**: Define optional patterns to extract specific state changes from logs.

**Configuration Extension**:
```yaml
components:
  lock-manager:
    type: resource
    label: Lock Manager
    sources:
      - "lib/lock-manager.ts"

    # OPTIONAL: Extract specific actions from matched logs
    actions:
      - pattern: "Lock acquired for (?<lockId>\\S+)"
        event: lock_acquired
        state: acquired
        metadata:
          lockId: "$lockId"  # Capture group extraction

      - pattern: "Lock released for (?<lockId>\\S+)"
        event: lock_released
        state: idle
        metadata:
          lockId: "$lockId"

      - pattern: "Lock acquisition failed: (?<reason>.*)"
        event: lock_failed
        state: error
        metadata:
          reason: "$reason"
```

**Schema Fields**:
- `pattern`: Regex to match log message (with named capture groups)
- `event`: Event type to emit when pattern matches
- `state`: Component state to transition to (optional)
- `metadata`: Extract data from capture groups (optional)

#### 2. Action Pattern Processor

**Purpose**: Parse matched logs to extract structured events.

**Enhanced Processing**:
```typescript
class ActionPatternProcessor {
  processLog(log: LogEntry, componentId: string, config: ComponentConfig): GraphEvent {
    // First, try to match action patterns
    if (config.actions) {
      for (const action of config.actions) {
        const match = log.message.match(new RegExp(action.pattern));
        if (match) {
          return {
            type: 'component-action',
            componentId,
            action: action.event,
            state: action.state,
            timestamp: log.metadata.timestamp,
            metadata: this.extractMetadata(match, action.metadata),
            source: log.metadata.source
          };
        }
      }
    }

    // Fallback: generic component activity event
    return {
      type: 'component-activity',
      componentId,
      timestamp: log.metadata.timestamp,
      level: log.metadata.level,
      message: log.message,
      source: log.metadata.source
    };
  }

  private extractMetadata(match: RegExpMatchArray, template: Record<string, string>): Record<string, any> {
    const metadata: Record<string, any> = {};
    for (const [key, value] of Object.entries(template)) {
      if (value.startsWith('$') && match.groups) {
        metadata[key] = match.groups[value.slice(1)];
      }
    }
    return metadata;
  }
}
```

**Event Output**:
```typescript
interface ComponentActionEvent {
  type: 'component-action';
  componentId: string;
  action: string;           // "lock_acquired"
  state?: string;           // "acquired"
  timestamp: number;
  metadata?: Record<string, any>;  // { lockId: "branch-123" }
  source: {
    file: string;
    line?: number;
  };
}
```

#### 3. Edge Activation Patterns

**Purpose**: Trigger edge animations based on interaction patterns.

**Configuration**:
```yaml
edges:
  - from: lock-manager
    to: github-api
    label: requests lock status

    # OPTIONAL: Activate edge when specific action occurs
    activatedBy:
      - action: lock_acquired
        animation: flow
        direction: forward
        duration: 2000

connections:
  # Alternative: pattern-based edge activation
  - trigger:
      component: lock-manager
      action: lock_acquired
    activates:
      - edge: lock-manager→github-api
        animation: particle
        duration: 1500
```

**Processor Logic**:
```typescript
class EdgeActivationProcessor {
  processAction(event: ComponentActionEvent): EdgeAnimationEvent[] {
    const animations: EdgeAnimationEvent[] = [];

    // Find edges activated by this action
    for (const edge of this.config.edges) {
      if (edge.activatedBy) {
        for (const trigger of edge.activatedBy) {
          if (trigger.action === event.action) {
            animations.push({
              type: 'edge-animation',
              edgeId: edge.id,
              animation: trigger.animation,
              direction: trigger.direction,
              duration: trigger.duration,
              timestamp: event.timestamp
            });
          }
        }
      }
    }

    return animations;
  }
}
```

#### 4. State-Based Visualization

**Purpose**: Update component visual state based on extracted state transitions.

**Visual State Mapping**:
```typescript
const stateVisualMap = {
  idle: { color: '#94a3b8', border: 'solid' },
  acquired: { color: '#22c55e', border: 'solid', glow: true },
  waiting: { color: '#eab308', border: 'dashed', pulse: true },
  error: { color: '#ef4444', border: 'solid', shake: true }
};

function GraphRenderer({ config, events }: Props) {
  const handleComponentAction = (event: ComponentActionEvent) => {
    if (event.state) {
      updateNodeState(event.componentId, {
        visual: stateVisualMap[event.state],
        metadata: event.metadata
      });
    }
  };
}
```

### Integration Example

**Scenario**: Enhanced RTC visualization with state tracking.

**Configuration**:
```yaml
components:
  lock-manager:
    sources: ["lib/lock-manager.ts"]
    actions:
      - pattern: "Lock acquired for (?<lockId>\\S+)"
        event: lock_acquired
        state: acquired
      - pattern: "Lock released"
        event: lock_released
        state: idle

edges:
  - from: request-handler
    to: lock-manager
    label: requests lock
    activatedBy:
      - action: lock_acquired
        animation: flow
        duration: 1500
```

**Result**:
- Generic activity: Logs create pulses (Milestone 1)
- Specific actions: "Lock acquired" → green glow + state transition
- Edge activation: lock_acquired triggers flow animation on incoming edge
- Metadata display: Tooltip shows `{ lockId: "branch-123" }`

### Success Criteria

- [ ] Action patterns extract structured events from logs
- [ ] Capture groups populate event metadata correctly
- [ ] State transitions update node visual appearance
- [ ] Edge activation triggers animations based on actions
- [ ] Fallback to generic activity events when no pattern matches
- [ ] Configuration validates action patterns (valid regex)
- [ ] Performance: <5ms additional overhead for pattern matching
- [ ] Documentation includes pattern authoring guide

---

## Implementation Timeline

### Milestone 1: Core Path-Based Association
**Duration**: 2-3 weeks
**Dependencies**: None
**Output**: Fully functional basic visualization with activity tracking

**Week 1**: Enhanced logger + source capture
**Week 2**: Path-based processor + configuration schema
**Week 3**: Default animations + integration testing

### Milestone 2: Action Pattern Refinement
**Duration**: 1-2 weeks
**Dependencies**: Milestone 1 complete
**Output**: Advanced visualization with state tracking and edge activation

**Week 1**: Action pattern processor + schema extension
**Week 2**: Edge activation + state-based visualization + documentation

---

## Progressive Enhancement Strategy

Users can adopt the framework incrementally:

1. **Level 0**: No integration (static graph visualization only)
2. **Level 1**: Milestone 1 - Basic activity tracking (logger wrapper + source mapping)
3. **Level 2**: Milestone 2 - Action patterns for critical paths
4. **Level 3**: Milestone 2 - Full action patterns + edge activation

**Recommendation**: Start at Level 1 for immediate value, then selectively add action patterns for high-value components in Level 2.

---

## Testing Strategy

### Milestone 1 Tests

**Unit Tests**:
- Source path extraction from stack traces
- Glob pattern matching for source paths
- Component-path mapping lookup
- Event generation from logs

**Integration Tests**:
- Winston logger wrapper
- Bunyan logger wrapper
- Pino logger wrapper
- End-to-end: log → event → visualization

**Performance Tests**:
- 10,000 logs/sec throughput
- Source capture overhead <10ms
- Memory usage <50MB for 100k events

### Milestone 2 Tests

**Unit Tests**:
- Regex pattern matching
- Capture group extraction
- State transition logic
- Edge activation triggers

**Integration Tests**:
- Pattern-based event extraction
- State-based visual updates
- Edge animation coordination
- Fallback to activity events

**Validation Tests**:
- Invalid regex patterns rejected
- Missing capture groups handled gracefully
- Overlapping patterns warn user

---

## Documentation Deliverables

### Milestone 1
- [ ] Quick Start: Path-based integration guide
- [ ] Configuration Reference: Source mapping schema
- [ ] Logger Integration: Wrapper setup for winston/bunyan/pino
- [ ] Troubleshooting: Source path issues, glob patterns

### Milestone 2
- [ ] Pattern Authoring Guide: Writing effective action patterns
- [ ] State Visualization: Customizing visual states
- [ ] Edge Activation: Trigger patterns and animations
- [ ] Migration Guide: Upgrading from M1 to M2

---

## Risk Mitigation

### Milestone 1 Risks

**Risk**: Source path extraction fails on some JavaScript runtimes
- **Mitigation**: Manual source annotation fallback: `logger.log('message', { _vvfSource: 'lib/foo.ts' })`

**Risk**: Performance overhead unacceptable for high-volume logging
- **Mitigation**: Sampling mode (capture 1/N logs), async processing queue

**Risk**: Glob patterns don't match expected files
- **Mitigation**: Validation tool: `vvf validate-config --check-sources`

### Milestone 2 Risks

**Risk**: Regex patterns too complex, users make mistakes
- **Mitigation**: Pattern testing tool: `vvf test-pattern "Lock acquired.*" --sample-logs logs.txt`

**Risk**: Pattern changes break existing configurations
- **Mitigation**: Configuration versioning, migration scripts

---

## Success Metrics

### Milestone 1
- **Adoption**: 3+ projects integrated using path-based approach
- **Performance**: <10ms overhead per log, 10k logs/sec sustained
- **Accuracy**: 95%+ source path capture rate
- **User Experience**: <5 minutes from install to first visualization

### Milestone 2
- **Coverage**: 80%+ of critical paths have action patterns
- **Accuracy**: 90%+ pattern match rate (vs manual review)
- **User Experience**: <15 minutes to add first action pattern
- **Value**: Users report state tracking "significantly improves debugging"
