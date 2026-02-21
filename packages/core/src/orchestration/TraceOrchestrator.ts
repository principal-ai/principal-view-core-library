/**
 * TraceOrchestrator - Coordinates the complete trace matching pipeline
 *
 * Pipeline:
 * 1. Parse OTLP trace → extract resources and scopes
 * 2. For each scope → lookup VersionSnapshot from registry
 * 3. Match spans against workflows/scenarios
 * 4. Categorize results into three categories
 */

import type { OtelExportTraceServiceRequest, OtelSpanData } from '../types/otel';
import type {
  RegisteredTrace,
  StoryboardRegistryInterface,
  TraceResource,
  ScenarioMatch,
  StoryboardMatch,
  UnmatchedSpans,
  UnmatchedSpan,
  ValidationIssue,
  MatchedSpan,
  OrphanedSpan,
} from '../types/registered-trace';
import type { VersionSnapshot } from '../types/version-registry';
import type { DiscoveredStoryboardWithContent, DiscoveredWorkflowWithContent, DiscoveredCanvasWithContent } from '../discovery/types';
import type { ExtendedCanvas } from '../types/canvas';
import { OtlpTraceParser } from '../parsers/OtlpTraceParser';
import { SpanMatcher } from '../matchers/SpanMatcher';
import { selectScenario } from '../workflow/scenario-matcher';
import type { OtelEvent } from '../workflow/types';

/**
 * Span with associated scope information
 */
interface ScopeSpan {
  scopeName: string;
  scopeVersion: string;
  spanId: string;
  spanName: string;
  traceId: string;
  parentSpanId?: string;
  startTime: number;
  endTime: number;
  duration: number;
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes: Record<string, unknown>;
  }>;
  status: { code: number; message?: string };
}

/**
 * Scope with its VersionSnapshot (storyboards)
 */
interface ScopeWithStoryboards {
  scopeName: string;
  scopeVersion: string;
  snapshot: VersionSnapshot | null;
  spanIds: string[];
}

/**
 * Orchestrator configuration
 */
export interface TraceOrchestratorConfig {
  registry: StoryboardRegistryInterface;
  enableValidation?: boolean;
}

/**
 * Main orchestrator for trace matching
 */
export class TraceOrchestrator {
  private parser: OtlpTraceParser;

  constructor(private config: TraceOrchestratorConfig) {
    this.parser = new OtlpTraceParser();
  }

  /**
   * Process an OTLP trace through the complete matching pipeline
   */
  async processTrace(otlpData: OtelExportTraceServiceRequest): Promise<RegisteredTrace> {
    // Step 1: Parse trace to extract resources and basic info
    const resources = this.parser.extractResources(otlpData);
    const traceInfo = this.parser.extractTraceInfo(otlpData);

    // Step 2: For each scope, lookup storyboards from registry
    const scopeStoryboards = await this.lookupStoryboardsForScopes(resources);

    // Step 3: Extract all spans with scope information
    const allSpans = this.extractAllSpans(otlpData, resources);

    // Step 4: Match spans against storyboards
    const { scenarioMatches, storyboardMatches, unmatchedSpans } = await this.matchSpans(
      allSpans,
      scopeStoryboards
    );

    // Step 5: Validate if enabled
    const validationIssues = this.config.enableValidation
      ? this.validateMatches(scenarioMatches, storyboardMatches)
      : undefined;

    // Step 6: Build final RegisteredTrace
    const registeredTrace: RegisteredTrace = {
      traceId: traceInfo.traceId,
      name: traceInfo.name,
      startTime: traceInfo.startTime,
      endTime: traceInfo.endTime,
      duration: traceInfo.duration,
      spanCount: traceInfo.spanCount,
      hasErrors: traceInfo.hasErrors,
      resources,
      scenarioMatches,
      storyboardMatches,
      unmatchedSpans,
      validationIssues,
      otlpData, // Include original OTLP data
    };

    return registeredTrace;
  }

  /**
   * Lookup storyboards from registry for each scope
   */
  private async lookupStoryboardsForScopes(
    resources: TraceResource[]
  ): Promise<ScopeWithStoryboards[]> {
    const results: ScopeWithStoryboards[] = [];

    for (const resource of resources) {
      for (const scopeInfo of resource.scopes) {
        const snapshot = await this.config.registry.lookupByScope(
          {
            name: scopeInfo.scope.name,
            version: scopeInfo.scope.version,
          },
          {
            attributes: resource.attributes,
          }
        );

        results.push({
          scopeName: scopeInfo.scope.name,
          scopeVersion: scopeInfo.scope.version,
          snapshot,
          spanIds: scopeInfo.spanIds,
        });
      }
    }

    return results;
  }

  /**
   * Extract all spans with their scope information
   */
  private extractAllSpans(
    otlpData: OtelExportTraceServiceRequest,
    resources: TraceResource[]
  ): ScopeSpan[] {
    const spans: ScopeSpan[] = [];

    for (const resource of resources) {
      for (const scopeInfo of resource.scopes) {
        const scopeSpans = this.parser.getSpansForScope(otlpData, scopeInfo.scope.name);

        for (const span of scopeSpans) {
          spans.push({
            scopeName: scopeInfo.scope.name,
            scopeVersion: scopeInfo.scope.version,
            spanId: span.spanId,
            spanName: span.spanName,
            traceId: span.traceId,
            parentSpanId: span.parentSpanId,
            startTime: span.startTime,
            endTime: span.endTime,
            duration: span.duration,
            attributes: span.attributes,
            events: span.events,
            status: span.status,
          });
        }
      }
    }

    return spans;
  }

  /**
   * Match spans against storyboards and categorize results
   */
  private async matchSpans(
    spans: ScopeSpan[],
    scopeStoryboards: ScopeWithStoryboards[]
  ): Promise<{
    scenarioMatches: ScenarioMatch[];
    storyboardMatches: StoryboardMatch[];
    unmatchedSpans: UnmatchedSpans;
  }> {
    const scenarioMatches: ScenarioMatch[] = [];
    const storyboardMatches: StoryboardMatch[] = [];
    const unmatchedSpansList: UnmatchedSpan[] = [];

    const matchedSpanIds = new Set<string>();

    // For each scope with storyboards
    for (const scopeWithStoryboards of scopeStoryboards) {
      if (!scopeWithStoryboards.snapshot) {
        // No storyboards found → all spans are unmatched
        const scopeSpans = spans.filter((s) => s.scopeName === scopeWithStoryboards.scopeName);
        for (const span of scopeSpans) {
          unmatchedSpansList.push({
            spanId: span.spanId,
            spanName: span.spanName,
            scopeName: span.scopeName,
            timestamp: span.startTime,
            duration: span.duration,
            reason: 'No storyboards found for scope',
            attributes: span.attributes,
          });
          // Mark as processed so we don't add it again in the final loop
          matchedSpanIds.add(span.spanId);
        }
        continue;
      }

      // Get spans for this scope
      const scopeSpans = spans.filter((s) => s.scopeName === scopeWithStoryboards.scopeName);

      // Match against each storyboard
      for (const storyboard of scopeWithStoryboards.snapshot.storyboards) {
        // Validate that content is loaded - cast to check content
        const sbWithContent = storyboard as DiscoveredStoryboardWithContent;
        if (!this.isStoryboardWithContent(sbWithContent)) {
          console.error('[TraceOrchestrator] Storyboard content not loaded:', storyboard.id);
          continue;
        }

        // TypeScript now knows sbWithContent is DiscoveredStoryboardWithContent
        const canvas = sbWithContent.canvas as DiscoveredCanvasWithContent;
        if (!canvas.content) {
          console.error('[TraceOrchestrator] Canvas content not loaded:', storyboard.id);
          continue;
        }

        // Create SpanMatcher for this canvas
        const spanMatcher = new SpanMatcher(canvas.content as ExtendedCanvas);

        // Match each span against the canvas
        for (const span of scopeSpans) {
          // Convert ScopeSpan to OtelSpanData format for SpanMatcher
          const otelSpan = this.convertToOtelSpan(span);
          const resource = { attributes: [] }; // Resource matching happens at scope level

          const matchResult = spanMatcher.matchSpan(otelSpan, resource);

          if (matchResult.matchedNodeIds.length > 0) {
            // This span matched canvas nodes! Now try workflow/scenario matching
            const workflowMatch = await this.matchWorkflowsForSpan(
              span,
              matchResult.matchedNodeIds,
              storyboard,
              scopeWithStoryboards.scopeName
            );

            if (workflowMatch) {
              matchedSpanIds.add(span.spanId);

              if (workflowMatch.type === 'scenario') {
                scenarioMatches.push(workflowMatch.match as ScenarioMatch);
              } else {
                storyboardMatches.push(workflowMatch.match as StoryboardMatch);
              }
            }
          }
        }
      }
    }

    // Collect unmatched spans (spans that didn't match any workflow)
    for (const span of spans) {
      if (!matchedSpanIds.has(span.spanId)) {
        const scopeHasStoryboards = scopeStoryboards.some(
          (s) => s.scopeName === span.scopeName && s.snapshot !== null
        );

        unmatchedSpansList.push({
          spanId: span.spanId,
          spanName: span.spanName,
          scopeName: span.scopeName,
          timestamp: span.startTime,
          duration: span.duration,
          reason: scopeHasStoryboards
            ? 'No canvas nodes matched this span'
            : 'No storyboards found for scope',
          attributes: span.attributes,
        });
      }
    }

    const unmatchedSpans: UnmatchedSpans = {
      spans: unmatchedSpansList,
    };

    return { scenarioMatches, storyboardMatches, unmatchedSpans };
  }

  /**
   * Type guard to check if storyboard has content loaded
   */
  private isStoryboardWithContent(
    storyboard: DiscoveredStoryboardWithContent
  ): storyboard is DiscoveredStoryboardWithContent {
    const canvas = storyboard.canvas as DiscoveredCanvasWithContent | undefined;
    return canvas?.content !== undefined;
  }

  /**
   * Convert ScopeSpan to OtelSpanData format
   */
  private convertToOtelSpan(span: ScopeSpan): OtelSpanData {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      name: span.spanName,
      parentSpanId: span.parentSpanId,
      kind: 1, // SPAN_KIND_INTERNAL (default - would be extracted from original OTLP)
      startTimeUnixNano: String(span.startTime * 1000000), // Convert ms back to nanos
      endTimeUnixNano: String(span.endTime * 1000000),
      attributes: Object.entries(span.attributes || {}).map(([key, value]) => ({
        key,
        value: { stringValue: String(value) },
      })),
      events: span.events.map((e) => ({
        timeUnixNano: String(e.timestamp * 1000000),
        name: e.name,
        attributes: Object.entries(e.attributes || {}).map(([key, value]) => ({
          key,
          value: { stringValue: String(value) },
        })),
      })),
      status: span.status,
    };
  }

  /**
   * Try to match a span that matched canvas nodes against workflows
   */
  private async matchWorkflowsForSpan(
    span: ScopeSpan,
    matchedNodeIds: string[],
    storyboard: DiscoveredStoryboardWithContent,
    scopeName: string
  ): Promise<
    | {
        type: 'scenario';
        match: ScenarioMatch;
      }
    | {
        type: 'storyboard';
        match: StoryboardMatch;
      }
    | null
  > {
    // Convert span events to OtelEvent format for scenario matcher
    const otelEvents: OtelEvent[] = span.events.map((e) => ({
      name: e.name,
      timestamp: e.timestamp,
      attributes: e.attributes as Record<string, string | number | boolean>,
    }));

    // Try each workflow in the storyboard
    for (const workflow of storyboard.workflows) {
      // Validate that workflow has content loaded - cast to check content
      const wfWithContent = workflow as DiscoveredWorkflowWithContent;
      if (!this.isWorkflowWithContent(wfWithContent)) {
        console.error('[TraceOrchestrator] Workflow content not loaded:', workflow.id);
        continue;
      }

      // Try to match scenario using scenario matcher
      const scenarioMatchResult = selectScenario(wfWithContent.content, otelEvents);

      // Check if we have a recommended match with actual coverage
      // We only consider it a scenario match if there's meaningful overlap
      if (
        scenarioMatchResult.recommendedScenario &&
        scenarioMatchResult.recommendedScenario.matchPercentage > 0
      ) {
        const detail = scenarioMatchResult.recommendedScenario;

        // Category 1: Scenario Match
        // For each matched node, create a MatchedSpan
        const matchedSpans: MatchedSpan[] = matchedNodeIds.map((nodeId) => ({
          spanId: span.spanId,
          spanName: span.spanName,
          nodeId,
          timestamp: span.startTime,
          duration: span.duration,
          events: detail.matchedEventNames,
          attributes: span.attributes,
          matchConfidence: 'exact' as const,
        }));

        return {
          type: 'scenario',
          match: {
            storyboardId: storyboard.id,
            storyboardName: storyboard.name,
            workflowId: wfWithContent.id,
            workflowName: wfWithContent.name,
            scenarioId: detail.scenario.id,
            scopeName,
            matchedSpans,
            coveragePercent: detail.matchPercentage,
            matchType: detail.matchPercentage === 100 ? 'full' : 'partial',
          },
        };
      } else {
        // No scenario matched - create orphaned span
        // Category 2: Storyboard Match (canvas matched, but scenario didn't)
        const orphanedSpans: OrphanedSpan[] = matchedNodeIds.map((nodeId) => ({
          spanId: span.spanId,
          spanName: span.spanName,
          nodeId,
          timestamp: span.startTime,
          duration: span.duration,
          reason: 'No scenario matched the observed events',
          observedEvents: span.events.map((e) => e.name),
          expectedEvents: wfWithContent.content.scenarios.flatMap((s: { template: { events?: Record<string, unknown> } }) =>
            Object.keys(s.template.events || {})
          ),
          attributes: span.attributes,
        }));

        return {
          type: 'storyboard',
          match: {
            storyboardId: storyboard.id,
            storyboardName: storyboard.name,
            workflowId: workflow.id,
            workflowName: workflow.name,
            scopeName,
            orphanedSpans,
          },
        };
      }
    }

    return null; // No workflow matched
  }

  /**
   * Type guard to check if workflow has content loaded
   */
  private isWorkflowWithContent(
    workflow: DiscoveredWorkflowWithContent
  ): workflow is DiscoveredWorkflowWithContent {
    return workflow.content !== undefined;
  }

  /**
   * Validate matches for common issues
   */
  private validateMatches(
    scenarioMatches: ScenarioMatch[],
    storyboardMatches: StoryboardMatch[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check for duplicate scenario matches
    const scenarioKeys = new Set<string>();
    for (const match of scenarioMatches) {
      const key = `${match.storyboardId}:${match.scenarioId}:${match.scopeName}`;
      if (scenarioKeys.has(key)) {
        issues.push({
          level: 'warning',
          category: 'matching',
          message: `Duplicate scenario match detected for scope ${match.scopeName}`,
          spanId: match.matchedSpans[0]?.spanId,
          scopeName: match.scopeName,
        });
      }
      scenarioKeys.add(key);
    }

    // Check for orphaned spans with no clear reason
    for (const match of storyboardMatches) {
      for (const orphan of match.orphanedSpans) {
        if (!orphan.reason || orphan.reason.trim() === '') {
          issues.push({
            level: 'warning',
            category: 'matching',
            message: 'Orphaned span has no reason',
            spanId: orphan.spanId,
            scopeName: match.scopeName,
          });
        }
      }
    }

    return issues;
  }
}
