# Bug: Workflow canvas path resolution fails in storyboard structure

---
status: To Do
labels: [bug, cli, validation, workflow, storyboard]
---

## Summary

The `validate` command fails to resolve the `canvas` field path in workflow files when using the storyboard directory structure. The path `../package-discovery-flow.otel.canvas` cannot be found, even though the file exists at that relative location.

## Steps to Reproduce

1. Create a storyboard structure:
   ```
   .principal-views/
   └── package-discovery-flow/
       ├── package-discovery-flow.otel.canvas
       └── package-discovery-flow-workflow/
           └── package-discovery-flow.workflow.json
   ```

2. In the workflow file, set:
   ```json
   {
     "canvas": "../package-discovery-flow.otel.canvas",
     ...
   }
   ```

3. Run `npx @principal-ai/principal-view-cli validate`

## Expected Behavior

The workflow should find the canvas file at `../package-discovery-flow.otel.canvas` relative to the workflow file location.

## Actual Behavior

```
✗ Referenced canvas file does not exist: ../package-discovery-flow.otel.canvas
  → Ensure the canvas field points to a valid .otel.canvas file
```

## Workaround

Using the `workflow validate` command with explicit `--canvas` flag works correctly:

```bash
npx @principal-ai/principal-view-cli workflow validate \
  .principal-views/package-discovery-flow/package-discovery-flow-workflow/package-discovery-flow.workflow.json \
  --canvas .principal-views/package-discovery-flow/package-discovery-flow.otel.canvas
```

This validates successfully, confirming the workflow content is correct.

## Paths Tested (all fail)

- `../package-discovery-flow.otel.canvas` (documented format)
- `./package-discovery-flow.otel.canvas` (when co-located)
- `package-discovery-flow.otel.canvas` (basename only)
- `package-discovery-flow/package-discovery-flow.otel.canvas` (from .principal-views)

## Environment

- CLI Version: 0.10.0
- Structure: Storyboard (not legacy flat)

## Analysis

The path resolution in the main `validate` command appears to resolve paths differently than the `workflow validate --canvas` command. The latter correctly finds the canvas file, suggesting the path resolution logic differs between the two code paths.
