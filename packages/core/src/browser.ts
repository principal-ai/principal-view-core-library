/**
 * @principal-ai/principal-view-core/browser
 * MINIMAL browser-safe exports (no Node.js dependencies)
 * Only exports what's needed for React components
 */

// Export essential types only
export type {
  GraphConfiguration,
  NodeState,
  EdgeState,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  Violation,
  GraphEvent,
  ComponentLibrary,
  LogLevel,
} from './types';

// Export Canvas types and converter (THE MAIN BROWSER EXPORT)
export * from './types/canvas';
export { CanvasConverter } from './utils/CanvasConverter';
export type { ReactFlowNode, ReactFlowEdge } from './utils/CanvasConverter';

// Export YAML parsing (browser-compatible)
export { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';
export type { YamlParseResult } from './utils/YamlParser';

// NOTE: Everything else requires Node.js dependencies and is NOT exported in browser bundle
// Use the main entry point ('@principal-ai/principal-view-core') in Node.js environments
