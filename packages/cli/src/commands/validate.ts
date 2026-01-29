/**
 * Validate command - Comprehensive validation of all Principal View artifacts
 *
 * This command validates:
 * - Canvas files (.canvas, .otel.canvas)
 * - Workflow templates (.workflow.json)
 * - Execution artifacts (.otel.json)
 * - Component library (library.yaml)
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname, basename } from 'node:path';
import chalk from 'chalk';
import { globby } from 'globby';
import yaml from 'js-yaml';
import type { ExtendedCanvas, WorkflowTemplate, ExecutionData } from '@principal-ai/principal-view-core';
import { createExecutionValidator } from '@principal-ai/principal-view-core';
import { CanvasDiscovery, buildFileTreeFromDirectory, createNodeFileReader, createWorkflowValidator } from '@principal-ai/principal-view-core/node';

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  path?: string;
  suggestion?: string;
}

interface ValidationResult {
  file: string;
  fileType: 'canvas' | 'workflow' | 'execution' | 'library';
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
    'markdown',
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
    'event',
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
 * Load a workflow template file
 */
function loadWorkflowTemplate(filePath: string): WorkflowTemplate | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as WorkflowTemplate;
  } catch {
    return null;
  }
}

/**
 * Load an execution artifact file
 */
function loadExecutionFile(filePath: string): ExecutionData | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as ExecutionData;
  } catch {
    return null;
  }
}

/**
 * Determine file type based on naming convention
 */
function determineFileType(filePath: string): 'canvas' | 'workflow' | 'execution' | 'library' {
  const name = basename(filePath).toLowerCase();

  if (name.startsWith('library.')) {
    return 'library';
  }
  if (name.endsWith('.workflow.json')) {
    return 'workflow';
  }
  if (name.endsWith('.otel.json')) {
    return 'execution';
  }
  return 'canvas';
}

/**
 * Find matching canvas file for an execution artifact
 */
function findMatchingCanvas(executionPath: string, repositoryPath: string): string | null {
  const fileName = basename(executionPath);
  const dir = dirname(executionPath);

  // Extract basename by removing .otel.json extension
  const canvasBasename = fileName.replace(/\.otel\.json$/, '');

  // Determine canvas directory (go up from __executions__ to .principal-views)
  let canvasDir: string;
  if (dir.includes('.principal-views/__executions__')) {
    canvasDir = dir.replace('/__executions__', '');
  } else if (dir.endsWith('__executions__')) {
    canvasDir = resolve(dirname(dir), '.principal-views');
  } else {
    // Fallback: look in .principal-views relative to repository root
    canvasDir = resolve(repositoryPath, '.principal-views');
  }

  // Check for .otel.canvas first (preferred)
  const otelCanvasPath = resolve(canvasDir, `${canvasBasename}.otel.canvas`);
  if (existsSync(otelCanvasPath)) {
    return otelCanvasPath;
  }

  // Check for regular .canvas as fallback
  const regularCanvasPath = resolve(canvasDir, `${canvasBasename}.canvas`);
  if (existsSync(regularCanvasPath)) {
    return regularCanvasPath;
  }

  return null;
}

/**
 * Check if a canvas has OTEL-related features
 * Returns true if the canvas contains any of:
 * 1. Nodes with pv.otel extension (kind, category)
 * 2. Event schema (pv.event or pv.eventRef with validation)
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

          // Check for event schema (pv.event or pv.eventRef)
          if (nodePv.event !== undefined || nodePv.eventRef !== undefined) {
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
 * - OTEL nodes have source file references and the files exist
 */
function validateCanvas(
  canvas: unknown,
  filePath: string,
  library: LoadedLibrary | null,
  repositoryPath?: string
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

        // Check for conflict: node cannot have both event and eventRef
        if (nodePv.event !== undefined && nodePv.eventRef !== undefined) {
          issues.push({
            type: 'error',
            message: `Node "${nodeLabel}" has both "pv.event" and "pv.eventRef" - only one is allowed`,
            path: `${nodePath}.pv`,
            suggestion: 'Use "event" for inline event definition, or "eventRef" to reference a library event schema. Remove one of them.',
          });
        }

        // Check for legacy string format: event should be object or use eventRef instead
        if (nodePv.event !== undefined && typeof nodePv.event === 'string') {
          issues.push({
            type: 'error',
            message: `Node "${nodeLabel}" uses deprecated string format for "pv.event": "${nodePv.event}"`,
            path: `${nodePath}.pv.event`,
            suggestion: `Migration options:\n  1. Use "eventRef": "${nodePv.event}" to reference a library event (define in library.yaml under eventSchemas)\n  2. Use "event": { "name": "${nodePv.event}", "attributes": {} } for inline event definition`,
          });
        }

        // For .otel.canvas files: require event or eventRef field on nodes with pv extension (except groups)
        if (filePath.endsWith('.otel.canvas') && nodeType !== 'group') {
          if (nodePv.event === undefined && nodePv.eventRef === undefined) {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" in .otel.canvas file must have either "pv.event" or "pv.eventRef" field`,
              path: `${nodePath}.pv`,
              suggestion: 'Add inline event schema with "event": {...} or reference library event with "eventRef": "event.name"',
            });
          }
        }

        // Validate source file references for OTEL event nodes
        const hasOtelFeatures = nodePv.otel !== undefined || nodePv.event !== undefined || nodePv.eventRef !== undefined;
        if (hasOtelFeatures) {
          // OTEL nodes must have at least one source file reference
          if (!Array.isArray(nodePv.sources) || nodePv.sources.length === 0) {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" has OTEL features but is missing required "pv.sources" field`,
              path: `${nodePath}.pv.sources`,
              suggestion: 'Add at least one source file reference, e.g.: "sources": ["src/services/MyService.ts"]',
            });
          }

          // For .otel.canvas files: nodes with event or eventRef must have pv.otel for UI rendering
          if (filePath.endsWith('.otel.canvas') && (nodePv.event !== undefined || nodePv.eventRef !== undefined) && nodePv.otel === undefined) {
            issues.push({
              type: 'error',
              message: `Node "${nodeLabel}" in .otel.canvas file has event schema but is missing "pv.otel" field required for UI badges`,
              path: `${nodePath}.pv.otel`,
              suggestion: 'Add OTEL metadata for UI rendering, e.g.: "otel": { "kind": "event", "category": "lifecycle", "isNew": true }',
            });
          }
        }

        // Validate source file paths
        if (Array.isArray(nodePv.sources)) {
          nodePv.sources.forEach((source: unknown, sourceIndex: number) => {
            if (typeof source === 'string') {
              // Check for glob patterns
              if (/[*?[\]{}]/.test(source)) {
                issues.push({
                  type: 'error',
                  message: `Node "${nodeLabel}" has glob pattern in sources: ${source}`,
                  path: `${nodePath}.pv.sources[${sourceIndex}]`,
                  suggestion: 'Use exact file paths only. Glob patterns (*, ?, [], {}) are not supported in sources.',
                });
              }

              // Check for line number suffix (e.g., "file.ts:123")
              if (/:\d+$/.test(source)) {
                issues.push({
                  type: 'error',
                  message: `Node "${nodeLabel}" has line number suffix in sources: ${source}`,
                  path: `${nodePath}.pv.sources[${sourceIndex}]`,
                  suggestion: 'Remove line number suffix. Use exact file paths only (e.g., "src/file.ts" not "src/file.ts:123").',
                });
              }

              // Validate that source file exists (if repository path is provided)
              if (repositoryPath) {
                const fullPath = resolve(repositoryPath, source);

                if (!existsSync(fullPath)) {
                  issues.push({
                    type: 'error',
                    message: `Node "${nodeLabel}" references non-existent source file: ${source}`,
                    path: `${nodePath}.pv.sources[${sourceIndex}]`,
                    suggestion: `Verify the file path is correct relative to repository root: ${repositoryPath}`,
                  });
                }
              }
            }
          });
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

  // Validate markdown field for .otel.canvas files
  if (isOtelCanvas) {
    const pv = c.pv as Record<string, unknown> | undefined;
    if (!pv || typeof pv.markdown !== 'string' || !pv.markdown) {
      issues.push({
        type: 'error',
        message: 'OTEL canvas files must have a "pv.markdown" field pointing to documentation',
        path: 'pv.markdown',
        suggestion: `Add: "markdown": ".principal-views/graph-name.md"

The markdown file should explain the FEATURE, not the canvas itself.

Good: "Task management lets users create, edit, and archive tasks.
       Tasks move through a lifecycle from draft → active → archive..."

Bad:  "This canvas shows telemetry events. The task.create.started
       event is emitted when..."

The canvas shows HOW we instrument it. The markdown explains WHAT the feature does and WHY.

Include:
- What problem does this feature solve?
- What operations are available?
- What design choices were made and why?
- Common workflow patterns
- Error scenarios and recovery

The canvas is visual documentation. The markdown supplements it with context.`,
      });
    } else {
      // Validate that the markdown file exists (if repository path is provided)
      if (repositoryPath) {
        const markdownPath = resolve(repositoryPath, pv.markdown as string);
        if (!existsSync(markdownPath)) {
          issues.push({
            type: 'error',
            message: `Referenced markdown file does not exist: ${pv.markdown}`,
            path: 'pv.markdown',
            suggestion: `Create the markdown file at: ${markdownPath}

The markdown should explain the FEATURE (what it does, why it exists), not describe the canvas itself.
The canvas shows HOW we instrument it. The markdown explains WHAT the feature does and WHY.

Example structure:
- What problem does this feature solve?
- What operations are available?
- What design choices were made and why?
- Common workflow patterns
- Error scenarios and recovery`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validate a workflow template
 */
async function validateWorkflow(
  filePath: string,
  allWorkflowEvents: Set<string> | undefined,
  repositoryPath: string
): Promise<ValidationResult> {
  const relativePath = relative(repositoryPath, filePath);

  if (!existsSync(filePath)) {
    return {
      file: relativePath,
      fileType: 'workflow',
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const workflow = loadWorkflowTemplate(filePath);
    if (!workflow) {
      return {
        file: relativePath,
        fileType: 'workflow',
        isValid: false,
        issues: [{ type: 'error', message: 'Could not parse workflow file' }],
      };
    }

    // Load referenced canvas if it exists
    const canvasPath = workflow.canvas
      ? resolve(dirname(filePath), workflow.canvas)
      : undefined;
    const canvas = canvasPath && existsSync(canvasPath)
      ? JSON.parse(readFileSync(canvasPath, 'utf8')) as ExtendedCanvas
      : undefined;

    // Validate using workflow validator
    const validator = createWorkflowValidator();
    const rawContent = readFileSync(filePath, 'utf8');

    const result = await validator.validate({
      workflow,
      workflowPath: relativePath,
      canvas,
      canvasPath: canvasPath ? relative(repositoryPath, canvasPath) : undefined,
      basePath: dirname(filePath),
      rawContent,
      allWorkflowEvents,
    });

    // Convert workflow violations to validation issues
    const issues: ValidationIssue[] = result.violations.map(v => ({
      type: v.severity === 'error' ? 'error' : 'warning',
      message: v.message,
      path: v.path,
      suggestion: v.suggestion,
    }));

    return {
      file: relativePath,
      fileType: 'workflow',
      isValid: result.errorCount === 0,
      issues,
    };
  } catch (error) {
    return {
      file: relativePath,
      fileType: 'workflow',
      isValid: false,
      issues: [{ type: 'error', message: `Failed to validate: ${(error as Error).message}` }],
    };
  }
}

/**
 * Validate an execution artifact
 */
function validateExecution(
  filePath: string,
  repositoryPath: string
): ValidationResult {
  const relativePath = relative(repositoryPath, filePath);

  if (!existsSync(filePath)) {
    return {
      file: relativePath,
      fileType: 'execution',
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const data = loadExecutionFile(filePath);
    if (!data) {
      return {
        file: relativePath,
        fileType: 'execution',
        isValid: false,
        issues: [{ type: 'error', message: 'Could not parse execution file' }],
      };
    }

    // Validate using execution validator
    const validator = createExecutionValidator();
    const result = validator.validate(data, relativePath);

    // Check if matching canvas exists
    const matchingCanvas = findMatchingCanvas(filePath, repositoryPath);
    if (!matchingCanvas) {
      const fileName = basename(filePath);
      const canvasBasename = fileName.replace(/\.otel\.json$/, '');
      result.errors.push({
        path: relativePath,
        message: 'No matching canvas file found for execution artifact',
        severity: 'error',
        suggestion: `Create a canvas file named '${canvasBasename}.otel.canvas' in .principal-views/ directory`,
      });
      result.valid = false;
    }

    // Convert execution validation result to validation issues
    const issues: ValidationIssue[] = [
      ...result.errors.map(e => ({
        type: 'error' as const,
        message: e.message,
        path: e.path,
        suggestion: e.suggestion,
      })),
      ...result.warnings.map(w => ({
        type: 'warning' as const,
        message: w.message,
        path: w.path,
        suggestion: w.suggestion,
      })),
    ];

    return {
      file: relativePath,
      fileType: 'execution',
      isValid: result.valid,
      issues,
    };
  } catch (error) {
    return {
      file: relativePath,
      fileType: 'execution',
      isValid: false,
      issues: [{ type: 'error', message: `Failed to validate: ${(error as Error).message}` }],
    };
  }
}

/**
 * Validate a single .canvas file
 */
function validateFile(
  filePath: string,
  library: LoadedLibrary | null,
  repositoryPath?: string
): ValidationResult {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);

  if (!existsSync(absolutePath)) {
    return {
      file: relativePath,
      fileType: 'canvas',
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const content = readFileSync(absolutePath, 'utf8');
    const canvas = JSON.parse(content);
    const issues = validateCanvas(canvas, relativePath, library, repositoryPath);
    const hasErrors = issues.some((i) => i.type === 'error');

    return {
      file: relativePath,
      fileType: 'canvas',
      isValid: !hasErrors,
      issues,
      canvas: hasErrors ? undefined : canvas,
    };
  } catch (error) {
    return {
      file: relativePath,
      fileType: 'canvas',
      isValid: false,
      issues: [{ type: 'error', message: `Failed to parse JSON: ${(error as Error).message}` }],
    };
  }
}

/**
 * Output validation results, organized by file type
 */
function outputResults(
  results: ValidationResult[],
  libraryResult: ValidationResult | null,
  options: { json?: boolean; quiet?: boolean }
) {
  const allResults = libraryResult ? [libraryResult, ...results] : results;
  const validCount = allResults.filter((r) => r.isValid).length;
  const invalidCount = allResults.length - validCount;

  // Group by file type
  const byType = {
    canvas: allResults.filter(r => r.fileType === 'canvas'),
    workflow: allResults.filter(r => r.fileType === 'workflow'),
    execution: allResults.filter(r => r.fileType === 'execution'),
    library: allResults.filter(r => r.fileType === 'library'),
  };

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          files: allResults,
          summary: {
            total: allResults.length,
            valid: validCount,
            invalid: invalidCount,
            byType: {
              canvas: byType.canvas.length,
              workflow: byType.workflow.length,
              execution: byType.execution.length,
              library: byType.library.length,
            },
          },
        },
        null,
        2
      )
    );
  } else {
    if (!options.quiet) {
      const counts = [];
      if (byType.canvas.length > 0) counts.push(`${byType.canvas.length} canvas`);
      if (byType.workflow.length > 0) counts.push(`${byType.workflow.length} workflow`);
      if (byType.execution.length > 0) counts.push(`${byType.execution.length} execution`);
      if (byType.library.length > 0) counts.push(`${byType.library.length} library`);

      console.log(chalk.bold(`\nValidating ${counts.join(', ')} file(s)...\n`));
    }

    // Output by type for better organization
    const outputByType = (type: string, results: ValidationResult[]) => {
      if (results.length === 0) return;

      if (!options.quiet) {
        console.log(chalk.bold(`${type.charAt(0).toUpperCase() + type.slice(1)} Files:`));
      }

      for (const result of results) {
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
      if (!options.quiet) console.log('');
    };

    // Output in logical order
    outputByType('Library', byType.library);
    outputByType('Canvas', byType.canvas);
    outputByType('Workflow', byType.workflow);
    outputByType('Execution', byType.execution);

    // Summary
    if (invalidCount === 0) {
      console.log(chalk.green(`✓ All ${validCount} file(s) are valid`));
    } else {
      console.log(
        chalk.red(`✗ ${invalidCount} of ${allResults.length} file(s) failed validation`)
      );
    }
  }

  // Exit with error if validation failed
  if (invalidCount > 0) {
    process.exit(1);
  }
}

export function createValidateCommand(): Command {
  const command = new Command('validate');

  command
    .description('Validate all Principal View artifacts (canvas, workflow, execution files)')
    .argument(
      '[files...]',
      'Files or glob patterns to validate (defaults to all Principal View files)'
    )
    .option('-q, --quiet', 'Only output errors')
    .option('--json', 'Output results as JSON')
    .option(
      '-r, --repository <path>',
      'Repository root path for validating source file references (defaults to current directory)'
    )
    .option('--canvas-only', 'Only validate canvas files')
    .option('--workflow-only', 'Only validate workflow files')
    .option('--execution-only', 'Only validate execution files')
    .action(async (files: string[], options) => {
      try {
        // Determine repository path for source file validation
        const repositoryPath = options.repository
          ? resolve(options.repository)
          : process.cwd();

        // If specific files are provided, fall back to legacy glob-based validation
        if (files.length > 0) {
          const matchedFiles = await globby(files, {
            expandDirectories: false,
          });

          if (matchedFiles.length === 0) {
            if (options.json) {
              console.log(JSON.stringify({ files: [], summary: { total: 0, valid: 0, invalid: 0 } }));
            } else {
              console.log(chalk.yellow('No .canvas files found matching the specified patterns.'));
              console.log(chalk.dim(`Patterns searched: ${files.join(', ')}`));
            }
            return;
          }

          const library = loadLibrary(resolve(repositoryPath, '.principal-views'));
          const results: ValidationResult[] = matchedFiles.map((f) =>
            validateFile(f, library, repositoryPath)
          );

          return outputResults(results, null, options);
        }

        // Determine which file types to validate
        const validateCanvases = !options.workflowOnly && !options.executionOnly;
        const validateWorkflows = !options.canvasOnly && !options.executionOnly;
        const validateExecutions = !options.canvasOnly && !options.workflowOnly;

        // Use CanvasDiscovery to find all canvases (including storyboards)
        const fileTree = await buildFileTreeFromDirectory(repositoryPath);
        const discovery = new CanvasDiscovery();
        const discoveryResult = await discovery.discover(fileTree, {
          fileReader: createNodeFileReader(repositoryPath),
          includeContent: true,
        });

        // Find workflows and executions using glob
        const workflowFiles = validateWorkflows
          ? await globby([
              '.principal-views/**/*.workflow.json',
              '**/*.workflow.json',
            ], {
              cwd: repositoryPath,
              ignore: ['**/node_modules/**'],
            })
          : [];

        const executionFiles = validateExecutions
          ? await globby([
              '**/__executions__/*.otel.json',
              '.principal-views/__executions__/*.otel.json',
            ], {
              cwd: repositoryPath,
              ignore: ['**/node_modules/**'],
            })
          : [];

        // Check if any files were found (only count OTEL canvas files)
        const otelCanvasCount = discoveryResult.canvases.filter(c => c.type === 'otel').length;
        const totalFiles = otelCanvasCount + workflowFiles.length + executionFiles.length;
        if (totalFiles === 0) {
          if (options.json) {
            console.log(JSON.stringify({
              files: [],
              discoveryErrors: discoveryResult.errors,
              summary: { total: 0, valid: 0, invalid: 0, byType: { canvas: 0, workflow: 0, execution: 0, library: 0 } }
            }));
          } else {
            console.log(chalk.yellow('No Principal View files found.'));
            if (discoveryResult.errors.length > 0) {
              console.log(chalk.red('\nDiscovery errors:'));
              discoveryResult.errors.forEach(err => {
                console.log(chalk.red(`  ✗ ${err.path}: ${err.error}`));
              });
            }
            console.log(chalk.dim('\nTo create a new .principal-views folder, run: npx @principal-ai/principal-view-cli init'));
          }
          return;
        }

        // Load library from .principal-views directory (used for type validation)
        const principalViewsDir = resolve(repositoryPath, '.principal-views');
        const library = loadLibrary(principalViewsDir);

        // Validate library if present
        let libraryResult: ValidationResult | null = null;
        if (library && Object.keys(library.raw).length > 0) {
          const libraryIssues = validateLibrary(library);
          const libraryHasErrors = libraryIssues.some((i) => i.type === 'error');
          libraryResult = {
            file: relative(repositoryPath, library.path),
            fileType: 'library',
            isValid: !libraryHasErrors,
            issues: libraryIssues,
          };
        }

        // Convert discovery results to validation results
        const results: ValidationResult[] = [];

        // Add discovery errors as validation failures (only for OTEL canvas files)
        for (const error of discoveryResult.errors) {
          // Find the canvas in discovery results to check its type
          const canvas = discoveryResult.canvases.find(c => c.path === error.path);
          // Skip regular canvas files
          if (canvas && canvas.type !== 'otel') {
            continue;
          }
          // Also skip if path doesn't look like a canvas file at all
          if (!error.path.endsWith('.canvas') && !error.path.endsWith('.otel.canvas')) {
            continue;
          }

          results.push({
            file: error.path,
            fileType: 'canvas',
            isValid: false,
            issues: [{
              type: 'error',
              message: error.error,
              path: error.path,
            }],
          });
        }

        // Add discovery warnings (only for OTEL canvas files)
        for (const warning of discoveryResult.warnings) {
          // Find the canvas in discovery results to check its type
          const canvas = discoveryResult.canvases.find(c => c.path === warning.path);
          // Skip regular canvas files
          if (canvas && canvas.type !== 'otel') {
            continue;
          }
          // Also skip if path doesn't look like a canvas file at all
          if (!warning.path.endsWith('.canvas') && !warning.path.endsWith('.otel.canvas')) {
            continue;
          }

          // Find existing result for this path or create new one
          let result = results.find(r => r.file === warning.path);
          if (!result) {
            result = {
              file: warning.path,
              fileType: 'canvas',
              isValid: true,
              issues: [],
            };
            results.push(result);
          }
          result.issues.push({
            type: 'warning',
            message: warning.message,
            path: warning.path,
          });
        }

        // PHASE 1: Group workflows by canvas and collect all events used
        const workflowsByCanvas = new Map<string, Set<string>>();

        for (const workflowFile of workflowFiles) {
          const absolutePath = resolve(repositoryPath, workflowFile);
          const workflow = loadWorkflowTemplate(absolutePath);
          if (!workflow || !workflow.canvas) continue;

          const canvasPath = resolve(dirname(absolutePath), workflow.canvas);
          const canvasKey = relative(repositoryPath, canvasPath);

          // Collect events from this workflow
          if (!workflowsByCanvas.has(canvasKey)) {
            workflowsByCanvas.set(canvasKey, new Set<string>());
          }
          const workflowEvents = workflowsByCanvas.get(canvasKey)!;

          for (const scenario of workflow.scenarios) {
            if (scenario.condition?.requires) {
              for (const eventPattern of scenario.condition.requires) {
                if (!eventPattern.includes('*')) {
                  workflowEvents.add(eventPattern);
                }
              }
            }
            if (scenario.template?.events) {
              for (const eventName of Object.keys(scenario.template.events)) {
                if (!eventName.includes('*')) {
                  workflowEvents.add(eventName);
                }
              }
            }
          }
        }

        // PHASE 2: Validate canvases (only OTEL canvas files)
        if (validateCanvases) {
          for (const canvas of discoveryResult.canvases) {
            // Skip regular canvas files - we only validate OTEL canvas files
            if (canvas.type !== 'otel') {
              continue;
            }

            // Check if we already have a result for this canvas (from discovery errors)
            const existingResult = results.find(r => r.file === canvas.path);
            if (existingResult) {
              // Already has errors/warnings, skip validation
              continue;
            }

            const validationResult = validateFile(canvas.path, library, repositoryPath);
            results.push(validationResult);
          }
        }

        // PHASE 3: Validate workflows with canvas-wide event knowledge
        if (validateWorkflows) {
          for (const workflowFile of workflowFiles) {
            const absolutePath = resolve(repositoryPath, workflowFile);
            const workflow = loadWorkflowTemplate(absolutePath);
            if (!workflow) continue;

            const canvasPath = workflow.canvas
              ? resolve(dirname(absolutePath), workflow.canvas)
              : undefined;
            const canvasKey = canvasPath ? relative(repositoryPath, canvasPath) : undefined;
            const allWorkflowEvents = canvasKey ? workflowsByCanvas.get(canvasKey) : undefined;

            const validationResult = await validateWorkflow(
              absolutePath,
              allWorkflowEvents,
              repositoryPath
            );
            results.push(validationResult);
          }
        }

        // PHASE 4: Validate execution artifacts
        if (validateExecutions) {
          for (const executionFile of executionFiles) {
            const absolutePath = resolve(repositoryPath, executionFile);
            const validationResult = validateExecution(absolutePath, repositoryPath);
            results.push(validationResult);
          }
        }

        // Output results using helper function
        outputResults(results, libraryResult, options);
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
