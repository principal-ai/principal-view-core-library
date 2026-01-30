---
id: TASK-3
title: Improve validation error messages for cross-canvas event references
status: To Do
assignee: []
created_date: '2026-01-30 17:54'
labels: []
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a workflow references a canvas that doesn't define certain events, the validator should:

1. Check if those events exist in library.yaml eventSchemas
2. Suggest using eventRef in the canvas to pull from the library
3. Provide clearer guidance on the eventRef pattern vs inline event definitions

Current behavior just says "Referenced canvas file does not exist" which doesn't help users understand the eventRef solution.

Example scenario:
- entry-points/completed-tasks-list.workflow.json uses cleanup.* events
- These events are defined in cleanup-operations canvas
- Validator should suggest: "Consider adding eventRef to entry-points canvas or moving workflow to cleanup-operations"
<!-- SECTION:DESCRIPTION:END -->
