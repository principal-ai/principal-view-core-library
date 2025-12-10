/**
 * Validate command - Validate .canvas configuration files
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
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
        const library = fileName.endsWith('.json')
          ? JSON.parse(content)
          : yaml.load(content);

        if (library && typeof library === 'object') {
          return {
            nodeComponents: (library as Record<string, unknown>).nodeComponents as Record<string, unknown> || {},
            edgeComponents: (library as Record<string, unknown>).edgeComponents as Record<string, unknown> || {},
          };
        }
      } catch {
        // Library exists but failed to parse - return empty to avoid false positives
        return { nodeComponents: {}, edgeComponents: {} };
      }
    }
  }
  return null;
}

/**
 * Standard JSON Canvas node types that don't require pv metadata
 */
const STANDARD_CANVAS_TYPES = ['text', 'group', 'file', 'link'] as const;

/**
 * Valid node shapes for pv.shape
 */
const VALID_NODE_SHAPES = ['circle', 'rectangle', 'hexagon', 'diamond', 'custom'] as const;

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
function validateCanvas(canvas: unknown, filePath: string, library: LoadedLibrary | null): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!canvas || typeof canvas !== 'object') {
    issues.push({ type: 'error', message: 'Canvas must be an object' });
    return issues;
  }

  const c = canvas as Record<string, unknown>;

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
    // Collect defined edge types for later validation
    if (pv.edgeTypes && typeof pv.edgeTypes === 'object') {
      canvasEdgeTypes = Object.keys(pv.edgeTypes as Record<string, unknown>);
    }
    // Collect defined node types for later validation
    if (pv.nodeTypes && typeof pv.nodeTypes === 'object') {
      canvasNodeTypes = Object.keys(pv.nodeTypes as Record<string, unknown>);
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
        issues.push({ type: 'error', message: `Node at index ${index} must be an object`, path: `nodes[${index}]` });
        return;
      }
      const n = node as Record<string, unknown>;

      if (typeof n.id !== 'string' || !n.id) {
        issues.push({ type: 'error', message: `Node at index ${index} must have a string "id"`, path: `nodes[${index}].id` });
      }
      if (typeof n.type !== 'string') {
        issues.push({ type: 'error', message: `Node "${n.id || index}" must have a string "type"`, path: `nodes[${index}].type` });
      }
      if (typeof n.x !== 'number') {
        issues.push({ type: 'error', message: `Node "${n.id || index}" must have a numeric "x" position`, path: `nodes[${index}].x` });
      }
      if (typeof n.y !== 'number') {
        issues.push({ type: 'error', message: `Node "${n.id || index}" must have a numeric "y" position`, path: `nodes[${index}].y` });
      }
      // Width and height are now REQUIRED (was warning)
      if (typeof n.width !== 'number') {
        issues.push({ type: 'error', message: `Node "${n.id || index}" must have a numeric "width"`, path: `nodes[${index}].width` });
      }
      if (typeof n.height !== 'number') {
        issues.push({ type: 'error', message: `Node "${n.id || index}" must have a numeric "height"`, path: `nodes[${index}].height` });
      }

      // Validate node type - must be standard canvas type OR have pv metadata
      const nodeType = n.type as string;
      const isStandardType = STANDARD_CANVAS_TYPES.includes(nodeType as typeof STANDARD_CANVAS_TYPES[number]);

      if (!isStandardType) {
        // Custom type - must have pv.nodeType with shape
        if (!n.pv || typeof n.pv !== 'object') {
          issues.push({
            type: 'error',
            message: `Node "${n.id || index}" uses custom type "${nodeType}" but has no "pv" extension`,
            path: `nodes[${index}].pv`,
            suggestion: `Use a standard type (${STANDARD_CANVAS_TYPES.join(', ')}) or add pv.nodeType and pv.shape`,
          });
        } else {
          const nodePv = n.pv as Record<string, unknown>;
          if (typeof nodePv.nodeType !== 'string' || !nodePv.nodeType) {
            issues.push({
              type: 'error',
              message: `Node "${n.id || index}" with custom type must have "pv.nodeType"`,
              path: `nodes[${index}].pv.nodeType`,
            });
          }
          if (typeof nodePv.shape !== 'string' || !VALID_NODE_SHAPES.includes(nodePv.shape as typeof VALID_NODE_SHAPES[number])) {
            issues.push({
              type: 'error',
              message: `Node "${n.id || index}" must have a valid "pv.shape"`,
              path: `nodes[${index}].pv.shape`,
              suggestion: `Valid shapes: ${VALID_NODE_SHAPES.join(', ')}`,
            });
          }
        }
      }

      // Validate pv.nodeType references a defined nodeType (for any node with pv.nodeType)
      if (n.pv && typeof n.pv === 'object') {
        const nodePv = n.pv as Record<string, unknown>;
        if (typeof nodePv.nodeType === 'string' && nodePv.nodeType) {
          if (allDefinedNodeTypes.length === 0) {
            issues.push({
              type: 'error',
              message: `Node "${n.id || index}" uses nodeType "${nodePv.nodeType}" but no node types are defined`,
              path: `nodes[${index}].pv.nodeType`,
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
            const suggestion = sources.length > 0
              ? `Available types from ${sources.join(' | ')}`
              : 'Define node types in canvas pv.nodeTypes or library.yaml nodeComponents';

            issues.push({
              type: 'error',
              message: `Node "${n.id || index}" uses undefined nodeType "${nodePv.nodeType}"`,
              path: `nodes[${index}].pv.nodeType`,
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
    const nodeIds = new Set((c.nodes as Array<{ id: string }>)?.map(n => n.id) || []);

    c.edges.forEach((edge: unknown, index: number) => {
      if (!edge || typeof edge !== 'object') {
        issues.push({ type: 'error', message: `Edge at index ${index} must be an object`, path: `edges[${index}]` });
        return;
      }
      const e = edge as Record<string, unknown>;

      if (typeof e.id !== 'string' || !e.id) {
        issues.push({ type: 'error', message: `Edge at index ${index} must have a string "id"`, path: `edges[${index}].id` });
      }
      if (typeof e.fromNode !== 'string') {
        issues.push({ type: 'error', message: `Edge "${e.id || index}" must have a string "fromNode"`, path: `edges[${index}].fromNode` });
      } else if (!nodeIds.has(e.fromNode)) {
        issues.push({ type: 'error', message: `Edge "${e.id || index}" references unknown node "${e.fromNode}"`, path: `edges[${index}].fromNode` });
      }
      if (typeof e.toNode !== 'string') {
        issues.push({ type: 'error', message: `Edge "${e.id || index}" must have a string "toNode"`, path: `edges[${index}].toNode` });
      } else if (!nodeIds.has(e.toNode)) {
        issues.push({ type: 'error', message: `Edge "${e.id || index}" references unknown node "${e.toNode}"`, path: `edges[${index}].toNode` });
      }

      // Validate edge type if pv.edgeType is specified
      if (e.pv && typeof e.pv === 'object') {
        const edgePv = e.pv as Record<string, unknown>;
        if (edgePv.edgeType && typeof edgePv.edgeType === 'string') {
          if (allDefinedEdgeTypes.length === 0) {
            issues.push({
              type: 'error',
              message: `Edge "${e.id || index}" uses edgeType "${edgePv.edgeType}" but no edge types are defined`,
              path: `edges[${index}].pv.edgeType`,
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
            const suggestion = sources.length > 0
              ? `Available types from ${sources.join(' | ')}`
              : 'Define edge types in canvas pv.edgeTypes or library.yaml edgeComponents';

            issues.push({
              type: 'error',
              message: `Edge "${e.id || index}" uses undefined edgeType "${edgePv.edgeType}"`,
              path: `edges[${index}].pv.edgeType`,
              suggestion,
            });
          }
        }
      }
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
    const hasErrors = issues.some(i => i.type === 'error');

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
    .argument('[files...]', 'Files or glob patterns to validate (defaults to .principal-views/*.canvas)')
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
            console.log(chalk.dim('\nTo create a new .principal-views folder, run: privu init'));
          }
          return;
        }

        // Load library from .principal-views directory (used for type validation)
        const principalViewsDir = resolve(process.cwd(), '.principal-views');
        const library = loadLibrary(principalViewsDir);

        // Validate all files
        const results: ValidationResult[] = matchedFiles.map(f => validateFile(f, library));
        const validCount = results.filter(r => r.isValid).length;
        const invalidCount = results.length - validCount;

        // Output results
        if (options.json) {
          console.log(JSON.stringify({
            files: results,
            summary: { total: results.length, valid: validCount, invalid: invalidCount },
          }, null, 2));
        } else {
          if (!options.quiet) {
            console.log(chalk.bold(`\nValidating ${results.length} canvas file(s)...\n`));
          }

          for (const result of results) {
            if (result.isValid) {
              if (!options.quiet) {
                console.log(chalk.green(`✓ ${result.file}`));
                const warnings = result.issues.filter(i => i.type === 'warning');
                if (warnings.length > 0) {
                  warnings.forEach(w => {
                    console.log(chalk.yellow(`  ⚠ ${w.message}`));
                  });
                }
              }
            } else {
              console.log(chalk.red(`✗ ${result.file}`));
              result.issues.forEach(issue => {
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
            console.log(chalk.red(`✗ ${invalidCount} of ${results.length} file(s) failed validation`));
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
