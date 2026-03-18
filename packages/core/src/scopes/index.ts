/**
 * Scopes module
 *
 * Provides utilities and validation for instrumentation scopes:
 * - Scope utilities for working with top-level scopes and owned-scopes references
 * - Validation for .scopes.canvas files that document scope boundaries
 */

export {
  ScopesCanvasValidator,
  type ScopesCanvasValidationContext,
  type ScopesCanvasValidationResult,
  type ScopesCanvasViolation,
} from './ScopesCanvasValidator';

export {
  DEFAULT_SCOPE_COLOR,
  DRAFT_NODE_COLOR,
  getScopeNames,
  getScopeDefinition,
  getScopeColor,
  normalizeScopes,
  buildScopeColorMap,
  getAllScopeNames,
  type NormalizedScope,
} from './utils';
