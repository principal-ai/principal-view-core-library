/**
 * Scopes module
 *
 * Provides utilities and validation for instrumentation scopes:
 * - Scope utilities for working with owned-scopes in both formats
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
  isRecordFormat,
  getScopeNames,
  getScopeDefinition,
  getScopeColor,
  normalizeScopes,
  extractScopesFromResources,
  buildScopeColorMap,
  type NormalizedScope,
} from './utils';
