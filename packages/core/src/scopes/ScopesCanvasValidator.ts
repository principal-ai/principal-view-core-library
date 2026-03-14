/**
 * Scopes Canvas Validator
 *
 * Validates that a .scopes.canvas file exists and properly documents
 * all instrumentation scopes declared in library.yaml.
 */

import type { ExtendedCanvas, ExtendedCanvasNode } from '../types/canvas';

/**
 * Scopes canvas validation context
 */
export interface ScopesCanvasValidationContext {
  /** The scopes canvas (if found) */
  scopesCanvas?: ExtendedCanvas;

  /** Path to the scopes canvas file */
  scopesCanvasPath?: string;

  /** Owned scopes from library.yaml */
  ownedScopes: string[];

  /** Base path for resolving relative paths */
  basePath: string;
}

/**
 * Scopes canvas validation violation
 */
export interface ScopesCanvasViolation {
  /** Rule ID that detected this violation */
  ruleId: string;

  /** Severity level */
  severity: 'error' | 'warn';

  /** File path where violation occurred */
  file: string;

  /** JSON path within file (optional) */
  path?: string;

  /** Human-readable description of what's wrong */
  message: string;

  /** Why this matters */
  impact: string;

  /** How to fix it */
  suggestion: string;
}

/**
 * Scopes canvas validation result
 */
export interface ScopesCanvasValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;

  /** List of violations found */
  violations: ScopesCanvasViolation[];

  /** Summary of scopes coverage */
  coverage: {
    /** Total owned scopes from library.yaml */
    totalOwnedScopes: number;
    /** Scopes documented in canvas */
    documentedScopes: string[];
    /** Scopes missing from canvas */
    missingScopes: string[];
    /** Scopes in canvas but not in owned-scopes */
    extraScopes: string[];
  };
}

/**
 * Validates scopes canvas files
 */
export class ScopesCanvasValidator {
  /**
   * Validate a scopes canvas against library.yaml owned-scopes
   */
  async validate(context: ScopesCanvasValidationContext): Promise<ScopesCanvasValidationResult> {
    const violations: ScopesCanvasViolation[] = [];
    const { scopesCanvas, scopesCanvasPath, ownedScopes, basePath } = context;

    // Initialize coverage tracking
    const documentedScopes: string[] = [];
    const missingScopes: string[] = [];
    const extraScopes: string[] = [];

    // Check if scopes canvas exists when owned-scopes are defined
    if (ownedScopes.length > 0 && !scopesCanvas) {
      violations.push({
        ruleId: 'scopes-canvas-required',
        severity: 'error',
        file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
        message: 'Scopes canvas is required when library.yaml defines owned-scopes',
        impact: 'Cannot visualize or validate instrumentation scope boundaries',
        suggestion: `Create a scopes canvas at .principal-views/architecture.scopes.canvas with nodes for each scope:\n` +
          ownedScopes.map(s => `  - ${s}`).join('\n') +
          '\n\nEach node should have pv.nodeType: "scope" and pv.otel.scope set to the scope name.',
      });

      return {
        valid: false,
        violations,
        coverage: {
          totalOwnedScopes: ownedScopes.length,
          documentedScopes: [],
          missingScopes: [...ownedScopes],
          extraScopes: [],
        },
      };
    }

    // If no owned scopes and no canvas, that's fine
    if (ownedScopes.length === 0) {
      return {
        valid: true,
        violations,
        coverage: {
          totalOwnedScopes: 0,
          documentedScopes: [],
          missingScopes: [],
          extraScopes: [],
        },
      };
    }

    // Extract scopes from canvas nodes
    const canvasScopes = this.extractScopesFromCanvas(scopesCanvas!);
    const canvasScopeSet = new Set(canvasScopes.map(s => s.scope));
    const ownedScopeSet = new Set(ownedScopes);

    // Check which scopes are documented
    for (const scope of ownedScopes) {
      if (canvasScopeSet.has(scope)) {
        documentedScopes.push(scope);
      } else {
        missingScopes.push(scope);
      }
    }

    // Check for extra scopes not in owned-scopes
    for (const { scope, nodeId } of canvasScopes) {
      if (!ownedScopeSet.has(scope)) {
        extraScopes.push(scope);
      }
    }

    // Report missing scopes
    if (missingScopes.length > 0) {
      violations.push({
        ruleId: 'scopes-canvas-incomplete',
        severity: 'error',
        file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
        message: `Scopes canvas is missing ${missingScopes.length} scope(s) from library.yaml`,
        impact: 'These scopes are not documented in the scope boundary map',
        suggestion: `Add nodes for the following scopes:\n` +
          missingScopes.map(s => `  - ${s}: Add a node with pv.otel.scope: "${s}"`).join('\n'),
      });
    }

    // Report extra scopes (warning, not error)
    if (extraScopes.length > 0) {
      violations.push({
        ruleId: 'scopes-canvas-extra-scopes',
        severity: 'warn',
        file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
        message: `Scopes canvas contains ${extraScopes.length} scope(s) not in library.yaml owned-scopes`,
        impact: 'These scopes may be external or need to be added to library.yaml',
        suggestion: `Either:\n` +
          `  - Add these scopes to owned-scopes in library.yaml: ${extraScopes.join(', ')}\n` +
          `  - Or remove them from the scopes canvas if they are external`,
      });
    }

    // Validate scope nodes have required fields
    for (const { scope, nodeId, node } of canvasScopes) {
      // Check for description
      if (!node.pv?.description) {
        violations.push({
          ruleId: 'scopes-canvas-node-description',
          severity: 'warn',
          file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
          path: `nodes[${nodeId}]`,
          message: `Scope node "${scope}" is missing a description`,
          impact: 'Scope documentation is incomplete without a description',
          suggestion: `Add pv.description to explain what this scope covers`,
        });
      }

      // Check for nodeType
      if (node.pv?.nodeType !== 'scope') {
        violations.push({
          ruleId: 'scopes-canvas-node-type',
          severity: 'warn',
          file: scopesCanvasPath || '.principal-views/architecture.scopes.canvas',
          path: `nodes[${nodeId}]`,
          message: `Scope node "${scope}" should have nodeType: "scope"`,
          impact: 'Node may not be recognized as a scope node',
          suggestion: `Add pv.nodeType: "scope" to this node`,
        });
      }
    }

    const errors = violations.filter(v => v.severity === 'error');

    return {
      valid: errors.length === 0,
      violations,
      coverage: {
        totalOwnedScopes: ownedScopes.length,
        documentedScopes,
        missingScopes,
        extraScopes,
      },
    };
  }

  /**
   * Extract scope information from canvas nodes
   */
  private extractScopesFromCanvas(
    canvas: ExtendedCanvas
  ): Array<{ scope: string; nodeId: string; node: ExtendedCanvasNode }> {
    const scopes: Array<{ scope: string; nodeId: string; node: ExtendedCanvasNode }> = [];

    for (const node of canvas.nodes || []) {
      const scope = node.pv?.otel?.scope;
      if (scope && typeof scope === 'string') {
        scopes.push({
          scope,
          nodeId: node.id,
          node: node as ExtendedCanvasNode,
        });
      }
    }

    return scopes;
  }
}
