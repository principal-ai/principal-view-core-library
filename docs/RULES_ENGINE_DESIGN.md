# Rules Engine Design: Configuration Quality Validation

This document outlines the design for a rules engine to validate graph configurations and component libraries in the Visual Validation Framework.

## Overview

The rules engine provides a pluggable, extensible system for validating GraphConfiguration files, ComponentLibrary definitions, and their relationships. It follows patterns established in the alexandria-core-library rules engine while adapting to the specific needs of graph visualization configurations.

**Key Principle**: Catch configuration errors early with actionable feedback, before they cause runtime failures or confusing visualization behavior.

---

## Architecture

### High-Level Structure

```
packages/core/src/rules/
├── engine.ts              # GraphRulesEngine - orchestrator
├── types.ts               # Interfaces: GraphRule, GraphRuleViolation, GraphRuleContext
├── index.ts               # Public exports
├── implementations/       # Individual rule implementations
│   ├── required-metadata.ts
│   ├── valid-node-types.ts
│   ├── valid-edge-types.ts
│   └── ...
└── utils/
    └── validators.ts      # Shared validation helpers
```

### Core Components

| Component | Responsibility |
|-----------|----------------|
| `GraphRulesEngine` | Central orchestrator - registers rules, builds context, executes validation |
| `GraphRule` | Interface for all rules: id, check(), optional fix(), metadata |
| `GraphRuleContext` | Encapsulates configuration, library, and file data for rule evaluation |
| `GraphRuleViolation` | Detailed violation report with location, message, impact, fix hints |

### Dependency Flow

```
GraphRulesEngine
  ├── Configuration data (GraphConfiguration, ComponentLibrary)
  ├── Rule Registry (Map<string, GraphRule>)
  └── Rules[]
       └── GraphRuleContext
            ├── configuration: GraphConfiguration
            ├── library?: ComponentLibrary
            ├── configPath?: string
            └── rawYaml?: string (for line number reporting)
```

---

## Type Definitions

### GraphRule Interface

```typescript
interface GraphRule {
  // Metadata
  id: string;                         // Unique kebab-case identifier
  name: string;                       // Human-readable name
  description: string;                // Brief explanation
  impact: string;                     // Business/user impact statement

  // Classification
  severity: GraphRuleSeverity;        // "error" | "warning" | "info"
  category: GraphRuleCategory;        // "schema" | "reference" | "structure" | "performance"

  // Capability flags
  enabled: boolean;                   // Default enabled state
  fixable: boolean;                   // Can be auto-fixed
  options?: RuleOptions;              // Default configuration options

  // Execution
  check: (context: GraphRuleContext) => Promise<GraphRuleViolation[]>;
  fix?: (violation: GraphRuleViolation, context: GraphRuleContext) => Promise<FixResult>;
}

type GraphRuleSeverity = 'error' | 'warning' | 'info';
type GraphRuleCategory = 'schema' | 'reference' | 'structure' | 'performance';
```

### GraphRuleContext Interface

```typescript
interface GraphRuleContext {
  // Primary data
  configuration: GraphConfiguration;
  library?: ComponentLibrary;

  // File information (for error reporting)
  configPath?: string;
  libraryPath?: string;
  rawYaml?: string;                   // Original YAML for line number lookup

  // Configuration overrides
  ruleOptions?: Map<string, RuleOptions>;
}
```

### GraphRuleViolation Interface

```typescript
interface GraphRuleViolation {
  ruleId: string;                     // Rule that detected violation
  severity: GraphRuleSeverity;

  // Location (all optional, depending on violation type)
  file?: string;                      // Config or library file path
  line?: number;                      // Line number in YAML
  path?: string;                      // JSON path (e.g., "nodeTypes.service.shape")

  // Details
  message: string;                    // Clear, actionable error message
  impact: string;                     // Why this matters
  suggestion?: string;                // How to fix

  // Fix metadata
  fixable: boolean;
  fixData?: Record<string, unknown>;  // Data needed for auto-fix
}
```

### GraphLintResult Interface

```typescript
interface GraphLintResult {
  violations: GraphRuleViolation[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  fixableCount: number;

  // Summary by category
  byCategory: Record<GraphRuleCategory, number>;
}
```

---

## Rules (14 Total)

All rules default to **error** severity to enforce strict configuration quality.

### Schema Validation Rules

| Rule ID | Description | Validates |
|---------|-------------|-----------|
| `no-unknown-fields` | Flag fields not defined in the schema | Typos, invalid fields at any level |
| `required-metadata` | Configuration must have name and version | `metadata.name`, `metadata.version` |
| `valid-node-types` | nodeTypes have required fields and valid values | `shape` required, valid shape/color/animation values |
| `valid-edge-types` | edgeTypes have required fields and valid values | `style` required, valid style/color/animation values |
| `valid-color-format` | Color values are valid hex codes | All color fields match `#RGB` or `#RRGGBB` |

### Reference Integrity Rules

| Rule ID | Description | Validates |
|---------|-------------|-----------|
| `connection-type-references` | allowedConnections reference existing nodeTypes/edgeTypes | `from`, `to`, `via` fields |
| `state-transition-references` | State transitions reference defined states | `validation.stateTransitions` entries |

### Structure Rules

| Rule ID | Description | Validates |
|---------|-------------|-----------|
| `minimum-node-sources` | Each nodeType must have at least N sources (default: 1) | `nodeTypes.*.sources` array length |
| `orphaned-node-types` | nodeTypes not used in any connection rule | Cross-reference with `allowedConnections` |
| `orphaned-edge-types` | edgeTypes not used in any connection rule | Cross-reference with `allowedConnections` |
| `unreachable-states` | States with no entry transitions | State graph reachability |
| `dead-end-states` | States with no exit transitions (except terminal states) | State graph completeness |

### Pattern Validation Rules

| Rule ID | Description | Validates |
|---------|-------------|-----------|
| `valid-action-patterns` | Action pattern regex is syntactically valid | `nodeTypes.*.actions[].pattern` |

### Library Consistency Rules

| Rule ID | Description | Validates |
|---------|-------------|-----------|
| `library-node-type-match` | nodeTypes match library nodeComponents (when library provided) | Type alignment |

---

## Engine Implementation

### GraphRulesEngine Class

```typescript
class GraphRulesEngine {
  private rules: Map<string, GraphRule> = new Map();

  constructor() {
    // Register built-in rules
    this.registerBuiltinRules();
  }

  /**
   * Register a custom rule
   */
  registerRule(rule: GraphRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Lint a configuration
   */
  async lint(
    configuration: GraphConfiguration,
    options?: LintOptions
  ): Promise<GraphLintResult> {
    const context = this.buildContext(configuration, options);
    const violations: GraphRuleViolation[] = [];

    for (const [ruleId, rule] of this.rules) {
      // Check if rule is enabled
      if (!this.isRuleEnabled(rule, options)) continue;

      // Execute rule check
      const ruleViolations = await rule.check(context);

      // Apply severity overrides
      for (const v of ruleViolations) {
        v.severity = options?.severityOverrides?.get(ruleId) ?? v.severity;
      }

      violations.push(...ruleViolations);
    }

    return this.buildResult(violations);
  }

  /**
   * Get all registered rules
   */
  getAllRules(): Map<string, GraphRule> {
    return new Map(this.rules);
  }
}
```

### Lint Options

```typescript
interface LintOptions {
  // Rule filtering
  enabledRules?: string[];            // Only run these rules
  disabledRules?: string[];           // Skip these rules

  // Severity overrides
  severityOverrides?: Map<string, GraphRuleSeverity>;

  // Additional context
  library?: ComponentLibrary;
  configPath?: string;
  libraryPath?: string;
  rawYaml?: string;

  // Rule-specific options
  ruleOptions?: Map<string, RuleOptions>;
}
```

---

## Example Rule Implementation

### required-metadata Rule

```typescript
// src/rules/implementations/required-metadata.ts

import { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

export const requiredMetadata: GraphRule = {
  id: 'required-metadata',
  name: 'Required Metadata',
  description: 'Configuration must have name and version in metadata',
  impact: 'Missing metadata makes configurations hard to identify and version',
  severity: 'error',
  category: 'schema',
  enabled: true,
  fixable: false,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    if (!configuration.metadata) {
      violations.push({
        ruleId: 'required-metadata',
        severity: 'error',
        file: configPath,
        path: 'metadata',
        message: 'Configuration is missing metadata section',
        impact: 'Cannot identify or version this configuration',
        suggestion: 'Add a metadata section with name and version fields',
        fixable: false,
      });
      return violations;
    }

    if (!configuration.metadata.name) {
      violations.push({
        ruleId: 'required-metadata',
        severity: 'error',
        file: configPath,
        path: 'metadata.name',
        message: 'Configuration metadata is missing required "name" field',
        impact: 'Cannot identify this configuration',
        suggestion: 'Add a name field to metadata',
        fixable: false,
      });
    }

    if (!configuration.metadata.version) {
      violations.push({
        ruleId: 'required-metadata',
        severity: 'error',
        file: configPath,
        path: 'metadata.version',
        message: 'Configuration metadata is missing required "version" field',
        impact: 'Cannot track configuration versions',
        suggestion: 'Add a version field (e.g., "1.0.0") to metadata',
        fixable: false,
      });
    }

    return violations;
  },
};
```

### valid-color-format Rule (Fixable)

```typescript
// src/rules/implementations/valid-color-format.ts

import { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export const validColorFormat: GraphRule = {
  id: 'valid-color-format',
  name: 'Valid Color Format',
  description: 'Color values must be valid hex codes',
  impact: 'Invalid colors may render incorrectly or cause visualization errors',
  severity: 'error',
  category: 'schema',
  enabled: true,
  fixable: true,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    // Check nodeTypes colors
    if (configuration.nodeTypes) {
      for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
        if (nodeType.color && !HEX_COLOR_REGEX.test(nodeType.color)) {
          violations.push({
            ruleId: 'valid-color-format',
            severity: 'error',
            file: configPath,
            path: `nodeTypes.${typeId}.color`,
            message: `Invalid color format "${nodeType.color}" for node type "${typeId}"`,
            impact: 'Node may not render with expected color',
            suggestion: 'Use hex format: #RGB or #RRGGBB (e.g., #3b82f6)',
            fixable: true,
            fixData: { typeId, field: 'color', value: nodeType.color },
          });
        }
      }
    }

    // Check edgeTypes colors
    if (configuration.edgeTypes) {
      for (const [typeId, edgeType] of Object.entries(configuration.edgeTypes)) {
        if (edgeType.color && !HEX_COLOR_REGEX.test(edgeType.color)) {
          violations.push({
            ruleId: 'valid-color-format',
            severity: 'error',
            file: configPath,
            path: `edgeTypes.${typeId}.color`,
            message: `Invalid color format "${edgeType.color}" for edge type "${typeId}"`,
            impact: 'Edge may not render with expected color',
            suggestion: 'Use hex format: #RGB or #RRGGBB (e.g., #94a3b8)',
            fixable: true,
            fixData: { typeId, field: 'color', value: edgeType.color },
          });
        }
      }
    }

    return violations;
  },
};
```

### minimum-node-sources Rule

```typescript
// src/rules/implementations/minimum-node-sources.ts

import { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

interface MinimumNodeSourcesOptions {
  minimum: number;
  excludeNodeTypes?: string[];
}

export const minimumNodeSources: GraphRule = {
  id: 'minimum-node-sources',
  name: 'Minimum Node Sources',
  description: 'Each nodeType must have at least a minimum number of sources defined',
  impact: 'NodeTypes without sources cannot be associated with log activity',
  severity: 'error',
  category: 'structure',
  enabled: true,
  fixable: false,
  options: {
    minimum: 1,
    excludeNodeTypes: [],
  },

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath, ruleOptions } = context;

    const options = (ruleOptions?.get('minimum-node-sources') ?? {
      minimum: 1,
      excludeNodeTypes: [],
    }) as MinimumNodeSourcesOptions;

    if (!configuration.nodeTypes) {
      return violations;
    }

    for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
      // Skip excluded node types
      if (options.excludeNodeTypes?.includes(typeId)) {
        continue;
      }

      const sources = (nodeType as any).sources ?? [];
      const sourceCount = Array.isArray(sources) ? sources.length : 0;

      if (sourceCount < options.minimum) {
        violations.push({
          ruleId: 'minimum-node-sources',
          severity: 'error',
          file: configPath,
          path: `nodeTypes.${typeId}.sources`,
          message: sourceCount === 0
            ? `Node type "${typeId}" has no sources defined`
            : `Node type "${typeId}" has ${sourceCount} source(s), minimum required is ${options.minimum}`,
          impact: 'This node type cannot be associated with log activity from source files',
          suggestion: `Add at least ${options.minimum} source path(s) to nodeTypes.${typeId}.sources`,
          fixable: false,
        });
      }
    }

    return violations;
  },
};
```

### no-unknown-fields Rule

```typescript
// src/rules/implementations/no-unknown-fields.ts

import { GraphRule, GraphRuleContext, GraphRuleViolation } from '../types';

// Define allowed fields for each configuration section
const ALLOWED_FIELDS = {
  root: ['metadata', 'nodeTypes', 'edgeTypes', 'allowedConnections', 'validation', 'display'],
  metadata: ['name', 'version', 'description'],
  nodeType: ['shape', 'icon', 'color', 'stroke', 'size', 'dataSchema', 'states', 'layout', 'sources', 'actions'],
  edgeType: ['style', 'color', 'width', 'directed', 'animated', 'label', 'animation', 'dataSchema', 'activatedBy'],
  connectionRule: ['from', 'to', 'via', 'constraints'],
  connectionConstraints: ['maxInstances', 'bidirectional', 'exclusive'],
  validation: ['stateTransitions', 'constraints', 'cardinality'],
  display: ['layout', 'theme', 'animations'],
  displayTheme: ['primary', 'success', 'warning', 'danger', 'info'],
  displayAnimations: ['enabled', 'speed'],
  dataSchemaField: ['type', 'required', 'displayInLabel', 'label', 'displayInInfo'],
  stateDefinition: ['color', 'icon', 'label'],
  layoutHints: ['layer', 'cluster'],
  edgeLabel: ['field', 'position'],
  edgeAnimation: ['type', 'duration', 'color'],
};

export const noUnknownFields: GraphRule = {
  id: 'no-unknown-fields',
  name: 'No Unknown Fields',
  description: 'Flag fields that are not defined in the configuration schema',
  impact: 'Unknown fields are likely typos or misunderstandings of the schema',
  severity: 'error',
  category: 'schema',
  enabled: true,
  fixable: true,

  async check(context: GraphRuleContext): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath } = context;

    // Check root level fields
    checkFields(configuration, ALLOWED_FIELDS.root, '', configPath, violations);

    // Check metadata fields
    if (configuration.metadata) {
      checkFields(configuration.metadata, ALLOWED_FIELDS.metadata, 'metadata', configPath, violations);
    }

    // Check nodeTypes
    if (configuration.nodeTypes) {
      for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
        checkFields(nodeType, ALLOWED_FIELDS.nodeType, `nodeTypes.${typeId}`, configPath, violations);

        // Check nested fields in nodeType
        if (nodeType.dataSchema) {
          for (const [fieldName, fieldDef] of Object.entries(nodeType.dataSchema)) {
            checkFields(fieldDef, ALLOWED_FIELDS.dataSchemaField,
              `nodeTypes.${typeId}.dataSchema.${fieldName}`, configPath, violations);
          }
        }
        if (nodeType.states) {
          for (const [stateName, stateDef] of Object.entries(nodeType.states)) {
            checkFields(stateDef, ALLOWED_FIELDS.stateDefinition,
              `nodeTypes.${typeId}.states.${stateName}`, configPath, violations);
          }
        }
        if (nodeType.layout) {
          checkFields(nodeType.layout, ALLOWED_FIELDS.layoutHints,
            `nodeTypes.${typeId}.layout`, configPath, violations);
        }
      }
    }

    // Check edgeTypes
    if (configuration.edgeTypes) {
      for (const [typeId, edgeType] of Object.entries(configuration.edgeTypes)) {
        checkFields(edgeType, ALLOWED_FIELDS.edgeType, `edgeTypes.${typeId}`, configPath, violations);

        if (edgeType.label) {
          checkFields(edgeType.label, ALLOWED_FIELDS.edgeLabel,
            `edgeTypes.${typeId}.label`, configPath, violations);
        }
        if (edgeType.animation) {
          checkFields(edgeType.animation, ALLOWED_FIELDS.edgeAnimation,
            `edgeTypes.${typeId}.animation`, configPath, violations);
        }
        if (edgeType.dataSchema) {
          for (const [fieldName, fieldDef] of Object.entries(edgeType.dataSchema)) {
            checkFields(fieldDef, ALLOWED_FIELDS.dataSchemaField,
              `edgeTypes.${typeId}.dataSchema.${fieldName}`, configPath, violations);
          }
        }
      }
    }

    // Check allowedConnections
    if (configuration.allowedConnections) {
      configuration.allowedConnections.forEach((rule, index) => {
        checkFields(rule, ALLOWED_FIELDS.connectionRule,
          `allowedConnections[${index}]`, configPath, violations);
        if (rule.constraints) {
          checkFields(rule.constraints, ALLOWED_FIELDS.connectionConstraints,
            `allowedConnections[${index}].constraints`, configPath, violations);
        }
      });
    }

    // Check validation
    if (configuration.validation) {
      checkFields(configuration.validation, ALLOWED_FIELDS.validation, 'validation', configPath, violations);
    }

    // Check display
    if (configuration.display) {
      checkFields(configuration.display, ALLOWED_FIELDS.display, 'display', configPath, violations);
      if (configuration.display.theme) {
        checkFields(configuration.display.theme, ALLOWED_FIELDS.displayTheme,
          'display.theme', configPath, violations);
      }
      if (configuration.display.animations) {
        checkFields(configuration.display.animations, ALLOWED_FIELDS.displayAnimations,
          'display.animations', configPath, violations);
      }
    }

    return violations;
  },
};

function checkFields(
  obj: Record<string, any>,
  allowedFields: string[],
  path: string,
  configPath: string | undefined,
  violations: GraphRuleViolation[]
): void {
  for (const field of Object.keys(obj)) {
    if (!allowedFields.includes(field)) {
      const suggestion = findSimilarField(field, allowedFields);
      violations.push({
        ruleId: 'no-unknown-fields',
        severity: 'error',
        file: configPath,
        path: path ? `${path}.${field}` : field,
        message: `Unknown field "${field}"${path ? ` in ${path}` : ' at root level'}`,
        impact: 'This field will be ignored and may indicate a configuration error',
        suggestion: suggestion
          ? `Did you mean "${suggestion}"? Allowed fields: ${allowedFields.join(', ')}`
          : `Allowed fields: ${allowedFields.join(', ')}`,
        fixable: true,
        fixData: { path, field, suggestion },
      });
    }
  }
}

function findSimilarField(field: string, allowedFields: string[]): string | null {
  // Simple Levenshtein-like similarity check
  const fieldLower = field.toLowerCase();
  for (const allowed of allowedFields) {
    const allowedLower = allowed.toLowerCase();
    // Check if it's a close match (e.g., typo)
    if (fieldLower.includes(allowedLower) || allowedLower.includes(fieldLower)) {
      return allowed;
    }
    // Check for common typos (off by 1-2 characters)
    if (Math.abs(field.length - allowed.length) <= 2) {
      let differences = 0;
      const minLen = Math.min(fieldLower.length, allowedLower.length);
      for (let i = 0; i < minLen; i++) {
        if (fieldLower[i] !== allowedLower[i]) differences++;
      }
      differences += Math.abs(field.length - allowed.length);
      if (differences <= 2) return allowed;
    }
  }
  return null;
}
```

---

## CLI Integration

Add a `lint` command to the CLI package:

```bash
# Lint a single configuration
vgc lint .vgc/microservices.yaml

# Lint with library validation
vgc lint .vgc/microservices.yaml --library .vgc/library.yaml

# Lint all configurations in .vgc folder
vgc lint

# Output formats
vgc lint --format json
vgc lint --format pretty  # default

# Rule filtering
vgc lint --only schema    # Only schema category rules
vgc lint --disable valid-color-format

# Fix mode (future)
vgc lint --fix
```

### CLI Output Example

```
$ vgc lint .vgc/microservices.yaml

  .vgc/microservices.yaml

  error  required-metadata            metadata.version is missing
         → Add a version field (e.g., "1.0.0") to metadata

  error  connection-type-references   allowedConnections[2] references undefined
                                      nodeType "databse" (did you mean "database"?)
         → Check nodeTypes section for available types

  error  valid-color-format           nodeTypes.service.color "blue" is not valid hex
         → Use hex format: #RGB or #RRGGBB (e.g., #3b82f6)

  error  orphaned-node-types          nodeType "legacy-service" is not used in any
                                      connection rule
         → Remove unused nodeType or add connection rules

  error  minimum-node-sources         nodeType "database" has no sources defined
         → Add at least 1 source path to nodeTypes.database.sources

  ✖ 5 errors
```

---

## Configuration File Specification

### File Resolution Order

The CLI searches for configuration in the following order (first match wins):

1. `--config <path>` CLI argument
2. `.vgcrc.json` in current directory
3. `.vgcrc.yaml` or `.vgcrc.yml` in current directory
4. `vgc.config.json` in current directory
5. `vgc.config.yaml` or `vgc.config.yml` in current directory
6. `"vgc"` key in `package.json`
7. Walk up parent directories repeating steps 2-6

### Schema Definition

```typescript
interface VGCConfig {
  /**
   * Schema version for forward compatibility
   * @default "1"
   */
  $schema?: string;

  /**
   * Extend from a shared configuration
   * Can be a package name or relative path
   * @example "@my-org/vgc-config" or "./configs/base.json"
   */
  extends?: string | string[];

  /**
   * Root flag - stop searching parent directories
   * @default false
   */
  root?: boolean;

  /**
   * Path to default component library
   * Used by library-node-type-match rule
   */
  library?: string;

  /**
   * Glob patterns for configuration files to lint
   * @default [".vgc/**/*.yaml", ".vgc/**/*.yml", ".vgc/**/*.json"]
   */
  include?: string[];

  /**
   * Glob patterns to exclude from linting
   * @default ["**/node_modules/**", "**/*.test.*"]
   */
  exclude?: string[];

  /**
   * Rule configurations
   */
  rules?: {
    [ruleId: string]: RuleConfig | RuleSeverity | false;
  };
}

/**
 * Severity levels following ESLint convention
 * - "off" or 0: Disable rule
 * - "warn" or 1: Warning (doesn't affect exit code)
 * - "error" or 2: Error (exit code 1)
 */
type RuleSeverity = 'off' | 'warn' | 'error' | 0 | 1 | 2;

/**
 * Full rule configuration object
 */
interface RuleConfig {
  /**
   * Rule severity
   * @default "error"
   */
  severity?: RuleSeverity;

  /**
   * Rule-specific options
   */
  options?: Record<string, unknown>;
}
```

### JSON Schema File

The CLI will provide a JSON Schema for editor autocompletion:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://principal.ai/schemas/vgcrc.json",
  "title": "VGC Configuration",
  "type": "object",
  "properties": {
    "$schema": {
      "type": "string",
      "description": "JSON Schema reference for editor support"
    },
    "extends": {
      "oneOf": [
        { "type": "string" },
        { "type": "array", "items": { "type": "string" } }
      ],
      "description": "Extend from shared configuration(s)"
    },
    "root": {
      "type": "boolean",
      "default": false,
      "description": "Stop searching parent directories for config"
    },
    "library": {
      "type": "string",
      "description": "Path to default component library file"
    },
    "include": {
      "type": "array",
      "items": { "type": "string" },
      "default": [".vgc/**/*.yaml", ".vgc/**/*.yml", ".vgc/**/*.json"],
      "description": "Glob patterns for files to lint"
    },
    "exclude": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["**/node_modules/**", "**/*.test.*"],
      "description": "Glob patterns to exclude"
    },
    "rules": {
      "type": "object",
      "description": "Rule configurations",
      "additionalProperties": {
        "oneOf": [
          { "$ref": "#/definitions/ruleSeverity" },
          { "$ref": "#/definitions/ruleConfig" },
          { "const": false }
        ]
      }
    }
  },
  "definitions": {
    "ruleSeverity": {
      "oneOf": [
        { "enum": ["off", "warn", "error"] },
        { "enum": [0, 1, 2] }
      ]
    },
    "ruleConfig": {
      "type": "object",
      "properties": {
        "severity": { "$ref": "#/definitions/ruleSeverity" },
        "options": { "type": "object" }
      },
      "additionalProperties": false
    }
  }
}
```

### Example Configurations

#### Minimal `.vgcrc.json`

```json
{
  "$schema": "https://principal.ai/schemas/vgcrc.json",
  "root": true
}
```

#### Full `.vgcrc.yaml`

```yaml
# yaml-language-server: $schema=https://principal.ai/schemas/vgcrc.json

root: true
library: .vgc/library.yaml

include:
  - ".vgc/**/*.yaml"
  - "configs/**/*.yaml"

exclude:
  - "**/*.test.yaml"
  - "**/fixtures/**"

rules:
  # Disable a rule
  dead-end-states: off

  # Shorthand severity
  orphaned-node-types: warn

  # Full configuration with options
  minimum-node-sources:
    severity: error
    options:
      minimum: 1
      excludeNodeTypes:
        - external-service
        - mock-service

  # Numeric severity (ESLint style)
  valid-color-format: 2
```

#### In `package.json`

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "vgc": {
    "root": true,
    "library": ".vgc/library.yaml",
    "rules": {
      "minimum-node-sources": {
        "severity": "error",
        "options": {
          "minimum": 1
        }
      }
    }
  }
}
```

#### Extending Shared Config

```json
{
  "$schema": "https://principal.ai/schemas/vgcrc.json",
  "extends": "@my-org/vgc-config-strict",
  "rules": {
    "orphaned-node-types": "warn"
  }
}
```

### Rule-Specific Options

| Rule ID | Options | Default |
|---------|---------|---------|
| `minimum-node-sources` | `minimum: number`, `excludeNodeTypes: string[]` | `{ minimum: 1, excludeNodeTypes: [] }` |
| `dead-end-states` | `terminalStates: string[]` | `{ terminalStates: ["completed", "failed", "terminated"] }` |
| `valid-action-patterns` | `strictMode: boolean` | `{ strictMode: false }` |
| `library-node-type-match` | `allowExtra: boolean` | `{ allowExtra: false }` |

### CLI Validation

The CLI validates the config file on load:

```
$ vgc lint

  Configuration Error: .vgcrc.json

  error  Invalid rule ID "uknown-rule" in rules configuration
         → Did you mean "no-unknown-fields"?

  error  Invalid severity "fatal" for rule "valid-color-format"
         → Allowed values: "off", "warn", "error", 0, 1, 2

  error  Invalid option "minumum" for rule "minimum-node-sources"
         → Did you mean "minimum"?

  ✖ 3 configuration errors
```

### TypeScript Types Export

The package exports config types for programmatic use:

```typescript
// packages/core/src/rules/config.ts
export interface VGCConfig { ... }
export interface RuleConfig { ... }
export type RuleSeverity = 'off' | 'warn' | 'error' | 0 | 1 | 2;

// Validation function
export function validateConfig(config: unknown): VGCConfig;
export function loadConfig(cwd?: string): Promise<VGCConfig | null>;
```

---

## Relationship to Existing ConfigurationValidator

The existing `ConfigurationValidator` class provides runtime validation. The rules engine complements it:

| Aspect | ConfigurationValidator | Rules Engine |
|--------|------------------------|--------------|
| Purpose | Runtime validation before EventProcessor creation | Static analysis during development |
| Timing | Called programmatically at runtime | CLI command or IDE integration |
| Output | Single error string | Detailed violations with locations |
| Scope | Basic schema checks | Comprehensive quality checks |
| Fixability | None | Some rules support auto-fix |

**Strategy**: Keep `ConfigurationValidator` for runtime, use Rules Engine for development-time linting. Consider migrating some checks to share logic.

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Define types in `src/rules/types.ts`
- [ ] Implement `GraphRulesEngine` class
- [ ] Create rule registration system
- [ ] Add basic test infrastructure

### Phase 2: Schema Rules (5 rules)
- [ ] `no-unknown-fields`
- [ ] `required-metadata`
- [ ] `valid-node-types` (includes shape/animation validation)
- [ ] `valid-edge-types` (includes style/animation validation)
- [ ] `valid-color-format`

### Phase 3: Reference & Structure Rules (7 rules)
- [ ] `connection-type-references`
- [ ] `state-transition-references`
- [ ] `minimum-node-sources`
- [ ] `orphaned-node-types`
- [ ] `orphaned-edge-types`
- [ ] `unreachable-states`
- [ ] `dead-end-states`

### Phase 4: Pattern & Library Rules (2 rules)
- [ ] `valid-action-patterns`
- [ ] `library-node-type-match`

### Phase 5: CLI Integration
- [ ] Add `vgc lint` command
- [ ] Implement formatters (pretty, json)
- [ ] Add configuration file support

---

## Open Questions

1. **Line Numbers**: Should we parse YAML to provide exact line numbers in violations? (Adds complexity but improves DX)

2. **Auto-Fix Scope**: Which rules should support auto-fix? Color normalization seems safe; others may be risky.

3. **IDE Integration**: Should we output in a format compatible with VS Code Problems panel?

4. **Streaming**: For large configurations, should lint() support streaming violations?

5. **Rule Dependencies**: Should rules be able to depend on other rules' results?

---

## References

- Alexandria Core Library Rules Engine: `/Users/griever/Developer/documentation-cli/alexandria-core-library/src/rules/`
- Existing ConfigurationValidator: `/packages/core/src/ConfigurationValidator.ts`
- GraphConfiguration types: `/packages/core/src/types/index.ts`
- ComponentLibrary types: `/packages/core/src/types/library.ts`
