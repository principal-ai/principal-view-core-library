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

// Export Canvas types and converter
export * from './types/canvas';
export { CanvasConverter } from './utils/CanvasConverter';
export type { ReactFlowNode, ReactFlowEdge } from './utils/CanvasConverter';

// Export session management (Event Recording System)
export { SessionManager } from './SessionManager';
export type {
  SessionStatus,
  SessionResult,
  SessionMetadata,
  EventSession,
  CreateSessionOptions,
  EndSessionOptions,
  SessionChangeCallback,
  SessionManagerConfig,
} from './SessionManager';

// Export event recorder service
export { EventRecorderService } from './EventRecorderService';
export type {
  ProtocolMessageType,
  ProtocolMessage,
  SessionStartMessage,
  SessionEndMessage,
  LogMessage,
  LogBatchMessage,
  PingMessage,
  PongMessage,
  ErrorMessage,
  AckMessage,
  IncomingMessage,
  OutgoingMessage,
  RecordingMode,
  EventCallback,
  EventBatchCallback,
  ConnectionState,
  EventRecorderServiceConfig,
} from './EventRecorderService';

// Export configuration loading (Phase 2: Multi-config support)
export { ConfigurationLoader } from './ConfigurationLoader';
export type { ConfigurationFile, ConfigurationLoadResult } from './ConfigurationLoader';
export { parseYaml, isYamlFile, getConfigNameFromFilename } from './utils/YamlParser';
export type { YamlParseResult } from './utils/YamlParser';

// Export component library support
export { LibraryLoader } from './LibraryLoader';
export { LibraryConverter } from './utils/LibraryConverter';
export type { CreateNodeOptions, CreateEdgeOptions } from './utils/LibraryConverter';

// Re-export FileSystemAdapter from repository-abstraction
export type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
export { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';
