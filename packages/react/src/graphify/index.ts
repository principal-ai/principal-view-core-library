/**
 * Graphify integration types.
 *
 * Type-compatible view of graphify's graph.json data model for consuming
 * graphify output (nodes, links, hyperedges) inside this library.
 */

export type {
  JsonValue,
  GraphifyFileType,
  GraphifyConfidence,
  GraphifyNodeType,
  GraphifyRelation,
  GraphifyNode,
  GraphifyEdge,
  GraphifyHyperedge,
  GraphifyGraphMetadata,
  GraphifyGraph,
} from './types';
export type {
  GraphifyAnchorResolution,
  SubsystemGraphifyAnchor,
  GraphifyMethodInfo,
  GraphifyPropertyInfo,
  GraphifyParamInfo,
  GraphifyCallInfo,
  GraphifyReferenceInfo,
  GraphifyImportInfo,
  GraphifyClassDetail,
  GraphifyFunctionDetail,
  GraphifyTypeDetail,
  GraphifyModuleDetail,
  GraphifyExternalDetail,
  GraphifyComponentDetail,
  GraphifyEdgeRef,
} from './consolidated';
