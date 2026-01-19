/**
 * Validate command - Validate .canvas configuration files
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import chalk from 'chalk';
import { globby } from 'globby';
import yaml from 'js-yaml';
import type { ExtendedCanvas } from '@principal-ai/principal-view-core';

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  path?: string;
  suggestion?: string;
}

interface ValidationResult {
  file: string;
  isValid: boolean;
  issues: ValidationIssue[];
  canvas?: ExtendedCanvas;
}

/**
 * Loaded library structure (simplified for validation purposes)
 */
interface LoadedLibrary {
  nodeComponents: Record<string, unknown>;
  edgeComponents: Record<string, unknown>;
  raw: Record<string, unknown>;
  path: string;
}

/**
 * Load the library.yaml file from the .principal-views directory
 */
function loadLibrary(principalViewsDir: string): LoadedLibrary | null {
  const libraryFiles = ['library.yaml', 'library.yml', 'library.json'];

  for (const fileName of libraryFiles) {
    const libraryPath = resolve(principalViewsDir, fileName);
    if (existsSync(libraryPath)) {
      try {
        const content = readFileSync(libraryPath, 'utf8');
        const library = fileName.endsWith('.json') ? JSON.parse(content) : yaml.load(content);

        if (library && typeof library === 'object') {
          return {
            nodeComponents:
              ((library as Record<string, unknown>).nodeComponents as Record<string, unknown>) ||
              {},
            edgeComponents:
              ((library as Record<string, unknown>).edgeComponents as Record<string, unknown>) ||
              {},
            raw: library as Record<string, unknown>,
            path: libraryPath,
          };
        }
      } catch {
        // Library exists but failed to parse - return empty to avoid false positives
        return { nodeComponents: {}, edgeComponents: {}, raw: {}, path: libraryPath };
      }
    }
  }
  return null;
}

/**
 * Validate library.yaml file for unknown fields
 */
function validateLibrary(library: LoadedLibrary): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lib = library.raw;

  // Check root level fields
  checkUnknownFields(lib, ALLOWED_LIBRARY_FIELDS.root, '', issues);

  // Validate nodeComponents
  if (lib.nodeComponents && typeof lib.nodeComponents === 'object') {
    for (const [compId, compDef] of Object.entries(lib.nodeComponents as Record<string, unknown>)) {
      if (compDef && typeof compDef === 'object') {
        const comp = compDef as Record<string, unknown>;
        checkUnknownFields(
          comp,
          ALLOWED_LIBRARY_FIELDS.nodeComponent,
          `nodeComponents.${compId}`,
          issues
        );

        // Validate icon name format (must be PascalCase for Lucide icons)
        validateIconName(comp.icon, `nodeComponents.${compId}.icon`, issues);

        // Check nested fields
        if (comp.size && typeof comp.size === 'object') {
          checkUnknownFields(
            comp.size as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.nodeComponentSize,
            `nodeComponents.${compId}.size`,
            issues
          );
        }

        if (comp.states && typeof comp.states === 'object') {
          for (const [stateId, stateDef] of Object.entries(
            comp.states as Record<string, unknown>
          )) {
            if (stateDef && typeof stateDef === 'object') {
              checkUnknownFields(
                stateDef as Record<string, unknown>,
                ALLOWED_LIBRARY_FIELDS.nodeComponentState,
                `nodeComponents.${compId}.states.${stateId}`,
                issues
              );
              // Validate state icon name format
              const state = stateDef as Record<string, unknown>;
              validateIconName(
                state.icon,
                `nodeComponents.${compId}.states.${stateId}.icon`,
                issues
              );
            }
          }
        }

        if (comp.dataSchema && typeof comp.dataSchema === 'object') {
          for (const [fieldName, fieldDef] of Object.entries(
            comp.dataSchema as Record<string, unknown>
          )) {
            if (fieldDef && typeof fieldDef === 'object') {
              checkUnknownFields(
                fieldDef as Record<string, unknown>,
                ALLOWED_LIBRARY_FIELDS.nodeComponentDataSchemaField,
                `nodeComponents.${compId}.dataSchema.${fieldName}`,
                issues
              );
            }
          }
        }

        if (comp.layout && typeof comp.layout === 'object') {
          checkUnknownFields(
            comp.layout as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.nodeComponentLayout,
            `nodeComponents.${compId}.layout`,
            issues
          );
        }

        if (Array.isArray(comp.actions)) {
          comp.actions.forEach((action: unknown, actionIndex: number) => {
            if (action && typeof action === 'object') {
              checkUnknownFields(
                action as Record<string, unknown>,
                ALLOWED_LIBRARY_FIELDS.nodeComponentAction,
                `nodeComponents.${compId}.actions[${actionIndex}]`,
                issues
              );
            }
          });
        }
      }
    }
  }

  // Validate edgeComponents
  if (lib.edgeComponents && typeof lib.edgeComponents === 'object') {
    for (const [compId, compDef] of Object.entries(lib.edgeComponents as Record<string, unknown>)) {
      if (compDef && typeof compDef === 'object') {
        const comp = compDef as Record<string, unknown>;
        checkUnknownFields(
          comp,
          ALLOWED_LIBRARY_FIELDS.edgeComponent,
          `edgeComponents.${compId}`,
          issues
        );

        // Check nested fields
        if (comp.animation && typeof comp.animation === 'object') {
          checkUnknownFields(
            comp.animation as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.edgeComponentAnimation,
            `edgeComponents.${compId}.animation`,
            issues
          );
        }

        if (comp.label && typeof comp.label === 'object') {
          checkUnknownFields(
            comp.label as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.edgeComponentLabel,
            `edgeComponents.${compId}.label`,
            issues
          );
        }
      }
    }
  }

  // Validate connectionRules
  if (Array.isArray(lib.connectionRules)) {
    lib.connectionRules.forEach((rule: unknown, ruleIndex: number) => {
      if (rule && typeof rule === 'object') {
        const r = rule as Record<string, unknown>;
        checkUnknownFields(
          r,
          ALLOWED_LIBRARY_FIELDS.connectionRule,
          `connectionRules[${ruleIndex}]`,
          issues
        );

        if (r.constraints && typeof r.constraints === 'object') {
          checkUnknownFields(
            r.constraints as Record<string, unknown>,
            ALLOWED_LIBRARY_FIELDS.connectionRuleConstraints,
            `connectionRules[${ruleIndex}].constraints`,
            issues
          );
        }
      }
    });
  }

  return issues;
}

/**
 * Standard JSON Canvas node types that don't require pv metadata
 */
const STANDARD_CANVAS_TYPES = ['text', 'group', 'file', 'link'] as const;

// ============================================================================
// Icon Validation
// ============================================================================

/**
 * Convert kebab-case to PascalCase
 * e.g., "file-text" -> "FileText", "alert-circle" -> "AlertCircle"
 */
function kebabToPascalCase(str: string): string {
  return str
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Check if a string looks like kebab-case (has hyphens and lowercase)
 */
function isKebabCase(str: string): boolean {
  return str.includes('-') && str === str.toLowerCase();
}

/**
 * Validate an icon name and return issues if invalid
 * Icons should be in PascalCase (e.g., "FileText", "Database", "AlertCircle")
 */
function validateIconName(iconValue: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof iconValue !== 'string' || !iconValue) {
    return; // No icon specified, that's fine
  }

  // Check if it looks like kebab-case
  if (isKebabCase(iconValue)) {
    const suggested = kebabToPascalCase(iconValue);
    issues.push({
      type: 'error',
      message: `Invalid icon name "${iconValue}" - icons must be in PascalCase`,
      path,
      suggestion: `Use "${suggested}" instead of "${iconValue}"`,
    });
    return;
  }

  // Check if first character is lowercase (common mistake)
  if (iconValue[0] === iconValue[0].toLowerCase() && iconValue[0] !== iconValue[0].toUpperCase()) {
    const suggested = iconValue.charAt(0).toUpperCase() + iconValue.slice(1);
    issues.push({
      type: 'error',
      message: `Invalid icon name "${iconValue}" - icons must start with uppercase`,
      path,
      suggestion: `Use "${suggested}" instead of "${iconValue}"`,
    });
  }
}

// ============================================================================
// Allowed Fields Definitions
// ============================================================================

/**
 * Allowed fields for canvas validation
 */
const ALLOWED_CANVAS_FIELDS = {
  root: ['nodes', 'edges', 'pv'],
  pv: [
    'version',
    'name',
    'description',
    'nodeTypes',
    'edgeTypes',
    'pathConfig',
    'display',
    'scope',
    'audit',
  ],
  pvPathConfig: [
    'projectRoot',
    'captureSource',
    'enableActionPatterns',
    'logLevel',
    'ignoreUnsourced',
  ],
  pvDisplay: ['layout', 'theme', 'animations'],
  pvDisplayTheme: ['primary', 'success', 'warning', 'danger', 'info'],
  pvDisplayAnimations: ['enabled', 'speed'],
  pvNodeType: ['label', 'description', 'color', 'icon', 'shape'],
  pvEdgeType: [
    'label',
    'style',
    'color',
    'width',
    'directed',
    'animation',
    'labelConfig',
    'activatedBy',
  ],
  pvEdgeTypeAnimation: ['type', 'duration', 'color'],
  pvEdgeTypeLabelConfig: ['field', 'position'],
  // Base node fields from JSON Canvas spec
  nodeBase: ['id', 'type', 'x', 'y', 'width', 'height', 'color', 'pv'],
  // Type-specific node fields
  nodeText: ['text'],
  nodeFile: ['file', 'subpath'],
  nodeLink: ['url'],
  nodeGroup: ['label', 'background', 'backgroundStyle'],
  // Node pv extension
  nodePv: [
    'nodeType',
    'name',
    'description',
    'otel',
    'events',
    'shape',
    'icon',
    'fill',
    'stroke',
    'states',
    'sources',
    'resourceMatch',
    'actions',
    'dataSchema',
    'layout',
  ],
  nodePvOtel: ['kind', 'category', 'isNew'],
  nodePvState: ['color', 'icon', 'label'],
  nodePvAction: ['pattern', 'event', 'state', 'metadata', 'triggerEdges'],
  nodePvDataSchemaField: ['type', 'required', 'displayInLabel'],
  nodePvLayout: ['layer', 'cluster'],
  // Edge fields
  edge: [
    'id',
    'fromNode',
    'toNode',
    'fromSide',
    'toSide',
    'fromEnd',
    'toEnd',
    'color',
    'label',
    'pv',
  ],
  edgePv: ['edgeType', 'style', 'width', 'animation', 'activatedBy'],
  edgePvAnimation: ['type', 'duration', 'color'],
  edgePvActivatedBy: ['action', 'animation', 'direction', 'duration'],
};

/**
 * Allowed fields for library validation
 */
const ALLOWED_LIBRARY_FIELDS = {
  root: ['version', 'name', 'description', 'nodeComponents', 'edgeComponents', 'connectionRules'],
  nodeComponent: [
    'description',
    'tags',
    'defaultLabel',
    'shape',
    'icon',
    'color',
    'size',
    'states',
    'sources',
    'resourceMatch',
    'actions',
    'dataSchema',
    'layout',
  ],
  nodeComponentSize: ['width', 'height'],
  nodeComponentState: ['color', 'icon', 'label'],
  nodeComponentAction: ['pattern', 'event', 'state', 'metadata', 'triggerEdges'],
  nodeComponentDataSchemaField: ['type', 'required', 'displayInLabel', 'label', 'displayInInfo'],
  nodeComponentLayout: ['layer', 'cluster'],
  edgeComponent: [
    'description',
    'tags',
    'style',
    'color',
    'width',
    'directed',
    'animation',
    'label',
  ],
  edgeComponentAnimation: ['type', 'duration', 'color'],
  edgeComponentLabel: ['field', 'position'],
  connectionRule: ['from', 'to', 'via', 'constraints'],
  connectionRuleConstraints: ['maxInstances', 'bidirectional', 'exclusive'],
};

/**
 * Check for unknown fields and return validation issues
 */
function checkUnknownFields(
  obj: Record<string, unknown>,
  allowedFields: string[],
  path: string,
  issues: ValidationIssue[]
): void {
  for (const field of Object.keys(obj)) {
    if (!allowedFields.includes(field)) {
      const suggestion = findSimilarField(field, allowedFields);
      issues.push({
        type: 'error',
        message: `Unknown field "${field}"${path ? ` in ${path}` : ' at root level'}`,
        path: path ? `${path}.${field}` : field,
        suggestion: suggestion
          ? `Did you mean "${suggestion}"? Allowed fields: ${allowedFields.join(', ')}`
          : `Allowed fields: ${allowedFields.join(', ')}`,
      });
    }
  }
}

/**
 * Find a similar field name for suggestions
 */
function findSimilarField(field: string, allowedFields: string[]): string | null {
  const fieldLower = field.toLowerCase();

  for (const allowed of allowedFields) {
    const allowedLower = allowed.toLowerCase();
    if (fieldLower.includes(allowedLower) || allowedLower.includes(fieldLower)) {
      return allowed;
    }
    // Check for small edit distance
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

/**
 * Check if a canvas has OTEL-related features
 * Returns true if the canvas contains any of:
 * 1. Nodes with pv.otel extension (kind, category)
 * 2. Event schemas (pv.events with validation)
 * 3. Canvas scope/audit config (OTEL log routing)
 * 4. Resource matching for OTEL logs
 */
function hasOtelFeatures(canvas: unknown): boolean {
  if (!canvas || typeof canvas !== 'object') {
    return false;
  }

  const c = canvas as Record<string, unknown>;

  // Check for canvas-level scope or audit config
  if (c.pv && typeof c.pv === 'object') {
    const pv = c.pv as Record<string, unknown>;
    if (pv.scope !== undefined || pv.audit !== undefined) {
      return true;
    }
  }

  // Check nodes for OTEL features
  if (Array.isArray(c.nodes)) {
    for (const node of c.nodes) {
      if (node && typeof node === 'object') {
        const n = node as Record<string, unknown>;
        if (n.pv && typeof n.pv === 'object') {
          const nodePv = n.pv as Record<string, unknown>;

          // Check for pv.otel extension
          if (nodePv.otel !== undefined) {
            return true;
          }

          // Check for event schemas (pv.events)
          if (nodePv.events !== undefined) {
            return true;
          }

          // Check for resourceMatch (OTEL log routing)
          if (nodePv.resourceMatch !== undefined) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Validate an ExtendedCanvas object with strict validation
 *
 * Strict validation ensures:
 * - All required fields are present
 * - Custom node types have proper pv metadata
 * - Edge types reference defined types in pv.edgeTypes or library.edgeComponents
 * - Node types reference defined types in pv.nodeTypes or library.nodeComponents
 * - Canvas has pv extension with name and version
 */
function validateCanvas(
  canvas: unknown,
  filePath: string,
  library: LoadedLibrary | null
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!canvas || typeof canvas !== 'object') {
    issues.push({ type: 'error', message: 'Canvas must be an object' });
    return issues;
  }

  const c = canvas as Record<string, unknown>;

  // Check unknown fields at canvas root level
  checkUnknownFields(c, ALLOWED_CANVAS_FIELDS.root, '', issues);

  // Collect library-defined types
  const libraryNodeTypes = library ? Object.keys(library.nodeComponents) : [];
  const libraryEdgeTypes = library ? Object.keys(library.edgeComponents) : [];

  // Check pv extension (REQUIRED for strict validation)
  let canvasEdgeTypes: string[] = [];
  let canvasNodeTypes: string[] = [];
  if (c.pv === undefined) {
    issues.push({
      type: 'error',
      message: 'Canvas must have a "pv" extension with name and version',
      path: 'pv',
      suggestion: 'Add: "pv": { "name": "My Graph", "version": "1.0.0" }',
    });
  } else if (typeof c.pv !== 'object') {
    issues.push({ type: 'error', message: '"pv" extension must be an object' });
  } else {
    const pv = c.pv as Record<string, unknown>;

    // Check unknown fields in pv extension
    checkUnknownFields(pv, ALLOWED_CANVAS_FIELDS.pv, 'pv', issues);

    if (typeof pv.version !== 'string' || !pv.version) {
      issues.push({
        type: 'error',
        message: 'pv.version is required',
        path: 'pv.version',
        suggestion: 'Add: "version": "1.0.0"',
      });
    }
    if (typeof pv.name !== 'string' || !pv.name) {
      issues.push({
        type: 'error',
        message: 'pv.name is required',
        path: 'pv.name',
        suggestion: 'Add: "name": "My Graph"',
      });
    }

    // Validate pv.pathConfig if present
    if (pv.pathConfig && typeof pv.pathConfig === 'object') {
      checkUnknownFields(
        pv.pathConfig as Record<string, unknown>,
        ALLOWED_CANVAS_FIELDS.pvPathConfig,
        'pv.pathConfig',
        issues
      );
    }

    // Validate pv.display if present
    if (pv.display && typeof pv.display === 'object') {
      const display = pv.display as Record<string, unknown>;
      checkUnknownFields(display, ALLOWED_CANVAS_FIELDS.pvDisplay, 'pv.display', issues);

      if (display.theme && typeof display.theme === 'object') {
        checkUnknownFields(
          display.theme as Record<string, unknown>,
          ALLOWED_CANVAS_FIELDS.pvDisplayTheme,
          'pv.display.theme',
          issues
        );
      }
      if (display.animations && typeof display.animations === 'object') {
        checkUnknownFields(
          display.animations as Record<string, unknown>,
          ALLOWED_CANVAS_FIELDS.pvDisplayAnimations,
          'pv.display.animations',
          issues
        );
      }
    }

    // Collect and validate defined node types
    if (pv.nodeTypes && typeof pv.nodeTypes === 'object') {
      canvasNodeTypes = Object.keys(pv.nodeTypes as Record<string, unknown>);
      for (const [typeId, typeDef] of Object.entries(pv.nodeTypes as Record<string, unknown>)) {
        if (typeDef && typeof typeDef === 'object') {
          checkUnknownFields(
            typeDef as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.pvNodeType,
            `pv.nodeTypes.${typeId}`,
            issues
          );
          // Validate icon name format
          const nodeType = typeDef as Record<string, unknown>;
          validateIconName(nodeType.icon, `pv.nodeTypes.${typeId}.icon`, issues);
        }
      }
    }

    // Collect and validate defined edge types
    if (pv.edgeTypes && typeof pv.edgeTypes === 'object') {
      canvasEdgeTypes = Object.keys(pv.edgeTypes as Record<string, unknown>);
      for (const [typeId, typeDef] of Object.entries(pv.edgeTypes as Record<string, unknown>)) {
        if (typeDef && typeof typeDef === 'object') {
          const edgeTypeDef = typeDef as Record<string, unknown>;
          checkUnknownFields(
            edgeTypeDef,
            ALLOWED_CANVAS_FIELDS.pvEdgeType,
            `pv.edgeTypes.${typeId}`,
            issues
          );

          if (edgeTypeDef.animation && typeof edgeTypeDef.animation === 'object') {
            checkUnknownFields(
              edgeTypeDef.animation as Record<string, unknown>,
              ALLOWED_CANVAS_FIELDS.pvEdgeTypeAnimation,
              `pv.edgeTypes.${typeId}.animation`,
              issues
            );
          }
          if (edgeTypeDef.labelConfig && typeof edgeTypeDef.labelConfig === 'object') {
            checkUnknownFields(
              edgeTypeDef.labelConfig as Record<string, unknown>,
              ALLOWED_CANVAS_FIELDS.pvEdgeTypeLabelConfig,
              `pv.edgeTypes.${typeId}.labelConfig`,
              issues
            );
          }
        }
      }
    }
  }

  // Combined types from canvas + library
  const allDefinedNodeTypes = [...new Set([...canvasNodeTypes, ...libraryNodeTypes])];
  const allDefinedEdgeTypes = [...new Set([...canvasEdgeTypes, ...libraryEdgeTypes])];

  // Check nodes
  if (!Array.isArray(c.nodes)) {
    issues.push({ type: 'error', message: 'Canvas must have a "nodes" array' });
  } else {
    c.nodes.forEach((node: unknown, index: number) => {
      if (!node || typeof node !== 'object') {
        issues.push({
          type: 'error',
          message: `Node at index ${index} must be an object`,
          path: `nodes[${index}]`,
        });
        return;
      }
      const n = node as Record<string, unknown>;
      const nodePath = `nodes[${index}]`;
      const nodeLabel = n.id || index;

      // Check unknown fields on node based on type
      const nodeType = n.type as string;
      let allowedNodeFields = [...ALLOWED_CANVAS_FIELDS.nodeBase];
      if (nodeType === 'text') {
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeText];
      } else if (nodeType === 'file') {
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeFile];
      } else if (nodeType === 'link') {
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeLink];
      } else if (nodeType === 'group') {
        allowedNodeFields = [...allowedNodeFields, ...ALLOWED_CANVAS_FIELDS.nodeGroup];
      }
      // Custom types can have any base fields
      checkUnknownFields(n, allowedNodeFields, nodePath, issues);

      if (typeof n.id !== 'string' || !n.id) {
        issues.push({
          type: 'error',
          message: `Node at index ${index} must have a string "id"`,
          path: `${nodePath}.id`,
        });
      }
      if (typeof n.type !== 'string') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a string "type"`,
          path: `${nodePath}.type`,
        });
      }
      if (typeof n.x !== 'number') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a numeric "x" position`,
          path: `${nodePath}.x`,
        });
      }
      if (typeof n.y !== 'number') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a numeric "y" position`,
          path: `${nodePath}.y`,
        });
      }
      // Width and height are now REQUIRED (was warning)
      if (typeof n.width !== 'number') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a numeric "width"`,
          path: `${nodePath}.width`,
        });
      }
      if (typeof n.height !== 'number') {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" must have a numeric "height"`,
          path: `${nodePath}.height`,
        });
      }

      // Validate required fields for standard canvas types
      if (nodeType === 'text' && (typeof n.text !== 'string' || !n.text)) {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" has type "text" but is missing required "text" field`,
          path: `${nodePath}.text`,
          suggestion: 'Add a "text" field with markdown content, or change the node type',
        });
      }
      if (nodeType === 'file' && (typeof n.file !== 'string' || !n.file)) {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" has type "file" but is missing required "file" field`,
          path: `${nodePath}.file`,
          suggestion: 'Add a "file" field with a file path, or change the node type',
        });
      }
      if (nodeType === 'link' && (typeof n.url !== 'string' || !n.url)) {
        issues.push({
          type: 'error',
          message: `Node "${nodeLabel}" has type "link" but is missing required "url" field`,
          path: `${nodePath}.url`,
          suggestion: 'Add a "url" field with a URL, or change the node type',
        });
      }

      // Validate node type - must be a standard JSON Canvas type
      const isStandardType = STANDARD_CANVAS_TYPES.includes(
        nodeType as (typeof STANDARD_CANVAS_TYPES)[number]
      );

      if (!isStandardType) {
        issues.push({
          type: 'error',
          message: `Node "${n.id || index}" uses invalid type "${nodeType}"`,
          path: `nodes[${index}].type`,
          suggestion: `Use a standard JSON Canvas type (${STANDARD_CANVAS_TYPES.join(
            ', '
          )}). For custom shapes, use type: "text" with pv.shape: "${nodeType}"`,
        });
      }

      // Validate node pv extension fields
      if (n.pv && typeof n.pv === 'object') {
        const nodePv = n.pv as Record<string, unknown>;

        // Check unknown fields in node pv extension
        checkUnknownFields(nodePv, ALLOWED_CANVAS_FIELDS.nodePv, `${nodePath}.pv`, issues);

        // Validate icon name format (must be PascalCase for Lucide icons)
        validateIconName(nodePv.icon, `${nodePath}.pv.icon`, issues);

        // Check nested pv fields
        if (nodePv.states && typeof nodePv.states === 'object') {
          for (const [stateId, stateDef] of Object.entries(
            nodePv.states as Record<string, unknown>
          )) {
            if (stateDef && typeof stateDef === 'object') {
              checkUnknownFields(
                stateDef as Record<string, unknown>,
                ALLOWED_CANVAS_FIELDS.nodePvState,
                `${nodePath}.pv.states.${stateId}`,
                issues
              );
              // Validate state icon name format
              const state = stateDef as Record<string, unknown>;
              validateIconName(state.icon, `${nodePath}.pv.states.${stateId}.icon`, issues);
            }
          }
        }

        if (nodePv.dataSchema && typeof nodePv.dataSchema === 'object') {
          for (const [fieldName, fieldDef] of Object.entries(
            nodePv.dataSchema as Record<string, unknown>
          )) {
            if (fieldDef && typeof fieldDef === 'object') {
              checkUnknownFields(
                fieldDef as Record<string, unknown>,
                ALLOWED_CANVAS_FIELDS.nodePvDataSchemaField,
                `${nodePath}.pv.dataSchema.${fieldName}`,
                issues
              );
            }
          }
        }

        if (nodePv.layout && typeof nodePv.layout === 'object') {
          checkUnknownFields(
            nodePv.layout as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.nodePvLayout,
            `${nodePath}.pv.layout`,
            issues
          );
        }

        if (nodePv.otel && typeof nodePv.otel === 'object') {
          checkUnknownFields(
            nodePv.otel as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.nodePvOtel,
            `${nodePath}.pv.otel`,
            issues
          );
        }

        if (Array.isArray(nodePv.actions)) {
          nodePv.actions.forEach((action: unknown, actionIndex: number) => {
            if (action && typeof action === 'object') {
              checkUnknownFields(
                action as Record<string, unknown>,
                ALLOWED_CANVAS_FIELDS.nodePvAction,
                `${nodePath}.pv.actions[${actionIndex}]`,
                issues
              );
            }
          });
        }

        // Validate pv.nodeType references a defined nodeType
        if (typeof nodePv.nodeType === 'string' && nodePv.nodeType) {
          if (allDefinedNodeTypes.length === 0) {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" uses nodeType "${nodePv.nodeType}" but no node types are defined`,
              path: `${nodePath}.pv.nodeType`,
              suggestion: 'Define node types in canvas pv.nodeTypes or library.yaml nodeComponents',
            });
          } else if (!allDefinedNodeTypes.includes(nodePv.nodeType)) {
            // Build a helpful suggestion showing where types can be defined
            const sources: string[] = [];
            if (canvasNodeTypes.length > 0) {
              sources.push(`canvas pv.nodeTypes: ${canvasNodeTypes.join(', ')}`);
            }
            if (libraryNodeTypes.length > 0) {
              sources.push(`library.yaml nodeComponents: ${libraryNodeTypes.join(', ')}`);
            }
            const suggestion =
              sources.length > 0
                ? `Available types from ${sources.join(' | ')}`
                : 'Define node types in canvas pv.nodeTypes or library.yaml nodeComponents';

            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" uses undefined nodeType "${nodePv.nodeType}"`,
              path: `${nodePath}.pv.nodeType`,
              suggestion,
            });
          }
        }
      }
    });
  }

  // Check edges (optional but validated strictly if present)
  if (c.edges !== undefined && !Array.isArray(c.edges)) {
    issues.push({ type: 'error', message: '"edges" must be an array if present' });
  } else if (Array.isArray(c.edges)) {
    const nodeIds = new Set((c.nodes as Array<{ id: string }>)?.map((n) => n.id) || []);

    c.edges.forEach((edge: unknown, index: number) => {
      if (!edge || typeof edge !== 'object') {
        issues.push({
          type: 'error',
          message: `Edge at index ${index} must be an object`,
          path: `edges[${index}]`,
        });
        return;
      }
      const e = edge as Record<string, unknown>;
      const edgePath = `edges[${index}]`;
      const edgeLabel = e.id || index;

      // Check unknown fields on edge
      checkUnknownFields(e, ALLOWED_CANVAS_FIELDS.edge, edgePath, issues);

      if (typeof e.id !== 'string' || !e.id) {
        issues.push({
          type: 'error',
          message: `Edge at index ${index} must have a string "id"`,
          path: `${edgePath}.id`,
        });
      }
      if (typeof e.fromNode !== 'string') {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" must have a string "fromNode"`,
          path: `${edgePath}.fromNode`,
        });
      } else if (!nodeIds.has(e.fromNode)) {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" references unknown node "${e.fromNode}"`,
          path: `${edgePath}.fromNode`,
        });
      }
      if (typeof e.toNode !== 'string') {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" must have a string "toNode"`,
          path: `${edgePath}.toNode`,
        });
      } else if (!nodeIds.has(e.toNode)) {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" references unknown node "${e.toNode}"`,
          path: `${edgePath}.toNode`,
        });
      }

      // Validate fromSide and toSide are present and valid
      const VALID_SIDES = ['top', 'right', 'bottom', 'left'] as const;
      if (typeof e.fromSide !== 'string') {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" must have a "fromSide" field`,
          path: `${edgePath}.fromSide`,
          suggestion: `Specify which side of the source node the edge starts from: ${VALID_SIDES.join(
            ', '
          )}`,
        });
      } else if (!VALID_SIDES.includes(e.fromSide as (typeof VALID_SIDES)[number])) {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" has invalid fromSide "${e.fromSide}"`,
          path: `${edgePath}.fromSide`,
          suggestion: `Valid values: ${VALID_SIDES.join(', ')}`,
        });
      }
      if (typeof e.toSide !== 'string') {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" must have a "toSide" field`,
          path: `${edgePath}.toSide`,
          suggestion: `Specify which side of the target node the edge connects to: ${VALID_SIDES.join(
            ', '
          )}`,
        });
      } else if (!VALID_SIDES.includes(e.toSide as (typeof VALID_SIDES)[number])) {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" has invalid toSide "${e.toSide}"`,
          path: `${edgePath}.toSide`,
          suggestion: `Valid values: ${VALID_SIDES.join(', ')}`,
        });
      }

      // Validate pv extension is present with edgeType
      if (!e.pv || typeof e.pv !== 'object') {
        issues.push({
          type: 'error',
          message: `Edge "${edgeLabel}" must have a "pv" extension with edgeType`,
          path: `${edgePath}.pv`,
          suggestion: 'Add: "pv": { "edgeType": "your-edge-type" }',
        });
      } else {
        const edgePv = e.pv as Record<string, unknown>;
        if (typeof edgePv.edgeType !== 'string' || !edgePv.edgeType) {
          issues.push({
            type: 'error',
            message: `Edge "${edgeLabel}" must have a "pv.edgeType" field`,
            path: `${edgePath}.pv.edgeType`,
            suggestion:
              allDefinedEdgeTypes.length > 0
                ? `Available types: ${allDefinedEdgeTypes.join(', ')}`
                : 'Define edge types in canvas pv.edgeTypes or library.yaml edgeComponents',
          });
        }
      }

      // Validate edge pv extension fields
      if (e.pv && typeof e.pv === 'object') {
        const edgePv = e.pv as Record<string, unknown>;

        // Check unknown fields in edge pv extension
        checkUnknownFields(edgePv, ALLOWED_CANVAS_FIELDS.edgePv, `${edgePath}.pv`, issues);

        // Check nested edge pv fields
        if (edgePv.animation && typeof edgePv.animation === 'object') {
          checkUnknownFields(
            edgePv.animation as Record<string, unknown>,
            ALLOWED_CANVAS_FIELDS.edgePvAnimation,
            `${edgePath}.pv.animation`,
            issues
          );
        }

        if (Array.isArray(edgePv.activatedBy)) {
          edgePv.activatedBy.forEach((trigger: unknown, triggerIndex: number) => {
            if (trigger && typeof trigger === 'object') {
              checkUnknownFields(
                trigger as Record<string, unknown>,
                ALLOWED_CANVAS_FIELDS.edgePvActivatedBy,
                `${edgePath}.pv.activatedBy[${triggerIndex}]`,
                issues
              );
            }
          });
        }

        // Validate edge type references
        if (edgePv.edgeType && typeof edgePv.edgeType === 'string') {
          if (allDefinedEdgeTypes.length === 0) {
            issues.push({
              type: 'error',
              message: `Edge "${edgeLabel}" uses edgeType "${edgePv.edgeType}" but no edge types are defined`,
              path: `${edgePath}.pv.edgeType`,
              suggestion: 'Define edge types in canvas pv.edgeTypes or library.yaml edgeComponents',
            });
          } else if (!allDefinedEdgeTypes.includes(edgePv.edgeType)) {
            // Build a helpful suggestion showing where types can be defined
            const sources: string[] = [];
            if (canvasEdgeTypes.length > 0) {
              sources.push(`canvas pv.edgeTypes: ${canvasEdgeTypes.join(', ')}`);
            }
            if (libraryEdgeTypes.length > 0) {
              sources.push(`library.yaml edgeComponents: ${libraryEdgeTypes.join(', ')}`);
            }
            const suggestion =
              sources.length > 0
                ? `Available types from ${sources.join(' | ')}`
                : 'Define edge types in canvas pv.edgeTypes or library.yaml edgeComponents';

            issues.push({
              type: 'error',
              message: `Edge "${edgeLabel}" uses undefined edgeType "${edgePv.edgeType}"`,
              path: `${edgePath}.pv.edgeType`,
              suggestion,
            });
          }
        }
      }
    });
  }

  // Validate OTEL canvas naming convention
  const hasOtel = hasOtelFeatures(canvas);
  const isOtelCanvas = filePath.endsWith('.otel.canvas');

  if (hasOtel && !isOtelCanvas) {
    issues.push({
      type: 'error',
      message:
        'Canvas contains OTEL features but does not use .otel.canvas naming convention',
      suggestion:
        'Rename file to use .otel.canvas extension (e.g., "graph-name.otel.canvas")',
    });
  } else if (!hasOtel && isOtelCanvas) {
    issues.push({
      type: 'warning',
      message:
        'Canvas uses .otel.canvas naming but does not contain any OTEL features',
      suggestion:
        'Either add OTEL features (pv.otel, pv.events, pv.scope, pv.audit, resourceMatch) or rename to .canvas',
    });
  }

  return issues;
}

/**
 * Validate a single .canvas file
 */
function validateFile(filePath: string, library: LoadedLibrary | null): ValidationResult {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);

  if (!existsSync(absolutePath)) {
    return {
      file: relativePath,
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const content = readFileSync(absolutePath, 'utf8');
    const canvas = JSON.parse(content);
    const issues = validateCanvas(canvas, relativePath, library);
    const hasErrors = issues.some((i) => i.type === 'error');

    return {
      file: relativePath,
      isValid: !hasErrors,
      issues,
      canvas: hasErrors ? undefined : canvas,
    };
  } catch (error) {
    return {
      file: relativePath,
      isValid: false,
      issues: [{ type: 'error', message: `Failed to parse JSON: ${(error as Error).message}` }],
    };
  }
}

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate .canvas configuration files')
    .argument(
      '[files...]',
      'Files or glob patterns to validate (defaults to .principal-views/*.canvas)'
    )
    .option('-q, --quiet', 'Only output errors')
    .option('--json', 'Output results as JSON')
    .action(async (files: string[], options) => {
      try {
        // Default to .principal-views/*.canvas if no files specified
        const patterns = files.length > 0 ? files : ['.principal-views/*.canvas'];

        // Find all matching files
        const matchedFiles = await globby(patterns, {
          expandDirectories: false,
        });

        if (matchedFiles.length === 0) {
          if (options.json) {
            console.log(JSON.stringify({ files: [], summary: { total: 0, valid: 0, invalid: 0 } }));
          } else {
            console.log(chalk.yellow('No .canvas files found matching the specified patterns.'));
            console.log(chalk.dim(`Patterns searched: ${patterns.join(', ')}`));
            console.log(chalk.dim('\nTo create a new .principal-views folder, run: npx @principal-ai/principal-view-cli init'));
          }
          return;
        }

        // Load library from .principal-views directory (used for type validation)
        const principalViewsDir = resolve(process.cwd(), '.principal-views');
        const library = loadLibrary(principalViewsDir);

        // Validate library if present
        let libraryResult: ValidationResult | null = null;
        if (library && Object.keys(library.raw).length > 0) {
          const libraryIssues = validateLibrary(library);
          const libraryHasErrors = libraryIssues.some((i) => i.type === 'error');
          libraryResult = {
            file: relative(process.cwd(), library.path),
            isValid: !libraryHasErrors,
            issues: libraryIssues,
          };
        }

        // Validate all canvas files
        const results: ValidationResult[] = matchedFiles.map((f) => validateFile(f, library));

        // Combine results
        const allResults = libraryResult ? [libraryResult, ...results] : results;
        const validCount = allResults.filter((r) => r.isValid).length;
        const invalidCount = allResults.length - validCount;

        // Output results
        if (options.json) {
          console.log(
            JSON.stringify(
              {
                files: allResults,
                summary: { total: allResults.length, valid: validCount, invalid: invalidCount },
              },
              null,
              2
            )
          );
        } else {
          if (!options.quiet) {
            const fileCount = libraryResult
              ? `${results.length} canvas file(s) + library`
              : `${results.length} canvas file(s)`;
            console.log(chalk.bold(`\nValidating ${fileCount}...\n`));
          }

          for (const result of allResults) {
            if (result.isValid) {
              if (!options.quiet) {
                console.log(chalk.green(`✓ ${result.file}`));
                const warnings = result.issues.filter((i) => i.type === 'warning');
                if (warnings.length > 0) {
                  warnings.forEach((w) => {
                    console.log(chalk.yellow(`  ⚠ ${w.message}`));
                  });
                }
              }
            } else {
              console.log(chalk.red(`✗ ${result.file}`));
              result.issues.forEach((issue) => {
                const icon = issue.type === 'error' ? '✗' : '⚠';
                const color = issue.type === 'error' ? chalk.red : chalk.yellow;
                console.log(color(`  ${icon} ${issue.message}`));
                if (issue.suggestion) {
                  console.log(chalk.dim(`    → ${issue.suggestion}`));
                }
              });
            }
          }

          // Summary
          console.log('');
          if (invalidCount === 0) {
            console.log(chalk.green(`✓ All ${validCount} file(s) are valid`));
          } else {
            console.log(
              chalk.red(`✗ ${invalidCount} of ${allResults.length} file(s) failed validation`)
            );
            process.exit(1);
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
