# Scenario-Specific Executions

**Status:** Design Proposal
**Created:** 2026-01-27
**Author:** System Design

## Overview

This document describes a feature for explicitly associating execution artifacts with specific narrative scenarios using a directory-based structure. This enables saved, reference test runs that serve as examples or "golden" executions for each scenario.

## Motivation

Currently, executions are matched to scenarios dynamically based on event content analysis. While powerful, this doesn't support:

1. **Saved test runs** - Preserved exemplar executions for each scenario
2. **Scenario documentation** - Reference executions that demonstrate each scenario
3. **Explicit mapping** - Clear, predictable association between files and scenarios
4. **Test organization** - Logical grouping of related test runs

### Use Cases

- **Onboarding**: Show new developers what each scenario looks like in practice
- **Documentation**: Executable examples for each narrative scenario
- **Regression testing**: Saved executions to compare against
- **Visual testing**: Reference runs for UI/behavior validation

## Proposed Solution

### Directory Structure

Organize execution files in subdirectories matching scenario IDs:

```
.principal-views/
├── checkout-flow.otel.canvas
├── __narratives__/
│   └── checkout-scenarios.narrative.json
└── __executions__/
    ├── checkout-success/           # Matches scenario id: "checkout-success"
    │   ├── run-001.otel.json      # Individual test run
    │   ├── run-002.otel.json
    │   └── golden.otel.json       # Named reference run
    ├── payment-declined/           # Matches scenario id: "payment-declined"
    │   ├── card-declined.otel.json
    │   └── insufficient-funds.otel.json
    ├── insufficient-inventory/     # Matches scenario id: "insufficient-inventory"
    │   └── out-of-stock.otel.json
    └── checkout-timeout/           # Matches scenario id: "checkout-timeout"
        └── gateway-timeout.otel.json
```

### Mapping Rules

1. **Subdirectory name** must exactly match a **scenario ID** from the narrative template
2. All `.otel.json` files within that subdirectory belong to that scenario
3. Files in the root `__executions__/` directory (no subdirectory) fall back to content-based matching
4. Subdirectories that don't match any scenario ID are ignored

### File Discovery Algorithm

```typescript
interface ScenarioExecution {
  scenarioId: string;
  executions: ExecutionFile[];
}

function findScenarioExecutions(
  narrativeTemplate: NarrativeTemplate,
  allFiles: FileInfo[]
): ScenarioExecution[] {
  const scenarioIds = narrativeTemplate.scenarios.map(s => s.id);
  const results: ScenarioExecution[] = [];

  for (const scenarioId of scenarioIds) {
    // Pattern: __executions__/{scenarioId}/*.otel.json
    const pattern = new RegExp(
      `^__executions__/${scenarioId}/(.+)\\.otel\\.json$`
    );

    const executions = allFiles
      .filter(f => pattern.test(f.relativePath))
      .map(f => createExecutionFile(f, scenarioId));

    results.push({
      scenarioId,
      executions
    });
  }

  return results;
}
```

## Implementation Plan

### Phase 1: Core Library Updates

#### 1.1 Update ExecutionLoader

**File:** `packages/core/src/execution/ExecutionLoader.ts` (or create if doesn't exist)

Add new pattern and data structure:

```typescript
interface ExecutionFile {
  id: string;
  name: string;
  path: string;
  scenarioId?: string;  // NEW: explicit scenario association
  canvasBasename?: string;
  packageName?: string;
}

const SCENARIO_EXECUTION_PATTERNS = [
  // Scenario-specific: __executions__/{scenarioId}/*.otel.json
  /^__executions__\/([^/]+)\/(.+)\.otel\.json$/,
  // Monorepo: packages/{pkg}/__executions__/{scenarioId}/*.otel.json
  /^packages\/([^/]+)\/__executions__\/([^/]+)\/(.+)\.otel\.json$/,
  // VGC: .principal-views/__executions__/{scenarioId}/*.otel.json
  /^\.principal-views\/__executions__\/([^/]+)\/(.+)\.otel\.json$/,
];
```

#### 1.2 Update Discovery Logic

```typescript
function findScenarioSpecificExecutions(
  files: FileInfo[],
  scenarioIds: string[]
): Map<string, ExecutionFile[]> {
  const scenarioMap = new Map<string, ExecutionFile[]>();

  for (const file of files) {
    for (const pattern of SCENARIO_EXECUTION_PATTERNS) {
      const match = file.relativePath.match(pattern);
      if (!match) continue;

      let scenarioId: string;
      let filename: string;
      let packageName: string | undefined;

      if (pattern === SCENARIO_EXECUTION_PATTERNS[0]) {
        // __executions__/{scenarioId}/*.otel.json
        [, scenarioId, filename] = match;
      } else if (pattern === SCENARIO_EXECUTION_PATTERNS[1]) {
        // packages/{pkg}/__executions__/{scenarioId}/*.otel.json
        [, packageName, scenarioId, filename] = match;
      } else {
        // .principal-views/__executions__/{scenarioId}/*.otel.json
        [, scenarioId, filename] = match;
      }

      // Only include if scenarioId matches a known scenario
      if (!scenarioIds.includes(scenarioId)) {
        console.warn(`Ignoring execution in unknown scenario directory: ${scenarioId}`);
        continue;
      }

      const execution: ExecutionFile = {
        id: `${scenarioId}-${filename}`,
        name: formatExecutionName(filename),
        path: file.relativePath,
        scenarioId,
        packageName,
      };

      const existing = scenarioMap.get(scenarioId) || [];
      existing.push(execution);
      scenarioMap.set(scenarioId, existing);
    }
  }

  return scenarioMap;
}
```

### Phase 2: Panel Framework Updates

#### 2.1 Update ExecutionLoader in Panels

**File:** `src/panels/execution-viewer/ExecutionLoader.ts`

Add scenario-specific discovery:

```typescript
static findScenarioExecutions(
  files: FileInfo[],
  scenarioIds: string[]
): Map<string, ExecutionFile[]> {
  // Implementation similar to core library
  // Returns map of scenario ID -> execution files
}
```

#### 2.2 Update CanvasDetailPanel State

Add new state for scenario-specific executions:

```typescript
interface CanvasDetailPanelState {
  // ... existing state ...
  scenarioExecutions: Map<string, ExecutionFile[]>;  // NEW
}
```

#### 2.3 Update loadCanvas Method

```typescript
const loadCanvas = async (canvasId: string, canvasPath: string) => {
  // ... existing code ...

  // Find scenario-specific executions
  let scenarioExecutions = new Map<string, ExecutionFile[]>();
  if (state.narrativeTemplate) {
    const scenarioIds = state.narrativeTemplate.scenarios.map(s => s.id);
    scenarioExecutions = ExecutionLoader.findScenarioExecutions(
      fileTreeData.allFiles,
      scenarioIds
    );
  }

  setState(prev => ({
    ...prev,
    scenarioExecutions,
    // ... rest of state
  }));
};
```

#### 2.4 Update NarrativeTemplatePanel

Display scenario-specific executions instead of dynamically matched ones:

```typescript
const NarrativeTemplatePanel: React.FC<Props> = ({
  narrativeTemplate,
  scenarioExecutions,  // NEW: Map<scenarioId, ExecutionFile[]>
  // ... other props
}) => {
  return (
    <div>
      {narrativeTemplate.scenarios.map(scenario => {
        const executions = scenarioExecutions.get(scenario.id) || [];

        return (
          <div key={scenario.id}>
            <h3>{scenario.id}</h3>
            {executions.length > 0 && (
              <div>
                <p>{executions.length} saved execution(s)</p>
                {executions.map(exec => (
                  <div key={exec.id} onClick={() => onExecutionSelect(exec.id)}>
                    {exec.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
```

## Migration Path

### Backward Compatibility

Support both approaches simultaneously:

1. **Scenario-specific executions** (directory-based) - new primary method
2. **Generic executions** (content-based matching) - fallback for compatibility

```typescript
function getExecutionsForScenario(
  scenarioId: string,
  scenarioExecutions: Map<string, ExecutionFile[]>,
  allExecutions: ExecutionFile[],
  executionScenarioMap: Record<string, string>
): ExecutionFile[] {
  // Priority 1: Scenario-specific directory
  const specific = scenarioExecutions.get(scenarioId);
  if (specific && specific.length > 0) {
    return specific;
  }

  // Priority 2: Content-based match (backward compatibility)
  return allExecutions.filter(
    exec => executionScenarioMap[exec.id] === scenarioId
  );
}
```

### Migration Guide for Users

#### Current Structure
```
__executions__/
  test-001.otel.json
  test-002.otel.json
  test-003.otel.json
```

#### Migrated Structure
```
__executions__/
  checkout-success/
    test-001.otel.json  # moved
    test-002.otel.json  # moved
  payment-declined/
    test-003.otel.json  # moved
```

**Migration script example:**
```bash
# Analyze existing executions and suggest organization
pv organize-executions --narrative checkout-scenarios.narrative.json

# Output:
# Suggested organization:
#   test-001.otel.json → checkout-success/
#   test-002.otel.json → checkout-success/
#   test-003.otel.json → payment-declined/
```

## Edge Cases & Considerations

### 1. Multiple Executions per Scenario
**Solution:** All files in scenario directory are included. Users can name them descriptively:
```
payment-declined/
  card-declined.otel.json
  insufficient-funds.otel.json
  expired-card.otel.json
```

### 2. Scenario Renamed
**Impact:** Directory name becomes stale, executions won't be found.
**Solution:**
- Add validation warning in UI
- Show "orphaned" execution directories that don't match any scenario
- Suggest rename

### 3. No Executions for Scenario
**Behavior:** Scenario is shown but execution list is empty (just like now)

### 4. Mixed Approach
**Scenario:** Some executions in scenario directories, some in root
**Solution:**
- Scenario directory takes precedence
- Root executions only used if no scenario directory exists
- UI can show both with visual distinction

### 5. Cross-Canvas Executions
**Question:** Can one execution be used by multiple canvases?
**Answer:** Yes - each canvas can have its own `__executions__/` directory with symbolic links or copies

## Testing Strategy

### Unit Tests
```typescript
describe('Scenario-Specific Execution Discovery', () => {
  it('should find executions in scenario subdirectories', () => {
    const files = [
      { path: '__executions__/success/test.otel.json' },
      { path: '__executions__/failure/test.otel.json' },
    ];
    const scenarios = ['success', 'failure'];

    const result = findScenarioExecutions(files, scenarios);

    expect(result.get('success')).toHaveLength(1);
    expect(result.get('failure')).toHaveLength(1);
  });

  it('should ignore directories that do not match scenario IDs', () => {
    const files = [
      { path: '__executions__/unknown/test.otel.json' },
    ];
    const scenarios = ['success'];

    const result = findScenarioExecutions(files, scenarios);

    expect(result.get('unknown')).toBeUndefined();
  });
});
```

### Integration Tests
- Create sample canvas with narrative
- Add scenario-specific executions
- Verify UI displays them correctly
- Verify clicking loads execution
- Verify hover highlights nodes

## Future Enhancements

### 1. Execution Metadata
Add more info to execution files:
```json
{
  "metadata": {
    "scenarioId": "payment-declined",
    "description": "Card declined due to insufficient funds",
    "tags": ["regression", "critical"],
    "createdAt": "2026-01-27T10:00:00Z",
    "author": "test-suite"
  }
}
```

### 2. UI Enhancements
- **Execution comparison**: Compare two executions side-by-side
- **Execution diff**: Show what changed between runs
- **Execution history**: Timeline of executions for a scenario
- **Golden execution**: Mark one as "reference" with star icon

### 3. CLI Tools
```bash
# Generate execution from test run
pv record-execution --scenario payment-declined --output test-001.otel.json

# Validate scenario directory structure
pv validate-executions --narrative checkout-scenarios.narrative.json

# Organize existing executions
pv organize-executions --auto
```

## Questions for Clarification

1. **Naming conventions**: Any preference for execution filenames within scenario directories?
2. **Multiple runs**: How should we handle multiple executions per scenario in the UI? (list, tabs, dropdown?)
3. **Primary execution**: Should one execution be marked as "primary" or "golden" for each scenario?
4. **Auto-discovery**: Should we still analyze generic executions for debugging, or completely remove content-based matching?

## Implementation Checklist

Core Library:
- [ ] Add scenario-specific patterns to ExecutionLoader
- [ ] Implement findScenarioExecutions method
- [ ] Add scenarioId to ExecutionFile interface
- [ ] Update discovery logic with validation
- [ ] Add unit tests

Panel Framework:
- [ ] Update ExecutionLoader in panels package
- [ ] Add scenarioExecutions to CanvasDetailPanel state
- [ ] Update loadCanvas to discover scenario executions
- [ ] Pass scenarioExecutions to NarrativeTemplatePanel
- [ ] Update NarrativeTemplatePanel UI
- [ ] Add integration tests
- [ ] Update documentation

Documentation:
- [ ] Add user guide for organizing executions
- [ ] Add migration guide
- [ ] Update examples in stories
- [ ] Add video/screenshots of feature

## Success Metrics

- Executions properly grouped by scenario in UI
- Clear visual distinction from generic executions
- Validation warnings for orphaned directories
- Users can easily organize test runs
- Backward compatible with existing setups
