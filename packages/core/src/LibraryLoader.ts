/**
 * Library Loader
 *
 * Loads component library files (.yaml, .yml, or .json) from the .principal-views/ folder.
 * Component libraries contain reusable node and edge type definitions.
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type { ComponentLibrary, LibraryLoadResult } from './types/library';
import * as yaml from 'js-yaml';

/**
 * Default library file names to search for (in order of preference)
 */
const DEFAULT_LIBRARY_FILES = ['library.yaml', 'library.yml', 'library.json'];

/**
 * Configuration directory name
 */
const CONFIG_DIR = '.principal-views';

/**
 * Loader for component library files
 */
export class LibraryLoader {
  constructor(private fsAdapter: FileSystemAdapter) {}

  /**
   * Load the component library from the .principal-views/ folder
   *
   * Searches for library.yaml, library.yml, or library.json (in that order).
   *
   * @param baseDir - Base directory containing .principal-views/ folder
   * @returns Library load result
   */
  async load(baseDir: string): Promise<LibraryLoadResult> {
    const configPath = this.fsAdapter.join(baseDir, CONFIG_DIR);

    // Check if .principal-views directory exists
    const configExists = await this.fsAdapter.exists(configPath);
    const isDir = configExists ? await this.fsAdapter.isDirectory(configPath) : false;

    if (!configExists || !isDir) {
      return {
        success: false,
        error: 'Configuration directory .principal-views/ not found',
        path: configPath,
      };
    }

    // Try each default library file name
    for (const fileName of DEFAULT_LIBRARY_FILES) {
      const fullPath = this.fsAdapter.join(configPath, fileName);

      if (await this.fsAdapter.exists(fullPath)) {
        return this.loadFromPath(fullPath);
      }
    }

    return {
      success: false,
      error: `No library file found. Expected one of: ${DEFAULT_LIBRARY_FILES.join(', ')}`,
      path: configPath,
    };
  }

  /**
   * Load a library from a specific file path
   *
   * @param filePath - Full path to the library file
   * @returns Library load result
   */
  async loadFromPath(filePath: string): Promise<LibraryLoadResult> {
    try {
      const content = await this.fsAdapter.readFile(filePath);
      const isJson = filePath.endsWith('.json');

      const library = isJson
        ? this.parseJson(content, filePath)
        : this.parseYaml(content, filePath);

      const validationError = this.validate(library, filePath);
      if (validationError) {
        return {
          success: false,
          error: validationError,
          path: filePath,
        };
      }

      return {
        success: true,
        library,
        path: filePath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to load library: ${errorMessage}`,
        path: filePath,
      };
    }
  }

  /**
   * Check if a library file exists in the .principal-views/ folder
   *
   * @param baseDir - Base directory containing .principal-views/ folder
   * @returns True if a library file exists
   */
  async hasLibrary(baseDir: string): Promise<boolean> {
    const configPath = this.fsAdapter.join(baseDir, CONFIG_DIR);

    const configExists = await this.fsAdapter.exists(configPath);
    if (!configExists) {
      return false;
    }

    const isDir = await this.fsAdapter.isDirectory(configPath);
    if (!isDir) {
      return false;
    }

    for (const fileName of DEFAULT_LIBRARY_FILES) {
      const fullPath = this.fsAdapter.join(configPath, fileName);
      if (await this.fsAdapter.exists(fullPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the path where the library file would be located
   *
   * @param baseDir - Base directory
   * @param format - Preferred format ('yaml' or 'json')
   * @returns Full path to the library file
   */
  getLibraryPath(baseDir: string, format: 'yaml' | 'json' = 'yaml'): string {
    const fileName = format === 'json' ? 'library.json' : 'library.yaml';
    return this.fsAdapter.join(baseDir, CONFIG_DIR, fileName);
  }

  /**
   * Parse YAML content into a library object
   */
  private parseYaml(content: string, filePath: string): ComponentLibrary {
    const data = yaml.load(content);

    if (!data || typeof data !== 'object') {
      throw new Error(`Empty or invalid YAML in ${filePath}`);
    }

    return data as ComponentLibrary;
  }

  /**
   * Parse JSON content into a library object
   */
  private parseJson(content: string, filePath: string): ComponentLibrary {
    try {
      const data = JSON.parse(content);
      return data as ComponentLibrary;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * Validate the library structure
   *
   * @param library - Parsed library object
   * @param filePath - File path for error messages
   * @returns Error message if invalid, undefined if valid
   */
  private validate(library: ComponentLibrary, filePath: string): string | undefined {
    if (!library.version) {
      return `Missing required field 'version' in ${filePath}`;
    }

    if (!library.name) {
      return `Missing required field 'name' in ${filePath}`;
    }

    if (!library.nodeComponents || typeof library.nodeComponents !== 'object') {
      return `Missing or invalid 'nodeComponents' in ${filePath}`;
    }

    if (!library.edgeComponents || typeof library.edgeComponents !== 'object') {
      return `Missing or invalid 'edgeComponents' in ${filePath}`;
    }

    // Note: nodeComponents and edgeComponents fields like 'shape' and 'style' are optional.
    // The CLI validator only checks for unknown fields, not required fields.
    // Visual rendering code should handle missing shape/style gracefully with defaults.

    // Validate event schemas if present
    if (library.eventSchemas) {
      if (typeof library.eventSchemas !== 'object') {
        return `Field 'eventSchemas' must be an object in ${filePath}`;
      }

      for (const [eventName, schema] of Object.entries(library.eventSchemas)) {
        if (!schema.description) {
          return `Event schema '${eventName}' is missing required field 'description' in ${filePath}`;
        }

        if (!schema.attributes || typeof schema.attributes !== 'object') {
          return `Event schema '${eventName}' is missing or has invalid 'attributes' field in ${filePath}`;
        }

        // Validate each attribute in the event schema
        for (const [attrName, attrSchema] of Object.entries(schema.attributes)) {
          if (!attrSchema.type) {
            return `Event schema '${eventName}' attribute '${attrName}' is missing required field 'type' in ${filePath}`;
          }

          const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
          if (!validTypes.includes(attrSchema.type)) {
            return `Event schema '${eventName}' attribute '${attrName}' has invalid type '${attrSchema.type}' in ${filePath}. Valid types: ${validTypes.join(', ')}`;
          }
        }
      }
    }

    // Validate connection rules if present
    if (library.connectionRules) {
      for (const [index, rule] of library.connectionRules.entries()) {
        if (!rule.from || !rule.to || !rule.via) {
          return `Connection rule at index ${index} is missing required fields (from, to, via) in ${filePath}`;
        }

        // Check that referenced types exist
        if (!library.nodeComponents[rule.from]) {
          return `Connection rule references unknown node type '${rule.from}' in ${filePath}`;
        }
        if (!library.nodeComponents[rule.to]) {
          return `Connection rule references unknown node type '${rule.to}' in ${filePath}`;
        }
        if (!library.edgeComponents[rule.via]) {
          return `Connection rule references unknown edge type '${rule.via}' in ${filePath}`;
        }
      }
    }

    // Validate resources if present
    if (library.resources) {
      if (typeof library.resources !== 'object' || Array.isArray(library.resources)) {
        return `Field 'resources' must be an object in ${filePath}`;
      }

      for (const [serviceId, resourceAttrs] of Object.entries(library.resources)) {
        // Check that each service has a resource attributes object
        if (typeof resourceAttrs !== 'object' || Array.isArray(resourceAttrs) || resourceAttrs === null) {
          return `Resource entry '${serviceId}' must be an object in ${filePath}`;
        }

        // Check that service.name is present (required)
        if (!resourceAttrs['service.name']) {
          return `Resource entry '${serviceId}' is missing required attribute 'service.name' in ${filePath}`;
        }

        // Validate attribute values
        for (const [attrName, attrValue] of Object.entries(resourceAttrs)) {
          // owned-scopes is allowed to be an array of strings
          if (attrName === 'owned-scopes') {
            if (!Array.isArray(attrValue)) {
              return `Resource '${serviceId}' attribute 'owned-scopes' must be an array in ${filePath}`;
            }
            for (const scope of attrValue) {
              if (typeof scope !== 'string') {
                return `Resource '${serviceId}' attribute 'owned-scopes' must contain only strings in ${filePath}`;
              }
            }
          } else if (typeof attrValue !== 'string') {
            return `Resource '${serviceId}' attribute '${attrName}' must have a string value in ${filePath}`;
          }
        }
      }
    }

    return undefined;
  }
}
