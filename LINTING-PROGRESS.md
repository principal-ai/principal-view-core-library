# Linting Progress Tracker

**Last Updated:** 2026-01-22
**Status:** In Progress

## Overall Summary

- **Total Problems:** 219 → 208 (205 errors, 3 warnings)
- **Fixed Today:** 11 errors
- **Remaining:** 208 problems
- **Completed:**
  - Unused imports/variables (14 fixes) ✅
  - Fallthrough errors (2 fixes) ✅
  - Require statements (3 fixes) ✅
  - Namespace errors (2 fixes via eslint-disable) ✅

## Progress by Package

| Package | Files with Errors | Status | Notes |
|---------|------------------|--------|-------|
| **core** | 23 → 22 | 🟡 In Progress | Fixed 7 errors in 3 files, ~90+ errors remain |
| **react** | 9 → 8 | 🟡 Started | Fixed 7 errors in 2 files, ~55+ errors remain |
| **logger** | 6 → 5 | 🟡 Started | Fixed 2 errors in 2 files, ~20+ errors remain |
| **cli** | 0 | ✅ Clean | No errors! |
| **scripts** | 3 | 🔴 Not started | Root-level migration scripts |

## Progress by Error Type

| Error Type | Count | Status | Priority |
|------------|-------|--------|----------|
| `@typescript-eslint/no-explicit-any` | 131 | 🔴 Not started | Medium |
| `react/no-unescaped-entities` | 54 | 🔴 Not started | Low |
| `react-hooks/rules-of-hooks` | 13 | 🔴 Not started | High |
| `no-case-declarations` | 4 | 🔴 Not started | Medium |
| `no-regex-spaces` | 2 | 🔴 Not started | Low |
| `no-irregular-whitespace` | 2 | 🔴 Not started | Low |
| `@typescript-eslint/no-namespace` | 5 → 3 | 🟡 Partial (2 fixed) | Medium |
| `@typescript-eslint/no-var-requires` | 3 → 0 | ✅ Fixed | - |
| `no-fallthrough` | 2 → 0 | ✅ Fixed | - |
| `@typescript-eslint/no-unused-vars` | 14 → 0 | ✅ Fixed | - |

## Completed Fixes

### ✅ Unused Imports/Variables (14 fixes)
1. `packages/core/src/PathBasedEventProcessor.ts` - Removed unused imports: ComponentActionEvent, EdgeAnimationEvent, JsonObject
2. `packages/core/src/utils/CanvasConverter.ts` - Prefixed unused canvas arg with _
3. `packages/core/src/utils/GraphConverter.test.ts` - Removed unused setSpanAttribute import
4. `packages/logger/src/transports/RecorderTransport.test.ts` - Removed unused beforeEach import
5. `packages/logger/src/transports/WebSocketTransport.ts` - Prefixed unused event arg with _
6. `packages/react/src/components/PendingChanges.test.tsx` - Removed 5 unused imports
7. `packages/react/src/stories/NodeFieldsAudit.stories.tsx` - Deleted 2 unused canvas constants

### ✅ Switch Fallthrough Errors (2 fixes)
1. `packages/core/src/cli/codegen.ts:78,81` - Added missing break statements after process.exit()

### ✅ Require Statements (3 fixes)
1. `packages/core/src/codegen/type-generator.test.ts` - Converted require() to import statements for generatorRegistry

### 🟡 Namespace Errors (2 of 5 fixed)
1. `packages/core/src/codegen/usage-example.ts` - Added eslint-disable for namespaces (example/documentation file)
2. Remaining 3 namespace errors in other files - TBD

## Detailed File List

### packages/core (23 → 22 files)
- `scripts/measure-telemetry-coverage.ts` - 2 any types
- `scripts/suggest-anchors.ts` - 2 any types
- `src/EventRecorderService.test.ts` - 6 any types
- `src/PathBasedEventProcessor.test.ts` - ✅ Fixed (3 unused imports)
- `src/SessionManager.test.ts` - 1 any type
- `src/ValidationEngine.ts` - 2 any types
- `src/cli/codegen.ts` - ✅ Fixed (2 fallthrough errors)
- `src/codegen/type-generator.test.ts` - ✅ Fixed (3 require statements)
- `src/codegen/usage-example.ts` - 🟡 Partial (2 namespaces suppressed, multiple any types remain)
- `src/utils/CanvasConverter.ts` - ✅ Fixed (1 unused arg)
- `src/utils/GraphConverter.test.ts` - ✅ Fixed (1 unused import)
- `src/discovery/CanvasDiscovery.test.ts` - Multiple errors
- `src/discovery/CanvasDiscovery.ts` - Multiple errors
- `src/discovery/types.ts` - Multiple errors
- `src/execution/ExecutionValidator.ts` - Multiple errors
- `src/generated/graph-converter-execution.types.ts` - Generated file
- `src/helpers/GraphInstrumentationHelper.test.ts` - Multiple errors
- `src/narrative/__tests__/template-renderer.test.ts` - Multiple errors
- `src/narrative/__tests__/validator.test.ts` - Multiple errors
- `src/narrative/validator.ts` - Multiple errors
- `src/telemetry/coverage.ts` - Multiple errors
- `src/utils/PathMatcher.ts` - 1 regex spaces error
- `src/utils/TraceToCanvas.test.ts` - Multiple errors
- `test/end-to-end.test.ts` - Multiple errors
- `test/rules-engine-instrumented.test.ts` - Multiple errors

### packages/react (9 → 8 files)
- `src/components/GraphRenderer.tsx` - 1 any type
- `src/components/PendingChanges.test.tsx` - ✅ Fixed (5 unused imports)
- `src/hooks/usePathBasedEvents.ts` - Multiple errors
- `src/stories/CanvasEdgeTypes.stories.tsx` - Multiple errors
- `src/stories/CanvasNodeTypes.stories.tsx` - Multiple errors
- `src/stories/ColorPriority.stories.tsx` - Multiple errors
- `src/stories/EventDrivenAnimations.stories.tsx` - Multiple errors
- `src/stories/NodeShapes.stories.tsx` - 12 unescaped entities
- `src/stories/NodeFieldsAudit.stories.tsx` - ✅ Fixed (2 unused variables)
- `src/stories/OtelComponents.stories.tsx` - 1 hooks violation
- `src/stories/RealTestExecution.stories.tsx` - 6 hooks violations

### packages/logger (6 → 5 files)
- `src/EnhancedLogger.ts` - Multiple any types
- `src/transports/RecorderTransport.test.ts` - ✅ Fixed (1 unused import)
- `src/transports/RecorderTransport.ts` - Multiple any types
- `src/transports/WebSocketTransport.ts` - ✅ Fixed (1 unused arg)
- `src/types.ts` - Multiple any types
- `src/wrappers.ts` - Multiple any types

### scripts (3 files)
- `scripts/migrate-events.ts` - 11 any types

## Next Steps

**Recommended Order:**
1. Fix critical issues (fallthrough, hooks violations) - High priority
2. Fix any types in production code (non-test files)
3. Fix React/JSX cosmetic issues (unescaped entities)
4. Fix any types in test files
5. Fix namespace and require statements

## Notes

- Type checking passes with 0 errors ✅
- CLI package is already clean
- Most errors are in test files and Storybook stories
- Consider disabling `no-explicit-any` for test files if appropriate
- Generated files (`graph-converter-execution.types.ts`) may need special handling

## Known Issues

- `packages/core/src/utils/PathMatcher.ts` - Has irregular whitespace (zero-width spaces) causing parsing errors. Skipped for now, needs manual inspection/rewrite of affected lines (13, 169).
