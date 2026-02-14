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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import { globby } from 'globby';
import yaml from 'js-yaml';
import type { ExtendedCanvas, WorkflowTemplate, ExecutionData } from '@principal-ai/principal-view-core';
import { createExecutionValidator } from '@principal-ai/principal-view-core';
import { CanvasDiscovery, createWorkflowValidator, EventRegistry, WorkflowValidator } from '@principal-ai/principal-view-core/node';
import type { ComponentLibrary } from '@principal-ai/principal-view-core';
import { FilesystemService, NodeFileSystemAdapter } from '@principal-ai/codebase-composition/node';

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  path?: string;
  suggestion?: string;
}

interface ValidationResult {
  file: string;
  fileType: 'canvas' | 'workflow' | 'testTrace' | 'library';
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
 * Common Lucide icons that are known to work
 * This is not exhaustive - see https://lucide.dev/icons/ for the full list
 */
const KNOWN_LUCIDE_ICONS = new Set([
  // Common UI
  'Server', 'Database', 'Cloud', 'Shield', 'Lock', 'Key',
  'Zap', 'Cpu', 'HardDrive', 'Network', 'Wifi', 'WifiOff',
  'User', 'Users', 'UserCheck', 'UserPlus', 'UserMinus',
  'File', 'Folder', 'Package', 'Box', 'Archive',
  'GitBranch', 'GitCommit', 'GitMerge', 'GitPullRequest', 'Github',
  'Circle', 'Square', 'Triangle', 'Pentagon', 'Hexagon', 'Octagon',
  'Settings', 'Wrench', 'Tool', 'Hammer', 'Cog',
  'Monitor', 'Smartphone', 'Tablet', 'Laptop',
  'Mail', 'Phone', 'MessageSquare', 'MessageCircle',
  'Calendar', 'Clock', 'Timer', 'Watch',
  'Check', 'X', 'AlertCircle', 'AlertTriangle', 'Info',
  'Plus', 'Minus', 'Edit', 'Trash', 'Copy',
  'Search', 'Filter', 'Download', 'Upload',
  'Home', 'Star', 'Heart', 'Bookmark',
  'ChevronRight', 'ChevronLeft', 'ChevronUp', 'ChevronDown',
  'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
  'Activity', 'BarChart', 'PieChart', 'TrendingUp', 'TrendingDown',
  'FileText', 'FileCode', 'FileJson', 'Image', 'Video',
  'Link', 'ExternalLink', 'Unlink',
  'Eye', 'EyeOff', 'Play', 'Pause', 'Stop', 'RefreshCw',
]);

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
      suggestion: `Use "${suggested}" instead of "${iconValue}". See https://lucide.dev/icons/ for valid icon names.`,
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
      suggestion: `Use "${suggested}" instead of "${iconValue}". See https://lucide.dev/icons/ for valid icon names.`,
    });
    return;
  }

  // Warn if icon is not in our known list (but might still be valid)
  if (!KNOWN_LUCIDE_ICONS.has(iconValue)) {
    issues.push({
      type: 'warning',
      message: `Icon "${iconValue}" is not in the list of commonly used Lucide icons`,
      path,
      suggestion: `Verify that "${iconValue}" exists at https://lucide.dev/icons/. If it does, you can ignore this warning. Common icons: Server, Database, User, File, Settings, etc.`,
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
function determineFileType(filePath: string): 'canvas' | 'workflow' | 'testTrace' | 'library' {
  const name = basename(filePath).toLowerCase();

  if (name.startsWith('library.')) {
    return 'library';
  }
  if (name.endsWith('.workflow.json')) {
    return 'workflow';
  }
  if (name.endsWith('.otel.json')) {
    return 'testTrace';
  }
  return 'canvas';
}

/**
 * Find matching canvas file for an execution artifact
 *
 * Strategy:
 * 1. Look for a co-located workflow file and use its canvas reference
 * 2. Fall back to name-based matching for legacy patterns
 */
function findMatchingCanvas(executionPath: string, repositoryPath: string): { canvasPath: string | null; workflowPath: string | null } {
  const fileName = basename(executionPath);
  const dir = dirname(executionPath);

  // Strategy 1: Look for co-located workflow file
  // In the hierarchical structure, test traces are co-located with their workflow:
  //   .principal-views/storyboard/workflow-name/
  //     ├── workflow-name.workflow.json
  //     └── test-trace.otel.json
  const workflowFiles = readdirSync(dir).filter(f => f.endsWith('.workflow.json'));
  if (workflowFiles.length > 0) {
    // Use the first workflow found (typically there's only one per directory)
    const workflowPath = resolve(dir, workflowFiles[0]);
    try {
      const workflowContent = readFileSync(workflowPath, 'utf8');
      const workflow = JSON.parse(workflowContent);

      if (workflow.canvas) {
        // Canvas paths in workflows are relative to repository root
        const canvasPath = resolve(repositoryPath, workflow.canvas);
        if (existsSync(canvasPath)) {
          return { canvasPath, workflowPath };
        }
      }
    } catch {
      // Failed to parse workflow, fall through to name-based matching
    }
  }

  // Strategy 2: Name-based matching for legacy patterns
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
    return { canvasPath: otelCanvasPath, workflowPath: null };
  }

  // Check for regular .canvas as fallback
  const regularCanvasPath = resolve(canvasDir, `${canvasBasename}.canvas`);
  if (existsSync(regularCanvasPath)) {
    return { canvasPath: regularCanvasPath, workflowPath: null };
  }

  return { canvasPath: null, workflowPath: workflowFiles.length > 0 ? resolve(dir, workflowFiles[0]) : null };
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

  // Validate markdown field for all canvas files
  const pv = c.pv as Record<string, unknown> | undefined;
  if (!pv || typeof pv.markdown !== 'string' || !pv.markdown) {
    issues.push({
      type: 'error',
      message: 'Canvas files must have a "pv.markdown" field pointing to documentation',
      path: 'pv.markdown',
      suggestion: `Add: "markdown": ".principal-views/graph-name.md"

The markdown file should explain the FEATURE, not the canvas itself.

Good: "Task management lets users create, edit, and archive tasks.
       Tasks move through a lifecycle from draft → active → archive..."

Bad:  "This canvas shows telemetry events. The task.create.started
       event is emitted when..."

The canvas shows HOW ${isOtelCanvas ? 'we instrument it' : 'it works'}. The markdown explains WHAT the feature does and WHY.

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
The canvas shows HOW ${isOtelCanvas ? 'we instrument it' : 'it works'}. The markdown explains WHAT the feature does and WHY.

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

  return issues;
}

/**
 * Validate a workflow template
 */
async function validateWorkflow(
  filePath: string,
  allWorkflowEvents: Set<string> | undefined,
  repositoryPath: string,
  executionFiles?: string[],
  eventRegistry?: EventRegistry
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
    // Canvas paths are always relative to repository root
    const canvasPath = workflow.canvas
      ? resolve(repositoryPath, workflow.canvas)
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
      canvasPath,
      basePath: repositoryPath,
      rawContent,
      allWorkflowEvents,
      executionFiles,
      eventRegistry,
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
 * Validate a test trace artifact (.otel.json file)
 */
function validateExecution(
  filePath: string,
  repositoryPath: string
): ValidationResult {
  const relativePath = relative(repositoryPath, filePath);

  if (!existsSync(filePath)) {
    return {
      file: relativePath,
      fileType: 'testTrace',
      isValid: false,
      issues: [{ type: 'error', message: `File not found: ${filePath}` }],
    };
  }

  try {
    const data = loadExecutionFile(filePath);
    if (!data) {
      return {
        file: relativePath,
        fileType: 'testTrace',
        isValid: false,
        issues: [{ type: 'error', message: 'Could not parse test trace file' }],
      };
    }

    // Validate using execution validator
    const validator = createExecutionValidator();
    const result = validator.validate(data, relativePath);

    // Check if matching canvas exists
    const { canvasPath, workflowPath } = findMatchingCanvas(filePath, repositoryPath);
    if (!canvasPath) {
      const fileName = basename(filePath);
      const traceDir = dirname(filePath);

      if (workflowPath) {
        // Workflow found but its canvas reference is invalid
        const workflowName = basename(workflowPath);
        try {
          const workflowContent = readFileSync(workflowPath, 'utf8');
          const workflow = JSON.parse(workflowContent);
          const canvasRef = workflow.canvas || '(no canvas field)';
          result.errors.push({
            path: relativePath,
            message: `Workflow '${workflowName}' references canvas that doesn't exist: ${canvasRef}`,
            severity: 'error',
            suggestion: `Check the 'canvas' field in ${relative(repositoryPath, workflowPath)} and ensure the referenced canvas file exists`,
          });
        } catch {
          result.errors.push({
            path: relativePath,
            message: `Found workflow '${workflowName}' but it could not be parsed`,
            severity: 'error',
            suggestion: `Check that ${relative(repositoryPath, workflowPath)} is valid JSON`,
          });
        }
      } else {
        // No workflow found - provide guidance on expected structure
        result.errors.push({
          path: relativePath,
          message: 'No co-located workflow file found for test trace',
          severity: 'error',
          suggestion: `Test traces should be co-located with a workflow file. Expected structure:
  ${relative(repositoryPath, traceDir)}/
    ├── <workflow-name>.workflow.json  (with 'canvas' field referencing the canvas)
    └── ${fileName}

The workflow's 'canvas' field should point to the canvas this trace validates against.`,
        });
      }
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
      fileType: 'testTrace',
      isValid: result.valid,
      issues,
    };
  } catch (error) {
    return {
      file: relativePath,
      fileType: 'testTrace',
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
    testTrace: allResults.filter(r => r.fileType === 'testTrace'),
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
              testTrace: byType.testTrace.length,
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
      if (byType.testTrace.length > 0) counts.push(`${byType.testTrace.length} test trace`);
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
    outputByType('Test Trace', byType.testTrace);

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
    .description('Validate all Principal View artifacts (canvas, workflow, test trace files)')
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
    .option('--execution-only', 'Only validate test trace files')
    .action(async (files: string[], options) => {
      try {
        // Determine repository path for source file validation
        const repositoryPath = options.repository
          ? resolve(options.repository)
          : process.cwd();

        // If specific files are provided, validate each based on its type
        if (files.length > 0) {
          const matchedFiles = await globby(files, {
            expandDirectories: false,
          });

          if (matchedFiles.length === 0) {
            if (options.json) {
              console.log(JSON.stringify({ files: [], summary: { total: 0, valid: 0, invalid: 0 } }));
            } else {
              console.log(chalk.yellow('No files found matching the specified patterns.'));
              console.log(chalk.dim(`Patterns searched: ${files.join(', ')}`));
            }
            return;
          }

          const library = loadLibrary(resolve(repositoryPath, '.principal-views'));

          // Validate each file based on its type
          const results: ValidationResult[] = [];
          for (const file of matchedFiles) {
            const fileType = determineFileType(file);
            const absolutePath = resolve(file);

            if (fileType === 'canvas') {
              results.push(validateFile(file, library, repositoryPath));
            } else if (fileType === 'workflow') {
              const result = await validateWorkflow(
                absolutePath,
                undefined, // allWorkflowEvents not available in single-file mode
                repositoryPath,
                undefined, // executionFiles not available in single-file mode
                undefined  // eventRegistry not available in single-file mode
              );
              results.push(result);
            } else if (fileType === 'testTrace') {
              results.push(validateExecution(absolutePath, repositoryPath));
            } else if (fileType === 'library') {
              if (library) {
                const libraryIssues = validateLibrary(library);
                const libraryHasErrors = libraryIssues.some((i) => i.type === 'error');
                results.push({
                  file: relative(repositoryPath, library.path),
                  fileType: 'library',
                  isValid: !libraryHasErrors,
                  issues: libraryIssues,
                });
              }
            }
          }

          return outputResults(results, null, options);
        }

        // Determine which file types to validate
        const validateCanvases = !options.workflowOnly && !options.executionOnly;
        const validateWorkflows = !options.canvasOnly && !options.executionOnly;
        const validateExecutions = !options.canvasOnly && !options.workflowOnly;

        // Use CanvasDiscovery to find all canvases (including storyboards)
        const service = new FilesystemService(new NodeFileSystemAdapter());
        const fileTree = await service.buildFileSystemTreeFromPath(repositoryPath);
        const fileReader = async (path: string) => readFile(resolve(repositoryPath, path), 'utf-8');
        const discovery = new CanvasDiscovery();
        const discoveryResult = await discovery.discover(fileTree, {
          fileReader,
          includeContent: true,
        });

        // Workflows and test traces are discovered by CanvasDiscovery
        // Extract them from the discovery result
        const workflows = validateWorkflows
          ? discoveryResult.storyboards.flatMap(sb => sb.workflows)
          : [];

        const testTraces = validateExecutions
          ? discoveryResult.testTraces
          : [];

        // Check if any files were found (only count OTEL canvas files)
        const otelCanvasCount = discoveryResult.canvases.filter(c => c.type === 'otel').length;
        const totalFiles = otelCanvasCount + workflows.length + testTraces.length;
        if (totalFiles === 0) {
          if (options.json) {
            console.log(JSON.stringify({
              files: [],
              discoveryErrors: discoveryResult.errors,
              summary: { total: 0, valid: 0, invalid: 0, byType: { canvas: 0, workflow: 0, testTrace: 0, library: 0 } }
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

        for (const discoveredWorkflow of workflows) {
          const absolutePath = resolve(repositoryPath, discoveredWorkflow.path);
          const workflow = loadWorkflowTemplate(absolutePath);
          if (!workflow || !workflow.canvas) continue;

          // Canvas paths are always relative to repository root
          const canvasPath = resolve(repositoryPath, workflow.canvas);
          const canvasKey = relative(repositoryPath, canvasPath);

          // Collect events from this workflow
          if (!workflowsByCanvas.has(canvasKey)) {
            workflowsByCanvas.set(canvasKey, new Set<string>());
          }
          const workflowEvents = workflowsByCanvas.get(canvasKey)!;

          for (const scenario of workflow.scenarios) {
            if (scenario.template?.events) {
              for (const eventName of Object.keys(scenario.template.events)) {
                if (!eventName.includes('*')) {
                  workflowEvents.add(eventName);
                }
              }
            }
          }
        }

        // PHASE 2: Validate canvases (only OTEL canvas files) and collect parsed canvases
        const parsedCanvases = new Map<string, ExtendedCanvas>();

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

            // Collect parsed canvas for EventRegistry
            if (validationResult.canvas) {
              parsedCanvases.set(canvas.path, validationResult.canvas);
            }
          }
        }

        // Build EventRegistry from library and all parsed canvases
        const componentLibrary = library?.raw as ComponentLibrary | undefined;
        const eventRegistry = EventRegistry.build(
          componentLibrary,
          parsedCanvases,
          library?.path
        );

        // PHASE 2.5: Cross-workflow validation (duplicate spanPatterns)
        if (validateWorkflows && workflows.length > 0) {
          // Collect all workflows with their templates
          const workflowsForSpanPatternValidation: Array<{
            workflow: WorkflowTemplate;
            workflowPath: string;
          }> = [];

          for (const discoveredWorkflow of workflows) {
            const absolutePath = resolve(repositoryPath, discoveredWorkflow.path);
            const workflow = loadWorkflowTemplate(absolutePath);
            if (workflow) {
              workflowsForSpanPatternValidation.push({
                workflow,
                workflowPath: discoveredWorkflow.path,
              });
            }
          }

          // Validate for duplicate spanPatterns
          const spanPatternViolations = WorkflowValidator.validateSpanPatterns(
            workflowsForSpanPatternValidation
          );

          // Add violations to results
          for (const violation of spanPatternViolations) {
            // Find or create result for this workflow file
            let result = results.find(r => r.file === violation.file);
            if (!result) {
              result = {
                file: violation.file,
                fileType: 'workflow',
                isValid: false,
                issues: [],
              };
              results.push(result);
            }

            // Add the violation as an issue
            result.issues.push({
              type: violation.severity === 'error' ? 'error' : 'warning',
              message: violation.message,
              path: violation.path,
              suggestion: violation.suggestion,
            });

            // Mark as invalid if it's an error
            if (violation.severity === 'error') {
              result.isValid = false;
            }
          }
        }

        // PHASE 3: Validate workflows with canvas-wide event knowledge
        if (validateWorkflows) {
          for (const discoveredWorkflow of workflows) {
            const absolutePath = resolve(repositoryPath, discoveredWorkflow.path);
            const workflow = loadWorkflowTemplate(absolutePath);
            if (!workflow) continue;

            // Canvas paths are always relative to repository root
            const canvasPath = workflow.canvas
              ? resolve(repositoryPath, workflow.canvas)
              : undefined;
            const canvasKey = canvasPath ? relative(repositoryPath, canvasPath) : undefined;
            const allWorkflowEvents = canvasKey ? workflowsByCanvas.get(canvasKey) : undefined;

            // Get co-located test traces for this workflow
            const executionFiles = discoveredWorkflow.testTraces.map(tt =>
              resolve(repositoryPath, tt.path)
            );

            const validationResult = await validateWorkflow(
              absolutePath,
              allWorkflowEvents,
              repositoryPath,
              executionFiles,
              eventRegistry
            );
            results.push(validationResult);
          }
        }

        // PHASE 4: Validate test trace artifacts
        if (validateExecutions) {
          for (const testTrace of testTraces) {
            const absolutePath = resolve(repositoryPath, testTrace.path);
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
