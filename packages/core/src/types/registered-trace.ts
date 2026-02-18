/**
 * Registry-aware trace types
 *
 * These types integrate trace data with storyboard registry lookups
 * to provide complete matching, validation, and routing information.
 */

import type { OtelExportTraceServiceRequest } from './otel';

/**
 * Registry-aware trace with matching and routing information
 *
 * Replaces TraceInfo with a type that knows:
 * - Whether it's matched to a registered storyboard
 * - Which schema version should be used
 * - Where it should be routed/displayed
 * - Detailed span-to-node matching results
 */
export interface RegisteredTrace {
  // ============================================================================
  // Core Trace Identity
  // ============================================================================

  /** Unique trace ID */
  traceId: string;

  /** Trace name (typically root span name) */
  name: string;

  /** Start timestamp (milliseconds) */
  startTime: number;

  /** End timestamp (milliseconds) */
  endTime: number;

  /** Duration (milliseconds) */
  duration: number;

  /** Number of spans in this trace */
  spanCount: number;

  /** Service name from resource attributes */
  serviceName: string;

  /** Has any span with error status */
  hasErrors: boolean;

  // ============================================================================
  // Instrumentation Scope (for versioning)
  // ============================================================================

  /** Instrumentation scope that created this trace */
  scope: {
    /** Scope name (e.g., "checkout-instrumentation") */
    name: string;

    /** Scope version (e.g., "2.1.0") - used for schema matching */
    version?: string;

    /** Scope-level attributes */
    attributes?: Record<string, unknown>;

    /** OTLP schema URL */
    schemaUrl?: string;
  };

  // ============================================================================
  // Registry Matching Status
  // ============================================================================

  /** Registry matching status */
  registryStatus: 'matched' | 'unmatched' | 'version-mismatch' | 'not-registered' | 'error';

  /** Match information (if trace has pv.* attributes) */
  matchInfo?: {
    /** Storyboard ID from trace attributes */
    storyboardId: string;

    /** Storyboard name from trace attributes */
    storyboardName: string;

    /** Workflow ID (optional) */
    workflowId?: string;

    /** Workflow name (optional) */
    workflowName?: string;

    /** Scenario ID (optional) */
    scenarioId?: string;

    /** Scenario name (optional) */
    scenarioName?: string;

    /** Resolved schema version (from scope.version or pv.schema.version) */
    schemaVersion?: string;
  };

  /** Registry lookup result */
  registry?: {
    /** Is the storyboard registered in the registry? */
    isRegistered: boolean;

    /** Registered storyboard ID (may differ from matchInfo.storyboardId) */
    storyboardId?: string;

    /** Resolved schema version (what version was actually used) */
    resolvedVersion?: string;

    /** Available versions in registry */
    availableVersions?: string[];

    /** Latest version in registry */
    latestVersion?: string;

    /** Is the resolved version the latest? */
    isLatestVersion?: boolean;

    /** Version match status */
    versionStatus?: 'exact-match' | 'fallback-to-latest' | 'not-found' | 'deprecated';
  };

  // ============================================================================
  // Span Matching Results
  // ============================================================================

  /** Per-span matching results */
  spanMatches: Array<{
    /** Span ID */
    spanId: string;

    /** Span name */
    spanName: string;

    /** Matched canvas node IDs */
    matchedNodeIds: string[];

    /** Timestamp (milliseconds) */
    timestamp: number;

    /** Duration (milliseconds) */
    duration: number;

    /** Match confidence (optional) */
    matchConfidence?: 'exact' | 'pattern' | 'wildcard';

    /** Unmatched reason (if no nodes matched) */
    unmatchedReason?: 'no-criteria' | 'no-match' | 'excluded';
  }>;

  /** Summary of matched nodes across all spans */
  matchedNodesSummary: {
    /** Total unique node IDs matched */
    totalNodesMatched: number;

    /** Node IDs that matched */
    matchedNodeIds: string[];

    /** Nodes in storyboard that didn't match any span */
    unmatchedNodeIds: string[];

    /** Coverage percentage (matched nodes / total nodes) */
    coveragePercent: number;
  };

  // ============================================================================
  // Routing Information
  // ============================================================================

  /** Where should this trace be routed/displayed? */
  routing: {
    /** Source URL for routing (from dev.server.url or service.name) */
    sourceUrl: string;

    /** Suggested destination (which panel/view should display this) */
    destination: 'trace-viewer' | 'storyboard-viewer' | 'scenario-viewer' | 'unmatched';

    /** Routing params (what to open, what to highlight) */
    params?: {
      /** Storyboard to open */
      storyboardId?: string;

      /** Workflow to select */
      workflowId?: string;

      /** Scenario to show */
      scenarioId?: string;

      /** Nodes to highlight */
      highlightNodeIds?: string[];

      /** Schema version to use */
      schemaVersion?: string;
    };
  };

  // ============================================================================
  // Validation Errors/Warnings
  // ============================================================================

  /** Validation issues found during matching */
  validationIssues?: Array<{
    /** Issue severity */
    level: 'error' | 'warning' | 'info';

    /** Issue category */
    category: 'registry' | 'version' | 'matching' | 'data';

    /** Human-readable message */
    message: string;

    /** Affected span ID (if span-specific) */
    spanId?: string;

    /** Suggested fix */
    suggestion?: string;
  }>;

  // ============================================================================
  // Raw Data Reference (for details view)
  // ============================================================================

  /** Reference to full OTLP data (if needed for details) */
  otlpData?: OtelExportTraceServiceRequest;
}

/**
 * Registry lookup result
 */
export interface RegistryLookupResult {
  /** Is the storyboard registered? */
  isRegistered: boolean;

  /** Storyboard ID */
  storyboardId?: string;

  /** Resolved schema version */
  resolvedVersion?: string;

  /** Available versions */
  availableVersions?: string[];

  /** Latest version */
  latestVersion?: string;

  /** Is latest version? */
  isLatestVersion?: boolean;

  /** Version match status */
  versionStatus?: 'exact-match' | 'fallback-to-latest' | 'not-found' | 'deprecated';
}

/**
 * Interface for storyboard registry
 *
 * This is implemented by the main process and injected into the
 * OTEL collector server for trace matching.
 */
export interface StoryboardRegistryInterface {
  /**
   * Look up a storyboard by ID and optional version
   */
  lookup(storyboardId: string, schemaVersion?: string): Promise<RegistryLookupResult>;

  /**
   * Get list of registered storyboard IDs
   */
  listStoryboards(): Promise<string[]>;

  /**
   * Check if a storyboard is registered
   */
  isRegistered(storyboardId: string): Promise<boolean>;
}

/**
 * Interface for trace registry matcher
 *
 * Converts OTLP traces to RegisteredTrace with full registry information.
 */
export interface TraceRegistryMatcher {
  /**
   * Match a trace against the registry and enrich with routing info
   */
  matchTrace(otlpData: OtelExportTraceServiceRequest): Promise<RegisteredTrace>;

  /**
   * Resolve schema version for a trace
   */
  resolveSchemaVersion(
    storyboardId: string,
    scopeVersion?: string,
    scopeAttributes?: Record<string, unknown>
  ): Promise<{
    resolvedVersion?: string;
    versionStatus: 'exact-match' | 'fallback-to-latest' | 'not-found';
    availableVersions: string[];
  }>;
}
