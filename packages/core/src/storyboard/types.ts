/**
 * Storyboard Context Types
 *
 * Types for representing storyboard context data that panels consume.
 * Used to communicate which storyboard/workflow/scenario is selected
 * and map nodes to their source files.
 */

// ============================================================================
// Reference Types
// ============================================================================

/**
 * Reference to a storyboard (canvas) in the storyboard context.
 * Represents the top-level selection in the storyboard hierarchy.
 */
export interface StoryboardReference {
  /** Unique storyboard identifier (e.g., "core/checkout-flow") */
  id: string;
  /** Display name (e.g., "Checkout Flow") */
  name: string;
  /** Path to the canvas file (e.g., ".principal-views/checkout-flow.otel.canvas") */
  path: string;
}

/**
 * Reference to a workflow within a storyboard.
 * Workflows define a subset of nodes from the parent canvas.
 */
export interface WorkflowReference {
  /** Unique workflow identifier (e.g., "core/checkout-flow/complete-checkout") */
  id: string;
  /** Display name (e.g., "Complete Checkout") */
  name: string;
  /** Path to the workflow file (e.g., ".principal-views/checkout-flow/complete-checkout.workflow.json") */
  path: string;
  /** Canvas node IDs involved in this workflow (resolved from event requirements) */
  nodeIds: string[];
}

/**
 * Reference to a scenario within a workflow.
 * Scenarios represent specific execution paths through a workflow.
 */
export interface ScenarioReference {
  /** Unique scenario identifier (e.g., "payment-success") */
  id: string;
  /** Display name (e.g., "Payment Success") */
  name: string;
  /** Canvas node IDs involved in this scenario (subset of workflow nodes) */
  nodeIds: string[];
}

// ============================================================================
// Slice Data Type
// ============================================================================

/**
 * Storyboard context slice data.
 *
 * Provides context about the currently selected storyboard, workflow, and scenario.
 * Used by panels (like File City) to highlight files associated with the selection.
 *
 * Hierarchy: Storyboard → Workflow → Scenario
 * - 1 Storyboard = 1 Canvas
 * - Workflows contain a subset of nodes from the canvas
 * - Scenarios contain a subset of nodes from their parent workflow
 *
 * @example
 * ```typescript
 * const storyboardContext: StoryboardContextSliceData = {
 *   storyboard: {
 *     id: 'checkout-flow',
 *     name: 'Checkout Flow',
 *     path: '.principal-views/checkout-flow.otel.canvas',
 *   },
 *   workflow: {
 *     id: 'checkout-flow/complete-checkout',
 *     name: 'Complete Checkout',
 *     path: '.principal-views/checkout-flow/complete-checkout.workflow.json',
 *     nodeIds: ['node-cart', 'node-payment', 'node-confirm'],
 *   },
 *   scenario: null,
 *   nodeSources: {
 *     'node-cart': ['src/cart/Cart.tsx', 'src/cart/cartUtils.ts'],
 *     'node-payment': ['src/payment/Payment.tsx'],
 *   },
 *   supportingFiles: [
 *     '.principal-views/checkout-flow.otel.canvas',
 *     '.principal-views/checkout-flow/complete-checkout.workflow.json',
 *   ],
 * };
 * ```
 */
export interface StoryboardContextSliceData {
  /** Currently selected storyboard (1 storyboard = 1 canvas) */
  storyboard: StoryboardReference | null;

  /** Currently selected workflow (optional, narrower scope than storyboard) */
  workflow: WorkflowReference | null;

  /** Currently selected scenario (optional, narrowest scope) */
  scenario: ScenarioReference | null;

  /**
   * Map of canvas node ID to source file paths.
   * Built from each node's `pv.sources` field in the canvas.
   * Used to highlight source files in visualizations.
   */
  nodeSources: Record<string, string[]>;

  /**
   * Additional files associated with the storyboard context.
   * Includes canvas files, workflow definitions, and related documentation.
   */
  supportingFiles: string[];
}
