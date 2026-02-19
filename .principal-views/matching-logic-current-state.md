# OTLP Trace Matching Logic - Current Implementation State

## What This Feature Does

The trace matching system processes OpenTelemetry (OTLP) traces and matches them against registered workflow schematics to determine which scenarios are being executed. This enables:

1. **Automatic workflow detection** - Identify which workflows are executing based on telemetry data
2. **Scenario recognition** - Match event sequences to known scenarios within workflows
3. **Coverage tracking** - Identify which parts of workflows are instrumented vs missing
4. **Multi-library support** - Handle traces from multiple instrumented libraries in the same process

## Why This Matters

When services use instrumented libraries, telemetry appears in traces as separate "scopes" (instrumentation libraries). The matching system needs to:

- Look up the correct schematics for each library based on scope name and version
- Match spans to expected workflow definitions
- Match events within spans to scenario patterns
- Categorize results into three buckets:
  - ✅ **Full matches** - spans with matching scenarios
  - ⚠️ **Workflow-orphaned** - spans that match workflows but events don't match any scenario
  - ❌ **Unmatched** - spans that don't match any workflow

This categorization helps developers understand which code paths are executing as expected, which are executing but behaving unexpectedly, and which are not part of registered workflows.

## What's Implemented

The codebase has strong foundational pieces:

### Type System (✅ Complete)
- `RegisteredTrace` - Complete output structure with routing info, span matches, and registry status
- Interface definitions for registry lookup and trace matching
- Location: `packages/core/src/types/registered-trace.ts`

### Scenario Matching (✅ Complete)
- Matches events within a span to scenario definitions
- Returns full matches (100% coverage) and partial matches
- Recommends best scenario based on coverage and priority
- Location: `packages/core/src/workflow/scenario-matcher.ts`

### Span Matching (✅ Complete)
- Efficiently matches OTLP spans to canvas nodes
- Supports compiled matching rules for performance
- Returns span match results with node IDs and timing
- Location: `packages/core/src/matchers/SpanMatcher.ts`

### Supporting Infrastructure (✅ Complete)
- **Version Registry** - In-memory storage for version snapshots
- **Event Registry** - Indexes events across libraries and canvases
- **Trace Aggregation** - Groups spans by trace ID and extracts workflow info
- **Storyboard Builder** - Builds context and resolves node IDs
- **Workflow Discovery** - Provides workflow and canvas type definitions

## What's Missing

The critical gap is the **orchestration layer** that ties these pieces together:

### Registry Lookup (❌ Missing)
- No implementation that takes `scope.name + scope.version` from OTLP traces
- No code that queries a registry to find matching schematics packages
- The `StoryboardRegistryInterface.lookup()` is defined but not implemented

### Scope Extraction (❌ Missing)
- No code that extracts scope information from incoming OTLP traces
- This is the first step in the matching pipeline

### Orchestration Pipeline (❌ Missing)
- No end-to-end flow that:
  1. Extracts scopes from OTLP traces
  2. Looks up schematics from registry
  3. Coordinates span and scenario matching
  4. Categorizes results into three buckets

### Result Categorization (❌ Missing)
- No implementation that produces the three-category output:
  - Workflow + Scenario matches
  - Workflow-orphaned spans
  - Unmatched spans

## Design Principles

### Single-Span Event Matching
Events are matched only within their containing span, not across span boundaries. This keeps matching:
- **Clean and isolated** - each span is self-contained
- **Composable** - scenarios exist at each level of the hierarchy
- **Simple to reason about** - events from different spans don't intermix

### Scope-Based Registry Lookup
The scope name and version in the OTLP trace serves as the lookup key for schematics:
- No need for explicit `pv.storyboard.id` attributes in traces
- Libraries declare their instrumentation scope
- Registry returns the matching schematics package

### Three-Category Results
All spans fall into one of three categories:
1. **Full match** - expected behavior, span and events match
2. **Workflow-orphaned** - unexpected behavior, span matches but events don't
3. **Unmatched** - ad-hoc instrumentation not part of workflows

## Next Steps

To complete this feature, the refactor needs to:

1. Implement scope extraction from OTLP traces
2. Implement registry lookup (scope@version → schematics)
3. Build the orchestration pipeline that coordinates all components
4. Implement result categorization logic
5. Ensure the output conforms to the `RegisteredTrace` type structure

## Related Documentation

- `docs/LIBRARY_TELEMETRY_AND_MATCHING.md` - Complete design specification
- `REGISTERED_TRACE_REDESIGN.md` (electron-app repo) - Related trace structure redesign
