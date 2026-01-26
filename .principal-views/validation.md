# Validation Pipeline

## Overview

The Validation Pipeline encompasses all validation operations in the Principal View system. It validates canvas files, narrative templates, execution data, library definitions, and runs comprehensive linting rules.

## Validation Types

1. **Canvas Validation** - `.canvas` and `.otel.canvas` files
2. **Narrative Validation** - `.narrative.json` template files
3. **Execution Validation** - `.otel.json` OTLP format files
4. **Library Validation** - `library.yaml/json` component definitions
5. **Rules Execution** - 15 built-in linting rules across 5 categories

## Workflow

### Main Flow
1. **Validation Started** - Entry point with validation type specified
2. **File Parsed** - Load and parse JSON/YAML content
3. **Type Detected** - Determine which validation to perform
4. **Specific Validation** - Route to appropriate validator:
   - Canvas validator (structure, nodes, edges, OTEL features)
   - Narrative validator (scenarios, templates, event references)
   - Execution validator (OTLP format, spans, events)
   - Library validator (components, connection rules)
   - Rules engine (15 linting rules)
5. **Results Aggregated** - Combine all validation results
6. **Validation Complete** - Success with metrics

### Error Paths
- Parse errors (malformed JSON/YAML)
- Schema errors (missing fields, invalid types)
- Reference errors (undefined types, missing files)
- Structure errors (invalid relationships)
- Rule violations (linting failures)

## Events

### validation.started
Entry point for any validation operation.

**Attributes:**
- `validation.type` (string, required) - Type of validation (canvas, narrative, execution, library, config, rules, event)
- `input.fileCount` (integer, optional) - Number of files to validate
- `input.patterns` (string[], optional) - File patterns searched

### file.parsed
File successfully parsed from disk.

**Attributes:**
- `file.path` (string, required) - Path to parsed file
- `file.format` (string, required) - Format (json, yaml)
- `file.size` (integer, optional) - File size in bytes

### type.detected
Validation type determined from file extension or content.

**Attributes:**
- `detected.type` (string, required) - Detected validation type
- `detection.method` (string, optional) - Detection method (file extension, content, explicit)

### canvas.validated
Canvas file validation completed.

**Attributes:**
- `canvas.type` (string, required) - Canvas type (standard, otel)
- `checks.total` (integer, required) - Total validation checks
- `checks.passed` (integer, required) - Passed checks
- `checks.failed` (integer, required) - Failed checks
- `nodes.count` (integer, optional) - Nodes validated
- `edges.count` (integer, optional) - Edges validated

### narrative.validated
Narrative template validation completed.

**Attributes:**
- `scenarios.count` (integer, required) - Scenarios validated
- `violations.count` (integer, required) - Total violations
- `errors.count` (integer, required) - Error-level violations
- `warnings.count` (integer, required) - Warning-level violations

### execution.validated
Execution file (OTLP) validation completed.

**Attributes:**
- `format` (string, required) - Format (OTLP, ExecutionData)
- `spans.count` (integer, required) - Spans validated
- `events.count` (integer, required) - Total events
- `errors.count` (integer, required) - Validation errors

### library.validated
Library file validation completed.

**Attributes:**
- `nodeComponents.count` (integer, required) - Node components
- `edgeComponents.count` (integer, required) - Edge components
- `issues.count` (integer, required) - Issues found

### rules.executed
Linting rules execution completed.

**Attributes:**
- `rules.count` (integer, required) - Rules executed
- `violations.total` (integer, required) - Total violations
- `violations.error` (integer, required) - Error violations
- `violations.warning` (integer, required) - Warning violations
- `fixable.count` (integer, optional) - Auto-fixable violations

### results.aggregated
All validation results combined.

**Attributes:**
- `total.files` (integer, required) - Files validated
- `total.errors` (integer, required) - Total errors
- `total.warnings` (integer, required) - Total warnings
- `validations.performed` (string[], required) - Validation types performed

### validation.complete
All validations completed successfully.

**Attributes:**
- `result.valid` (boolean, required) - Overall validation result
- `result.validCount` (integer, required) - Valid items
- `result.invalidCount` (integer, required) - Invalid items
- `duration.ms` (number, optional) - Total duration

### validation.error
Validation failed with errors.

**Attributes:**
- `error.type` (string, required) - Error type (parse, schema, reference, structure)
- `error.message` (string, required) - Error message
- `error.stage` (string, required) - Stage where error occurred
- `error.file` (string, optional) - File that caused error
- `error.line` (integer, optional) - Line number

## Scenarios

### Canvas Validation Success
```
validation.started (type=canvas) → file.parsed → type.detected → canvas.validated → results.aggregated → validation.complete
```

### Narrative Validation with Warnings
```
validation.started (type=narrative) → file.parsed → type.detected → narrative.validated → results.aggregated → validation.complete
```

### Execution Validation Error
```
validation.started (type=execution) → file.parsed → execution.validated → validation.error
```

### Library Validation Success
```
validation.started (type=library) → file.parsed → type.detected → library.validated → results.aggregated → validation.complete
```

### Lint Rules Execution
```
validation.started (type=rules) → file.parsed → type.detected → rules.executed → results.aggregated → validation.complete
```

### Parse Error
```
validation.started → file.parsed → validation.error (stage=parsing)
```

## Source Files

- **Canvas Validation**: `packages/cli/src/commands/validate.ts`
- **Narrative Validation**: `packages/cli/src/commands/narrative/validate.ts`, `packages/core/src/narrative/validator.ts`
- **Execution Validation**: `packages/cli/src/commands/validate-execution.ts`, `packages/core/src/execution/ExecutionValidator.ts`
- **Library Validation**: `packages/cli/src/commands/validate.ts`
- **Rules Engine**: `packages/cli/src/commands/lint.ts`, `packages/core/src/rules/engine.ts`
- **Configuration Validation**: `packages/core/src/ConfigurationValidator.ts`
- **Event Validation**: `packages/core/src/telemetry/event-validator.ts`
