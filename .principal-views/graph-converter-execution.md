# Graph Converter Execution

This canvas documents the execution flow for graph conversion with event schema validation.

## Overview

The Graph Converter transforms configuration data into graph nodes and edges for visualization in the Principal View framework. This process includes validation, transformation, and output generation.

## Events

The graph converter emits the following telemetry events during execution:

### conversion.started
Graph conversion begins.

**Attributes:**
- `config.nodeTypes` (number, required): Number of node types in configuration
- `config.edgeTypes` (number, required): Number of edge types in configuration

### conversion.processingNodes
Processing node definitions.

**Attributes:**
- `nodes.count` (number, required): Number of nodes being processed

### conversion.processingEdges
Processing edge definitions.

**Attributes:**
- `edges.count` (number, required): Number of edges being processed

### conversion.complete
Graph conversion completes successfully.

**Attributes:**
- `result.nodes.count` (number, required): Number of nodes in result
- `result.edges.count` (number, required): Number of edges in result
- `duration.ms` (number, optional): Conversion duration in milliseconds

### conversion.error
Error during conversion.

**Attributes:**
- `error.message` (string, required): Error message
- `error.phase` (string, optional): Phase where error occurred

## Source Files

- `packages/core/src/utils/GraphConverter.ts` - Main graph converter implementation
- `packages/core/src/ConfigurationValidator.ts` - Configuration validation logic

## Related Documentation

- [Event Schema Validation Guide](./EVENT-SCHEMA-VALIDATION-GUIDE.md)
- [Code Generation Guide](./CODE-GENERATION-GUIDE.md)
