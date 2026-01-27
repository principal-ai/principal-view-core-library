# Workflow Validation Bug Report

## Summary

The `workflow validate` command incorrectly reports that events referenced in a workflow file are "not defined in canvas", even when those events are correctly defined in the canvas file with matching names.

## Environment

- **Tool**: `@principal-ai/principal-view-cli`
- **Command**: `npx @principal-ai/principal-view-cli workflow validate <file>`
- **Date Reported**: 2026-01-25
- **Project**: web-ade

## Issue Description

When validating a workflow JSON file that references events from an OTEL canvas, the validator reports errors claiming the events don't exist in the canvas, despite:

1. The canvas file validating successfully
2. The event names matching exactly between canvas and workflow
3. Both files following the correct schema format

## Steps to Reproduce

1. Create an OTEL canvas file with event definitions:
   ```json
   {
     "pv": {
       "name": "Authentication Callback",
       "version": "1.0.0"
     },
     "nodes": [
       {
         "id": "auth-started",
         "pv": {
           "event": "auth.callback.started",
           "sources": ["src/app/api/auth/callback/route.ts"],
           "otel": { "kind": "event", "category": "lifecycle" },
           "dataSchema": { ... }
         }
       }
       // ... more nodes
     ]
   }
   ```

2. Create a workflow JSON file referencing those events:
   ```json
   {
     "version": "1.0.0",
     "canvas": "auth-callback.otel.canvas",
     "mode": "span-tree",
     "scenarios": [
       {
         "id": "success",
         "condition": {
           "requires": ["auth.callback.started", "auth.callback.complete"]
         },
         "template": {
           "summary": "Success",
           "events": {
             "auth.callback.started": "Started",
             "auth.callback.complete": "Complete"
           }
         }
       }
     ]
   }
   ```

3. Validate canvas: `npx @principal-ai/principal-view-cli validate`
   - **Result**: ✅ Canvas validates successfully

4. Validate workflow: `npx @principal-ai/principal-view-cli workflow validate .principal-views/auth-callback.workflow.json`
   - **Result**: ❌ Reports events not defined in canvas

## Actual Output

```
Validating: .principal-views/auth-callback.workflow.json

✗ Error: Workflow references event "auth.callback.complete" which is not defined in canvas
  Location: events
  Impact: This event will never highlight a canvas node and may never match
  Suggestion: Add event "auth.callback.complete" to a node in auth-callback.otel.canvas or remove it from the workflow

✗ Error: Workflow references event "auth.state.validated" which is not defined in canvas
  Location: events
  Impact: This event will never highlight a canvas node and may never match
  Suggestion: Add event "auth.state.validated" to a node in auth-callback.otel.canvas or remove it from the workflow

✗ Error: Workflow references event "auth.callback.started" which is not defined in canvas
  Location: events
  Impact: This event will never highlight a canvas node and may never match
  Suggestion: Add event "auth.callback.started" to a node in auth-callback.otel.canvas or remove it from the workflow

✗ Error: Workflow references event "auth.tokens.received" which is not defined in canvas
  Location: events
  Impact: This event will never highlight a canvas node and may never match
  Suggestion: Add event "auth.tokens.received" to a node in auth-callback.otel.canvas or remove it from the workflow

✗ Error: Workflow references event "auth.cookies.set" which is not defined in canvas
  Location: events
  Impact: This event will never highlight a canvas node and may never match
  Suggestion: Add event "auth.cookies.set" to a node in auth-callback.otel.canvas or remove it from the workflow

✗ Error: Workflow references event "auth.callback.error" which is not defined in canvas
  Location: events
  Impact: This event will never highlight a canvas node and may never match
  Suggestion: Add event "auth.callback.error" to a node in auth-callback.otel.canvas or remove it from the workflow

Summary:
  • 6 error(s)
  • 0 warnings
  • 6 scenario(s)
  • Canvas: auth-callback.otel.canvas
```

## Verification

Events extracted from canvas file:
```bash
$ jq '.nodes[].pv.event' .principal-views/auth-callback.otel.canvas
"auth.callback.started"
"auth.state.validated"
"auth.tokens.received"
"auth.cookies.set"
"auth.callback.complete"
"auth.callback.error"
```

Events referenced in workflow file:
```bash
$ jq '.scenarios[].template.events | keys[]' .principal-views/auth-callback.workflow.json | sort -u
"auth.callback.complete"
"auth.callback.error"
"auth.callback.started"
"auth.cookies.set"
"auth.state.validated"
"auth.tokens.received"
```

**The event names match exactly** - there is no discrepancy between the files.

## Expected Behavior

The workflow validation should:
1. Read the referenced canvas file (`auth-callback.otel.canvas`)
2. Extract all event names from canvas nodes where `pv.event` is defined
3. Compare against events referenced in workflow scenarios
4. Report success when all events are found

## Actual Behavior

The validator reports all events as missing from the canvas, suggesting it's either:
1. Not loading/parsing the canvas file correctly
2. Looking for events in the wrong location/format in the canvas
3. Using an incorrect comparison logic
4. Has a caching issue

## Impact

- **Severity**: Medium
- **Workaround**: Ignore the validation errors and proceed with instrumentation
- **Affects**: Users following the OTEL onboarding workflow who rely on validation to confirm correct file structure

## Files for Reproduction

**Canvas file**: `/Users/griever/Developer/web-ade/web-ade/.principal-views/auth-callback.otel.canvas`

**Workflow file**: `/Users/griever/Developer/web-ade/web-ade/.principal-views/auth-callback.workflow.json`

Both files are correctly formatted and can be used to reproduce this issue.

## Additional Context

- Canvas validation command works correctly: `validate` passes
- The issue only appears when validating workflow files
- Both files follow schema patterns from working examples in other projects (e.g., `backlog-adaptation/Backlog.md/.principal-views/`)
- This was discovered during the "onboard otel canvas" skill workflow in web-ade project

## Possible Root Causes

1. **Canvas loading issue**: The workflow validator might not be correctly loading or parsing the referenced canvas file
2. **Event extraction logic**: The code that extracts events from canvas nodes might be looking in the wrong place (e.g., expecting `nodes[].pv.otel.event` instead of `nodes[].pv.event`)
3. **Path resolution**: The canvas file path might not be resolving correctly relative to the workflow file
4. **Case sensitivity**: Could be a case-sensitive comparison issue (though events match in case)
5. **Async loading**: Race condition or async file loading issue

## Suggested Investigation

1. Add debug logging to workflow validator to show:
   - Which canvas file is being loaded
   - What events are extracted from the canvas
   - What events are being checked from the workflow

2. Check if there's a difference in how canvas events are stored:
   - Via `pv.event` field (current approach)
   - Via some other metadata structure

3. Verify the canvas file is being loaded from the correct path relative to the workflow file location

## Workaround for Users

For now, users can:
1. Verify event names match using `jq` or manual inspection
2. Ignore the validation errors if events clearly match
3. Proceed with instrumentation and testing - the runtime execution will show if events actually work

The validation error appears to be a false positive and doesn't prevent the files from working correctly.
