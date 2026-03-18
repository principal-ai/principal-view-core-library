/**
 * Scope utility functions
 *
 * Helpers for working with scopes defined in the top-level `scopes` section
 * and referenced by resources via `owned-scopes`.
 */

import type { OwnedScopes, ScopeDefinition } from '../types/library';

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
  /** Icon identifier (Lucide icons) */
  icon?: string;
  description?: string;
  /** Whether this scope is defined externally (in another library) */
  external?: boolean;
}

/**
 * Get all scope names from owned-scopes array
 */
export function getScopeNames(scopes: OwnedScopes | undefined): string[] {
  return scopes ?? [];
}

/**
 * Get scope definition by name from library scopes
 */
export function getScopeDefinition(
  libraryScopes: Record<string, ScopeDefinition> | undefined,
  scopeName: string
): ScopeDefinition | undefined {
  return libraryScopes?.[scopeName];
}

/**
 * Get scope color by name from library scopes
 * Returns the defined color, or default color if not found
 */
export function getScopeColor(
  libraryScopes: Record<string, ScopeDefinition> | undefined,
  scopeName: string
): string {
  return libraryScopes?.[scopeName]?.color ?? DEFAULT_SCOPE_COLOR;
}

/**
 * Normalize scope names to NormalizedScope array using library scope definitions
 */
export function normalizeScopes(
  scopeNames: OwnedScopes | undefined,
  libraryScopes: Record<string, ScopeDefinition> | undefined
): NormalizedScope[] {
  if (!scopeNames) return [];

  return scopeNames.map((name) => {
    const definition = libraryScopes?.[name];
    return {
      name,
      color: definition?.color ?? DEFAULT_SCOPE_COLOR,
      icon: definition?.icon,
      description: definition?.description,
      external: definition?.external,
    };
  });
}

/**
 * Get scope icon by name from library scopes
 * Returns the defined icon, or undefined if not found
 */
export function getScopeIcon(
  libraryScopes: Record<string, ScopeDefinition> | undefined,
  scopeName: string
): string | undefined {
  return libraryScopes?.[scopeName]?.icon;
}

/**
 * Build a scope color map from library scopes
 * Returns a simple name -> color mapping for fast lookups
 * External scopes (without color) use the default color
 */
export function buildScopeColorMap(
  library: { scopes?: Record<string, ScopeDefinition> } | undefined
): Record<string, string> {
  const colorMap: Record<string, string> = {};

  if (library?.scopes) {
    for (const [name, def] of Object.entries(library.scopes)) {
      colorMap[name] = def.color ?? DEFAULT_SCOPE_COLOR;
    }
  }

  return colorMap;
}

/**
 * Get all scope names defined in library
 */
export function getAllScopeNames(
  library: { scopes?: Record<string, ScopeDefinition> } | undefined
): string[] {
  if (!library?.scopes) return [];
  return Object.keys(library.scopes);
}
