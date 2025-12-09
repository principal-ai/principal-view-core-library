/**
 * Rule: minimum-node-sources
 * Ensures each nodeType has at least a minimum number of sources defined
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation, RuleOptions } from '../types';

/**
 * Options for minimum-node-sources rule
 */
export interface MinimumNodeSourcesOptions extends RuleOptions {
  /**
   * Minimum number of sources required per nodeType
   * @default 1
   */
  minimum: number;

  /**
   * NodeType IDs to exclude from this check
   * @default []
   */
  excludeNodeTypes: string[];
}

const DEFAULT_OPTIONS: MinimumNodeSourcesOptions = {
  minimum: 1,
  excludeNodeTypes: [],
};

export const minimumNodeSources: GraphRule<MinimumNodeSourcesOptions> = {
  id: 'minimum-node-sources',
  name: 'Minimum Node Sources',
  description: 'Each nodeType must have at least a minimum number of sources defined',
  impact: 'NodeTypes without sources cannot be associated with log activity',
  severity: 'error',
  category: 'structure',
  enabled: true,
  fixable: false,
  defaultOptions: DEFAULT_OPTIONS,

  async check(context: GraphRuleContext<MinimumNodeSourcesOptions>): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, configPath, options } = context;

    const minimum = options.minimum ?? DEFAULT_OPTIONS.minimum;
    const excludeNodeTypes = options.excludeNodeTypes ?? DEFAULT_OPTIONS.excludeNodeTypes;

    if (!configuration.nodeTypes) {
      return violations;
    }

    for (const [typeId, nodeType] of Object.entries(configuration.nodeTypes)) {
      // Skip excluded node types
      if (excludeNodeTypes.includes(typeId)) {
        continue;
      }

      // Get sources from nodeType (may be extended via path-based config)
      const nodeTypeAny = nodeType as unknown as Record<string, unknown>;
      const sources = nodeTypeAny.sources;
      const sourceCount = Array.isArray(sources) ? sources.length : 0;

      if (sourceCount < minimum) {
        violations.push({
          ruleId: 'minimum-node-sources',
          severity: 'error',
          file: configPath,
          path: `nodeTypes.${typeId}.sources`,
          message:
            sourceCount === 0
              ? `Node type "${typeId}" has no sources defined`
              : `Node type "${typeId}" has ${sourceCount} source(s), minimum required is ${minimum}`,
          impact: 'This node type cannot be associated with log activity from source files',
          suggestion: `Add at least ${minimum} source path(s) to nodeTypes.${typeId}.sources`,
          fixable: false,
        });
      }
    }

    return violations;
  },
};
