/**
 * Events Canvas Validator
 *
 * Validates that a .events.canvas file properly documents event namespaces
 * and their events, with correct namespace extraction and node structure.
 */

import type { ExtendedCanvas, ExtendedCanvasNode } from '../types/canvas';

/**
 * Event namespace node structure
 */
export interface EventNamespaceNode {
  id: string;
  type: 'event-namespace';
  namespace: {
    name: string;
    description: string;
    events: Array<{
      name: string;
      severity?: 'INFO' | 'WARN' | 'ERROR';
      description?: string;
      attributes?: Record<string, {
        type: string;
        required?: boolean;
        description?: string;
      }>;
    }>;
  };
  // Standard canvas node fields
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

/**
 * Events canvas validation context
 */
export interface EventsCanvasValidationContext {
  /** The events canvas (if found) */
  eventsCanvas?: ExtendedCanvas;

  /** Path to the events canvas file */
  eventsCanvasPath?: string;

  /** Base path for resolving relative paths */
  basePath: string;

  /** Optional: Workflow files to validate against */
  workflowFiles?: Array<{
    path: string;
    events: string[];
  }>;
}

/**
 * Events canvas validation violation
 */
export interface EventsCanvasViolation {
  /** Rule ID that detected this violation */
  ruleId: string;

  /** Severity level */
  severity: 'error' | 'warn';

  /** File path where violation occurred */
  file: string;

  /** JSON path within file (optional) */
  path?: string;

  /** Human-readable description of what's wrong */
  message: string;

  /** Why this matters */
  impact: string;

  /** How to fix it */
  suggestion: string;
}

/**
 * Events canvas validation result
 */
export interface EventsCanvasValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean;

  /** List of violations found */
  violations: EventsCanvasViolation[];

  /** Coverage metrics */
  metrics: {
    /** Total unique namespaces found */
    totalNamespaces: number;
    /** Namespaces with nodes */
    documentedNamespaces: string[];
    /** Namespaces missing nodes */
    missingNamespaces: string[];
    /** Total events across all namespaces */
    totalEvents: number;
    /** Events properly registered in namespace nodes */
    registeredEvents: string[];
    /** Events not in any namespace node */
    unregisteredEvents: string[];
  };
}

/**
 * Validates events canvas files
 */
export class EventsCanvasValidator {
  /**
   * Extract namespace from event name (all segments except last)
   *
   * @example
   * extractNamespace('validation.started') // 'validation'
   * extractNamespace('file.read.complete') // 'file.read'
   * extractNamespace('error') // null (invalid, needs at least 2 segments)
   */
  private extractNamespace(eventName: string): string | null {
    const segments = eventName.split('.');
    if (segments.length < 2) {
      return null; // Invalid event name
    }
    return segments.slice(0, -1).join('.');
  }

  /**
   * Check if a node is an event-namespace node
   */
  private isEventNamespaceNode(node: any): node is EventNamespaceNode {
    return node?.type === 'event-namespace' &&
           node?.namespace?.name !== undefined;
  }

  /**
   * Extract all events from namespace nodes
   */
  private extractEventsFromCanvas(
    canvas: ExtendedCanvas
  ): Map<string, Set<string>> {
    const namespaceEvents = new Map<string, Set<string>>();

    for (const node of canvas.nodes || []) {
      if (this.isEventNamespaceNode(node)) {
        const namespaceNode = node as EventNamespaceNode;
        const namespace = namespaceNode.namespace.name;
        const events = new Set<string>();

        for (const event of namespaceNode.namespace.events || []) {
          events.add(event.name);
        }

        namespaceEvents.set(namespace, events);
      }
    }

    return namespaceEvents;
  }

  /**
   * Build a map of event name → expected namespace
   */
  private buildEventNamespaceMap(
    namespaceEvents: Map<string, Set<string>>
  ): Map<string, string> {
    const eventNamespaceMap = new Map<string, string>();

    for (const [namespace, events] of namespaceEvents) {
      for (const eventName of events) {
        const extractedNamespace = this.extractNamespace(eventName);
        eventNamespaceMap.set(eventName, extractedNamespace || '');
      }
    }

    return eventNamespaceMap;
  }

  /**
   * Validate an events canvas
   */
  async validate(
    context: EventsCanvasValidationContext
  ): Promise<EventsCanvasValidationResult> {
    const violations: EventsCanvasViolation[] = [];
    const { eventsCanvas, eventsCanvasPath, basePath } = context;

    // Initialize metrics
    const metrics = {
      totalNamespaces: 0,
      documentedNamespaces: [] as string[],
      missingNamespaces: [] as string[],
      totalEvents: 0,
      registeredEvents: [] as string[],
      unregisteredEvents: [] as string[],
    };

    // Check if canvas exists
    if (!eventsCanvas) {
      violations.push({
        ruleId: 'events-canvas-required',
        severity: 'error',
        file: eventsCanvasPath || '.principal-views/cli.events.canvas',
        message: 'Events canvas is required for documenting event namespaces',
        impact: 'Cannot validate event structure or namespace organization',
        suggestion: 'Create an events canvas with event-namespace nodes for each namespace',
      });

      return {
        valid: false,
        violations,
        metrics,
      };
    }

    // Extract namespace nodes and events
    const namespaceEvents = this.extractEventsFromCanvas(eventsCanvas);
    const namespaceNodes = new Set(namespaceEvents.keys());
    metrics.documentedNamespaces = Array.from(namespaceNodes);
    metrics.totalNamespaces = namespaceNodes.size;

    // Collect all event names and their extracted namespaces
    const allEvents = new Set<string>();
    const eventToExtractedNamespace = new Map<string, string>();
    const extractedNamespaces = new Set<string>();

    for (const [namespace, events] of namespaceEvents) {
      for (const eventName of events) {
        allEvents.add(eventName);
        metrics.totalEvents++;

        // Extract namespace from event name
        const extractedNamespace = this.extractNamespace(eventName);

        if (!extractedNamespace) {
          violations.push({
            ruleId: 'events-invalid-event-name',
            severity: 'error',
            file: eventsCanvasPath || '.principal-views/cli.events.canvas',
            path: `nodes[].namespace.events[name="${eventName}"]`,
            message: `Event name "${eventName}" is invalid (must have at least 2 segments)`,
            impact: 'Event name does not follow {namespace}.{action} convention',
            suggestion: `Rename to follow pattern like "${namespace}.${eventName}"`,
          });
          continue;
        }

        eventToExtractedNamespace.set(eventName, extractedNamespace);
        extractedNamespaces.add(extractedNamespace);

        // Check namespace consistency: extracted namespace should match the node it's in
        if (extractedNamespace !== namespace) {
          violations.push({
            ruleId: 'events-namespace-mismatch',
            severity: 'error',
            file: eventsCanvasPath || '.principal-views/cli.events.canvas',
            path: `nodes[namespace.name="${namespace}"].namespace.events[name="${eventName}"]`,
            message: `Event "${eventName}" is in wrong namespace node (expected: "${extractedNamespace}", actual: "${namespace}")`,
            impact: 'Event is incorrectly organized, making namespace structure confusing',
            suggestion: `Move event "${eventName}" to namespace node "${extractedNamespace}"`,
          });
        } else {
          metrics.registeredEvents.push(eventName);
        }
      }
    }

    // Check for missing namespace nodes
    for (const namespace of extractedNamespaces) {
      if (!namespaceNodes.has(namespace)) {
        metrics.missingNamespaces.push(namespace);
        violations.push({
          ruleId: 'events-namespace-node-missing',
          severity: 'error',
          file: eventsCanvasPath || '.principal-views/cli.events.canvas',
          message: `Namespace "${namespace}" is missing a node in the canvas`,
          impact: 'Cannot visualize or document this namespace group',
          suggestion: `Add a node with type: "event-namespace" and namespace.name: "${namespace}"`,
        });
      }
    }

    // Validate namespace nodes have descriptions
    for (const node of eventsCanvas.nodes || []) {
      if (this.isEventNamespaceNode(node)) {
        const namespaceNode = node as EventNamespaceNode;
        if (!namespaceNode.namespace.description) {
          violations.push({
            ruleId: 'events-namespace-missing-description',
            severity: 'warn',
            file: eventsCanvasPath || '.principal-views/cli.events.canvas',
            path: `nodes[id="${namespaceNode.id}"].namespace`,
            message: `Namespace "${namespaceNode.namespace.name}" is missing a description`,
            impact: 'Namespace purpose is undocumented',
            suggestion: 'Add a description field explaining what events this namespace contains',
          });
        }

        // Validate each event has description and severity
        for (const event of namespaceNode.namespace.events || []) {
          if (!event.description) {
            violations.push({
              ruleId: 'events-event-missing-description',
              severity: 'warn',
              file: eventsCanvasPath || '.principal-views/cli.events.canvas',
              path: `nodes[id="${namespaceNode.id}"].namespace.events[name="${event.name}"]`,
              message: `Event "${event.name}" is missing a description`,
              impact: 'Event purpose is undocumented',
              suggestion: 'Add a description field explaining when/why this event is emitted',
            });
          }

          if (!event.severity) {
            violations.push({
              ruleId: 'events-event-missing-severity',
              severity: 'warn',
              file: eventsCanvasPath || '.principal-views/cli.events.canvas',
              path: `nodes[id="${namespaceNode.id}"].namespace.events[name="${event.name}"]`,
              message: `Event "${event.name}" is missing a severity level`,
              impact: 'Cannot determine event criticality',
              suggestion: 'Add severity field with value: "INFO", "WARN", or "ERROR"',
            });
          }
        }
      }
    }

    metrics.totalNamespaces = extractedNamespaces.size;

    const errors = violations.filter(v => v.severity === 'error');

    return {
      valid: errors.length === 0,
      violations,
      metrics,
    };
  }
}
