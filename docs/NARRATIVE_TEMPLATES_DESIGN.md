# Narrative Template System: Human-Readable Execution Stories

This document outlines the design for a narrative template system that transforms OpenTelemetry event streams into human-readable execution stories based on OTEL canvas definitions.

## Overview

The narrative template system addresses a core usability challenge: **OTEL event data is optimized for machines, not humans**. While `.otel.canvas` files define event schemas and system flows, they don't provide a way to tell the story of what actually happened during execution.

**Key Principle**: Separate event schema definitions from narrative presentation, allowing multiple narrative views of the same execution data.

### Problem Statement

Given an execution that generates OTEL events:
```
[
  { name: "conversion.started", attributes: { config.nodeTypes: 5 } },
  { name: "conversion.processingNodes", attributes: { nodes.count: 12 } },
  { name: "conversion.complete", attributes: { result.nodes.count: 12, duration.ms: 45 } }
]
```

Current state: Users must manually interpret raw event data.

Desired state: Automatically generate readable narratives:
```
✅ Graph Converter Succeeded
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Processing configuration with 5 node types
Converting 12 node definitions
✅ Generated 12 nodes in 45ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SUCCESS - Graph ready
```

---

## Architecture

### File Structure

The system introduces a new file type: `.narrative.json` files that reference `.otel.canvas` files.

```
.principal-views/
├── graph-converter-execution.otel.canvas           # Event schema (unchanged)
├── graph-converter-execution.narrative.json        # Default narrative templates
├── graph-converter-execution.narrative-dev.json    # Developer debugging view
├── graph-converter-execution.narrative-exec.json   # Executive summary view
└── rules-engine-execution.otel.canvas
    ├── rules-engine-execution.narrative.json
    └── rules-engine-execution.narrative-debug.json
```

### Separation of Concerns

| File Type | Responsibility | Owned By | Change Frequency |
|-----------|---------------|----------|------------------|
| `.otel.canvas` | Event schema, node definitions, graph structure | Engineers | Low - structural changes only |
| `.narrative.json` | Human-readable templates, scenarios, formatting | Technical writers / Engineers | Medium - template refinement |

### High-Level Flow

```
┌─────────────────┐
│ OTEL Events     │ (collected during execution)
│ - Spans         │
│ - Logs          │
│ - Attributes    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Canvas Scope Filtering  │ (match events to canvas)
│ - Resource matching     │
│ - Scope evaluation      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Span Tree Construction  │ (build execution hierarchy)
│ - Parent-child links    │
│ - Temporal ordering     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Scenario Matching       │ (select narrative based on events)
│ - Evaluate conditions   │
│ - First-match wins      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Template Rendering      │ (generate final narrative)
│ - Attribute injection   │
│ - Formatting            │
└────────┬────────────────┘
         │
         ▼
┌─────────────────┐
│ Human-Readable  │
│ Narrative Text  │
└─────────────────┘
```

### OTEL Signal Types in Narratives

The narrative system supports all three OpenTelemetry signal types:

#### 1. Spans (Traces)
- **What**: Execution traces representing operations
- **Key Data**: Name, duration, parent-child relationships, attributes
- **Use in Narratives**: Primary structure for execution flow
- **Example**: `conversion.started`, `rule.completed`

```typescript
interface OtelSpan {
  name: string;              // "conversion.started"
  spanId: string;
  traceId: string;
  parentSpanId?: string;     // For hierarchy
  startTime: string;
  endTime: string;
  duration: number;          // Computed from start/end
  attributes: {              // Event-specific data
    "config.nodeTypes": 5,
    "result.nodes.count": 12
  };
}
```

#### 2. Logs
- **What**: Discrete log records emitted during execution
- **Key Data**: Severity, message body, trace context, attributes
- **Use in Narratives**: Detailed context, errors, debug info
- **Example**: Debug messages, error stack traces

```typescript
interface OtelLog {
  timestamp: string;
  observedTimestamp: string;
  traceId?: string;          // Links to span
  spanId?: string;           // Links to span
  severityText: string;      // "INFO", "ERROR", "DEBUG"
  severityNumber: number;    // 1-24 (OTEL standard)
  body: string;              // Main log message
  resource: {                // Service/resource attributes
    "service.name": string;
    "service.version": string;
  };
  attributes: {              // Log-specific attributes
    "error.type"?: string;
    "error.message"?: string;
    "error.stack"?: string;
  };
}
```

**Log Severity Levels (OTEL Standard):**
- TRACE (1-4): Very detailed debugging
- DEBUG (5-8): Debugging information
- INFO (9-12): Informational messages
- WARN (13-16): Warning conditions
- ERROR (17-20): Error conditions
- FATAL (21-24): Critical failures

#### 3. Metrics (Future)
- **What**: Numeric measurements over time
- **Key Data**: Name, value, unit, labels
- **Use in Narratives**: Performance statistics, aggregations
- **Example**: `conversion.duration.ms`, `rules.violation.count`

Note: Metrics support is planned for Phase 4.

#### Signal Integration Patterns

**Pattern 1: Span-First (Current Default)**
```json
{
  "mode": "span-tree",
  "template": {
    "events": {
      "conversion.started": "Started: {config.nodeTypes} types",
      "conversion.complete": "Completed in {duration.ms}ms"
    }
  }
}
```

**Pattern 2: Timeline (Interleaved Spans + Logs)**
```json
{
  "mode": "timeline",
  "template": {
    "events": {
      "conversion.started": "[SPAN] {timestamp} - Started conversion",
      "log.info": "[LOG] {timestamp} - {log.body}",
      "log.error": "[LOG] {timestamp} - ERROR: {log.body}",
      "conversion.complete": "[SPAN] {timestamp} - Completed"
    }
  }
}
```

**Pattern 3: Span with Associated Logs**
```json
{
  "mode": "span-tree",
  "showLogsPerSpan": true,
  "template": {
    "span": "→ {span.name}",
    "logs": "  📝 [{log.severityText}] {log.body}",
    "children": "recurse"
  }
}
```

Example output:
```
→ conversion.started
  📝 [INFO] Loading configuration file
  📝 [DEBUG] Found 5 node types

  → conversion.processingNodes
    📝 [DEBUG] Validating node 'auth-service'
    📝 [ERROR] Node 'missing' not found
```

#### Log-Based Scenarios

Scenarios can match based on log presence or content:

```json
{
  "scenarios": [
    {
      "id": "error-logs-present",
      "priority": 1,
      "condition": {
        "requires": ["log.*"],
        "assertions": {
          "log.severityNumber": { "$gte": 17 }  // ERROR level
        }
      },
      "template": {
        "introduction": "❌ Errors Logged During Execution\n{'━'.repeat(50)}",
        "flow": [
          "Execution completed but error logs detected:",
          "",
          {
            "forEach": "logs.filter(l => l.severityNumber >= 17)",
            "template": "  [{log.timestamp}] {log.severityText}: {log.body}\n    Service: {log.resource['service.name']}"
          }
        ]
      }
    },
    {
      "id": "debug-verbose",
      "priority": 10,
      "condition": {
        "requires": ["log.*"],
        "assertions": {
          "debugLogs.count": { "$gt": 10 }
        }
      },
      "template": {
        "introduction": "🔍 Verbose Debug Session\n{'━'.repeat(50)}",
        "summary": "Captured {debugLogs.count} debug logs"
      }
    }
  ]
}
```

#### Accessing Log Data in Templates

All log fields are accessible via dot notation:

```json
{
  "events": {
    "log.error": "❌ {log.severityText}: {log.body}\n  Service: {log.resource['service.name']}\n  Error Type: {log.attributes['error.type']}\n  Stack:\n{log.attributes['error.stack']}"
  }
}
```

Renders as:
```
❌ ERROR: Failed to process node
  Service: graph-converter
  Error Type: ValidationError
  Stack:
    at GraphConverter.processNode (converter.ts:45)
    at GraphConverter.convert (converter.ts:23)
```

---

## Narrative Template Schema

### Root Structure

```typescript
interface NarrativeTemplate {
  // Metadata
  version: string;                    // Schema version (e.g., "1.0.0")
  canvas: string;                     // Reference to .otel.canvas file
  name: string;                       // Human-readable template name
  description: string;                // Purpose of this narrative view

  // Rendering configuration
  mode: NarrativeMode;                // How to structure the narrative
  scenarioSelection: 'first-match' | 'manual';

  // OTEL signal integration
  showLogsPerSpan?: boolean;          // Show logs associated with each span (span-tree mode)
  interleaveSignals?: boolean;        // Mix spans/logs by timestamp (timeline mode)

  // Scenario definitions
  scenarios: NarrativeScenario[];

  // Formatting options
  formatting?: FormattingOptions;
}

type NarrativeMode =
  | 'span-tree'      // Follow OTEL span hierarchy (uses parent-child relationships)
  | 'timeline'       // Chronological order (sorts all signals by timestamp)
  | 'summary-only';  // Just show summary, skip event details
```

### Scenario Definition

Scenarios are **mutually exclusive** narrative templates selected based on which events occurred.

```typescript
interface NarrativeScenario {
  // Identification
  id: string;                         // Unique scenario identifier
  priority: number;                   // Lower = higher priority (1 = highest)
  description: string;                // What this scenario represents

  // Matching logic
  condition: ScenarioCondition;

  // Template content
  template: ScenarioTemplate;
}

interface ScenarioCondition {
  // Event requirements
  requires?: string[];                // Must have these events (glob patterns)
  excludes?: string[];                // Must NOT have these events

  // Attribute assertions
  assertions?: Record<string, Assertion>;

  // Special conditions
  default?: boolean;                  // Always matches (use as fallback)
  any?: boolean;                      // Match if ANY requires condition met
}

interface Assertion {
  $gt?: number;                       // Greater than
  $gte?: number;                      // Greater than or equal
  $lt?: number;                       // Less than
  $lte?: number;                      // Less than or equal
  $eq?: any;                          // Equal to
  $ne?: any;                          // Not equal to
  $exists?: boolean;                  // Attribute exists/doesn't exist
  $in?: any[];                        // Value in array
}

interface ScenarioTemplate {
  introduction?: string;              // Opening text
  events?: Record<string, string>;    // Event/log name -> template mapping (e.g., "conversion.started", "log.error")
  logs?: LogTemplates;                // Optional: separate log templates by severity
  flow?: Array<string | FlowDirective>; // Narrative flow steps
  summary?: string;                   // Closing text
}

interface LogTemplates {
  trace?: string;                     // Template for TRACE logs
  debug?: string;                     // Template for DEBUG logs
  info?: string;                      // Template for INFO logs
  warn?: string;                      // Template for WARN logs
  error?: string;                     // Template for ERROR logs
  fatal?: string;                     // Template for FATAL logs
  default?: string;                   // Fallback for any log
}

interface FlowDirective {
  forEach?: string;                   // Iterate over collection
  template?: string;                  // Template for each item
  if?: string;                        // Conditional expression
  then?: string;                      // Template if condition true
  else?: string;                      // Template if condition false
}
```

### Formatting Options

```typescript
interface FormattingOptions {
  indentPerLevel?: string;            // Default: "  " (2 spaces)
  timestampFormat?: string;           // Default: "HH:mm:ss.SSS"
  showTimestamps?: boolean;           // Default: false
  showDuration?: boolean;             // Default: true
  showSpanIds?: boolean;              // Default: false (useful for debugging)
  showAttributes?: 'none' | 'matched' | 'all'; // Default: 'matched'
}
```

---

## Template Syntax

Templates use a simple expression language for attribute injection and formatting.

### Basic Attribute Injection

```
"Processing {config.nodeTypes} node types"
```

Renders as:
```
Processing 5 node types
```

### Nested Attributes

```
"Error: {error.phase} - {error.message}"
```

Renders as:
```
Error: edge processing - Invalid edge reference: node 'xyz' not found
```

### Computed Values

```
"Executed {engine.rules.count} rules in {total.ms}ms"
```

The system can inject:
- Direct event attributes: `{config.nodeTypes}`
- Aggregated values: `{total.violations}`, `{avg.duration}`
- Computed values: `{fixablePercent}`, `{successRate}`

### Conditional Expressions

```
"{result.violations.total > 0 ? '❌ FAILED' : '✅ PASSED'}"
```

### JavaScript-like Expressions

```
"{'━'.repeat(50)}"  // Generates: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Iteration

```json
{
  "forEach": "violations",
  "template": "  • Rule '{rule.id}': {violations.count} {violations.severity} issues"
}
```

Renders as:
```
  • Rule 'required-metadata': 2 error issues
  • Rule 'minimum-sources': 1 warning issues
```

---

## Scenario Matching Algorithm

### Priority-Based Selection

Scenarios are evaluated in **priority order** (lowest priority number first). The **first matching scenario** wins.

```typescript
function selectScenario(
  events: OtelEvent[],
  attributes: Record<string, any>,
  scenarios: NarrativeScenario[]
): NarrativeScenario {
  // Sort by priority (should already be sorted in file)
  const sorted = scenarios.sort((a, b) => a.priority - b.priority);

  for (const scenario of sorted) {
    if (matchesCondition(scenario.condition, events, attributes)) {
      return scenario;  // STOP - first match wins
    }
  }

  throw new Error("No scenario matched - ensure there's a default scenario");
}
```

### Condition Evaluation

```typescript
function matchesCondition(
  condition: ScenarioCondition,
  events: OtelEvent[],
  attributes: Record<string, any>
): boolean {
  // 1. Check required events
  if (condition.requires) {
    const matchMode = condition.any ? 'some' : 'every';
    const hasRequired = condition.requires[matchMode](
      pattern => hasEventMatching(events, pattern)
    );
    if (!hasRequired) return false;
  }

  // 2. Check excluded events
  if (condition.excludes) {
    const hasExcluded = condition.excludes.some(
      pattern => hasEventMatching(events, pattern)
    );
    if (hasExcluded) return false;
  }

  // 3. Check attribute assertions
  if (condition.assertions) {
    for (const [key, assertion] of Object.entries(condition.assertions)) {
      if (!evaluateAssertion(attributes[key], assertion)) {
        return false;
      }
    }
  }

  // 4. Default condition always matches
  if (condition.default) {
    return true;
  }

  return true;  // All checks passed
}
```

### Event Pattern Matching

Supports glob patterns for flexible matching:

```typescript
"*.error"           // Matches: conversion.error, rule.error, validation.error
"rule.*"            // Matches: rule.completed, rule.error, rule.started
"conversion.complete" // Exact match only
```

---

## Example: Complete Narrative Template

### File: `graph-converter-execution.narrative.json`

```json
{
  "version": "1.0.0",
  "canvas": "graph-converter-execution.otel.canvas",
  "name": "Default Narrative",
  "description": "Standard execution narrative for graph converter",

  "mode": "span-tree",
  "scenarioSelection": "first-match",

  "scenarios": [
    {
      "id": "conversion-error",
      "priority": 1,
      "description": "Fatal error during conversion",
      "condition": {
        "requires": ["conversion.error"]
      },
      "template": {
        "introduction": "❌ Graph Converter Failed\n{'━'.repeat(50)}",
        "events": {
          "conversion.started": "Started processing {config.nodeTypes} node types and {config.edgeTypes} edge types",
          "conversion.processingNodes": "Processing {nodes.count} nodes...",
          "conversion.processingEdges": "Processing {edges.count} edges...",
          "conversion.error": "❌ Error in {error.phase}: {error.message}"
        },
        "summary": "{'━'.repeat(50)}\n❌ FAILED - Conversion incomplete"
      }
    },
    {
      "id": "partial-conversion",
      "priority": 2,
      "description": "Conversion completed with warnings",
      "condition": {
        "requires": ["conversion.complete"],
        "assertions": {
          "result.nodes.count": { "$lt": 1 },
          "result.edges.count": { "$lt": 1 }
        }
      },
      "template": {
        "introduction": "⚠️  Graph Converter - Minimal Output\n{'━'.repeat(50)}",
        "events": {
          "conversion.started": "Processing configuration",
          "conversion.complete": "⚠️  Generated {result.nodes.count} nodes and {result.edges.count} edges"
        },
        "flow": [
          "Conversion completed but produced minimal results:",
          "  - Nodes: {result.nodes.count}",
          "  - Edges: {result.edges.count}",
          "",
          "This may indicate an issue with the input configuration."
        ],
        "summary": "{'━'.repeat(50)}\n⚠️  WARNING - Verify input configuration"
      }
    },
    {
      "id": "happy-path",
      "priority": 99,
      "description": "Successful conversion",
      "condition": {
        "requires": ["conversion.complete"],
        "assertions": {
          "result.nodes.count": { "$gt": 0 }
        }
      },
      "template": {
        "introduction": "✅ Graph Converter Succeeded\n{'━'.repeat(50)}",
        "events": {
          "conversion.started": "Processing configuration with {config.nodeTypes} node types",
          "conversion.processingNodes": "Converting {nodes.count} node definitions",
          "conversion.processingEdges": "Converting {edges.count} edge definitions",
          "conversion.complete": "✅ Generated {result.nodes.count} nodes and {result.edges.count} edges in {duration.ms}ms"
        },
        "summary": "{'━'.repeat(50)}\n✅ SUCCESS - Graph ready"
      }
    },
    {
      "id": "incomplete-execution",
      "priority": 100,
      "description": "Execution didn't complete normally",
      "condition": {
        "default": true
      },
      "template": {
        "introduction": "⚠️  Graph Converter - Incomplete Execution\n{'━'.repeat(50)}",
        "flow": [
          "Execution trace incomplete or unexpected state",
          "",
          "Events captured: {events.length}",
          "Last event: {events[events.length - 1].name}",
          "",
          "This may indicate:",
          "  • Execution was interrupted",
          "  • Events were not fully captured",
          "  • Unexpected execution path"
        ],
        "summary": "{'━'.repeat(50)}\n⚠️  INCOMPLETE - Review execution logs"
      }
    }
  ],

  "formatting": {
    "indentPerLevel": "  ",
    "timestampFormat": "HH:mm:ss.SSS",
    "showTimestamps": false,
    "showDuration": true
  }
}
```

---

## Usage Examples

### Example 1: Happy Path Execution

**Events Collected:**
```json
[
  {
    "name": "conversion.started",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "attributes": { "config.nodeTypes": 5, "config.edgeTypes": 3 }
  },
  {
    "name": "conversion.processingNodes",
    "timestamp": "2025-01-15T10:30:00.015Z",
    "attributes": { "nodes.count": 12 }
  },
  {
    "name": "conversion.processingEdges",
    "timestamp": "2025-01-15T10:30:00.032Z",
    "attributes": { "edges.count": 8 }
  },
  {
    "name": "conversion.complete",
    "timestamp": "2025-01-15T10:30:00.045Z",
    "attributes": { "result.nodes.count": 12, "result.edges.count": 8, "duration.ms": 45 }
  }
]
```

**Scenario Selection:**
- `conversion-error`? ❌ No (missing conversion.error)
- `partial-conversion`? ❌ No (result.nodes.count = 12, not < 1)
- `happy-path`? ✅ **YES** (has conversion.complete, result.nodes.count > 0)

**Generated Narrative:**
```
✅ Graph Converter Succeeded
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Processing configuration with 5 node types
Converting 12 node definitions
Converting 8 edge definitions
✅ Generated 12 nodes and 8 edges in 45ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ SUCCESS - Graph ready
```

### Example 2: Error Execution

**Events Collected:**
```json
[
  {
    "name": "conversion.started",
    "attributes": { "config.nodeTypes": 5, "config.edgeTypes": 3 }
  },
  {
    "name": "conversion.processingNodes",
    "attributes": { "nodes.count": 12 }
  },
  {
    "name": "conversion.error",
    "attributes": {
      "error.phase": "edge processing",
      "error.message": "Invalid edge reference: node 'xyz' not found"
    }
  }
]
```

**Scenario Selection:**
- `conversion-error`? ✅ **YES** (has conversion.error)

**Generated Narrative:**
```
❌ Graph Converter Failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Started processing 5 node types and 3 edge types
Processing 12 nodes...
❌ Error in edge processing: Invalid edge reference: node 'xyz' not found

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ FAILED - Conversion incomplete
```

### Example 3: Multiple Narrative Views

Same events, different narrative templates:

**Developer View (`narrative-dev.json`):**
```
🔧 Graph Converter Execution Trace
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[10:30:00.000] START conversion
  Input: 5 nodeTypes, 3 edgeTypes

[10:30:00.015] +15ms - Processing 12 nodes
  Memory: 45MB

[10:30:00.032] +17ms - Processing 8 edges

[10:30:00.045] +13ms - COMPLETE
  Output: 12 nodes, 8 edges
  Total duration: 45ms
  Avg node time: 1.25ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Stats: 12 nodes, 8 edges, 45ms, 3.75ms/item
```

**Executive View (`narrative-exec.json`):**
```
Graph conversion: 12 nodes generated in 45ms
```

### Example 4: Spans + Logs (Timeline Mode)

**Signals Collected:**
```json
[
  {
    "type": "span",
    "name": "conversion.started",
    "timestamp": "2025-01-15T10:30:00.000Z",
    "attributes": { "config.nodeTypes": 5 }
  },
  {
    "type": "log",
    "timestamp": "2025-01-15T10:30:00.005Z",
    "severityText": "INFO",
    "severityNumber": 9,
    "body": "Loading configuration from file",
    "attributes": { "file.path": "/config/graph.yaml" }
  },
  {
    "type": "log",
    "timestamp": "2025-01-15T10:30:00.012Z",
    "severityText": "DEBUG",
    "severityNumber": 5,
    "body": "Validating node type definitions",
    "attributes": { "nodeTypes.count": 5 }
  },
  {
    "type": "span",
    "name": "conversion.processingNodes",
    "timestamp": "2025-01-15T10:30:00.015Z",
    "attributes": { "nodes.count": 12 }
  },
  {
    "type": "log",
    "timestamp": "2025-01-15T10:30:00.022Z",
    "severityText": "ERROR",
    "severityNumber": 17,
    "body": "Node 'auth-service' references unknown source 'redis'",
    "attributes": {
      "node.id": "auth-service",
      "error.type": "InvalidReference"
    }
  },
  {
    "type": "span",
    "name": "conversion.complete",
    "timestamp": "2025-01-15T10:30:00.045Z",
    "attributes": { "result.nodes.count": 11, "result.hasErrors": true }
  }
]
```

**Narrative Template (`narrative-timeline.json`):**
```json
{
  "mode": "timeline",
  "scenarios": [
    {
      "id": "with-error-logs",
      "priority": 1,
      "condition": {
        "requires": ["log.*"],
        "assertions": {
          "log.severityNumber": { "$gte": 17 }
        }
      },
      "template": {
        "introduction": "⚠️  Conversion Timeline (Errors Detected)\n{'━'.repeat(60)}",
        "events": {
          "conversion.started": "[{timestamp}] 🔵 SPAN: Started conversion",
          "log.info": "[{timestamp}] 📝 LOG: {log.body}",
          "log.debug": "[{timestamp}] 🔍 DEBUG: {log.body}",
          "log.error": "[{timestamp}] ❌ ERROR: {log.body}\n             Type: {log.attributes['error.type']}",
          "conversion.processingNodes": "[{timestamp}] 🔵 SPAN: Processing {nodes.count} nodes",
          "conversion.complete": "[{timestamp}] 🔵 SPAN: Completed (with errors)"
        },
        "summary": "{'━'.repeat(60)}\n⚠️  {errorLogs.count} error(s) logged - Review above timeline"
      }
    }
  ]
}
```

**Generated Narrative:**
```
⚠️  Conversion Timeline (Errors Detected)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[10:30:00.000] 🔵 SPAN: Started conversion
[10:30:00.005] 📝 LOG: Loading configuration from file
[10:30:00.012] 🔍 DEBUG: Validating node type definitions
[10:30:00.015] 🔵 SPAN: Processing 12 nodes
[10:30:00.022] ❌ ERROR: Node 'auth-service' references unknown source 'redis'
             Type: InvalidReference
[10:30:00.045] 🔵 SPAN: Completed (with errors)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  1 error(s) logged - Review above timeline
```

### Example 5: Span-Tree with Associated Logs

**Signals Collected:** (Same as Example 4, but with span parent-child relationships)

**Narrative Template (`narrative-span-tree.json`):**
```json
{
  "mode": "span-tree",
  "showLogsPerSpan": true,
  "scenarios": [
    {
      "id": "detailed-with-logs",
      "priority": 1,
      "template": {
        "introduction": "Execution Trace with Logs\n{'━'.repeat(50)}",
        "span": "→ {span.name}",
        "logs": {
          "info": "  📝 {log.body}",
          "debug": "  🔍 {log.body}",
          "error": "  ❌ {log.body} ({log.attributes['error.type']})"
        },
        "children": "recurse"
      }
    }
  ]
}
```

**Generated Narrative:**
```
Execution Trace with Logs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

→ conversion.started
  📝 Loading configuration from file
  🔍 Validating node type definitions

  → conversion.processingNodes
    ❌ Node 'auth-service' references unknown source 'redis' (InvalidReference)

  → conversion.complete
```

This hierarchical view shows which logs occurred during which spans, making it easier to understand the execution context.

---

## UI Integration

### Narrative Rendering Component

```typescript
interface NarrativeViewProps {
  canvasFile: string;               // e.g., "graph-converter-execution.otel.canvas"
  narrativeFile?: string;           // Optional: specific narrative template
  events: OtelEvent[];              // Collected OTEL events
  options?: {
    allowManualSelection?: boolean; // Let user pick different scenario
    showRawEvents?: boolean;        // Toggle to see underlying data
  };
}

function NarrativeView({ canvasFile, narrativeFile, events, options }: NarrativeViewProps) {
  const canvas = useCanvas(canvasFile);
  const narrative = useNarrative(narrativeFile || canvas.pv.narratives.default);

  const { scenario, allScenarios } = useScenarioSelection(narrative, events);
  const renderedNarrative = useNarrativeRenderer(scenario, events);

  return (
    <div className="narrative-view">
      {options?.allowManualSelection && (
        <ScenarioSelector
          scenarios={allScenarios}
          selected={scenario.id}
          onChange={setScenario}
        />
      )}

      <NarrativeContent>
        {renderedNarrative}
      </NarrativeContent>

      {options?.showRawEvents && (
        <EventInspector events={events} />
      )}
    </div>
  );
}
```

### Narrative Template Picker

```typescript
interface NarrativeTemplateSelectorProps {
  canvas: OtelCanvas;
  selectedTemplate?: string;
  onSelect: (templateFile: string) => void;
}

function NarrativeTemplateSelector({ canvas, selectedTemplate, onSelect }: NarrativeTemplateSelectorProps) {
  const templates = canvas.pv.narratives.available;

  return (
    <Select value={selectedTemplate} onChange={onSelect}>
      {templates.map(template => (
        <option key={template} value={template}>
          {getNarrativeMetadata(template).name}
        </option>
      ))}
    </Select>
  );
}
```

### Scenario Override UI

When multiple scenarios are applicable but lower priority ones matched:

```
┌─────────────────────────────────────────┐
│ Narrative View                 [v]      │
├─────────────────────────────────────────┤
│                                         │
│ Auto-selected: happy-path ▼             │
│   ✓ happy-path (selected)               │
│   ✗ conversion-error (not applicable)   │
│   ✗ partial-conversion (not applicable) │
│   ✓ incomplete-execution (applicable)   │
│                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                         │
│ ✅ Graph Converter Succeeded            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                         │
│ Processing configuration with 5 node    │
│ types...                                │
│                                         │
└─────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

**Deliverables:**
- [ ] Define TypeScript types for narrative templates
- [ ] Implement scenario matching algorithm
- [ ] Implement template expression parser
- [ ] Create basic template renderer
- [ ] Write unit tests for matching logic

**Files to Create:**
```
packages/core/src/narrative/
├── types.ts                    # NarrativeTemplate, NarrativeScenario types
├── scenario-matcher.ts         # Scenario selection logic
├── template-parser.ts          # Expression parsing
├── template-renderer.ts        # Template → text rendering
└── __tests__/
    ├── scenario-matcher.test.ts
    └── template-renderer.test.ts
```

### Phase 2: Template Examples (Week 2-3)

**Deliverables:**
- [ ] Create narrative templates for existing `.otel.canvas` files
- [ ] Add `narratives` metadata to canvas `pv` sections
- [ ] Document template authoring guidelines
- [ ] Create template validation tool

**Templates to Create:**
- `graph-converter-execution.narrative.json`
- `graph-converter-execution.narrative-dev.json`
- `rules-engine-execution.narrative.json`
- `rules-engine-execution.narrative-debug.json`
- `otel-log-association.narrative.json`

### Phase 3: UI Integration (Week 3-4)

**Deliverables:**
- [ ] React component for narrative rendering
- [ ] Narrative template selector UI
- [ ] Scenario override dropdown
- [ ] Raw event inspector toggle
- [ ] Storybook stories for all components

**Components to Create:**
```
packages/react/src/components/
├── NarrativeView/
│   ├── NarrativeView.tsx
│   ├── NarrativeRenderer.tsx
│   ├── ScenarioSelector.tsx
│   ├── EventInspector.tsx
│   └── NarrativeView.stories.tsx
```

### Phase 4: Advanced Features (Week 4-5)

**Deliverables:**
- [ ] Support for multiple narrative files per canvas
- [ ] Internationalization support (i18n)
- [ ] Template validation in rules engine
- [ ] CLI tool for generating narratives from event files
- [ ] Export narratives (markdown, PDF)

---

## Open Questions & Future Considerations

### 1. Template Composition

Should we support template inheritance or composition?

```json
{
  "extends": "graph-converter-execution.narrative.json",
  "scenarios": [
    {
      "id": "conversion-error",
      "override": true,
      "template": { /* custom template */ }
    }
  ]
}
```

### 2. Real-time Streaming

How should narratives work with streaming events (execution still in progress)?

Options:
- Show "in progress" indicator
- Update narrative live as events arrive
- Show partial narrative + pending events

### 3. Parameterized Narratives

Should we allow runtime parameters to customize narratives?

```typescript
generateNarrative(events, {
  focusRuleId: "required-metadata",  // Filter to specific rule
  verbosity: "detailed",             // Control detail level
  audience: "developer"              // Auto-select template
});
```

### 4. Narrative Diff

For comparing two executions:

```
Comparing runs:
  Run A: 12 nodes in 45ms ✅
  Run B: 8 nodes in 67ms ⚠️

  Δ -4 nodes (-33%)
  Δ +22ms (+48% slower)
```

### 5. Automatic Scenario Generation

Could we use LLMs to generate narrative templates from canvas schemas?

```bash
$ pv narrative generate graph-converter-execution.otel.canvas
Generated: graph-converter-execution.narrative.json
  - 4 scenarios
  - 12 event templates
  - Ready for customization
```

---

## References

### Related Documentation

- [EVENT_RECORDING_SYSTEM.md](./EVENT_RECORDING_SYSTEM.md) - OTEL event capture
- [CANVAS_LOG_ASSOCIATION.md](./CANVAS_LOG_ASSOCIATION.md) - Log routing to canvas nodes
- [OPENTELEMETRY_OVERVIEW.md](./OPENTELEMETRY_OVERVIEW.md) - OTEL fundamentals

### External Resources

- [JSON Canvas Specification](https://jsoncanvas.org/)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [Handlebars Template Syntax](https://handlebarsjs.com/) (inspiration for template syntax)

---

## Appendix: Full Example Narrative Templates

### A. graph-converter-execution.narrative-dev.json

```json
{
  "version": "1.0.0",
  "canvas": "graph-converter-execution.otel.canvas",
  "name": "Developer Debugging Narrative",
  "description": "Detailed technical narrative with timing and internals",

  "mode": "span-tree",
  "scenarioSelection": "first-match",

  "scenarios": [
    {
      "id": "conversion-error",
      "priority": 1,
      "description": "Error during conversion with debug details",
      "condition": {
        "requires": ["conversion.error"]
      },
      "template": {
        "introduction": "🔧 Graph Converter - ERROR TRACE\n{'━'.repeat(60)}",
        "events": {
          "conversion.started": "[{timestamp}] START conversion\n  Input: {config.nodeTypes} nodeTypes, {config.edgeTypes} edgeTypes\n  Span ID: {span.spanId}",
          "conversion.processingNodes": "[{timestamp}] +{deltaMs}ms - Processing {nodes.count} nodes\n  Parent Span: {span.parentSpanId}",
          "conversion.error": "[{timestamp}] +{deltaMs}ms - ❌ ERROR\n  Phase: {error.phase}\n  Message: {error.message}\n  Stack: {error.stack}\n  Span ID: {span.spanId}"
        },
        "summary": "{'━'.repeat(60)}\n❌ FAILED at {error.phase}\n📍 Review span {span.spanId} for details"
      }
    },
    {
      "id": "happy-path",
      "priority": 99,
      "description": "Successful conversion with detailed metrics",
      "condition": {
        "requires": ["conversion.complete"]
      },
      "template": {
        "introduction": "🔧 Graph Converter Execution Trace\n{'━'.repeat(60)}",
        "events": {
          "conversion.started": "[{timestamp}] START conversion\n  Input: {config.nodeTypes} nodeTypes, {config.edgeTypes} edgeTypes\n  Span ID: {span.spanId}",
          "conversion.processingNodes": "[{timestamp}] +{deltaMs}ms - Processing {nodes.count} nodes\n  Memory: {process.memoryUsage}MB\n  Span ID: {span.spanId}",
          "conversion.processingEdges": "[{timestamp}] +{deltaMs}ms - Processing {edges.count} edges\n  Span ID: {span.spanId}",
          "conversion.complete": "[{timestamp}] +{deltaMs}ms - COMPLETE\n  Output: {result.nodes.count} nodes, {result.edges.count} edges\n  Total duration: {duration.ms}ms\n  Avg node time: {avgNodeTime}ms\n  Span ID: {span.spanId}"
        },
        "summary": "{'━'.repeat(60)}\n📊 Stats:\n  Total: {duration.ms}ms\n  Nodes: {result.nodes.count} ({avgNodeTime}ms/node)\n  Edges: {result.edges.count} ({avgEdgeTime}ms/edge)\n  Root Span: {span.traceId}"
      }
    }
  ],

  "formatting": {
    "indentPerLevel": "  ",
    "timestampFormat": "HH:mm:ss.SSS",
    "showTimestamps": true,
    "showDuration": true,
    "showSpanIds": true,
    "showAttributes": "all"
  }
}
```

### B. rules-engine-execution.narrative.json

```json
{
  "version": "1.0.0",
  "canvas": "rules-engine-execution.otel.canvas",
  "name": "Rules Engine Narrative",
  "description": "Human-readable validation results",

  "mode": "span-tree",
  "scenarioSelection": "first-match",

  "scenarios": [
    {
      "id": "rule-execution-error",
      "priority": 1,
      "description": "One or more rules crashed",
      "condition": {
        "requires": ["rule.error"]
      },
      "template": {
        "introduction": "❌ Rules Engine - Execution Errors\n{'━'.repeat(50)}",
        "flow": [
          "Started validation with {engine.rules.count} rules",
          "",
          "❌ Rules that failed:",
          {
            "forEach": "events[rule.error]",
            "template": "  • {rule.id}: {error.type} - {error.message}"
          },
          "",
          "Successfully executed: {successfulRules.count}/{engine.rules.count} rules"
        ],
        "summary": "{'━'.repeat(50)}\n❌ ERROR - {failedRules.count} rule(s) crashed"
      }
    },
    {
      "id": "high-volume-violations",
      "priority": 2,
      "description": "Many violations found",
      "condition": {
        "requires": ["lint.completed"],
        "assertions": {
          "result.violations.total": { "$gt": 10 }
        }
      },
      "template": {
        "introduction": "⚠️  Rules Engine - High Violation Count\n{'━'.repeat(50)}",
        "flow": [
          "Validated configuration: {config.nodeTypes.count} node types, {config.edgeTypes.count} edge types",
          "",
          "📊 Found {result.violations.total} violations:",
          "",
          "Top violating rules:",
          {
            "forEach": "topViolators.slice(0, 5)",
            "template": "  {index + 1}. {rule.id}: {violations.count} {violations.severity} ({rule.category})"
          },
          "",
          "Severity breakdown:",
          "  • Errors: {result.violations.errors}",
          "  • Warnings: {result.violations.warnings}",
          "  • Auto-fixable: {result.violations.fixable}"
        ],
        "summary": "{'━'.repeat(50)}\n⚠️  {result.violations.errors} ERRORS - Review configuration structure"
      }
    },
    {
      "id": "violations-found",
      "priority": 3,
      "description": "Some violations detected",
      "condition": {
        "requires": ["violations.detected"],
        "assertions": {
          "result.violations.total": { "$gt": 0 }
        }
      },
      "template": {
        "introduction": "⚠️  Rules Engine - Violations Detected\n{'━'.repeat(50)}",
        "flow": [
          "Configuration validation completed",
          "",
          "Found {result.violations.total} violations across {violatedRules.length} rules:",
          {
            "forEach": "violations",
            "template": "  • {rule.id}: {violations.count} {violations.severity} issues"
          },
          "",
          "Breakdown:",
          "  - Error-level: {result.violations.errors}",
          "  - Warning-level: {result.violations.warnings}",
          "  - Auto-fixable: {result.violations.fixable}"
        ],
        "summary": "{'━'.repeat(50)}\n{result.violations.errors > 0 ? '❌ FAILED' : '⚠️  WARNINGS ONLY'}"
      }
    },
    {
      "id": "happy-path",
      "priority": 99,
      "description": "All rules passed",
      "condition": {
        "requires": ["lint.completed"],
        "assertions": {
          "result.violations.total": 0
        }
      },
      "template": {
        "introduction": "✅ Rules Engine - All Rules Passed\n{'━'.repeat(50)}",
        "flow": [
          "Validated configuration successfully",
          "  • Node types: {config.nodeTypes.count}",
          "  • Edge types: {config.edgeTypes.count}",
          "  • Connections: {config.connections.count}",
          "",
          "Executed {engine.rules.count} rules: all passed ✅"
        ],
        "summary": "{'━'.repeat(50)}\n✅ SUCCESS - Configuration valid"
      }
    }
  ],

  "formatting": {
    "indentPerLevel": "  ",
    "showTimestamps": false,
    "showDuration": true
  }
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-15 | Initial design document |
