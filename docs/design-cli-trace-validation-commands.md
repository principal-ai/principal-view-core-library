# Design: CLI Collector & Trace Commands for Agent Access

---
status: In Progress (Phase 1 Done, Phase 2 Partial)
labels: [cli, traces, validation, agents, electron-app, collector, design-doc]
---

## Summary

Add CLI commands that allow agents (Claude, etc.) to:

1. **Verify collector setup** - Check that the OTEL collector is running and correctly configured
2. **Access processed traces** - Fetch traces from the electron-app
3. **Validate instrumentation** - Compare traces against workflow.json definitions

This enables agents to verify their telemetry instrumentation work is correct, with clear diagnostics when something isn't working.

## Problem Statement

When an agent implements telemetry instrumentation based on workflow.json definitions, they currently have no way to:

1. Verify the collector is running and accepting traces
2. Diagnose configuration issues (auth, allowlists, port conflicts)
3. Fetch recent traces to inspect
4. Compare traces against workflow definitions
5. Get actionable feedback on what's missing or incorrect

The OTEL collector receives traces, the electron-app stores them, and the core library has validation logic - but there's no CLI bridge that exposes this to agents.

## Architecture Overview

```
                                      ┌──────────────────┐
                                      │   CLI (new)      │
                                      │                  │
                                      │ collector:       │
                                      │   - status       │
                                      │   - check        │
                                      │   - diagnose     │
                                      │                  │
                                      │ trace:           │
                                      │   - list         │
                                      │   - validate     │
                                      │   - inspect      │
                                      │   - wait         │
                                      │   - flow         │
                                      │   - registrations│
                                      └─────┬─────┬──────┘
                                            │     │
                        ┌───────────────────┘     └───────────────────┐
                        │                                             │
                        ▼                                             ▼
          ┌─────────────────────────┐               ┌─────────────────────────┐
          │     OTEL Collector      │               │      electron-app       │
          │     (Port 4318)         │               │      (Port 3043)        │
          │                         │               │                         │
          │  Raw OTLP Storage:      │               │  Processed Storage:     │
          │  - File-based (JSONL)   │──────────────▶│  - In-memory (50 max)   │
          │  - By service/version   │   forwards    │  - Workflow matching    │
          │  - Full OTLP payloads   │               │  - Scenario detection   │
          │                         │               │                         │
          │  Endpoints:             │               │  Endpoints (NEW):       │
          │  - GET /health          │               │  - GET /otel/traces     │
          │  - GET /services/stats  │               │  - GET /otel/traces/:id │
          │  - GET /traces          │               │  - GET /otel/status     │
          │  - GET /traces/:service │               │                         │
          └─────────────────────────┘               └────────────┬────────────┘
                                                                 │
                                                                 │ uses
                                                                 ▼
                                                    ┌─────────────────────────┐
                                                    │      core library       │
                                                    │  - WorkflowValidator    │
                                                    │  - ScenarioMatcher      │
                                                    │  - EventValidator       │
                                                    └─────────────────────────┘
```

**Dual-Source Design:**

The CLI can query **both** the collector and electron-app to diagnose where traces are in the pipeline:

| Source | What it shows | Use case |
|--------|--------------|----------|
| **Collector** | Raw OTLP traces as received | "Did my trace reach the collector?" |
| **Electron-app** | Processed traces with workflow matching | "Was my trace processed and matched?" |

**Data Flow:**
1. **Setup verification**: `collector status/check` → OTEL Collector (port 4318)
2. **Raw trace retrieval**: `trace list --source collector` → Collector `/traces` endpoint
3. **Processed trace retrieval**: `trace list --source app` → Electron-app `/otel/traces` endpoint
4. **End-to-end check**: `trace flow` → Query both, compare counts
5. **Trace validation**: `trace validate` → electron-app + core library

## Proposed Commands

### `principal-ai collector status`

Verify the OTEL collector is running and configured correctly. This is a prerequisite check before trace commands will work.

```bash
principal-ai collector status [options]

Options:
  --port <port>           Collector port (default: 4318, or 14318 for dev)
  --json                  Output as JSON
  --verbose               Show detailed configuration
```

**Output (pretty - all healthy):**
```
OTEL Collector Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Endpoint:        http://localhost:4318
  Status:          ✓ healthy
  Traces received: 142
  Logs received:   38

  Services (2 active):
    ✓ my-service          last seen 30s ago    (52 traces)
    ✓ auth-service        last seen 2m ago     (90 traces)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Collector is ready to receive traces.
```

**Output (pretty - issues detected):**
```
OTEL Collector Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Endpoint:        http://localhost:4318
  Status:          ✗ unreachable

  Troubleshooting:
    • Verify the collector is running
    • Check if port 4318 is in use by another process
    • Try: curl http://localhost:4318/health

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Output (JSON):**
```json
{
  "endpoint": "http://localhost:4318",
  "healthy": true,
  "tracesReceived": 142,
  "logsReceived": 38,
  "services": {
    "summary": {
      "totalServices": 2,
      "aliveServices": 2,
      "totalTraces": 142
    },
    "details": {
      "my-service": {
        "firstSeen": "2025-02-07T10:30:00.000Z",
        "lastSeen": "2025-02-07T10:35:00.000Z",
        "totalTraces": 52,
        "isAlive": true
      }
    }
  }
}
```

---

### `principal-ai collector check`

Send a test trace to verify end-to-end connectivity and configuration.

```bash
principal-ai collector check [options]

Options:
  --port <port>           Collector port (default: 4318)
  --service <name>        Service name for test trace (default: "principal-cli-test")
  --auth-token <token>    Bearer token if auth is required
  --json                  Output as JSON
```

**Output (pretty - success):**
```
Collector Connectivity Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Health check.............. ✓ healthy
  2. Sending test trace........ ✓ accepted (trace: abc123...)
  3. Verifying receipt......... ✓ trace found in /services/stats
  4. Roundtrip latency......... 12ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Collector is correctly configured and receiving traces.

Your client should send traces to:
  http://localhost:4318/v1/traces
```

**Output (pretty - auth failure):**
```
Collector Connectivity Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Health check.............. ✓ healthy
  2. Sending test trace........ ✗ 401 Unauthorized

  The collector requires authentication.

  Fix: Include a Bearer token in your requests:
    --auth-token <token>

  Or configure your OTEL SDK:
    headers: { "Authorization": "Bearer <token>" }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Output (pretty - service not allowlisted):**
```
Collector Connectivity Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Health check.............. ✓ healthy
  2. Sending test trace........ ✓ accepted
  3. Verifying receipt......... ✗ trace not found

  The trace was accepted but not stored. Possible causes:
    • Service name "my-service" is not in the allowlist
    • Traces are being filtered by the collector

  Check collector configuration for allowedServices setting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Output (JSON):**
```json
{
  "checks": {
    "health": { "passed": true, "latencyMs": 5 },
    "sendTrace": { "passed": true, "traceId": "abc123...", "latencyMs": 12 },
    "verifyReceipt": { "passed": true, "foundInStats": true }
  },
  "endpoint": "http://localhost:4318/v1/traces",
  "overallPassed": true,
  "suggestions": []
}
```

---

### `principal-ai collector diagnose`

Comprehensive diagnostic for troubleshooting collector issues.

```bash
principal-ai collector diagnose [options]

Options:
  --port <port>           Collector port (default: 4318)
  --json                  Output as JSON
```

**Output (pretty):**
```
Collector Diagnostics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Port Availability:
  4318 (OTLP).......... ✓ listening (collector)
  4319 (wrapper)....... ✓ listening (collector)
  4320 (internal)...... ✓ listening (collector)

Endpoints:
  GET  /health......... ✓ 200 OK
  GET  /services/stats. ✓ 200 OK
  POST /v1/traces...... ✓ 200 OK (test trace accepted)
  POST /v1/logs........ ✓ 200 OK

Configuration:
  Output mode:        console
  Auth required:      no
  Allowed services:   * (all)
  Bind address:       127.0.0.1 (localhost only)

Recent Activity:
  Last trace:         2s ago (my-service)
  Traces (1h):        142
  Logs (1h):          38

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No issues detected.
```

---

## Collector Command Implementation

### Port Detection

```typescript
async function detectCollectorPort(): Promise<number> {
  const devPort = 14318;
  const prodPort = 4318;

  // Try production port first (more common)
  if (await checkHealth(prodPort)) return prodPort;
  if (await checkHealth(devPort)) return devPort;

  throw new Error(
    'Cannot connect to OTEL collector.\n\n' +
    '  Expected ports: 4318 (production) or 14318 (development)\n\n' +
    '  To start the collector:\n' +
    '    1. Open the Principal desktop app, or\n' +
    '    2. Run: npx @principal-ai/otel-collector-server'
  );
}

async function checkHealth(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/health`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

### Test Trace Generation

```typescript
function createTestTrace(serviceName: string): OTLPTracePayload {
  const traceId = generateTraceId();
  const spanId = generateSpanId();
  const now = Date.now() * 1_000_000; // nanoseconds

  return {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: serviceName } },
          { key: 'principal.cli.test', value: { boolValue: true } }
        ]
      },
      scopeSpans: [{
        scope: { name: 'principal-cli-check' },
        spans: [{
          traceId,
          spanId,
          name: 'cli.connectivity.test',
          kind: 1, // INTERNAL
          startTimeUnixNano: String(now),
          endTimeUnixNano: String(now + 1_000_000), // 1ms duration
          attributes: [
            { key: 'test.timestamp', value: { stringValue: new Date().toISOString() } }
          ],
          status: { code: 1 } // OK
        }]
      }]
    }]
  };
}
```

### File Structure

```
packages/cli/src/commands/collector/
├── index.ts              # createCollectorCommand() - registers subcommands
├── status.ts             # collector status
├── check.ts              # collector check (send test trace)
├── diagnose.ts           # collector diagnose
└── utils.ts              # Shared utilities (port detection, test trace)
```

---

### `principal-ai trace list`

List recent traces from the collector and/or electron-app.

```bash
principal-ai trace list [options]

Options:
  -n, --limit <count>     Number of traces to show (default: 10)
  --source <source>       Where to fetch traces from:
                            - "collector" : Raw traces from OTEL collector
                            - "app"       : Processed traces from electron-app
                            - "both"      : Query both sources (default)
  --service <name>        Filter by service name (collector only)
  --port <port>           Override port (collector: 4318, app: 3043)
  --json                  Output as JSON
  --quiet                 Minimal output
```

**Output (pretty - default `--source both`):**
```
Trace Pipeline Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Collector (port 4318):  ✓ 142 traces stored
  Electron-app (port 3043): ✓ 48 traces stored

Recent Traces (from electron-app):
  abc123...  authenticate.user     2.3s   ✓ auth-flow (100%)
  def456...  validate.canvas       0.8s   ⚠ canvas-validation (73%)
  ghi789...  file.read             0.1s   ─ no workflow match
  jkl012...  session.create        1.5s   ✓ session-management (100%)
  mno345...  unknown.operation     0.4s   ─ no workflow match

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Output (pretty - `--source collector`):**
```
Collector Traces (showing 5 of 142)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Service: my-service (52 traces)
    abc123...  authenticate.user     2.3s   5 spans
    def456...  validate.canvas       0.8s   3 spans

  Service: auth-service (90 traces)
    ghi789...  session.create        1.5s   4 spans

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Output (JSON):**
```json
{
  "sources": {
    "collector": {
      "healthy": true,
      "traceCount": 142,
      "endpoint": "http://localhost:4318"
    },
    "app": {
      "healthy": true,
      "traceCount": 48,
      "endpoint": "http://localhost:3043"
    }
  },
  "traces": [
    {
      "traceId": "abc123...",
      "source": "app",
      "rootSpanName": "authenticate.user",
      "duration": 2300,
      "spanCount": 5,
      "hasErrors": false,
      "matchedWorkflow": {
        "name": "auth-flow",
        "scenarioId": "login-success",
        "matchPercentage": 100
      }
    }
  ],
  "total": 48
}
```

---

### `principal-ai trace flow`

Check end-to-end trace flow through the pipeline. Useful for diagnosing where traces are getting stuck.

```bash
principal-ai trace flow [options]

Options:
  --service <name>        Filter by service name
  --json                  Output as JSON
```

**Output (pretty - healthy):**
```
Trace Flow Diagnostic
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Collector receiving traces?
     ✓ Yes - 142 traces from 6 services

  2. Electron-app receiving traces?
     ✓ Yes - 48 traces stored (last 50 kept)

  3. Traces flowing through?
     ✓ Yes - traces seen in both sources

  Service Breakdown:
    my-service:       52 collector → 25 app   ✓
    auth-service:     90 collector → 23 app   ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Traces are flowing through the pipeline correctly.
```

**Output (pretty - issue detected):**
```
Trace Flow Diagnostic
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Collector receiving traces?
     ✓ Yes - 142 traces from 6 services

  2. Electron-app receiving traces?
     ✗ No - 0 traces stored

  3. Traces flowing through?
     ✗ No - traces stuck at collector

  Possible causes:
    • Electron-app not connected to collector
    • MessagePort not registered
    • Electron-app filtering traces

  Troubleshooting:
    • Check electron-app logs for connection errors
    • Verify collector is forwarding to port 4319

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Output (JSON):**
```json
{
  "collector": {
    "healthy": true,
    "traceCount": 142,
    "services": ["my-service", "auth-service"]
  },
  "app": {
    "healthy": true,
    "traceCount": 48
  },
  "flowHealthy": true,
  "serviceBreakdown": {
    "my-service": { "collector": 52, "app": 25 },
    "auth-service": { "collector": 90, "app": 23 }
  },
  "issues": []
}
```

---

### `principal-ai trace validate <traceId>`

Validate a specific trace against its matched workflow (or a specified one).

```bash
principal-ai trace validate <traceId> [options]

Options:
  --workflow <path>       Override auto-matched workflow
  --dir <path>            Project directory for workflow discovery
  --port <port>           Electron-app port (default: 3043)
  --json                  Output as JSON
  --verbose               Show all events, not just issues
```

**Output (pretty):**
```
Trace Validation: abc123...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Workflow: user-authentication
Scenario: login-success (87% match)

Events:
  ✓ auth.started              (span: authenticate.user)
  ✓ credentials.validated     (span: authenticate.user)
  ✗ session.created           MISSING
    └─ Expected in span: session.manager
    └─ Suggestion: tracer.startSpan('session.manager').addEvent('session.created', { sessionId })

Attributes:
  ✓ user.id                   present on auth.started
  ✗ user.role                 MISSING on credentials.validated
    └─ Required by schema
    └─ Suggestion: span.addEvent('credentials.validated', { ...attrs, 'user.role': role })

Span Hierarchy:
  ✓ authenticate.user (root)
    ✓ credentials.check
    ✗ session.manager         MISSING
      └─ Expected child of: authenticate.user

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary: 2 events missing, 1 attribute missing, 1 span missing
```

**Output (JSON):**
```json
{
  "traceId": "abc123...",
  "workflow": {
    "name": "user-authentication",
    "path": ".principal-views/auth.workflow.json"
  },
  "scenario": {
    "id": "login-success",
    "matchPercentage": 87,
    "isFullMatch": false
  },
  "events": {
    "expected": ["auth.started", "credentials.validated", "session.created"],
    "found": ["auth.started", "credentials.validated"],
    "missing": ["session.created"],
    "details": {
      "session.created": {
        "expectedSpan": "session.manager",
        "suggestion": "tracer.startSpan('session.manager').addEvent('session.created', { sessionId })"
      }
    }
  },
  "attributes": {
    "missing": [
      {
        "event": "credentials.validated",
        "attribute": "user.role",
        "required": true
      }
    ]
  },
  "spans": {
    "expected": ["authenticate.user", "credentials.check", "session.manager"],
    "found": ["authenticate.user", "credentials.check"],
    "missing": ["session.manager"],
    "hierarchy": {
      "valid": false,
      "issues": ["session.manager expected as child of authenticate.user"]
    }
  },
  "summary": {
    "valid": false,
    "missingEvents": 1,
    "missingAttributes": 1,
    "missingSpans": 1
  }
}
```

---

### `principal-ai trace inspect <traceId>`

Inspect the raw structure of a trace (for debugging).

```bash
principal-ai trace inspect <traceId> [options]

Options:
  --spans                 Show span hierarchy
  --events                Show all events
  --attributes            Show all attributes
  --logs                  Show associated logs
  --port <port>           Electron-app port
  --json                  Output as JSON
```

**Output (--spans):**
```
Trace: abc123...
Duration: 2.3s | Spans: 5 | Errors: 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

authenticate.user (root) [1.8s]
├── credentials.check [0.3s]
│   └── event: credentials.validated {user.id: "u123"}
├── database.query [0.5s]
│   └── event: query.executed {table: "users", rows: 1}
└── token.generate [0.2s]
    └── event: token.created {type: "jwt", expiresIn: 3600}
```

---

### `principal-ai trace wait`

Wait for a trace matching criteria (useful for CI/test scenarios).

```bash
principal-ai trace wait [options]

Options:
  --root-span <name>      Wait for trace with this root span
  --workflow <name>       Wait for trace matching this workflow
  --timeout <ms>          Timeout in milliseconds (default: 30000)
  --port <port>           Electron-app port
  --json                  Output matching trace as JSON
```

**Use case:** Agent runs instrumented code, then waits for the trace to appear.

```bash
# Run the code that generates traces
npm run test:auth

# Wait for the trace and validate
TRACE_ID=$(principal-ai trace wait --root-span authenticate.user --json | jq -r '.traceId')
principal-ai trace validate $TRACE_ID
```

---

### `principal-ai trace registrations`

Show active MessagePort registrations - which windows are listening for traces from which services.

```bash
principal-ai trace registrations [options]

Options:
  --port <port>           Electron-app port (default: 3043, dev: 3045)
  --json                  Output as JSON
```

**Output (pretty):**
```
Port Registrations
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Window: dev-workspace-1774029421924
  └─ principal-ade-main @ 12:57:01 PM
  └─ principal-ade-daemon @ 12:57:01 PM
  └─ file-city-renderer @ 12:57:01 PM

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Windows: 1
Registrations: 3
Active services: principal-ade-main, principal-ade-daemon, file-city-renderer
```

**Output (JSON):**
```json
{
  "success": true,
  "registrations": [
    {
      "windowId": "dev-workspace-1774029421924",
      "serviceName": "principal-ade-main",
      "registeredAt": 1774029421933
    },
    {
      "windowId": "dev-workspace-1774029421924",
      "serviceName": "file-city-renderer",
      "registeredAt": 1774029421933
    }
  ],
  "services": ["principal-ade-main", "file-city-renderer"],
  "timestamp": 1774029500000
}
```

**Use case:** Understand which windows are receiving traces from which services. Helpful for:
- Debugging why traces aren't appearing in a specific window
- Verifying MessagePort setup is working correctly
- Understanding the trace routing topology

---

## Implementation Details

### API Client Module

Create `packages/cli/src/commands/trace/api-client.ts`:

```typescript
interface ElectronAppConfig {
  port: number;
  host: string;
}

interface TraceListResponse {
  traces: TraceInfo[];
  total: number;
}

interface TraceDetailResponse {
  trace: OtlpTrace;
  spans: OtelSpanData[];
  events: OtelSpanEvent[];
  logs: OtelLog[];
}

export class ElectronAppClient {
  constructor(private config: ElectronAppConfig) {}

  async healthCheck(): Promise<boolean>;
  async listTraces(limit?: number): Promise<TraceListResponse>;
  async getTrace(traceId: string): Promise<TraceDetailResponse>;
  async waitForTrace(criteria: WaitCriteria, timeout: number): Promise<TraceInfo | null>;
}
```

### Validation Pipeline

Create `packages/cli/src/commands/trace/validator.ts`:

```typescript
interface TraceValidationResult {
  traceId: string;
  workflow: WorkflowInfo | null;
  scenario: ScenarioMatchDetail | null;
  events: EventValidationResult;
  attributes: AttributeValidationResult;
  spans: SpanValidationResult;
  summary: ValidationSummary;
}

export async function validateTrace(
  trace: TraceDetailResponse,
  workflow: WorkflowTemplate,
  canvas?: ExtendedCanvas
): Promise<TraceValidationResult>;
```

### File Structure

```
packages/cli/src/commands/
├── collector/
│   ├── index.ts          # createCollectorCommand() - registers subcommands
│   ├── status.ts         # collector status (✅ Done)
│   ├── check.ts          # collector check (✅ Done)
│   ├── diagnose.ts       # collector diagnose (✅ Done)
│   └── utils.ts          # Port detection, test trace generation (✅ Done)
│
├── trace/
│   ├── index.ts          # createTraceCommand() - registers subcommands
│   ├── list.ts           # trace list (--source collector|app|both)
│   ├── flow.ts           # trace flow (end-to-end diagnostic)
│   ├── inspect.ts        # trace inspect
│   ├── validate.ts       # trace validate
│   ├── wait.ts           # trace wait
│   ├── registrations.ts  # trace registrations (✅ Done)
│   ├── collector-client.ts   # HTTP client for collector (/traces endpoints)
│   ├── electron-client.ts    # HTTP client for electron-app (/otel endpoints)
│   ├── validator.ts      # Trace validation logic
│   └── utils.ts          # Shared utilities
│
└── shared/
    └── http-client.ts    # Shared HTTP utilities (timeout, retry, etc.)
```

### Port Detection

The CLI should auto-detect the correct port:

```typescript
async function detectElectronAppPort(): Promise<number> {
  const devPort = 3045;
  const prodPort = 3043;

  // Try dev port first (more likely during development)
  if (await checkHealth(devPort)) return devPort;
  if (await checkHealth(prodPort)) return prodPort;

  throw new Error(
    'Cannot connect to electron-app. Ensure it is running.\n' +
    'Expected ports: 3043 (production) or 3045 (development)'
  );
}
```

---

## API Requirements

### OTEL Collector Endpoints (Already Exist)

The collector already provides trace retrieval endpoints:

```
GET  /health                        Health check
GET  /services/stats                Service statistics
GET  /traces                        List all services with stored traces
GET  /traces/:serviceName           Get traces for a specific service
GET  /traces/:serviceName/versions  List versions for a service
GET  /traces/:serviceName/versions/:version  Get traces for specific version
```

Query parameters:
- `?limit=N` - Limit number of traces returned

Storage details:
- File-based storage (JSONL format)
- Organized by `service-name/version/traces.jsonl`
- Full OTLP payloads preserved

### Electron-App Endpoints (Need to Add)

The electron-app needs HTTP endpoints added to `PrincipalMCPBridge`:

```
GET  /otel/status                   Collector connection status
GET  /otel/traces                   List stored traces (max 50)
GET  /otel/traces/:traceId          Get specific trace details
GET  /otel/registrations            List active MessagePort registrations (✅ Done)
```

**Implementation location:** Add routes to existing Express server in `PrincipalMCPBridge`

**Data source:** Call `OtelCollectorService.getInstance().getTraces(limit)`

Example implementation:
```typescript
// In PrincipalMCPBridge routes
app.get('/otel/status', async (req, res) => {
  const service = OtelCollectorService.getInstance();
  res.json({
    healthy: service.isRunning(),
    traceCount: service.getTraceCount(),
  });
});

app.get('/otel/traces', async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const traces = await OtelCollectorService.getInstance().getTraces(limit);
  res.json({ traces, total: traces.length });
});

app.get('/otel/traces/:traceId', async (req, res) => {
  const trace = await OtelCollectorService.getInstance().getTrace(req.params.traceId);
  if (!trace) {
    return res.status(404).json({ error: 'Trace not found' });
  }
  res.json(trace);
});
```

### Port Configuration

| Component | Production | Development |
|-----------|------------|-------------|
| Collector OTLP | 4318 | 14318 |
| Collector Wrapper | 4319 | 14319 |
| Collector Internal | 4320 | 14320 |
| Electron-app MCP | 3043 | 3045 |

---

## Workflow Matching

### Auto-Discovery

When validating a trace, the CLI needs to find the matching workflow:

1. **By trace metadata**: Check if trace has `pv.workflow.name` attribute
2. **By root span**: Match `rootSpan` field in workflow definitions
3. **By scope**: Match `scope` field against trace's instrumentation scope
4. **Discovery scan**: Load all workflows from `.principal-views/` and find best match

```typescript
async function findMatchingWorkflow(
  trace: TraceDetailResponse,
  projectDir: string
): Promise<WorkflowTemplate | null> {
  // 1. Check trace attributes
  const workflowName = trace.spans[0]?.attributes?.['pv.workflow.name'];
  if (workflowName) {
    return loadWorkflowByName(workflowName, projectDir);
  }

  // 2. Discover all workflows and match
  const workflows = await discoverWorkflows(projectDir);
  const rootSpanName = trace.spans.find(s => !s.parentSpanId)?.name;

  return workflows.find(w => w.rootSpan === rootSpanName) ?? null;
}
```

---

## Error Handling

### Connection Errors
```
Error: Cannot connect to electron-app at localhost:3043

  The electron-app must be running to fetch traces.

  To start it:
    1. Open the Principal desktop app, or
    2. Run: cd /path/to/electron-app && npm start
```

### No Traces Found
```
No traces found matching criteria.

  Possible reasons:
    • No traces have been received yet
    • Traces matching your criteria have been evicted (max 50 stored)
    • The service name doesn't match your filter
```

### No Workflow Match
```
Warning: No workflow matches trace abc123...

  Root span: unknown.operation

  To validate against a specific workflow:
    principal-ai trace validate abc123 --workflow ./my.workflow.json
```

---

## Agent-Friendly Output

The JSON output is designed for agent consumption:

1. **Actionable suggestions**: Each missing item includes a code suggestion
2. **Clear structure**: Predictable field names for parsing
3. **Summary stats**: Quick pass/fail assessment
4. **File paths**: Where to make changes

Example agent workflow:
```
1. Agent implements telemetry based on workflow.json
2. Agent runs the instrumented code
3. Agent calls: principal-ai trace wait --root-span my.span --json
4. Agent calls: principal-ai trace validate <traceId> --json
5. Agent parses JSON, identifies missing events/attributes
6. Agent makes fixes based on suggestions
7. Repeat until validation passes
```

---

## Implementation Phases

### Phase 1: Collector Setup Verification (DONE)
These commands have no dependency on electron-app API changes:

| Command | Priority | Complexity | Status |
|---------|----------|------------|--------|
| `collector status` | P0 | Low | ✅ Done |
| `collector check` | P0 | Low | ✅ Done |
| `collector diagnose` | P1 | Medium | ✅ Done |

### Phase 2a: Collector Trace Access (No electron-app changes needed)
These use existing collector endpoints:

| Command | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| `trace list --source collector` | P0 | Low | Uses existing `/traces/:service` endpoint |
| `trace inspect --source collector` | P1 | Low | Parse OTLP payload from collector |

### Phase 2b: Electron-App Trace Access (Requires API changes)
These require new HTTP endpoints in the electron-app:

| Command | Priority | Complexity | Status |
|---------|----------|------------|--------|
| Add `/otel/traces` endpoint | P0 | Low | ✅ Done |
| Add `/otel/traces/:id` endpoint | P0 | Low | ✅ Done |
| Add `/otel/registrations` endpoint | P1 | Low | ✅ Done |
| `trace list --source app` | P0 | Medium | ✅ Done |
| `trace list --source both` | P0 | Medium | Pending |
| `trace flow` | P0 | Medium | ✅ Done |
| `trace inspect --source app` | P1 | Low | ✅ Done |
| `trace registrations` | P1 | Low | ✅ Done |

### Phase 2c: Trace Validation
| Command | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| `trace validate` | P1 | High | Core validation logic integration |
| `trace wait` | P2 | Medium | Polling with timeout |

### Phase 3: Future Enhancements
- `principal-ai trace diff <traceId1> <traceId2>` - Compare two traces
- `principal-ai trace export <traceId>` - Export trace to .otel.json for test fixtures
- `principal-ai trace replay <file>` - Replay a trace file for testing
- Watch mode: `principal-ai trace watch --workflow auth.workflow.json`
- CI integration: Exit codes for validation pass/fail
- Coverage reports: Which workflow events have been seen in traces

---

## Open Questions

1. **Authentication**: Should the electron-app API require any auth for CLI access?
   - Recommendation: No, localhost-only access is sufficient

2. **Trace storage**: Should we increase the 50-trace limit for better history?
   - Recommendation: Add configurable limit, default to 100

3. **Real-time streaming**: Should `trace wait` poll or use SSE/WebSocket?
   - Recommendation: Start with polling (simpler), add streaming later

4. **Cross-project workflows**: What if the workflow is in a different repo than where CLI runs?
   - Recommendation: Support `--workflow <path>` for explicit specification

---

## Dependencies

### CLI Package
```json
{
  "dependencies": {
    "node-fetch": "^3.x"  // Or use native fetch in Node 18+
  }
}
```

### Electron-App Changes
- Expose HTTP endpoints for trace queries (or document existing IPC -> HTTP bridge)

---

## Success Criteria

### Collector Commands (Phase 1 - DONE)
1. ✅ `collector status` shows health, trace counts, and active services
2. ✅ `collector check` sends a test trace and verifies end-to-end connectivity
3. ✅ `collector diagnose` identifies common misconfigurations (port conflicts, auth issues, allowlist filtering)
4. ✅ Clear error messages guide users to fix issues

### Trace Commands (Phase 2)
5. ✅ Agent can list traces from electron-app (`trace list`)
6. Agent can list traces from collector (`--source collector`) - Pending
7. Agent can compare both sources (`--source both` or `trace flow`) - Pending
8. ✅ Agent can diagnose pipeline issues (`trace flow`)
9. ✅ Agent can validate a trace against workflow.json (`trace validate`)
10. Agent can wait for a trace to appear after running instrumented code - Pending
11. ✅ Agent can see which windows are listening for which services (`trace registrations`)
12. ✅ All commands work in both development and production port configurations:
    - Collector: 4318 (prod) / 14318 (dev)
    - Electron-app: 3043 (prod) / 3045 (dev)

### General
12. JSON output is stable and documented for agent parsing
13. Commands fail gracefully with helpful troubleshooting steps
14. Dual-source queries help identify where traces get stuck
