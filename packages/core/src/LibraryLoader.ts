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
  load(baseDir: string): LibraryLoadResult {
    const configPath = this.fsAdapter.join(baseDir, CONFIG_DIR);

    // Check if .principal-views directory exists
    if (!this.fsAdapter.exists(configPath) || !this.fsAdapter.isDirectory(configPath)) {
      return {
        success: false,
        error: 'Configuration directory .principal-views/ not found',
        path: configPath,
      };
    }

    // Try each default library file name
    for (const fileName of DEFAULT_LIBRARY_FILES) {
      const fullPath = this.fsAdapter.join(configPath, fileName);

      if (this.fsAdapter.exists(fullPath)) {
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
  loadFromPath(filePath: string): LibraryLoadResult {
    try {
      const content = this.fsAdapter.readFile(filePath);
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
  hasLibrary(baseDir: string): boolean {
    const configPath = this.fsAdapter.join(baseDir, CONFIG_DIR);

    if (!this.fsAdapter.exists(configPath) || !this.fsAdapter.isDirectory(configPath)) {
      return false;
    }

    return DEFAULT_LIBRARY_FILES.some((fileName) =>
      this.fsAdapter.exists(this.fsAdapter.join(configPath, fileName))
    );
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

    // Validate node components
    for (const [key, node] of Object.entries(library.nodeComponents)) {
      if (!node.shape) {
        return `Node component '${key}' is missing required field 'shape' in ${filePath}`;
      }
    }

    // Validate edge components
    for (const [key, edge] of Object.entries(library.edgeComponents)) {
      if (!edge.style) {
        return `Edge component '${key}' is missing required field 'style' in ${filePath}`;
      }
    }

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

    return undefined;
  }
}
