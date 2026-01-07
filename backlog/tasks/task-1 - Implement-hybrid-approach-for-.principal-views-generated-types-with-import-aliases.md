---
id: task-1
title: >-
  Implement hybrid approach for .principal-views generated types with import
  aliases
status: To Do
assignee: []
created_date: '2026-01-07 20:09'
labels:
  - typescript
  - refactoring
  - dx-improvement
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Improve TypeScript imports for generated types by moving them to src/generated/ and adding path aliases. Currently imports use awkward relative paths like ../../.principal-views/. The hybrid approach keeps canvas files in .principal-views/ (as the framework expects) but generates types to idiomatic src/generated/ locations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generated types are output to packages/*/src/generated/ instead of .principal-views/
- [ ] #2 TypeScript path aliases configured in tsconfig.json for clean imports
- [ ] #3 Update codegen workflow/scripts to use --output flag
- [ ] #4 All existing imports updated to use new path aliases
- [ ] #5 Documentation updated to reflect new generation workflow
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update tsconfig.json to add path aliases (@generated/* or @principal-views/*)\n2. Modify codegen command/script to output types to packages/*/src/generated/\n3. Regenerate graph-converter-execution.types.ts to new location\n4. Update imports in EventValidationIntegration.ts and other consumers\n5. Update .principal-views/CODE-GENERATION-GUIDE.md with new workflow\n6. Test build and type checking still works
<!-- SECTION:PLAN:END -->
