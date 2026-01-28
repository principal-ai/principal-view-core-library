# Migration Guide: Legacy Flat Structure → Storyboards

## Overview

This guide will help you migrate from the legacy flat structure to the new hierarchical storyboard structure for organizing Principal Views.

**Status:** The legacy flat structure is deprecated as of version 0.15.0 and will show deprecation warnings. Both structures are currently supported for backward compatibility.

## Why Migrate?

### Problems with Legacy Flat Structure

The legacy flat structure stores all files directly in `.principal-views/`:

```
.principal-views/
  ├── checkout-flow.otel.canvas
  ├── checkout-flow.workflow.json
  └── __executions__/
      ├── success-test.otel.json
      └── error-test.otel.json
```

**Limitations:**
- Hard to associate multiple workflows with one canvas
- Hard to associate executions with specific workflows
- No clear relationship between workflow and its test executions
- Doesn't scale well with multiple workflows per feature area
- Scenarios are variations of a workflow, but executions are scattered

### Benefits of Storyboard Structure

The new storyboard structure provides clear hierarchy:

```
.principal-views/
  └── checkout-flow/                      # Storyboard folder
      ├── checkout-flow.otel.canvas       # Canvas definition
      ├── happy-path/                      # Workflow folder
      │   ├── happy-path.workflow.json    # Workflow definition
      │   ├── success-1.otel.json         # Execution files
      │   └── success-2.otel.json
      └── payment-failures/                # Another workflow
          ├── payment-failures.workflow.json
          ├── declined-1.otel.json
          └── timeout-1.otel.json
```

**Advantages:**
- **Clear Hierarchy:** Storyboard → Workflows → Executions
- **Multiple Workflows:** Easy to have many workflow variations for one canvas
- **Organized Executions:** Each workflow has its own execution files
- **Better Discoverability:** Related files are co-located
- **Scenario-Aware:** Executions are grouped with the workflow that defines their scenarios

## Migration Steps

### Step 1: Understand Your Current Structure

First, identify what you have in your current `.principal-views/` directory:

```bash
ls -R .principal-views/
```

Look for:
- Canvas files (`.canvas` or `.otel.canvas`)
- Workflow files (`.workflow.json`)
- Execution files (`.otel.json`) in `__executions__/`

### Step 2: Plan Your Storyboard Organization

For each canvas file, decide:
1. What is the storyboard name? (Usually the canvas basename)
2. What workflows belong to this canvas?
3. Which execution files belong to each workflow?

### Step 3: Create Storyboard Folder Structure

For each canvas:

#### 3.1. Create Storyboard Directory

```bash
# Example: migrating checkout-flow.otel.canvas
mkdir -p .principal-views/checkout-flow
```

#### 3.2. Move Canvas File

```bash
mv .principal-views/checkout-flow.otel.canvas \
   .principal-views/checkout-flow/checkout-flow.otel.canvas
```

#### 3.3. Create Workflow Folders

For each workflow related to this canvas:

```bash
# Example: creating a happy-path workflow
mkdir -p .principal-views/checkout-flow/happy-path
```

#### 3.4. Create or Move Workflow File

If you have an existing workflow file:

```bash
mv .principal-views/checkout-flow.workflow.json \
   .principal-views/checkout-flow/happy-path/happy-path.workflow.json
```

If you need to create a new workflow file:

```json
{
  "version": "1.0.0",
  "canvas": "../checkout-flow.otel.canvas",
  "name": "Happy Path",
  "description": "Successful checkout flow",
  "mode": "test",
  "scenarios": [
    {
      "id": "success",
      "description": "Successful checkout"
    }
  ]
}
```

**Important:** The `canvas` field must be a relative path pointing to the parent canvas file.

#### 3.5. Move Execution Files

Move execution files from `__executions__/` into the appropriate workflow folder:

```bash
# Move execution files to the workflow folder
mv .principal-views/__executions__/success-1.otel.json \
   .principal-views/checkout-flow/happy-path/success-1.otel.json
```

### Step 4: Update Canvas References in Workflow Files

Ensure all workflow files have the correct relative canvas path:

```json
{
  "canvas": "../checkout-flow.otel.canvas"
}
```

The path should use `..` to reference the parent storyboard canvas.

### Step 5: Cleanup Legacy Directories

Once all files are migrated, remove the old `__executions__/` directory if it's empty:

```bash
# Only remove if empty
rmdir .principal-views/__executions__/
```

### Step 6: Verify Migration

Check your new structure:

```bash
tree .principal-views/
```

Expected structure:
```
.principal-views/
└── checkout-flow/
    ├── checkout-flow.otel.canvas
    ├── happy-path/
    │   ├── happy-path.workflow.json
    │   └── success-1.otel.json
    └── payment-failures/
        ├── payment-failures.workflow.json
        └── declined-1.otel.json
```

## Complete Migration Example

### Before (Legacy Flat Structure)

```
.principal-views/
├── checkout.otel.canvas
├── checkout.workflow.json
├── refund.workflow.json
└── __executions__/
    ├── checkout-success.otel.json
    ├── checkout-declined.otel.json
    └── refund-full.otel.json
```

### After (Storyboard Structure)

```
.principal-views/
└── checkout/
    ├── checkout.otel.canvas
    ├── checkout-flow/
    │   ├── checkout-flow.workflow.json
    │   ├── checkout-success.otel.json
    │   └── checkout-declined.otel.json
    └── refund-flow/
        ├── refund-flow.workflow.json
        └── refund-full.otel.json
```

### Step-by-Step Commands

```bash
# 1. Create storyboard folder
mkdir -p .principal-views/checkout

# 2. Move canvas
mv .principal-views/checkout.otel.canvas \
   .principal-views/checkout/checkout.otel.canvas

# 3. Create workflow folders
mkdir -p .principal-views/checkout/checkout-flow
mkdir -p .principal-views/checkout/refund-flow

# 4. Move and update workflow files
mv .principal-views/checkout.workflow.json \
   .principal-views/checkout/checkout-flow/checkout-flow.workflow.json

mv .principal-views/refund.workflow.json \
   .principal-views/checkout/refund-flow/refund-flow.workflow.json

# 5. Move execution files
mv .principal-views/__executions__/checkout-success.otel.json \
   .principal-views/checkout/checkout-flow/

mv .principal-views/__executions__/checkout-declined.otel.json \
   .principal-views/checkout/checkout-flow/

mv .principal-views/__executions__/refund-full.otel.json \
   .principal-views/checkout/refund-flow/

# 6. Update workflow canvas references
# Edit both workflow.json files to have:
# "canvas": "../checkout.otel.canvas"

# 7. Cleanup
rmdir .principal-views/__executions__/
```

## Workflow File Canvas Reference

When creating or updating workflow files, ensure the `canvas` field correctly references the parent canvas:

```json
{
  "version": "1.0.0",
  "canvas": "../checkout.otel.canvas",
  "name": "Checkout Flow",
  "description": "Main checkout workflow",
  "mode": "test",
  "scenarios": [
    {
      "id": "success",
      "description": "Successful checkout"
    },
    {
      "id": "declined",
      "description": "Payment declined"
    }
  ]
}
```

**Path Rules:**
- Must be relative (use `../` notation)
- Must point to the canvas file in the parent storyboard directory
- Format: `../<canvas-filename>.otel.canvas`

## Common Issues and Solutions

### Issue 1: Deprecation Warnings

**Problem:** You see warnings like:
```
⚠ Legacy flat canvas structure is deprecated. Consider migrating to the storyboard structure.
```

**Solution:** Follow this migration guide to move to the storyboard structure.

### Issue 2: Canvas Reference Not Found

**Problem:** Workflow files cannot find the canvas file.

**Solution:** Update the `canvas` field in workflow.json to use the correct relative path:
```json
{
  "canvas": "../storyboard-name.otel.canvas"
}
```

### Issue 3: Executions Not Associated with Workflow

**Problem:** Execution files in the old `__executions__/` directory are not linked to workflows.

**Solution:** Move execution files into the appropriate workflow folder. The discovery system will automatically associate them.

### Issue 4: Multiple Canvases in Storyboard

**Problem:** You have multiple related canvases.

**Solution:** Currently, each storyboard should have exactly one canvas. If you have multiple related canvases:
1. Create separate storyboards for each canvas
2. Use naming conventions to show they're related (e.g., `checkout-ui/` and `checkout-api/`)

### Issue 5: Nested Workflow Folders

**Problem:** You want to organize workflows into subgroups.

**Solution:** Currently, workflows must be direct children of the storyboard folder. Use descriptive workflow names instead:
- Good: `checkout-flow/payment-happy-path/`
- Good: `checkout-flow/payment-failures/`

## Best Practices

### Naming Conventions

1. **Storyboard Names:** Use the feature or component name
   - ✅ `checkout-flow`
   - ✅ `user-authentication`
   - ❌ `test-1`

2. **Workflow Names:** Describe the scenario or test case
   - ✅ `happy-path`
   - ✅ `payment-failures`
   - ✅ `edge-cases`
   - ❌ `workflow1`

3. **Execution Files:** Include scenario prefix or variant number
   - ✅ `success-1.otel.json`
   - ✅ `declined-card-1.otel.json`
   - ✅ `timeout-retry.otel.json`

### Organizing Workflows

Group related test cases in the same workflow:

```
checkout-flow/
├── checkout-flow.otel.canvas
├── happy-path/
│   └── ... (all successful scenarios)
├── payment-failures/
│   └── ... (all payment failure scenarios)
└── inventory-issues/
    └── ... (all inventory-related scenarios)
```

### Documentation

Add a README.md in each storyboard folder to explain:
- What the feature does
- What workflows are included
- What scenarios are tested

Example:
```markdown
# Checkout Flow

This storyboard documents the e-commerce checkout process.

## Workflows

- **happy-path/**: Successful checkout scenarios
- **payment-failures/**: Payment declined, fraud, timeout scenarios
- **inventory-issues/**: Out of stock, partial fulfillment scenarios
```

## Monorepo Considerations

If you're in a monorepo with package-specific views:

```
packages/
├── api/
│   └── .principal-views/
│       └── authentication/
│           ├── authentication.otel.canvas
│           └── login/
│               └── login.workflow.json
└── ui/
    └── .principal-views/
        └── checkout/
            ├── checkout.otel.canvas
            └── happy-path/
                └── happy-path.workflow.json
```

Each package has its own `.principal-views/` directory with storyboards.

## Migration Checklist

Use this checklist to ensure complete migration:

- [ ] Identified all canvas files
- [ ] Created storyboard folders for each canvas
- [ ] Moved canvas files into storyboard folders
- [ ] Created workflow folders
- [ ] Moved or created workflow.json files
- [ ] Updated canvas references in workflow files (use relative paths)
- [ ] Moved execution files from `__executions__/` to workflow folders
- [ ] Verified structure with `tree .principal-views/`
- [ ] Cleaned up empty `__executions__/` directory
- [ ] Tested discovery (if using tools that leverage CanvasDiscovery API)
- [ ] No deprecation warnings remaining

## Timeline

- **v0.15.0 (Current):** Legacy structure shows deprecation warnings but still works
- **v1.x (Future):** Legacy structure continues to work with warnings
- **v2.0 (Future):** Legacy structure may be removed (with sufficient notice)

## Getting Help

If you encounter issues during migration:

1. Check this guide for common issues
2. Review the [Storyboard Discovery Design](./STORYBOARD_DISCOVERY_DESIGN.md) for technical details
3. Open an issue in the repository with:
   - Your current file structure
   - The error message or issue you're experiencing
   - What you've tried so far

## Additional Resources

- [Storyboard Discovery Design](./STORYBOARD_DISCOVERY_DESIGN.md) - Technical specification
- [Workflow Documentation](../packages/core/src/workflow/README.md) - Workflow file format
- [Canvas Documentation](../README.md) - Canvas file format
