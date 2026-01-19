# ESLint Cleanup Effort

**Date Started:** 2026-01-19
**Status:** Phase 1 Complete
**Total Errors:** 253 (down from 296, originally 331)

---

## Summary

This document tracks the ESLint cleanup effort across the monorepo to achieve a clean, type-safe codebase ready for commit.

### Completed Work ✅

1. **ESLint Configuration Updates**
   - Changed `@typescript-eslint/no-explicit-any` from `warn` to `error`
   - Added support for `_` prefix to ignore unused variables/parameters
   - Configuration: `.eslintrc.js:30-35`

2. **Fixed Unused Variables/Imports** (35 fixes)
   - CLI package: 5 files fixed
   - Core package: 15 files fixed
   - All TypeScript strict checks now pass

3. **TypeScript Type Checking**
   - ✅ All packages pass: `tsc --noEmit`
   - CLI: Pass
   - Core: Pass
   - React: Pass

### Current Error Breakdown

| Error Type | Count | Priority |
|------------|-------|----------|
| `@typescript-eslint/no-explicit-any` | 151 (was 194) | HIGH |
| `react/no-unescaped-entities` | 54 | MEDIUM |
| `react-hooks/rules-of-hooks` | 13 | HIGH |
| `@typescript-eslint/no-unused-vars` | ~10 | HIGH |
| `@typescript-eslint/no-namespace` | 5 | LOW |
| `@typescript-eslint/no-var-requires` | 3 | MEDIUM |
| Other (fallthrough, regex) | ~14 | LOW |

---

## Cleanup Plan by Package

### Priority 1: packages/core (128 `no-explicit-any` errors)

**Target:** Remove all `any` types and replace with proper TypeScript types

#### High-Impact Files (50+ errors)
1. **src/narrative/__tests__/validator.test.ts** (18 errors)
   - Test file - likely mock/stub objects using `any`
   - Replace with proper type definitions or type assertions

2. **src/PathBasedEventProcessor.test.ts** (16 errors)
   - Test file - event/span mock objects
   - Create proper test fixtures with correct types

3. **src/helpers/GraphInstrumentationHelper.test.ts** (13 errors)
   - Test file - OTEL span mocks
   - Define proper span types for tests

4. **src/helpers/GraphInstrumentationHelper.ts** (11 errors)
   - ⚠️ Production code - PRIORITY
   - OTEL span handling needs proper typing

5. **src/utils/TraceToCanvas.test.ts** (11 errors)
   - Test file - trace data structures
   - Define trace data types

#### Medium-Impact Files (25-50 errors)
6. **src/types/index.ts** (8 errors)
   - ⚠️ Type definitions - PRIORITY
   - Core type system needs proper definitions

7. **src/utils/CanvasConverter.ts** (7 errors)
   - Production utility
   - Canvas conversion logic needs typing

8. **src/EventRecorderService.test.ts** (6 errors)
   - Test file - message/event mocks

9. **src/EventProcessor.ts** (5 errors)
   - ⚠️ Production code - PRIORITY
   - Event processing needs proper types

10. **src/telemetry/event-validator.ts** (5 errors)
    - ⚠️ Production code - PRIORITY
    - Event validation logic

#### Remaining Files (40 errors across 14 files)
- src/codegen/usage-example.ts (4)
- src/types/path-based-config.ts (4)
- src/PathBasedEventProcessor.ts (3)
- scripts/measure-telemetry-coverage.ts (2)
- scripts/suggest-anchors.ts (2)
- 9 files with 1-2 errors each

#### Other Core Package Errors
- **@typescript-eslint/no-unused-vars**: 5 errors
  - src/codegen/type-generator.test.ts (3 `require()` statements)
  - src/cli/codegen.ts (2 fallthrough cases)
- **@typescript-eslint/no-namespace**: 5 errors
  - src/codegen/usage-example.ts (2)
  - src/generated/graph-converter-execution.types.ts (3)
- **no-regex-spaces**: 2 errors
  - src/narrative/__tests__/template-renderer.test.ts

**Estimated Effort:** 6-8 hours
**Completion Target:** Phase 1

---

### Priority 2: packages/react (33 `no-explicit-any` errors)

**Target:** Type all React components and remove `any` usage

#### Files with `no-explicit-any` errors

1. **src/components/PendingChanges.test.tsx** (16 errors)
   - Test file - component props/state mocks
   - Define proper prop types

2. **src/components/GraphRenderer.tsx** (7 errors)
   - ⚠️ Core component - PRIORITY
   - Graph rendering logic needs proper typing

3. **src/stories/RealTestExecution.stories.tsx** (6 errors)
   - Storybook file - story data
   - Type story args and data

4. **src/components/TestEventPanel.tsx** (2 errors)
   - Component code
   - Event panel props

5. **src/stories/ValidatedExecution.stories.tsx** (2 errors)
   - Storybook file
   - Story data types

#### Other React Package Errors
- **react/no-unescaped-entities**: 54 errors
  - src/components/TestEventPanel.tsx (~50 errors)
  - Fix: Replace `'` with `&apos;` or `&rsquo;`
  - Can be partially auto-fixed

- **react-hooks/rules-of-hooks**: 13 errors
  - src/stories/OtelComponents.stories.tsx (1)
  - src/stories/RealTestExecution.stories.tsx (12)
  - Issue: Hooks called in `render` functions
  - Fix: Convert to proper React components or remove hooks

**Estimated Effort:** 3-4 hours
**Completion Target:** Phase 2

---

### Priority 3: packages/logger (33 `no-explicit-any` errors)

**Target:** Properly type logger internals and transport layer

#### Files with `no-explicit-any` errors

1. **src/transports/RecorderTransport.test.ts** (10 errors)
   - Test file - transport mock objects
   - Define proper transport types

2. **src/wrappers.ts** (7 errors)
   - ⚠️ Core wrapper logic - PRIORITY
   - Function wrapper types

3. **src/transports/WebSocketTransport.ts** (6 errors)
   - Transport implementation
   - WebSocket message types

4. **src/EnhancedLogger.ts** (5 errors)
   - ⚠️ Main logger class - PRIORITY
   - Log method signatures

5. **src/transports/RecorderTransport.ts** (3 errors)
   - Transport implementation
   - Record message types

6. **src/types.ts** (2 errors)
   - Type definitions
   - Core logger types

**Estimated Effort:** 2-3 hours
**Completion Target:** Phase 3

---

## Action Plan

### Phase 1: Core Package Production Code (Priority: HIGH)
**Goal:** Fix `any` types in production code only

**Files to fix (in order):**
1. src/types/index.ts (8 errors) - Foundation types
2. src/helpers/GraphInstrumentationHelper.ts (11 errors) - Core helper
3. src/EventProcessor.ts (5 errors) - Event processing
4. src/telemetry/event-validator.ts (5 errors) - Validation
5. src/utils/CanvasConverter.ts (7 errors) - Conversion utilities
6. src/PathBasedEventProcessor.ts (3 errors) - Path processor
7. src/types/path-based-config.ts (4 errors) - Config types

**Success Criteria:**
- All production code in core package properly typed
- Test files can remain with `any` for now

**Estimated Time:** 4-5 hours

---

### Phase 2: React Package (Priority: MEDIUM)
**Goal:** Fix React components and Storybook issues

**Tasks (in order):**
1. Fix `GraphRenderer.tsx` (7 `any` errors) - Core component
2. Fix `TestEventPanel.tsx` (2 `any` + 54 unescaped entities)
   - Run `eslint --fix` for auto-fixable unescaped entities
   - Manually fix remaining `any` types
3. Fix Storybook hooks violations (13 errors)
   - Convert `render` functions to proper components
4. Type remaining story files

**Success Criteria:**
- All React components properly typed
- No hooks violations
- All JSX entities properly escaped

**Estimated Time:** 3-4 hours

---

### Phase 3: Logger Package (Priority: MEDIUM)
**Goal:** Properly type logger infrastructure

**Tasks (in order):**
1. Fix src/types.ts (2 errors) - Foundation
2. Fix src/EnhancedLogger.ts (5 errors) - Main logger
3. Fix src/wrappers.ts (7 errors) - Wrappers
4. Fix transport implementations (9 errors total)

**Success Criteria:**
- Logger has complete type coverage
- Transport layer properly typed

**Estimated Time:** 2-3 hours

---

### Phase 4: Test Files & Cleanup (Priority: LOW)
**Goal:** Clean up remaining test files and minor issues

**Tasks:**
1. Type test fixtures in core package tests
2. Fix namespace warnings (5 errors) - consider refactoring
3. Replace `require()` statements (3 errors) - convert to imports
4. Fix regex/fallthrough issues (18 errors)

**Success Criteria:**
- Zero ESLint errors
- All code properly typed
- Codebase ready to commit

**Estimated Time:** 3-4 hours

---

## Progress Tracking

### Phase 1: Core Production Code ✅ COMPLETE
- [x] src/types/index.ts (8 errors) ✅
- [x] src/helpers/GraphInstrumentationHelper.ts (11 errors) ✅
- [x] src/EventProcessor.ts (5 errors) ✅
- [x] src/telemetry/event-validator.ts (5 errors) ✅
- [x] src/utils/CanvasConverter.ts (7 errors) ✅
- [x] src/PathBasedEventProcessor.ts (3 errors) ✅
- [x] src/types/path-based-config.ts (4 errors) ✅

**Phase 1 Results:**
- Fixed: 43 no-explicit-any errors in 7 production files
- Approach: Created semantic type system (JsonValue, JsonObject, NodeData, EdgeData, EventMetadata)
- All core production code now properly typed

### Phase 2: React Package
- [ ] src/components/GraphRenderer.tsx
- [ ] src/components/TestEventPanel.tsx (any + entities)
- [ ] Fix Storybook hooks violations
- [ ] Type story files

### Phase 3: Logger Package
- [ ] src/types.ts
- [ ] src/EnhancedLogger.ts
- [ ] src/wrappers.ts
- [ ] Transport implementations

### Phase 4: Tests & Cleanup
- [ ] Core test files
- [ ] Fix namespaces
- [ ] Convert require() to imports
- [ ] Fix regex/fallthrough

---

## Quick Commands

```bash
# Run full lint
bun run lint

# Run lint and auto-fix what's possible
bun run lint:fix

# Check specific package
cd packages/core && bunx eslint src --ext .ts
cd packages/react && bunx eslint src --ext .tsx,.ts
cd packages/logger && bunx eslint src --ext .ts

# Count errors by type
bun run lint 2>&1 | grep "error" | grep -o "@typescript-eslint/[a-z-]*\|react[/-][a-z-]*" | sort | uniq -c | sort -rn

# Type check all packages
bun run typecheck  # Note: needs proper setup
cd packages/cli && bun run typecheck
cd packages/core && bunx tsc --noEmit
cd packages/react && bunx tsc --noEmit
```

---

## Notes

### Auto-Fixable Errors
- **3 errors** can be auto-fixed with `bun run lint:fix`
- Mostly formatting/spacing issues

### Non-Negotiables
- All production code must have proper types (no `any`)
- Test files can use `any` sparingly for complex mocks
- Generated code (`src/generated/*`) can be excluded if needed

### Future Improvements
- Add stricter TypeScript compiler options
- Enable additional ESLint rules
- Consider `strict: true` in tsconfig.json
- Add pre-commit hooks to prevent new `any` types

---

## Total Estimated Effort

| Phase | Hours | Status |
|-------|-------|--------|
| Phase 1: Core Production | 4-5 | ✅ **COMPLETE** |
| Phase 2: React | 3-4 | Not Started |
| Phase 3: Logger | 2-3 | Not Started |
| Phase 4: Tests & Cleanup | 3-4 | Not Started |
| **Total** | **12-16 hours** | **25% Complete** |

---

**Last Updated:** 2026-01-19
**Next Review:** After Phase 1 completion
