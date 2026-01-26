# Canvas Validation Pipeline

## Overview

The Canvas Validation Pipeline validates `.canvas` configuration files against the Principal View schema. It performs comprehensive checks including structure validation, type checking, cross-referencing, and file existence verification.

## Workflow

1. **Validation Started** - Process begins with file patterns and count
2. **Parsing Complete** - Canvas files are loaded and parsed from JSON
3. **Validation Checks Complete** - All validation rules are executed
4. **Validation Success** - All files pass validation (may include warnings)
5. **Validation Error** - One or more files fail validation

## Events

### validation.started
Emitted when the validation process begins.

**Attributes:**
- `input.fileCount` (integer, required) - Number of files to validate
- `input.patterns` (string[], optional) - File patterns searched

### parsing.complete
Emitted after all files have been parsed.

**Attributes:**
- `files.parsed` (integer, required) - Successfully parsed files
- `files.failed` (integer, required) - Files that failed to parse

### checks.complete
Emitted when all validation checks have been executed.

**Attributes:**
- `checks.total` (integer, required) - Total validation checks performed
- `checks.passed` (integer, required) - Checks that passed
- `checks.failed` (integer, required) - Checks that failed

### validation.success
Emitted when validation completes successfully.

**Attributes:**
- `result.validCount` (integer, required) - Number of valid files
- `result.invalidCount` (integer, required) - Number of invalid files
- `warnings.count` (integer, optional) - Number of warnings
- `duration.ms` (number, optional) - Total duration in milliseconds

### validation.error
Emitted when validation fails.

**Attributes:**
- `error.type` (string, required) - Error type (parse, structure, reference)
- `error.message` (string, required) - Error message
- `error.stage` (string, required) - Stage where error occurred
- `error.file` (string, optional) - File that caused the error

## Scenarios

### Success Path
All canvas files pass validation:
```
validation.started → parsing.complete → checks.complete → validation.success
```

### Success with Warnings
Files pass validation but have warnings (e.g., .otel.canvas without OTEL features):
```
validation.started → parsing.complete → checks.complete → validation.success (warnings.count > 0)
```

### Parse Error
JSON parsing fails on malformed file:
```
validation.started → validation.error (error.stage = "parsing")
```

### Validation Error
Files have structural or reference errors:
```
validation.started → parsing.complete → validation.error (error.stage = "checks")
```

## Source Files

- `packages/cli/src/commands/validate.ts` - Main validation command implementation
