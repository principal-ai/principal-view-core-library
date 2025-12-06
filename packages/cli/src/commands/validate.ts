/**
 * Validate command - Validate .canvas configuration files
 */

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import chalk from 'chalk';
import { globby } from 'globby';
import type { ExtendedCanvas } from '@principal-ai/visual-validation-core';

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
 * Standard JSON Canvas node types that don't require vv metadata
 */
const STANDARD_CANVAS_TYPES = ['text', 'group', 'file', 'link'] as const;

/**
 * Valid node shapes for vv.shape
 */
const VALID_NODE_SHAPES = ['circle', 'rectangle', 'hexagon', 'diamond', 'custom'] as const;

/**
 * Validate an ExtendedCanvas object with strict validation
 *
 * Strict validation ensures:
 * - All required fields are present
 * - Custom node types have proper vv metadata
 * - Edge types reference defined types in vv.edgeTypes
 * - Canvas has vv extension with name and version
 */
function validateCanvas(canvas: unknown, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!canvas || typeof canvas !== 'object') {
    issues.push({ type: 'error', message: 'Canvas must be an object' });
    return issues;
  }

  const c = canvas as Record<string, unknown>;

  // Check vv extension (REQUIRED for strict validation)
  let definedEdgeTypes: string[] = [];
  if (c.vv === undefined) {
    issues.push({
      type: 'error',
      message: 'Canvas must have a "vv" extension with name and version',
      path: 'vv',
      suggestion: 'Add: "vv": { "name": "My Graph", "version": "1.0.0" }',
    });
  } else if (typeof c.vv !== 'object') {
    issues.push({ type: 'error', message: '"vv" extension must be an object' });
  } else {
    const vv = c.vv as Record<string, unknown>;
    if (typeof vv.version !== 'string' || !vv.version) {
      issues.push({
        type: 'error',
        message: 'vv.version is required',
        path: 'vv.version',
        suggestion: 'Add: "version": "1.0.0"',
      });
    }
    if (typeof vv.name !== 'string' || !vv.name) {
      issues.push({
        type: 'error',
        message: 'vv.name is required',
        path: 'vv.name',
        suggestion: 'Add: "name": "My Graph"',
      });
    }
    // Collect defined edge types for later validation
    if (vv.edgeTypes && typeof vv.edgeTypes === 'object') {
      definedEdgeTypes = Object.keys(vv.edgeTypes as Record<string, unknown>);
    }
  }

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

      // Validate node type - must be standard canvas type OR have vv metadata
      const nodeType = n.type as string;
      const isStandardType = STANDARD_CANVAS_TYPES.includes(nodeType as typeof STANDARD_CANVAS_TYPES[number]);

      if (!isStandardType) {
        // Custom type - must have vv.nodeType with shape
        if (!n.vv || typeof n.vv !== 'object') {
          issues.push({
            type: 'error',
            message: `Node "${n.id || index}" uses custom type "${nodeType}" but has no "vv" extension`,
            path: `nodes[${index}].vv`,
            suggestion: `Use a standard type (${STANDARD_CANVAS_TYPES.join(', ')}) or add vv.nodeType and vv.shape`,
          });
        } else {
          const nodeVv = n.vv as Record<string, unknown>;
          if (typeof nodeVv.nodeType !== 'string' || !nodeVv.nodeType) {
            issues.push({
              type: 'error',
              message: `Node "${n.id || index}" with custom type must have "vv.nodeType"`,
              path: `nodes[${index}].vv.nodeType`,
            });
          }
          if (typeof nodeVv.shape !== 'string' || !VALID_NODE_SHAPES.includes(nodeVv.shape as typeof VALID_NODE_SHAPES[number])) {
            issues.push({
              type: 'error',
              message: `Node "${n.id || index}" must have a valid "vv.shape"`,
              path: `nodes[${index}].vv.shape`,
              suggestion: `Valid shapes: ${VALID_NODE_SHAPES.join(', ')}`,
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

      // Validate edge type if vv.edgeType is specified
      if (e.vv && typeof e.vv === 'object') {
        const edgeVv = e.vv as Record<string, unknown>;
        if (edgeVv.edgeType && typeof edgeVv.edgeType === 'string') {
          if (definedEdgeTypes.length === 0) {
            issues.push({
              type: 'error',
              message: `Edge "${e.id || index}" uses edgeType "${edgeVv.edgeType}" but no edge types are defined in vv.edgeTypes`,
              path: `edges[${index}].vv.edgeType`,
              suggestion: 'Define edge types in the canvas vv.edgeTypes object',
            });
          } else if (!definedEdgeTypes.includes(edgeVv.edgeType)) {
            issues.push({
              type: 'error',
              message: `Edge "${e.id || index}" uses undefined edgeType "${edgeVv.edgeType}"`,
              path: `edges[${index}].vv.edgeType`,
              suggestion: `Defined types: ${definedEdgeTypes.join(', ')}`,
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
function validateFile(filePath: string): ValidationResult {
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
    const issues = validateCanvas(canvas, relativePath);
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
    .argument('[files...]', 'Files or glob patterns to validate (defaults to .vgc/*.canvas)')
    .option('-q, --quiet', 'Only output errors')
    .option('--json', 'Output results as JSON')
    .action(async (files: string[], options) => {
      try {
        // Default to .vgc/*.canvas if no files specified
        const patterns = files.length > 0 ? files : ['.vgc/*.canvas'];

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
            console.log(chalk.dim('\nTo create a new .vgc folder, run: vv init'));
          }
          return;
        }

        // Validate all files
        const results: ValidationResult[] = matchedFiles.map(validateFile);
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
