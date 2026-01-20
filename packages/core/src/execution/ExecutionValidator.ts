/**
 * Execution File Validator
 *
 * Validates execution files (.spans.json, .execution.json, .otel.json, .events.json)
 * to ensure they conform to the expected structure before loading in UI components.
 */

/**
 * Execution data structure (as expected by ExecutionLoader and UI components)
 */
export interface ExecutionData {
  metadata?: {
    status?: string;
    testName?: string;
    sessionId?: string;
    startTime?: number;
    endTime?: number;
    canvasName?: string;
    exportedAt?: string;
    source?: string;
    framework?: string;
  };
  spans: Array<{
    id: string;
    name: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    status?: 'OK' | 'ERROR';
    attributes?: Record<string, unknown>;
    events: Array<{
      time: number;
      name: string;
      attributes: Record<string, unknown>;
    }>;
  }>;
}

/**
 * Validation error details
 */
export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

/**
 * Validation result
 */
export interface ExecutionValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validator for execution files
 */
export class ExecutionValidator {
  /**
   * Validate execution data structure
   */
  validate(data: unknown, filePath?: string): ExecutionValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check if data is an object
    if (!data || typeof data !== 'object') {
      errors.push({
        path: filePath || 'root',
        message: 'Execution data must be an object',
        severity: 'error',
        suggestion: 'Expected: { spans: [...], metadata?: {...} }',
      });
      return { valid: false, errors, warnings };
    }

    // Check if it's an array (common mistake)
    if (Array.isArray(data)) {
      errors.push({
        path: filePath || 'root',
        message: 'Execution data should be an object, not an array',
        severity: 'error',
        suggestion:
          'Wrap array in object: { "spans": [...], "metadata": {...} }',
      });
      return { valid: false, errors, warnings };
    }

    const execution = data as Partial<ExecutionData>;

    // Check required fields
    if (!execution.spans) {
      errors.push({
        path: 'spans',
        message: 'Missing required "spans" array',
        severity: 'error',
        suggestion: 'Add "spans" property with array of span objects',
      });
      return { valid: false, errors, warnings };
    }

    if (!Array.isArray(execution.spans)) {
      errors.push({
        path: 'spans',
        message: '"spans" must be an array',
        severity: 'error',
        suggestion: 'Change "spans" to an array of span objects',
      });
      return { valid: false, errors, warnings };
    }

    // Validate metadata if present
    if (execution.metadata !== undefined) {
      if (typeof execution.metadata !== 'object' || execution.metadata === null) {
        errors.push({
          path: 'metadata',
          message: '"metadata" must be an object',
          severity: 'error',
        });
      } else {
        // Validate metadata fields
        const meta = execution.metadata;
        if (meta.startTime !== undefined && typeof meta.startTime !== 'number') {
          errors.push({
            path: 'metadata.startTime',
            message: '"startTime" must be a number (timestamp)',
            severity: 'error',
          });
        }
        if (meta.endTime !== undefined && typeof meta.endTime !== 'number') {
          errors.push({
            path: 'metadata.endTime',
            message: '"endTime" must be a number (timestamp)',
            severity: 'error',
          });
        }
      }
    }

    // Validate each span
    execution.spans.forEach((span, index) => {
      const spanPath = `spans[${index}]`;

      // Check span is an object
      if (!span || typeof span !== 'object') {
        errors.push({
          path: spanPath,
          message: 'Span must be an object',
          severity: 'error',
        });
        return;
      }

      // Required fields
      if (!span.id) {
        errors.push({
          path: `${spanPath}.id`,
          message: 'Span is missing required "id" field',
          severity: 'error',
          suggestion: `Add unique ID like "span-${index + 1}"`,
        });
      } else if (typeof span.id !== 'string') {
        errors.push({
          path: `${spanPath}.id`,
          message: 'Span "id" must be a string',
          severity: 'error',
        });
      }

      if (!span.name) {
        errors.push({
          path: `${spanPath}.name`,
          message: 'Span is missing required "name" field',
          severity: 'error',
        });
      } else if (typeof span.name !== 'string') {
        errors.push({
          path: `${spanPath}.name`,
          message: 'Span "name" must be a string',
          severity: 'error',
        });
      }

      if (!span.events) {
        errors.push({
          path: `${spanPath}.events`,
          message: 'Span is missing required "events" array',
          severity: 'error',
          suggestion: 'Add "events" array (can be empty [])',
        });
      } else if (!Array.isArray(span.events)) {
        errors.push({
          path: `${spanPath}.events`,
          message: 'Span "events" must be an array',
          severity: 'error',
        });
      } else {
        // Validate events
        span.events.forEach((event, eventIndex) => {
          const eventPath = `${spanPath}.events[${eventIndex}]`;

          if (!event || typeof event !== 'object') {
            errors.push({
              path: eventPath,
              message: 'Event must be an object',
              severity: 'error',
            });
            return;
          }

          if (!event.name) {
            errors.push({
              path: `${eventPath}.name`,
              message: 'Event is missing required "name" field',
              severity: 'error',
            });
          }

          if (event.time === undefined) {
            errors.push({
              path: `${eventPath}.time`,
              message: 'Event is missing required "time" field',
              severity: 'error',
            });
          } else if (typeof event.time !== 'number') {
            errors.push({
              path: `${eventPath}.time`,
              message: 'Event "time" must be a number (timestamp)',
              severity: 'error',
            });
          }

          if (!event.attributes) {
            warnings.push({
              path: `${eventPath}.attributes`,
              message: 'Event is missing "attributes" object',
              severity: 'warning',
              suggestion: 'Add empty object {} if no attributes needed',
            });
          } else if (
            typeof event.attributes !== 'object' ||
            Array.isArray(event.attributes)
          ) {
            errors.push({
              path: `${eventPath}.attributes`,
              message: 'Event "attributes" must be an object',
              severity: 'error',
            });
          }
        });
      }

      // Optional fields validation
      if (span.startTime !== undefined && typeof span.startTime !== 'number') {
        errors.push({
          path: `${spanPath}.startTime`,
          message: 'Span "startTime" must be a number (timestamp)',
          severity: 'error',
        });
      }

      if (span.endTime !== undefined && typeof span.endTime !== 'number') {
        errors.push({
          path: `${spanPath}.endTime`,
          message: 'Span "endTime" must be a number (timestamp)',
          severity: 'error',
        });
      }

      if (span.duration !== undefined && typeof span.duration !== 'number') {
        errors.push({
          path: `${spanPath}.duration`,
          message: 'Span "duration" must be a number',
          severity: 'error',
        });
      }

      if (span.status !== undefined) {
        if (span.status !== 'OK' && span.status !== 'ERROR') {
          errors.push({
            path: `${spanPath}.status`,
            message: 'Span "status" must be either "OK" or "ERROR"',
            severity: 'error',
          });
        }
      }

      if (span.attributes !== undefined) {
        if (
          typeof span.attributes !== 'object' ||
          Array.isArray(span.attributes)
        ) {
          errors.push({
            path: `${spanPath}.attributes`,
            message: 'Span "attributes" must be an object',
            severity: 'error',
          });
        }
      }
    });

    // Check for duplicate span IDs
    const spanIds = new Set<string>();
    execution.spans.forEach((span, index) => {
      if (span.id && spanIds.has(span.id)) {
        warnings.push({
          path: `spans[${index}].id`,
          message: `Duplicate span ID: "${span.id}"`,
          severity: 'warning',
          suggestion: 'Span IDs should be unique within an execution',
        });
      }
      if (span.id) {
        spanIds.add(span.id);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate and throw if invalid
   */
  validateOrThrow(data: unknown, filePath?: string): ExecutionData {
    const result = this.validate(data, filePath);

    if (!result.valid) {
      const errorMessages = result.errors.map(
        (e) => `${e.path}: ${e.message}${e.suggestion ? ` (${e.suggestion})` : ''}`
      );
      throw new Error(
        `Invalid execution data:\n${errorMessages.join('\n')}`
      );
    }

    return data as ExecutionData;
  }

  /**
   * Format validation result as human-readable report
   */
  formatReport(result: ExecutionValidationResult): string {
    const lines: string[] = [];

    if (result.valid && result.warnings.length === 0) {
      lines.push('✓ Execution data is valid');
      return lines.join('\n');
    }

    if (result.errors.length > 0) {
      lines.push('✗ Validation failed with errors:\n');
      result.errors.forEach((error) => {
        lines.push(`  ERROR: ${error.path}`);
        lines.push(`    ${error.message}`);
        if (error.suggestion) {
          lines.push(`    → ${error.suggestion}`);
        }
        lines.push('');
      });
    }

    if (result.warnings.length > 0) {
      lines.push('⚠ Warnings:\n');
      result.warnings.forEach((warning) => {
        lines.push(`  WARN: ${warning.path}`);
        lines.push(`    ${warning.message}`);
        if (warning.suggestion) {
          lines.push(`    → ${warning.suggestion}`);
        }
        lines.push('');
      });
    }

    return lines.join('\n');
  }
}

/**
 * Create a new execution validator instance
 */
export function createExecutionValidator(): ExecutionValidator {
  return new ExecutionValidator();
}
