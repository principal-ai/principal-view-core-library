# Rules Engine Execution

This canvas documents the execution flow for the Principal View rules engine validation system.

## Overview

The rules engine validates configuration files through a series of rules, detecting violations and aggregating results. This system ensures configuration quality and adherence to framework standards.

## Validation Process

1. **Configuration Loading**: Load canvas files from `.principal-views/` directory
2. **Rule Execution**: Apply validation rules to each configuration
3. **Violation Detection**: Identify errors, warnings, and fixable issues
4. **Result Aggregation**: Collect and categorize all violations
5. **Report Generation**: Format results for CLI or JSON output

## Rule Categories

- **Schema Rules**: Validate structure and required fields
- **Reference Rules**: Check that references to types/nodes/edges are valid
- **Pattern Rules**: Enforce naming conventions and best practices
- **OTEL Rules**: Validate telemetry event schemas and source mappings

## Events

The rules engine emits telemetry events during validation execution to enable observability of the validation process itself.

## Source Files

- `packages/core/src/rules/` - Rule implementations
- `packages/cli/src/commands/lint.ts` - CLI command for running validation

## Related Documentation

- [Event Schema Validation Guide](./EVENT-SCHEMA-VALIDATION-GUIDE.md)
- [Configuration Reference](../docs/CONFIGURATION_REFERENCE.md)
