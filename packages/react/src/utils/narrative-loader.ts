/**
 * Utilities for loading and managing narrative templates
 */

import type { NarrativeTemplate } from '@principal-ai/principal-view-core/browser';

/**
 * Load a narrative template from a URL or file path
 *
 * Note: In most cases, you should import templates directly:
 *   import template from './my-template.narrative.json';
 *
 * This function is useful when you need to dynamically load templates.
 *
 * @param path - Path to the narrative template JSON file
 * @returns Promise resolving to the narrative template, or null if not found
 */
export async function loadNarrativeTemplate(path: string): Promise<NarrativeTemplate | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      console.warn(`Narrative template not found: ${path}`);
      return null;
    }
    const template = await response.json();
    return template as NarrativeTemplate;
  } catch (error) {
    console.warn(`Failed to load narrative template from ${path}:`, error);
    return null;
  }
}

/**
 * Auto-discover narrative template for a given canvas path
 *
 * Example:
 *   Canvas: "/path/to/graph-converter.otel.canvas"
 *   Narrative: "/path/to/graph-converter.narrative.json"
 *
 * @param canvasPath - Path to the .otel.canvas file
 * @returns Promise resolving to the narrative template, or null if not found
 */
export async function discoverNarrativeTemplate(canvasPath: string): Promise<NarrativeTemplate | null> {
  const narrativePath = canvasPath.replace('.otel.canvas', '.narrative.json');
  return loadNarrativeTemplate(narrativePath);
}

/**
 * Validate a narrative template has required fields
 *
 * @param template - Template to validate
 * @returns True if valid, false otherwise
 */
export function validateNarrativeTemplate(template: unknown): template is NarrativeTemplate {
  if (!template || typeof template !== 'object') {
    return false;
  }

  const t = template as Partial<NarrativeTemplate>;

  // Check required fields
  if (!t.version || !t.canvas || !t.name || !t.mode || !t.scenarioSelection || !t.scenarios) {
    return false;
  }

  // Check scenarios array
  if (!Array.isArray(t.scenarios) || t.scenarios.length === 0) {
    return false;
  }

  // Check each scenario has required fields
  for (const scenario of t.scenarios) {
    if (!scenario.id || !scenario.priority || !scenario.condition || !scenario.template) {
      return false;
    }
  }

  return true;
}

/**
 * Get a user-friendly error message for invalid templates
 *
 * @param template - Template to check
 * @returns Error message, or null if valid
 */
export function getNarrativeTemplateError(template: unknown): string | null {
  if (!template || typeof template !== 'object') {
    return 'Template must be a valid JSON object';
  }

  const t = template as Partial<NarrativeTemplate>;

  if (!t.version) return 'Missing required field: version';
  if (!t.canvas) return 'Missing required field: canvas';
  if (!t.name) return 'Missing required field: name';
  if (!t.mode) return 'Missing required field: mode';
  if (!t.scenarioSelection) return 'Missing required field: scenarioSelection';
  if (!t.scenarios) return 'Missing required field: scenarios';

  if (!Array.isArray(t.scenarios)) {
    return 'Field "scenarios" must be an array';
  }

  if (t.scenarios.length === 0) {
    return 'Template must have at least one scenario';
  }

  for (let i = 0; i < t.scenarios.length; i++) {
    const scenario = t.scenarios[i];
    if (!scenario.id) return `Scenario ${i}: missing required field "id"`;
    if (scenario.priority === undefined) return `Scenario ${i}: missing required field "priority"`;
    if (!scenario.condition) return `Scenario ${i}: missing required field "condition"`;
    if (!scenario.template) return `Scenario ${i}: missing required field "template"`;
  }

  return null;
}

/**
 * React hook for loading narrative templates
 *
 * @param templatePath - Path to template, or null to skip loading
 * @returns {template, loading, error}
 */
export function useNarrativeTemplate(templatePath: string | null) {
  const [template, setTemplate] = React.useState<NarrativeTemplate | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!templatePath) {
      setTemplate(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    loadNarrativeTemplate(templatePath)
      .then((loadedTemplate) => {
        if (loadedTemplate) {
          const validationError = getNarrativeTemplateError(loadedTemplate);
          if (validationError) {
            setError(validationError);
            setTemplate(null);
          } else {
            setTemplate(loadedTemplate);
            setError(null);
          }
        } else {
          setError('Template not found');
          setTemplate(null);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setTemplate(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [templatePath]);

  return { template, loading, error };
}

// Note: React import is expected to be available in the React package
// If this causes issues, we can remove the hook and export it separately
import React from 'react';
