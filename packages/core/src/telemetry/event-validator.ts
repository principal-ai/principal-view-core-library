/**
 * Event Validator
 *
 * Type-safe telemetry event validation against canvas event schemas.
 * Ensures that emitted events match the schema defined in the canvas.
 */

import type { ExtendedCanvas, PVEventSchema, PVEventFieldSchema } from '../types/canvas';

/**
 * Validation error for telemetry events
 */
export class EventValidationError extends Error {
  constructor(
    public eventName: string,
    public nodeId: string,
    public errors: string[]
  ) {
    super(`Event validation failed for '${eventName}' on node '${nodeId}':\n${errors.join('\n')}`);
    this.name = 'EventValidationError';
  }
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Event validator that checks events against canvas schema
 */
export class EventValidator {
  private eventSchemas: Map<string, Record<string, PVEventSchema>> = new Map();

  constructor(canvas: ExtendedCanvas) {
    this.indexEventSchemas(canvas);
  }

  /**
   * Index all event schemas from canvas nodes
   */
  private indexEventSchemas(canvas: ExtendedCanvas) {
    if (!canvas.nodes) return;

    for (const node of canvas.nodes) {
      if (node.pv?.events) {
        this.eventSchemas.set(node.id, node.pv.events);
      }
    }
  }

  /**
   * Validate an event against the schema for a specific node
   */
  validate(
    nodeId: string,
    eventName: string,
    attributes: Record<string, any>
  ): ValidationResult {
    const errors: string[] = [];

    // Get schema for this node
    const nodeSchema = this.eventSchemas.get(nodeId);
    if (!nodeSchema) {
      // No schema defined - allow all events (permissive mode)
      return { valid: true, errors: [] };
    }

    // Get schema for this specific event
    const eventSchema = nodeSchema[eventName];
    if (!eventSchema) {
      errors.push(`Event '${eventName}' is not defined in schema for node '${nodeId}'`);
      return { valid: false, errors };
    }

    // Validate each field in the schema
    for (const [fieldName, fieldSchema] of Object.entries(eventSchema.attributes)) {
      const value = attributes[fieldName];

      // Check required fields
      if (fieldSchema.required && value === undefined) {
        errors.push(`Required field '${fieldName}' is missing`);
        continue;
      }

      // Skip validation if field is not present and not required
      if (value === undefined) {
        continue;
      }

      // Validate type
      const actualType = this.getValueType(value);
      if (actualType !== fieldSchema.type) {
        errors.push(
          `Field '${fieldName}' has type '${actualType}' but schema expects '${fieldSchema.type}'`
        );
      }
    }

    // Check for unexpected fields (strict mode)
    const schemaFields = new Set(Object.keys(eventSchema.attributes));
    for (const fieldName of Object.keys(attributes)) {
      // Allow special metadata fields
      if (fieldName.startsWith('code.') || fieldName === 'description') {
        continue;
      }

      if (!schemaFields.has(fieldName)) {
        // Just a warning, not an error
        // errors.push(`Unexpected field '${fieldName}' not in schema`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get the type of a value
   */
  private getValueType(value: any): string {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'object';
    return typeof value;
  }

  /**
   * Get all event schemas for a node
   */
  getNodeSchema(nodeId: string): Record<string, PVEventSchema> | undefined {
    return this.eventSchemas.get(nodeId);
  }

  /**
   * Get all defined event names for a node
   */
  getNodeEventNames(nodeId: string): string[] {
    const schema = this.eventSchemas.get(nodeId);
    return schema ? Object.keys(schema) : [];
  }

  /**
   * Check if a node has event schema defined
   */
  hasSchema(nodeId: string): boolean {
    return this.eventSchemas.has(nodeId);
  }
}

/**
 * Create a validated event emitter for a specific node
 *
 * @example
 * ```typescript
 * const emit = createValidatedEmitter(validator, 'graph-converter', span);
 *
 * // Type-safe and runtime-validated
 * emit('conversion.started', {
 *   'config.nodeTypes': nodeTypes.length,
 *   'config.edgeTypes': edgeTypes.length
 * });
 * ```
 */
export function createValidatedEmitter(
  validator: EventValidator,
  nodeId: string,
  addEventFn: (eventName: string, attributes: Record<string, any>) => void,
  options: { strict?: boolean } = {}
): (eventName: string, attributes: Record<string, any>) => void {
  return (eventName: string, attributes: Record<string, any>) => {
    // Validate against schema
    const result = validator.validate(nodeId, eventName, attributes);

    if (!result.valid) {
      if (options.strict !== false) {
        // Strict mode: throw on validation errors
        throw new EventValidationError(eventName, nodeId, result.errors);
      } else {
        // Permissive mode: log warnings but allow the event
        console.warn(
          `Event validation warnings for '${eventName}' on node '${nodeId}':`,
          result.errors
        );
      }
    }

    // Emit the event
    addEventFn(eventName, attributes);
  };
}
