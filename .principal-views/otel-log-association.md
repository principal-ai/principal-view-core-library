# OTEL Log Association Architecture

This canvas shows how OpenTelemetry logs flow through the system and are associated with canvas nodes.

## Overview

The OTEL log association system routes telemetry logs to the appropriate canvas nodes based on:
- Source file paths
- Resource attributes
- Scope matching
- Canvas-level filtering

## Architecture Components

### OtelLog
TypeScript type representing an OpenTelemetry log record with standardized fields (timestamp, severity, body, attributes, resource, scope).

### OtelResource
Resource attributes that identify the source of telemetry (service name, deployment environment, etc.).

### LogRouter
Runtime service that routes incoming logs to canvas nodes based on matching criteria.

### Canvas Node
Visual representation in the canvas that receives and displays associated logs.

### ResourceMatch
Matching criteria for routing logs based on OTEL resource attributes.

### Audit Tracking
System for tracking log coverage, detecting orphaned logs, and generating reports.

## Log Routing Flow

1. OtelLog arrives with resource attributes and scope
2. LogRouter evaluates canvas scope filters
3. For each canvas node, check:
   - Source file path matching (pv.sources)
   - Resource attribute matching (pv.resourceMatch)
4. Route log to matching nodes
5. Track routing in audit system

## Related Documentation

- [Canvas Log Association](../docs/CANVAS_LOG_ASSOCIATION.md)
- [Event Schema Implementation](./EVENT-SCHEMA-IMPLEMENTATION-SUMMARY.md)
