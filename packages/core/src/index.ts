/**
 * @principal-ai/visual-validation-core
 * Core logic and types for graph-based visual validation framework
 */

// Export all types
export * from './types';

// Export core classes
export { EventProcessor } from './EventProcessor';
export type { ProcessingResult } from './EventProcessor';

export { ValidationEngine } from './ValidationEngine';

export { ConfigurationValidator } from './ConfigurationValidator';
export type { ConfigurationValidationError, ConfigurationValidationResult } from './ConfigurationValidator';

// Export helpers
export { GraphInstrumentationHelper } from './helpers/GraphInstrumentationHelper';

// Export path-based processing (Milestone 1 & 2)
export { PathBasedEventProcessor } from './PathBasedEventProcessor';
export type { LogEntry } from './PathBasedEventProcessor';

// Export path utilities
export { PathMatcher } from './utils/PathMatcher';
export { GraphConverter } from './utils/GraphConverter';

// Export configuration loading (Phase 2: Multi-config support)
export { ConfigurationLoader } from './ConfigurationLoader';
export type { ConfigurationFile, ConfigurationLoadResult } from './ConfigurationLoader';
export { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';
export type { YamlParseResult } from './utils/YamlParser';

// Re-export FileSystemAdapter from repository-abstraction
export type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
export { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';
