# Configuration Validation

The Visual Validation Framework includes a `ConfigurationValidator` to catch configuration errors **before** runtime.

## The Problem

Without validation, configuration errors only surface at runtime:

```typescript
const config = {
  nodeTypes: { process: { /*...*/ } },
  edgeTypes: { dataflow: { /*...*/ } },
  allowedConnections: [
    { from: 'process', to: 'database', via: 'dataflow' }
    //                       ^^^^^^^^ TYPO! Should be 'data'
  ]
};

// ❌ Error only appears when you try to render
<GraphRenderer configuration={config} nodes={nodes} edges={edges} />
// TypeError: Cannot read properties of undefined (reading 'color')
```

## The Solution

Validate configurations early:

```typescript
import { ConfigurationValidator } from '@principal-ai/visual-validation-core';

// Option 1: Validate and get detailed results
const result = ConfigurationValidator.validate(config);
if (!result.valid) {
  console.error(ConfigurationValidator.formatReport(result));
}

// Option 2: Validate and throw (recommended for apps)
try {
  ConfigurationValidator.validateOrThrow(config);
} catch (error) {
  console.error(error.message);
  // Invalid GraphConfiguration:
  //   - allowedConnections[0].to: Connection rule references undefined node type 'database'
  //     (Available node types: process, data)
}

// Option 3: Automatic validation (default in EventProcessor)
const processor = new EventProcessor(config);
// Validates automatically! Will throw if invalid.
```

## What Gets Validated

### ✅ Required Fields
- Metadata (name, version)
- At least one node type
- At least one edge type
- Node type shapes
- Edge type styles

### ✅ Reference Integrity
- Connection rules reference existing node types
- Connection rules reference existing edge types
- State transition rules reference existing node types
- State transitions reference defined states
- Cardinality rules reference existing node types

### ⚠️  Best Practices (Warnings)
- Missing data schemas
- States with no visual properties
- No connection rules defined
- Undefined states in transitions

## Validation Result

```typescript
interface ConfigurationValidationResult {
  valid: boolean;
  errors: ConfigurationValidationError[];    // Must fix
  warnings: ConfigurationValidationError[];  // Should fix
}

interface ConfigurationValidationError {
  type: 'error' | 'warning';
  message: string;
  path: string;          // e.g. "allowedConnections[0].to"
  suggestion?: string;   // Helpful hint
}
```

## Example Output

```typescript
const result = ConfigurationValidator.validate(badConfig);
console.log(ConfigurationValidator.formatReport(result));
```

```
❌ Configuration has 2 error(s)

Errors:
  ❌ allowedConnections[0].to: Connection rule references undefined node type 'database'
     💡 Available node types: process, data
  ❌ nodeTypes.process.shape: Node type 'process' must have a shape

⚠️  1 warning(s):
  ⚠️  nodeTypes.data.dataSchema: Node type 'data' has no data schema defined
     💡 Consider defining data schema for better type safety
```

## CLI Tool Integration

For your future CLI tool, you can use the validator like this:

```typescript
// cli/validate-config.ts
import { ConfigurationValidator } from '@principal-ai/visual-validation-core';
import fs from 'fs';

const configFile = process.argv[2];
const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

const result = ConfigurationValidator.validate(config);

if (result.valid) {
  console.log('✅ Configuration is valid');
  process.exit(0);
} else {
  console.error(ConfigurationValidator.formatReport(result));
  process.exit(1);
}
```

Usage:
```bash
# Validate before using
bun run validate-config my-graph-config.json

# In CI/CD pipeline
bun run validate-config config.json || exit 1
```

## Preventing Runtime Errors

The validator prevents common errors:

### Before Validation:
```typescript
// Config has typo: 'proces' instead of 'process'
const config = {
  nodeTypes: { proces: { shape: 'rectangle', dataSchema: {} } },
  edgeTypes: { flow: { style: 'solid' } },
  allowedConnections: [
    { from: 'process', to: 'proces', via: 'flow' }  // Typo!
  ]
};

// ❌ Runtime error in GraphRenderer
<GraphRenderer configuration={config} {...props} />
// Error: Cannot read properties of undefined (reading 'color')
```

### After Validation:
```typescript
ConfigurationValidator.validateOrThrow(config);
// ✅ Immediate error with clear message:
// Error: Invalid GraphConfiguration:
//   - allowedConnections[0].from: Connection rule references undefined node type 'process'
//     (Available node types: proces)
```

## Best Practices

1. **Validate early**: Check configurations when loading, not when rendering
2. **Use in development**: Run validation in development mode
3. **CI/CD**: Add validation step to prevent bad configs from deploying
4. **Error handling**: Catch validation errors and show user-friendly messages
5. **Warnings**: Don't ignore warnings - they prevent future issues

## Performance

- Validation is fast (< 1ms for typical configs)
- Runs once per EventProcessor instance
- Can be disabled if needed: `new EventProcessor(config, { validateConfig: false })`
- Consider caching validation results for repeated use

## TypeScript Integration

The validator catches errors TypeScript can't:

```typescript
// TypeScript says this is valid (types match)
const config: GraphConfiguration = {
  // ... all types check out
  allowedConnections: [
    { from: 'process', to: 'database', via: 'flow' }
  ]
};

// But validator catches the logic error
ConfigurationValidator.validate(config);
// ❌ node type 'database' doesn't exist in nodeTypes!
```

TypeScript validates **structure**, ConfigurationValidator validates **logic**.

## Summary

- **Use `ConfigurationValidator`** to catch errors before runtime
- **Automatic validation** in `EventProcessor` (can be disabled)
- **Clear error messages** with suggestions
- **Perfect for CLI tools** and CI/CD pipelines
- **Prevents** the exact error you encountered: "Cannot read properties of undefined"
