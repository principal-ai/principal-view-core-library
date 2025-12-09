/**
 * Rule: library-node-type-match
 * Ensures nodeTypes match library nodeComponents when a library is provided
 */

import type { GraphRule, GraphRuleContext, GraphRuleViolation, RuleOptions } from '../types';

/**
 * Options for library-node-type-match rule
 */
export interface LibraryNodeTypeMatchOptions extends RuleOptions {
  /**
   * Allow extra nodeTypes not defined in the library
   * @default false
   */
  allowExtra: boolean;
}

const DEFAULT_OPTIONS: LibraryNodeTypeMatchOptions = {
  allowExtra: false,
};

export const libraryNodeTypeMatch: GraphRule<LibraryNodeTypeMatchOptions> = {
  id: 'library-node-type-match',
  name: 'Library Node Type Match',
  description: 'NodeTypes must match library nodeComponents when a library is provided',
  impact: 'Mismatched types may cause inconsistent behavior or missing features',
  severity: 'error',
  category: 'library',
  enabled: true,
  fixable: false,
  defaultOptions: DEFAULT_OPTIONS,

  async check(context: GraphRuleContext<LibraryNodeTypeMatchOptions>): Promise<GraphRuleViolation[]> {
    const violations: GraphRuleViolation[] = [];
    const { configuration, library, configPath, libraryPath, options } = context;

    // Skip if no library is provided
    if (!library) {
      return violations;
    }

    // Skip if library has no nodeComponents
    if (!library.nodeComponents || Object.keys(library.nodeComponents).length === 0) {
      return violations;
    }

    const libraryNodeTypes = new Set(Object.keys(library.nodeComponents));
    const configNodeTypes = Object.keys(configuration.nodeTypes ?? {});

    // Check each nodeType in configuration
    for (const typeId of configNodeTypes) {
      if (!libraryNodeTypes.has(typeId)) {
        if (!options.allowExtra) {
          const suggestion = findSimilar(typeId, libraryNodeTypes);
          violations.push({
            ruleId: 'library-node-type-match',
            severity: 'error',
            file: configPath,
            path: `nodeTypes.${typeId}`,
            message: `Node type "${typeId}" is not defined in the component library`,
            impact: 'This node type may be missing library-defined behavior or styling',
            suggestion: suggestion
              ? `Did you mean "${suggestion}"?`
              : `Available library nodeComponents: ${[...libraryNodeTypes].join(', ')}`,
            fixable: false,
          });
        }
      } else {
        // Validate that config matches library definition
        const libraryComponent = library.nodeComponents[typeId];
        const configNodeType = configuration.nodeTypes![typeId];

        // Check shape matches if library defines one
        if (libraryComponent.shape && configNodeType.shape !== libraryComponent.shape) {
          violations.push({
            ruleId: 'library-node-type-match',
            severity: 'error',
            file: configPath,
            path: `nodeTypes.${typeId}.shape`,
            message: `Node type "${typeId}" shape "${configNodeType.shape}" doesn't match library definition "${libraryComponent.shape}"`,
            impact: 'Node may render differently than expected',
            suggestion: `Use shape "${libraryComponent.shape}" as defined in the library`,
            fixable: true,
            fixData: {
              typeId,
              field: 'shape',
              expected: libraryComponent.shape,
              actual: configNodeType.shape,
            },
          });
        }

        // Check that config defines all states from library
        if (libraryComponent.states && Object.keys(libraryComponent.states).length > 0) {
          const libraryStates = Object.keys(libraryComponent.states);
          const configStates = configNodeType.states ? Object.keys(configNodeType.states) : [];

          for (const stateId of libraryStates) {
            if (!configStates.includes(stateId)) {
              violations.push({
                ruleId: 'library-node-type-match',
                severity: 'error',
                file: configPath,
                path: `nodeTypes.${typeId}.states`,
                message: `Node type "${typeId}" is missing state "${stateId}" defined in library`,
                impact: 'State transitions to this state may fail',
                suggestion: `Add state "${stateId}" to nodeTypes.${typeId}.states`,
                fixable: false,
              });
            }
          }
        }
      }
    }

    return violations;
  },
};

/**
 * Find a similar string from a set (for "did you mean" suggestions)
 */
function findSimilar(input: string, candidates: Set<string>): string | null {
  const inputLower = input.toLowerCase();

  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();

    // Exact substring match
    if (inputLower.includes(candidateLower) || candidateLower.includes(inputLower)) {
      return candidate;
    }

    // Small edit distance
    if (Math.abs(input.length - candidate.length) <= 2) {
      let differences = 0;
      const minLen = Math.min(inputLower.length, candidateLower.length);
      for (let i = 0; i < minLen; i++) {
        if (inputLower[i] !== candidateLower[i]) differences++;
      }
      differences += Math.abs(input.length - candidate.length);
      if (differences <= 2) return candidate;
    }
  }

  return null;
}
