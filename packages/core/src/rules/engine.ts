/**
 * Graph Rules Engine
 * Central orchestrator for configuration validation rules
 */

import type { GraphConfiguration } from '../types';
import type { ComponentLibrary } from '../types/library';
import type {
  GraphRule,
  GraphRuleContext,
  GraphRuleViolation,
  GraphLintResult,
  LintOptions,
  RuleOptions,
  NormalizedSeverity,
  RuleCategory,
  VGCConfig,
  RuleConfig,
  RuleSeverity,
} from './types';
import { normalizeSeverity, isRuleDisabled } from './types';

/**
 * Graph Rules Engine - validates GraphConfiguration against registered rules
 */
export class GraphRulesEngine {
  private rules: Map<string, GraphRule> = new Map();

  constructor() {
    // Rules are registered via registerRule() or registerBuiltinRules()
  }

  /**
   * Register a single rule
   */
  registerRule(rule: GraphRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule "${rule.id}" is already registered`);
    }
    this.rules.set(rule.id, rule);
  }

  /**
   * Register multiple rules at once
   */
  registerRules(rules: GraphRule[]): void {
    for (const rule of rules) {
      this.registerRule(rule);
    }
  }

  /**
   * Unregister a rule by ID
   */
  unregisterRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): GraphRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all registered rules
   */
  getAllRules(): Map<string, GraphRule> {
    return new Map(this.rules);
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: RuleCategory): GraphRule[] {
    return Array.from(this.rules.values()).filter((rule) => rule.category === category);
  }

  /**
   * Lint a configuration against all enabled rules
   */
  async lint(configuration: GraphConfiguration, options?: LintOptions): Promise<GraphLintResult> {
    const violations: GraphRuleViolation[] = [];

    for (const [ruleId, rule] of this.rules) {
      // Check if rule should be skipped
      if (!this.shouldRunRule(rule, options)) {
        continue;
      }

      // Build context for this rule
      const context = this.buildRuleContext(configuration, rule, options);

      // Get effective severity
      const effectiveSeverity = this.getEffectiveSeverity(rule, options);
      if (effectiveSeverity === 'off') {
        continue;
      }

      try {
        // Execute rule check
        const ruleViolations = await rule.check(context);

        // Apply effective severity to all violations
        for (const violation of ruleViolations) {
          violation.severity = effectiveSeverity;
          violations.push(violation);
        }
      } catch (error) {
        // Rule execution error - report as a violation
        violations.push({
          ruleId,
          severity: 'error',
          message: `Rule "${ruleId}" threw an error: ${error instanceof Error ? error.message : String(error)}`,
          impact: 'Rule could not complete validation',
          fixable: false,
        });
      }
    }

    return this.buildResult(violations);
  }

  /**
   * Lint a configuration with VGC config file settings applied
   */
  async lintWithConfig(
    configuration: GraphConfiguration,
    vgcConfig: VGCConfig,
    options?: Omit<LintOptions, 'ruleOptions' | 'severityOverrides'>
  ): Promise<GraphLintResult> {
    // Convert VGC config rules to lint options
    const { ruleOptions, severityOverrides, disabledRules } = this.parseVGCConfigRules(
      vgcConfig.rules
    );

    return this.lint(configuration, {
      ...options,
      ruleOptions,
      severityOverrides,
      disabledRules: [...(options?.disabledRules ?? []), ...disabledRules],
    });
  }

  /**
   * Check if a rule should run based on options
   */
  private shouldRunRule(rule: GraphRule, options?: LintOptions): boolean {
    // Check disabled rules list
    if (options?.disabledRules?.includes(rule.id)) {
      return false;
    }

    // Check enabled rules list (if specified, only run those)
    if (options?.enabledRules && options.enabledRules.length > 0) {
      return options.enabledRules.includes(rule.id);
    }

    // Check rule's default enabled state
    return rule.enabled;
  }

  /**
   * Get the effective severity for a rule
   */
  private getEffectiveSeverity(rule: GraphRule, options?: LintOptions): NormalizedSeverity {
    // Check for override
    if (options?.severityOverrides?.has(rule.id)) {
      return options.severityOverrides.get(rule.id)!;
    }

    // Use rule's default severity
    return rule.severity;
  }

  /**
   * Build the context object for a rule
   */
  private buildRuleContext<TOptions extends RuleOptions>(
    configuration: GraphConfiguration,
    rule: GraphRule<TOptions>,
    options?: LintOptions
  ): GraphRuleContext<TOptions> {
    // Merge default options with provided options
    const ruleSpecificOptions = options?.ruleOptions?.get(rule.id) as TOptions | undefined;
    const mergedOptions = {
      ...rule.defaultOptions,
      ...ruleSpecificOptions,
    } as TOptions;

    return {
      configuration,
      library: options?.library,
      configPath: options?.configPath,
      libraryPath: options?.libraryPath,
      rawContent: options?.rawContent,
      options: mergedOptions,
      allRuleOptions: options?.ruleOptions,
    };
  }

  /**
   * Build the final lint result from violations
   */
  private buildResult(violations: GraphRuleViolation[]): GraphLintResult {
    const byCategory: Record<RuleCategory, number> = {
      schema: 0,
      reference: 0,
      structure: 0,
      pattern: 0,
      library: 0,
    };

    const byRule: Record<string, number> = {};

    let errorCount = 0;
    let warningCount = 0;
    let fixableCount = 0;

    for (const violation of violations) {
      // Count by severity
      if (violation.severity === 'error') {
        errorCount++;
      } else if (violation.severity === 'warn') {
        warningCount++;
      }

      // Count fixable
      if (violation.fixable) {
        fixableCount++;
      }

      // Count by rule
      byRule[violation.ruleId] = (byRule[violation.ruleId] ?? 0) + 1;

      // Count by category
      const rule = this.rules.get(violation.ruleId);
      if (rule) {
        byCategory[rule.category]++;
      }
    }

    return {
      violations,
      errorCount,
      warningCount,
      fixableCount,
      byCategory,
      byRule,
    };
  }

  /**
   * Parse VGC config rules into lint options
   */
  private parseVGCConfigRules(rules?: VGCConfig['rules']): {
    ruleOptions: Map<string, RuleOptions>;
    severityOverrides: Map<string, NormalizedSeverity>;
    disabledRules: string[];
  } {
    const ruleOptions = new Map<string, RuleOptions>();
    const severityOverrides = new Map<string, NormalizedSeverity>();
    const disabledRules: string[] = [];

    if (!rules) {
      return { ruleOptions, severityOverrides, disabledRules };
    }

    for (const [ruleId, config] of Object.entries(rules)) {
      // Handle false (disabled)
      if (config === false) {
        disabledRules.push(ruleId);
        continue;
      }

      // Handle severity shorthand
      if (typeof config === 'string' || typeof config === 'number') {
        const severity = normalizeSeverity(config as RuleSeverity);
        if (severity === 'off') {
          disabledRules.push(ruleId);
        } else {
          severityOverrides.set(ruleId, severity);
        }
        continue;
      }

      // Handle full config object
      const ruleConfig = config as RuleConfig;

      if (ruleConfig.severity !== undefined) {
        const severity = normalizeSeverity(ruleConfig.severity);
        if (severity === 'off') {
          disabledRules.push(ruleId);
        } else {
          severityOverrides.set(ruleId, severity);
        }
      }

      if (ruleConfig.options) {
        ruleOptions.set(ruleId, ruleConfig.options);
      }
    }

    return { ruleOptions, severityOverrides, disabledRules };
  }
}

/**
 * Create a new rules engine with optional initial rules
 */
export function createRulesEngine(rules?: GraphRule[]): GraphRulesEngine {
  const engine = new GraphRulesEngine();
  if (rules) {
    engine.registerRules(rules);
  }
  return engine;
}
