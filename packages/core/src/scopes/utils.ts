/**
 * Scope utility functions
 *
 * Helpers for working with owned-scopes in both legacy (string[])
 * and new (Record<string, ScopeDefinition>) formats.
 */

import type { OwnedScopes, ScopeDefinition, ResourceAttributes } from '../types/library';

/** Default color for scopes without a defined color */
export const DEFAULT_SCOPE_COLOR = '#6B7280'; // gray-500

/** Default color for draft nodes (no scope) */
export const DRAFT_NODE_COLOR = '#9CA3AF'; // gray-400

/**
 * Normalized scope entry with name and definition
 */
export interface NormalizedScope {
  name: string;
  color: string;
  description?: string;
}

/**
 * Check if owned-scopes is in the new record format
 */
export function isRecordFormat(scopes: OwnedScopes): scopes is Record<string, ScopeDefinition> {
  return !Array.isArray(scopes) && typeof scopes === 'object';
}

/**
 * Get all scope names from owned-scopes (works with both formats)
 */
export function getScopeNames(scopes: OwnedScopes | undefined): string[] {
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes;
  return Object.keys(scopes);
}

/**
 * Get scope definition by name (returns undefined for legacy format)
 */
export function getScopeDefinition(
  scopes: OwnedScopes | undefined,
  scopeName: string
): ScopeDefinition | undefined {
  if (!scopes || Array.isArray(scopes)) return undefined;
  return scopes[scopeName];
}

/**
 * Get scope color by name
 * Returns the defined color, or default color for legacy format
 */
export function getScopeColor(scopes: OwnedScopes | undefined, scopeName: string): string {
  const definition = getScopeDefinition(scopes, scopeName);
  return definition?.color ?? DEFAULT_SCOPE_COLOR;
}

/**
 * Normalize owned-scopes to a consistent array of scope entries
 */
export function normalizeScopes(scopes: OwnedScopes | undefined): NormalizedScope[] {
  if (!scopes) return [];

  if (Array.isArray(scopes)) {
    // Legacy format - assign default color
    return scopes.map(name => ({
      name,
      color: DEFAULT_SCOPE_COLOR,
    }));
  }

  // New record format
  return Object.entries(scopes).map(([name, definition]) => ({
    name,
    color: definition.color,
    description: definition.description,
  }));
}

/**
 * Extract all scopes from a library's resources
 * Returns a map of scope name to its definition
 */
export function extractScopesFromResources(
  resources: Record<string, ResourceAttributes> | undefined
): Map<string, NormalizedScope> {
  const scopeMap = new Map<string, NormalizedScope>();

  if (!resources) return scopeMap;

  for (const [_resourceKey, attrs] of Object.entries(resources)) {
    const ownedScopes = attrs['owned-scopes'];
    const normalized = normalizeScopes(ownedScopes);

    for (const scope of normalized) {
      // Later definitions override earlier ones
      scopeMap.set(scope.name, scope);
    }

    // Also add service.name as a scope (with default color if not defined elsewhere)
    const serviceName = attrs['service.name'];
    if (serviceName && !scopeMap.has(serviceName)) {
      scopeMap.set(serviceName, {
        name: serviceName,
        color: DEFAULT_SCOPE_COLOR,
      });
    }
  }

  return scopeMap;
}

/**
 * Build a scope color map from library resources
 * Returns a simple name -> color mapping for fast lookups
 */
export function buildScopeColorMap(
  resources: Record<string, ResourceAttributes> | undefined
): Record<string, string> {
  const scopes = extractScopesFromResources(resources);
  const colorMap: Record<string, string> = {};

  for (const [name, scope] of scopes) {
    colorMap[name] = scope.color;
  }

  return colorMap;
}
