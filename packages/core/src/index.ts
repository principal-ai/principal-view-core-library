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

// Export helpers
export { GraphInstrumentationHelper } from './helpers/GraphInstrumentationHelper';
