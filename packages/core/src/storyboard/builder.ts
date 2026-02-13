/**
 * Storyboard Context Builder
 *
 * Utilities for building StoryboardContextSliceData from canvas and workflow artifacts.
 * Used by hosts to create the context slice for panels like File City.
 */

import type { ExtendedCanvas, ExtendedCanvasNode } from '../types/canvas';
import type { WorkflowTemplate, WorkflowScenario } from '../workflow/types';
import type {
  StoryboardReference,
  WorkflowReference,
  ScenarioReference,
  StoryboardContextSliceData,
} from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Map of event name to canvas node IDs that emit that event.
 */
export type EventNodeMap = Map<string, string[]>;

/**
 * Options for building storyboard context.
 */
export interface BuildStoryboardContextOptions {
  /** The parsed canvas content */
  canvas: ExtendedCanvas;

  /** Storyboard metadata (id, name, path) */
  storyboard: StoryboardReference;

  /** Optional: Selected workflow template and its path */
  workflow?: {
    template: WorkflowTemplate;
    path: string;
  };

  /** Optional: Selected scenario within the workflow */
  scenario?: WorkflowScenario;

  /** Optional: Additional supporting files to include */
  additionalSupportingFiles?: string[];
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Build a map of canvas node ID to source file paths.
 * Extracts `pv.sources` from each node in the canvas.
 *
 * @param canvas - The extended canvas with nodes
 * @returns Record mapping node IDs to their source file paths
 *
 * @example
 * ```typescript
 * const nodeSources = buildNodeSourcesMap(canvas);
 * // { 'node-abc': ['src/auth/login.ts'], 'node-xyz': ['src/api/fetch.ts'] }
 * ```
 */
export function buildNodeSourcesMap(canvas: ExtendedCanvas): Record<string, string[]> {
  const nodeSources: Record<string, string[]> = {};

  if (!canvas.nodes) {
    return nodeSources;
  }

  for (const node of canvas.nodes) {
    if (node.pv?.sources && node.pv.sources.length > 0) {
      nodeSources[node.id] = [...node.pv.sources];
    }
  }

  return nodeSources;
}

/**
 * Build a map of event name to canvas node IDs.
 * Uses `pv.event.name` or `pv.eventRef` from each node.
 *
 * @param canvas - The extended canvas with nodes
 * @returns Map of event names to node IDs that emit those events
 *
 * @example
 * ```typescript
 * const eventMap = buildEventNodeMap(canvas);
 * // Map { 'auth.login' => ['node-abc'], 'api.fetch' => ['node-xyz', 'node-def'] }
 * ```
 */
export function buildEventNodeMap(canvas: ExtendedCanvas): EventNodeMap {
  const eventMap: EventNodeMap = new Map();

  if (!canvas.nodes) {
    return eventMap;
  }

  for (const node of canvas.nodes) {
    const eventName = getNodeEventName(node);
    if (eventName) {
      const existing = eventMap.get(eventName) || [];
      existing.push(node.id);
      eventMap.set(eventName, existing);
    }
  }

  return eventMap;
}

/**
 * Get the event name from a canvas node.
 * Checks `pv.event.name` first, then falls back to `pv.eventRef`.
 *
 * @param node - The canvas node
 * @returns Event name or undefined if node doesn't emit events
 */
export function getNodeEventName(node: ExtendedCanvasNode): string | undefined {
  return node.pv?.event?.name || node.pv?.eventRef;
}

/**
 * Resolve workflow scenario event requirements to canvas node IDs.
 *
 * Given a scenario's required events, finds which canvas nodes emit those events.
 *
 * @param canvas - The extended canvas with nodes
 * @param scenario - The workflow scenario with event requirements
 * @returns Array of canvas node IDs involved in this scenario
 *
 * @example
 * ```typescript
 * const nodeIds = resolveScenarioNodeIds(canvas, scenario);
 * // ['node-abc', 'node-xyz'] - nodes that emit events required by the scenario
 * ```
 */
export function resolveScenarioNodeIds(
  canvas: ExtendedCanvas,
  scenario: WorkflowScenario
): string[] {
  const eventMap = buildEventNodeMap(canvas);
  const nodeIds = new Set<string>();

  // Get required events from scenario template.events
  const requiredEvents = Object.keys(scenario.template?.events || {});

  for (const eventPattern of requiredEvents) {
    // Handle glob patterns (e.g., "*.error", "auth.*")
    const matchingNodes = findNodesMatchingEventPattern(eventMap, eventPattern);
    for (const nodeId of matchingNodes) {
      nodeIds.add(nodeId);
    }
  }

  return Array.from(nodeIds);
}

/**
 * Resolve workflow template to canvas node IDs.
 *
 * Returns all unique node IDs that are involved in any scenario of the workflow.
 *
 * @param canvas - The extended canvas with nodes
 * @param workflow - The workflow template with scenarios
 * @returns Array of canvas node IDs involved in this workflow
 */
export function resolveWorkflowNodeIds(
  canvas: ExtendedCanvas,
  workflow: WorkflowTemplate
): string[] {
  const nodeIds = new Set<string>();

  for (const scenario of workflow.scenarios) {
    const scenarioNodeIds = resolveScenarioNodeIds(canvas, scenario);
    for (const nodeId of scenarioNodeIds) {
      nodeIds.add(nodeId);
    }
  }

  return Array.from(nodeIds);
}

/**
 * Find node IDs matching an event pattern (supports glob-style wildcards).
 *
 * @param eventMap - Map of event names to node IDs
 * @param pattern - Event pattern (e.g., "auth.login", "*.error", "api.*")
 * @returns Array of matching node IDs
 */
export function findNodesMatchingEventPattern(
  eventMap: EventNodeMap,
  pattern: string
): string[] {
  const matchingNodes: string[] = [];

  // Simple glob matching
  const regexPattern = pattern
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\*/g, '.*'); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`);

  for (const [eventName, nodeIds] of eventMap) {
    if (regex.test(eventName)) {
      matchingNodes.push(...nodeIds);
    }
  }

  return matchingNodes;
}

/**
 * Get all node IDs from a canvas.
 * Useful when no specific workflow/scenario is selected (widest scope).
 *
 * @param canvas - The extended canvas with nodes
 * @returns Array of all node IDs in the canvas
 */
export function getAllNodeIds(canvas: ExtendedCanvas): string[] {
  if (!canvas.nodes) {
    return [];
  }
  return canvas.nodes.map((node) => node.id);
}

// ============================================================================
// Context Builder
// ============================================================================

/**
 * Build a complete StoryboardContextSliceData from canvas and optional workflow/scenario.
 *
 * This is the main function for creating the context slice that panels consume.
 *
 * @param options - Build options with canvas, storyboard, and optional workflow/scenario
 * @returns Complete storyboard context slice data
 *
 * @example
 * ```typescript
 * // Just storyboard selected (widest scope)
 * const context = buildStoryboardContext({
 *   canvas: parsedCanvas,
 *   storyboard: { id: 'checkout-flow', name: 'Checkout Flow', path: 'canvas.otel.canvas' },
 * });
 *
 * // With workflow selected (medium scope)
 * const context = buildStoryboardContext({
 *   canvas: parsedCanvas,
 *   storyboard: { id: 'checkout-flow', name: 'Checkout Flow', path: 'canvas.otel.canvas' },
 *   workflow: { template: workflowTemplate, path: 'workflow.workflow.json' },
 * });
 *
 * // With scenario selected (narrowest scope)
 * const context = buildStoryboardContext({
 *   canvas: parsedCanvas,
 *   storyboard: { id: 'checkout-flow', name: 'Checkout Flow', path: 'canvas.otel.canvas' },
 *   workflow: { template: workflowTemplate, path: 'workflow.workflow.json' },
 *   scenario: selectedScenario,
 * });
 * ```
 */
export function buildStoryboardContext(
  options: BuildStoryboardContextOptions
): StoryboardContextSliceData {
  const { canvas, storyboard, workflow, scenario, additionalSupportingFiles = [] } = options;

  // Build node sources map from canvas
  const nodeSources = buildNodeSourcesMap(canvas);

  // Build supporting files list
  const supportingFiles: string[] = [storyboard.path];
  if (workflow) {
    supportingFiles.push(workflow.path);
  }
  // Add markdown doc if canvas has one
  if (canvas.pv?.markdown) {
    supportingFiles.push(canvas.pv.markdown);
  }
  supportingFiles.push(...additionalSupportingFiles);

  // Determine workflow reference
  let workflowReference: WorkflowReference | null = null;
  if (workflow) {
    const workflowNodeIds = resolveWorkflowNodeIds(canvas, workflow.template);
    workflowReference = {
      id: `${storyboard.id}/${workflow.template.name.toLowerCase().replace(/\s+/g, '-')}`,
      name: workflow.template.name,
      path: workflow.path,
      nodeIds: workflowNodeIds,
    };
  }

  // Determine scenario reference
  let scenarioReference: ScenarioReference | null = null;
  if (scenario) {
    const scenarioNodeIds = resolveScenarioNodeIds(canvas, scenario);
    scenarioReference = {
      id: scenario.id,
      name: scenario.description,
      nodeIds: scenarioNodeIds,
    };
  }

  return {
    storyboard,
    workflow: workflowReference,
    scenario: scenarioReference,
    nodeSources,
    supportingFiles,
  };
}
