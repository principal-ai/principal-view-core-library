# Dependency State - January 15, 2026

## Summary

After investigating Storybook failures, we discovered that `bun.lockb` was gitignored, causing dependency version drift. We've pinned all dependencies to known-working versions from commit 56c553d and are now checking in the lockfile.

## Current Issue

Storybook was failing with:
```
TypeError: Class extends value undefined is not a constructor or null
```

This was NOT a code issue - it was caused by a dependency update in the Storybook ecosystem.

## Root Cause

- `bun.lockb` was gitignored
- Every `bun install` pulled latest versions matching semver ranges (`^`)
- A breaking change was introduced in a transitive dependency
- The exact breaking dependency has not been identified (not repository-abstraction)

## Solution Applied

1. Pinned all dependencies to exact versions (removed `^` prefix)
2. Checked in `bun.lockb` to prevent future drift
3. Storybook now works on main branch (70f9c4e)

## Principal AI Libraries - Version Status

### @principal-ai/repository-abstraction
- **Current**: 0.2.6
- **Latest**: 0.4.0
- **Status**: ⚠️ OUTDATED - Breaking changes in 0.4.0
- **Notes**:
  - Version 0.2.6 tested and works
  - Version 0.4.0 has breaking API changes (FileSystemAdapter methods became async)
  - Safe to upgrade to any 0.2.x version
  - Upgrading to 0.4.x requires code changes

### @principal-ai/principal-view-core
- **Current**: 0.6.4
- **Latest**: 0.6.4
- **Status**: ✅ UP TO DATE
- **Notes**:
  - Successfully upgraded from 0.5.16 to 0.6.4
  - Moved OpenTelemetry packages from devDependencies to dependencies (required for rules engine)
  - Added @principal-ai/codebase-composition@0.2.34 dependency
  - Storybook tested and working

### @principal-ade/industry-theme
- **Current**: 0.1.7
- **Latest**: 0.1.7
- **Status**: ✅ UP TO DATE
- **Notes**: Successfully upgraded from 0.1.4 to 0.1.7, Storybook tested and working

## Unidentified Breaking Dependency

One dependency in the Storybook ecosystem introduced a breaking change between commit 56c553d and now. Candidates:
- `storybook@^8.5.0` or its many `@storybook/*` sub-packages
- Transitive dependencies of Storybook

**Recommendation**: Before unpinning versions, test updates incrementally or use a bisection approach to identify the culprit.

## Next Steps

1. ✅ Check in `bun.lockb`
2. ⏸️ Optionally identify the exact breaking dependency (low priority)
3. ⏸️ Update Principal AI libraries when ready:
   - Test @principal-ade/industry-theme@0.1.7
   - Evaluate if @principal-ai/principal-view-core@0.6.4 changes are desired
   - Plan migration to @principal-ai/repository-abstraction@0.4.x (requires async refactor)

## Files Modified

All package.json files have pinned dependencies:
- `packages/core/package.json`
- `packages/react/package.json`
- `packages/cli/package.json`
- `packages/logger/package.json`

These changes are currently uncommitted.
