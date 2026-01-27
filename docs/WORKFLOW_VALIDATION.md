# Workflow Template Validation

This document outlines the validation rules for `.workflow.json` files to ensure they work correctly with their corresponding `.otel.canvas` files.

## Overview

Workflow templates must be validated to ensure:
1. **Structural Validity**: Template follows the schema
2. **Canvas Integration**: Referenced canvas exists and events match
3. **Scenario Logic**: Scenarios are well-defined and non-conflicting
4. **Template Syntax**: Template expressions are valid

## Validation Rules

### 1. `workflow-schema-valid` (Category: schema, Severity: error)

**Description**: Validate that the workflow template follows the required schema

**Checks:**
- `version` field exists and is a valid semver string
- `canvas` field exists and is a string
- `name` field exists and is non-empty
- `description` field exists
- `mode` is one of: `span-tree`, `timeline`, `summary-only`
- `scenarioSelection` is one of: `first-match`, `manual`
- `scenarios` is a non-empty array

**Example Violations:**
```json
{
  "canvas": "test.otel.canvas",
  "name": "Test",
  // Missing version field
  "scenarios": []
}
```

**Violation:**
```
error  workflow-schema-valid  Missing required field "version"
                               → Add a version field (e.g., "1.0.0")
```

---

### 2. `workflow-canvas-exists` (Category: reference, Severity: error)

**Description**: The referenced canvas file must exist

**Checks:**
- Canvas file path in `canvas` field points to an existing file
- File has `.canvas` or `.otel.canvas` extension
- File can be parsed as valid JSON or YAML

**Example Violations:**
```json
{
  "version": "1.0.0",
  "canvas": "nonexistent.otel.canvas",
  "scenarios": [...]
}
```

**Violation:**
```
error  workflow-canvas-exists  Referenced canvas file does not exist: nonexistent.otel.canvas
                                → Ensure the canvas field points to a valid .otel.canvas file
```

---

### 3. `workflow-event-references` (Category: reference, Severity: error)

**Description**: Events referenced in templates must be defined in the canvas

**Checks:**
- For each event name in `template.events` keys
  - Check if event exists in canvas's event definitions
  - Support glob patterns (e.g., `log.*`, `*.error`)
- For log templates (`template.logs`), verify they use standard log severity levels

**Canvas Event Schema:**
```json
{
  "pv": {
    "eventSchema": {
      "conversion.started": { "attributes": [...] },
      "conversion.complete": { "attributes": [...] },
      "conversion.error": { "attributes": [...] }
    }
  }
}
```

**Workflow Template:**
```json
{
  "template": {
    "events": {
      "conversion.started": "...",
      "conversion.complete": "...",
      "conversion.invalid": "..."  // ❌ Not defined in canvas
    }
  }
}
```

**Violation:**
```
error  workflow-event-references  Event "conversion.invalid" not defined in canvas
                                   → Available events: conversion.started, conversion.complete, conversion.error
```

---

### 4. `workflow-scenario-valid` (Category: structure, Severity: error)

**Description**: Scenarios must be well-formed and non-conflicting

**Checks:**
- Each scenario has a unique `id`
- Each scenario has a unique `priority` value
- At least one scenario has `condition.default: true`
- Scenario priorities are positive integers
- Condition patterns in `requires`/`excludes` are valid glob patterns
- Condition assertions use valid operators (`$gt`, `$eq`, etc.)

**Example Violations:**

**Duplicate Scenario IDs:**
```json
{
  "scenarios": [
    { "id": "test-passed", "priority": 1, ... },
    { "id": "test-passed", "priority": 2, ... }
  ]
}
```

**Violation:**
```
error  workflow-scenario-valid  Duplicate scenario ID: "test-passed"
                                 → Scenario IDs must be unique
```

**Missing Default Scenario:**
```json
{
  "scenarios": [
    { "id": "error", "priority": 1, "condition": { "requires": ["*.error"] } },
    { "id": "success", "priority": 2, "condition": { "requires": ["*.complete"] } }
    // ❌ No default fallback
  ]
}
```

**Violation:**
```
error  workflow-scenario-valid  No default scenario defined
                                 → Add a scenario with "condition.default: true"
```

---

### 5. `workflow-template-syntax` (Category: pattern, Severity: error)

**Description**: Template strings must have valid expression syntax

**Checks:**
- All `{expression}` placeholders have balanced braces
- Expressions don't contain invalid characters
- Conditional expressions (`? :`) have valid syntax
- Template strings don't reference undefined variables (warning level)

**Example Violations:**

**Unbalanced Braces:**
```json
{
  "template": {
    "introduction": "Test {span.name"  // Missing closing brace
  }
}
```

**Violation:**
```
error  workflow-template-syntax  Unbalanced braces in template expression
                                  → Ensure all {expressions} have closing braces
```

**Invalid Conditional:**
```json
{
  "template": {
    "summary": "{result.passed ? 'Success'"  // Missing : and alternate value
  }
}
```

**Violation:**
```
error  workflow-template-syntax  Invalid conditional expression: missing ':' operator
                                  → Conditional format: {condition ? 'true' : 'false'}
```

---

### 6. `workflow-attribute-references` (Category: reference, Severity: warn)

**Description**: Attributes referenced in templates should exist in canvas event schemas

**Checks:**
- For each `{attribute.path}` in templates
  - Check if attribute exists in corresponding event's schema
  - This is a warning because attributes might be dynamic

**Example Violations:**

**Canvas Event Schema:**
```json
{
  "eventSchema": {
    "conversion.complete": {
      "attributes": [
        { "name": "result.nodes.count", "type": "number" },
        { "name": "duration.ms", "type": "number" }
      ]
    }
  }
}
```

**Workflow Template:**
```json
{
  "events": {
    "conversion.complete": "Generated {result.nodes.count} nodes with {result.quality} quality"
    //                                                           ^^^^^^^^^^^^^^ Not defined
  }
}
```

**Violation:**
```
warn  workflow-attribute-references  Attribute "result.quality" not found in event schema
                                      → Available: result.nodes.count, duration.ms
```

---

### 7. `workflow-formatting-options` (Category: schema, Severity: warn)

**Description**: Formatting options should have valid values

**Checks:**
- `timestampFormat` matches a valid date-fns format pattern
- `showAttributes` is one of: `none`, `matched`, `all`
- Numeric options are within reasonable ranges

---

## Validation Architecture

### Validator Structure

```typescript
interface WorkflowValidationContext {
  workflow: WorkflowTemplate;
  workflowPath: string;
  canvas?: ExtendedCanvas;
  canvasPath?: string;
  basePath: string;  // For resolving relative paths
}

interface WorkflowValidationResult {
  violations: WorkflowViolation[];
  errorCount: number;
  warningCount: number;
  fixableCount: number;
}

interface WorkflowViolation {
  ruleId: string;
  severity: 'error' | 'warn';
  file: string;
  line?: number;
  path?: string;  // JSON path (e.g., "scenarios[0].condition.requires")
  message: string;
  impact: string;
  suggestion?: string;
  fixable: boolean;
}
```

### Validator Implementation

```typescript
// packages/core/src/workflow/validator.ts

export class WorkflowValidator {
  async validate(
    context: WorkflowValidationContext
  ): Promise<WorkflowValidationResult> {
    const violations: WorkflowViolation[] = [];

    // Run all validation rules
    violations.push(...await this.checkSchema(context));
    violations.push(...await this.checkCanvasExists(context));
    violations.push(...await this.checkEventReferences(context));
    violations.push(...await this.checkScenarios(context));
    violations.push(...await this.checkTemplateSyntax(context));
    violations.push(...await this.checkAttributeReferences(context));
    violations.push(...await this.checkFormattingOptions(context));

    return this.aggregateResults(violations);
  }

  private async checkSchema(
    context: WorkflowValidationContext
  ): Promise<WorkflowViolation[]> {
    // Implement schema validation
  }

  // ... other validation methods
}
```

---

## CLI Integration

### Updated Lint Command

The `lint` command will validate both canvas files and workflow templates:

```bash
# Lint all files (canvas + workflows)
privu lint

# Lint only workflow templates
privu lint --type workflow

# Lint only canvas files
privu lint --type canvas

# Lint specific files
privu lint .principal-views/*.workflow.json
```

### File Type Detection

```typescript
function getFileType(filePath: string): 'canvas' | 'workflow' | 'config' {
  const name = basename(filePath).toLowerCase();

  if (name.endsWith('.workflow.json')) {
    return 'workflow';
  }

  if (name.endsWith('.canvas') || name.endsWith('.otel.canvas')) {
    return 'canvas';
  }

  return 'config';
}
```

### Validation Flow

```typescript
// In lint.ts
for (const filePath of matchedFiles) {
  const fileType = getFileType(filePath);

  if (fileType === 'workflow') {
    // Validate workflow template
    const workflow = loadWorkflowTemplate(filePath);
    const canvasPath = resolve(dirname(filePath), workflow.canvas);
    const canvas = loadCanvas(canvasPath);

    const validator = new WorkflowValidator();
    const result = await validator.validate({
      workflow,
      workflowPath: filePath,
      canvas,
      canvasPath,
      basePath: dirname(filePath)
    });

    results.set(filePath, result);
  } else {
    // Existing canvas validation
    const result = await engine.lintWithConfig(...);
    results.set(filePath, result);
  }
}
```

---

## Example Output

```bash
$ privu lint

.principal-views/graph-converter-test.workflow.json

  error  workflow-event-references  Event "test.invalid" not defined in canvas
                                     → Available events: setup.started, setup.complete, ...
  warn   workflow-attribute-references  Attribute "test.quality" not found in event schema
                                         → Available: test.name, test.status, ...

.principal-views/rules-engine-execution.workflow.json

✓ All checks passed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✖ 1 error, 1 warning
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('WorkflowValidator', () => {
  describe('checkSchema', () => {
    it('should flag missing version field', async () => {
      const result = await validator.validate({
        workflow: { name: 'Test', scenarios: [] } as any,
        workflowPath: 'test.workflow.json'
      });

      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-schema-valid',
          path: 'version'
        })
      );
    });
  });

  describe('checkEventReferences', () => {
    it('should flag undefined events', async () => {
      const canvas = createMockCanvas({
        eventSchema: {
          'test.started': {},
          'test.complete': {}
        }
      });

      const workflow = createMockWorkflow({
        template: {
          events: {
            'test.started': 'Started',
            'test.invalid': 'Invalid'  // Not in canvas
          }
        }
      });

      const result = await validator.validate({
        workflow,
        canvas,
        workflowPath: 'test.workflow.json'
      });

      expect(result.violations).toContainEqual(
        expect.objectContaining({
          ruleId: 'workflow-event-references',
          message: expect.stringContaining('test.invalid')
        })
      );
    });
  });
});
```

---

## Future Enhancements

### Auto-fix Support

Some violations could be auto-fixable:

1. **Add missing default scenario**: Automatically add a catch-all scenario
2. **Remove undefined event references**: Delete template entries for non-existent events
3. **Fix template syntax**: Balance braces, fix common expression errors

### IDE Integration

Provide JSON schema for IDE validation:

```json
{
  "$schema": "https://principal-ai.com/schemas/workflow-template.schema.json",
  "version": "1.0.0",
  "canvas": "test.otel.canvas",
  ...
}
```

### Canvas-Workflow Co-validation

When validating a canvas, also check if any workflow templates reference it and validate them together.

---

## Implementation Checklist

- [ ] Create `packages/core/src/workflow/validator.ts`
- [ ] Implement schema validation
- [ ] Implement canvas existence check
- [ ] Implement event reference validation
- [ ] Implement scenario validation
- [ ] Implement template syntax validation
- [ ] Implement attribute reference validation
- [ ] Update CLI lint command to handle workflows
- [ ] Add tests for all validation rules
- [ ] Update documentation
- [ ] Add JSON schema for IDE support
