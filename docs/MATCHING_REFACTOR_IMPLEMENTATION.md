# Matching Algorithm Refactor - Implementation Guide

**Date**: February 22, 2026
**Status**: ✅ Implemented (v0.24.21)
**Related**: LIBRARY_TELEMETRY_AND_MATCHING.md

---

## Overview

This document outlines the implementation changes required to move from the current attribute-based matching (using `pv.storyboard.id` in traces) to the new scope-based matching algorithm described in LIBRARY_TELEMETRY_AND_MATCHING.md.

**Important**: This is a **clean break refactor** - no backwards compatibility required. We will replace the existing system entirely.

---

## Key Conceptual Changes

### Old Approach (Current)
- Traces contain explicit `pv.storyboard.id` attributes
- Single scope per trace
- Single-level matching (matched vs unmatched)
- Registry lookup by storyboard ID from attributes

### New Approach (Target)
- No `pv.*` attributes required
- Multiple scopes per trace (multi-library support)
- Three-level categorization (scenario match, workflow-orphaned, unmatched)
- Registry lookup by `scope.name + scope.version` from OTLP data

---

## Required Changes

### 1. Update RegisteredTrace Type

**File**: `packages/core/src/types/registered-trace.ts`

**Current Structure** (lines 19-224):
```typescript
interface RegisteredTrace {
  traceId: string;
  scope: { name: string; version?: string };
  registryStatus: 'matched' | 'unmatched' | ...;
  matchInfo?: { storyboardId: string; ... };
  spanMatches: Array<{ spanId, matchedNodeIds, ... }>;
  routing: { ... };
}
```

**New Structure** (from LIBRARY_TELEMETRY_AND_MATCHING.md):
```typescript
interface RegisteredTrace {
  // Multi-resource, multi-scope aware
  resources: Array<{
    serviceIdentifier: string;  // e.g., "http://localhost:3000"
    serviceName: string;        // e.g., "web-ade"
    scopes: Array<{
      scope: { name: string; version: string };
      spanIds: string[];        // Spans from this scope
    }>;
  }>;

  // Category 1: Full matches (workflow + scenario)
  scenarioMatches: Array<{
    storyboardId: string;
    scenarioId: string;
    scopeName: string;          // Which scope/library matched
    matchedSpans: Array<{
      spanId: string;
      spanName: string;
      nodeId: string;           // Matched canvas node
      events: string[];         // Matched event names
    }>;
  }>;

  // Category 2: Workflow-orphaned (span matched, events didn't)
  storyboardMatches: Array<{
    storyboardId: string;
    scopeName: string;
    orphanedSpans: Array<{
      spanId: string;
      spanName: string;
      nodeId: string;           // Matched workflow node
      reason: string;           // Why no scenario matched
      observedEvents: string[]; // Events that were found
    }>;
  }>;

  // Category 3: Unmatched (no workflow match)
  unmatchedSpans: {
    spans: Array<{
      spanId: string;
      spanName: string;
      scopeName: string;
      reason: string;           // Why no workflow matched
    }>;
  };
}
```

**Action Items**:
- [ ] Replace existing RegisteredTrace type completely
- [ ] Remove old single-scope structure
- [ ] No backwards compatibility needed

---

### 2. Implement OTLP Trace Parser

**New File**: `packages/core/src/parsers/OtlpTraceParser.ts`

**Purpose**: Extract structured data from OTLP trace format

**Responsibilities**:
```typescript
class OtlpTraceParser {
  /**
   * Extract all scopes from OTLP trace
   * Returns array of { scope, spanIds }
   */
  extractScopes(otlpData: OtelExportTraceServiceRequest): Array<{
    scope: { name: string; version: string };
    spanIds: string[];
  }>;

  /**
   * Extract resource information (service name, identifier, etc.)
   */
  extractResources(otlpData: OtelExportTraceServiceRequest): Array<{
    serviceIdentifier: string;
    serviceName: string;
    attributes: Record<string, unknown>;
  }>;

  /**
   * Get all spans for a specific scope
   */
  getSpansForScope(
    otlpData: OtelExportTraceServiceRequest,
    scopeName: string
  ): Array<OtelSpan>;

  /**
   * Extract events from a span
   */
  extractSpanEvents(span: OtelSpan): Array<{
    name: string;
    timestamp: number;
    attributes: Record<string, unknown>;
  }>;
}
```

**Action Items**:
- [ ] Create `OtlpTraceParser.ts`
- [ ] Implement scope extraction logic
- [ ] Implement resource extraction logic
- [ ] Implement span filtering by scope
- [ ] Add unit tests with sample OTLP data

---

### 3. Implement Scope-Based Registry Interface

**File**: `packages/core/src/registry/StoryboardRegistry.ts` (new)

**Purpose**: Lookup schematics by scope name + version

**Current State**:
- Interface defined in `registered-trace.ts:258-273`
- **No implementation exists**

**New Implementation**:
```typescript
class StoryboardRegistry {
  /**
   * Lookup by scope@version
   * Returns the schematics package for this scope
   */
  async lookupByScope(
    scopeName: string,
    scopeVersion: string
  ): Promise<{
    storyboardId: string;
    storyboards: Array<Canvas>;  // .otel.canvas files
    workflows: Array<Workflow>;
    version: string;
  } | null>;

  /**
   * List all registered scopes
   */
  async listScopes(): Promise<Array<{
    name: string;
    versions: string[];
  }>>;
}
```

**Action Items**:
- [ ] Create `StoryboardRegistry.ts`
- [ ] Implement `lookupByScope()` method
- [ ] Implement caching for registry lookups
- [ ] Add version resolution logic (exact match, fallback to latest, etc.)
- [ ] Add tests

---

### 4. Implement Orchestration Pipeline

**New File**: `packages/core/src/matchers/TraceOrchestrator.ts`

**Purpose**: Coordinate the end-to-end matching process

**Flow**:
```typescript
class TraceOrchestrator {
  constructor(
    private registry: StoryboardRegistry,
    private spanMatcher: SpanMatcher,
    private scenarioMatcher: ScenarioMatcher
  ) {}

  async processTrace(
    otlpData: OtelExportTraceServiceRequest
  ): Promise<RegisteredTrace> {
    // 1. Parse OTLP trace
    const resources = this.parser.extractResources(otlpData);
    const scopes = this.parser.extractScopes(otlpData);

    // 2. Lookup schematics for each scope
    const scopeSchematicsMap = await this.lookupAllScopes(scopes);

    // 3. Match spans to workflows (per scope)
    const spanMatchResults = await this.matchSpansToWorkflows(
      otlpData,
      scopeSchematicsMap
    );

    // 4. Match events to scenarios (per matched span)
    const scenarioMatchResults = await this.matchEventsToScenarios(
      spanMatchResults
    );

    // 5. Categorize results
    return this.categorizeResults(
      resources,
      scopes,
      spanMatchResults,
      scenarioMatchResults
    );
  }
}
```

**Action Items**:
- [ ] Create `TraceOrchestrator.ts`
- [ ] Implement step-by-step processing pipeline
- [ ] Integrate with existing SpanMatcher
- [ ] Integrate with existing ScenarioMatcher
- [ ] Add error handling and validation
- [ ] Add comprehensive tests

---

### 5. Implement Result Categorizer

**New File**: `packages/core/src/matchers/ResultCategorizer.ts`

**Purpose**: Bucket spans into the three categories

**Logic**:
```typescript
class ResultCategorizer {
  categorize(
    spanMatchResults: SpanMatchResult[],
    scenarioMatchResults: ScenarioMatchResult[]
  ): {
    scenarioMatches: RegisteredTrace['scenarioMatches'];
    storyboardMatches: RegisteredTrace['storyboardMatches'];
    unmatchedSpans: RegisteredTrace['unmatchedSpans'];
  } {
    const scenarioMatches = [];
    const storyboardMatches = [];
    const unmatchedSpans = [];

    for (const spanMatch of spanMatchResults) {
      // Check if span matched a workflow node
      if (spanMatch.matchedNodeIds.length === 0) {
        // Category 3: No workflow match
        unmatchedSpans.push({
          spanId: spanMatch.spanId,
          spanName: spanMatch.spanName,
          scopeName: spanMatch.scopeName,
          reason: 'no-workflow-match'
        });
        continue;
      }

      // Span matched a workflow node - check for scenario match
      const scenarioMatch = scenarioMatchResults.find(
        sm => sm.spanId === spanMatch.spanId
      );

      if (scenarioMatch && scenarioMatch.recommendedScenario) {
        // Category 1: Workflow + Scenario match
        scenarioMatches.push({
          storyboardId: spanMatch.storyboardId,
          scenarioId: scenarioMatch.recommendedScenario.id,
          scopeName: spanMatch.scopeName,
          matchedSpans: [...]
        });
      } else {
        // Category 2: Workflow-orphaned
        storyboardMatches.push({
          storyboardId: spanMatch.storyboardId,
          scopeName: spanMatch.scopeName,
          orphanedSpans: [{
            spanId: spanMatch.spanId,
            spanName: spanMatch.spanName,
            nodeId: spanMatch.matchedNodeIds[0],
            reason: 'no-scenario-match',
            observedEvents: spanMatch.observedEvents
          }]
        });
      }
    }

    return { scenarioMatches, storyboardMatches, unmatchedSpans };
  }
}
```

**Action Items**:
- [ ] Create `ResultCategorizer.ts`
- [ ] Implement categorization logic
- [ ] Handle edge cases (multiple node matches, partial matches, etc.)
- [ ] Add tests

---

### 6. Update Existing Code

**Files to Update**:

1. **SpanMatcher.ts** (packages/core/src/matchers/SpanMatcher.ts)
   - Add `scopeName` to `SpanMatchResult`
   - Add `storyboardId` to results
   - Update to handle multiple schematics per trace

2. **scenario-matcher.ts** (packages/core/src/workflow/scenario-matcher.ts)
   - Ensure it returns `observedEvents` when no match found
   - Add reason codes for no-match scenarios

3. **Consumer Code** (likely in electron-app repo)
   - Update all code that uses `RegisteredTrace`
   - Migrate from single-scope to multi-scope handling
   - Update UI to display three categories

**Action Items**:
- [ ] Audit codebase for `RegisteredTrace` usage
- [ ] Update all consumers to use new three-category structure
- [ ] Update SpanMatcher to include scope information
- [ ] Update ScenarioMatcher to track observed events

---

### 7. Update StoryboardRegistryInterface

**File**: `packages/core/src/types/registered-trace.ts:258-273`

**Replace Interface**:
```typescript
export interface StoryboardRegistryInterface {
  /**
   * Look up schematics by scope name and version
   */
  lookupByScope(
    scopeName: string,
    scopeVersion: string
  ): Promise<{
    storyboards: Array<Canvas>;
    workflows: Array<Workflow>;
    version: string;
  } | null>;

  /**
   * List all registered scopes
   */
  listScopes(): Promise<Array<{
    name: string;
    versions: string[];
  }>>;
}
```

**Action Items**:
- [ ] Replace entire interface with scope-based methods
- [ ] Remove old `lookup()`, `listStoryboards()`, `isRegistered()` methods
- [ ] Document the new interface with examples

---

### 8. Add Validation and Error Handling

**New Features**:

1. **Scope validation**
   - Verify scope.name and scope.version exist
   - Warn if version not found (suggest available versions)

2. **Registry errors**
   - Handle network failures (if remote registry)
   - Handle missing schematics gracefully
   - Provide actionable error messages

3. **Matching errors**
   - Track why spans didn't match
   - Track why events didn't match scenarios
   - Provide suggestions for fixing

**Action Items**:
- [ ] Add validation in OtlpTraceParser
- [ ] Add error handling in StoryboardRegistry
- [ ] Add detailed error reasons in ResultCategorizer
- [ ] Create validation result type

---

## Testing Strategy

### Unit Tests

1. **OtlpTraceParser**
   - Test scope extraction with multi-scope traces
   - Test resource extraction
   - Test span filtering

2. **StoryboardRegistry**
   - Test scope@version lookups
   - Test version resolution (exact, fallback, not found)
   - Test caching

3. **TraceOrchestrator**
   - Test end-to-end flow with sample traces
   - Test multi-scope traces
   - Test error cases

4. **ResultCategorizer**
   - Test all three categories
   - Test edge cases (no matches, all matches, partial)

### Integration Tests

1. **Full pipeline test**
   - OTLP trace → RegisteredTrace output
   - Verify all three categories populated correctly
   - Test with real-world trace data

2. **Multi-library traces**
   - Service using multiple instrumented libraries
   - Verify scopes handled independently
   - Verify results grouped by scope

### Test Data

Create sample OTLP traces for:
- Single scope trace
- Multi-scope trace (service + library)
- Trace with full matches
- Trace with workflow-orphaned spans
- Trace with unmatched spans
- Trace with mix of all three categories

---

## Implementation Path

### Phase 1: Core Library Refactor
- Replace RegisteredTrace type completely
- Implement OtlpTraceParser
- Implement StoryboardRegistry
- Implement TraceOrchestrator
- Implement ResultCategorizer
- Update SpanMatcher and ScenarioMatcher
- Add comprehensive tests

### Phase 2: Consumer Updates
- Update electron-app to use new RegisteredTrace structure
- Update UI to display three categories (scenario matches, workflow-orphaned, unmatched)
- Update any other consumers

### Phase 3: Documentation
- Update all documentation
- Add examples of new trace structure
- Document registry setup and configuration

---

## Open Questions

1. **Registry Implementation**
   - Where are schematics stored? (local files, remote server, database?)
   - How is scope@version → schematics mapping maintained?
   - Is there a central registry or per-project registry?

2. **Performance**
   - How many scopes do we expect per trace? (affects lookup performance)
   - Should registry lookups be cached? For how long?
   - Should we batch process multiple traces?

3. **Multi-Span Workflows**
   - Should we implement this now or defer as documented in LIBRARY_TELEMETRY_AND_MATCHING.md?
   - If now, which approach? (Composite workflows, span groups, or hierarchical scenarios?)

---

## Success Criteria

The refactor is complete when:

1. ✅ New RegisteredTrace type matches design doc structure
2. ✅ OTLP traces can be parsed to extract scopes
3. ✅ Registry lookup by scope@version works
4. ✅ Orchestrator produces three-category results
5. ✅ All existing tests pass
6. ✅ New tests cover all new functionality
7. ✅ Documentation updated
8. ✅ Migration guide provided for consumers

---

## Timeline Estimate

**Note**: These are implementation estimates, not calendar time:

- **Core Library Refactor**:
  - Replace types: 1 day
  - OtlpTraceParser: 2-3 days
  - StoryboardRegistry: 2-3 days
  - TraceOrchestrator: 3-4 days
  - ResultCategorizer: 2-3 days
  - Update existing matchers: 1-2 days
  - Testing: 3-5 days

- **Consumer Updates**: Variable (depends on electron-app complexity)

- **Documentation**: 1-2 days

**Total Core Library**: ~2-3 weeks of focused development time

---

## Workflow Template Fields

### New Fields (v0.24.21+)

Workflow templates now support additional fields for scope tracking and implementation status:

```json
{
  "version": "1.0.0",
  "canvas": ".principal-views/auth-me/auth-me.otel.canvas",
  "mode": "span-tree",
  "spanPattern": "auth.me",
  "scope": "auth-me",
  "status": "implemented",
  "files": ["src/app/api/auth/me/route.ts"],
  "name": "Get Current User",
  "description": "Fetch the currently authenticated user's profile"
}
```

#### `scope` (optional)
The instrumentation scope name that emits this span. This should match:
- A custom tracer name (e.g., `trace.getTracer('auth-me')`)
- An owned scope declared in `library.yaml`

**Important**: Use your custom scope, not auto-instrumentation scopes like `next.js`. If your span is created by auto-instrumentation, consider adding custom instrumentation for better control.

#### `status` (optional)
Workflow lifecycle status:
- `draft` - Design/proposal phase (default)
- `approved` - Design finalized, ready for implementation
- `implemented` - Code exists with instrumentation

#### `files` (optional, required for `approved`/`implemented`)
Array of file paths where this span is instrumented:
```json
"files": ["src/app/api/auth/me/route.ts"]
```

### Validation Rules

The CLI validator enforces:
1. **Files required**: When `status` is `approved` or `implemented`, `files` must be specified
2. **Files exist**: When `status` is `implemented`, all files must exist on disk

---

## Custom Instrumentation Pattern

### Recommended Approach

Use custom instrumentation with your own tracer rather than relying on auto-instrumentation:

```typescript
// Create a custom tracer with your scope name
const tracer = trace.getTracer('auth-me');

export async function GET(request: Request) {
  // Create a span with your custom name
  const span = tracer.startSpan('auth.me');

  try {
    // Add events to the span
    span.addEvent('auth.me.get_token', { has_token: true });
    span.addEvent('auth.me.fetch_github', { status: 200 });
    span.addEvent('auth.me.success', { 'user.login': 'john' });

    return NextResponse.json({ user });
  } catch (error) {
    span.addEvent('auth.me.error', { 'error.message': error.message });
    throw error;
  } finally {
    span.end();
  }
}
```

### Why Custom Instrumentation?

| Aspect | Auto-instrumentation (e.g., `next.js`) | Custom instrumentation |
|--------|----------------------------------------|------------------------|
| Span name | `GET /api/auth/me/route` (framework-defined) | `auth.me` (you control) |
| Scope | `next.js` | `auth-me` (your tracer) |
| Stability | May change between framework versions | You control |
| Events | None (just span lifecycle) | Custom events attached |
| Workflow match | Matches wrapper span | Matches your span with events |

### Workflow Configuration

```json
{
  "spanPattern": "auth.me",
  "scope": "auth-me",
  "status": "implemented",
  "files": ["src/app/api/auth/me/route.ts"]
}
```

---

## Related Documents

- `LIBRARY_TELEMETRY_AND_MATCHING.md` - Design specification
- `LOCAL_DEVELOPMENT_REGISTRY.md` - Local development and owned-scopes
- `REGISTERED_TRACE_REDESIGN.md` (electron-app) - Related trace redesign
- `.principal-views/matching-logic-current-state.canvas` - Visual storyboard
- `.principal-views/matching-logic-current-state.md` - Current state documentation
