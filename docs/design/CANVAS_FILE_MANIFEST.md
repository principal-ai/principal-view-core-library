# Canvas File Manifest Design

## Problem Statement

Currently, there is no aggregated view of files associated with canvases, workflows, or scenarios. To determine which files are in scope, consumers must:

1. Parse the canvas JSON and iterate through all nodes
2. Parse associated workflow files for their `files` property
3. Handle different OTEL node types (`otel-event`, `otel-span-convention`, etc.)
4. Handle different canvas types (`otel`, `scopes`, `spans`, `resources`)

This creates friction for panels like **Code City** that need to:
- Know which files are "in scope" for a canvas/workflow
- Understand what type of association each file has
- Map files back to the nodes/workflows that reference them
- Filter files by scenario (which events are used)

## Hierarchy Overview

```
Storyboard (folder)
├── main.otel.canvas          # Main canvas with nodes
│   └── nodes[]
│       └── otel.files[]      # Instrumentation files
│       └── otel.references[] # External references
├── workflow-a/
│   ├── workflow-a.workflow.json
│   │   └── files[]           # Root span instrumentation files
│   │   └── scenarios[]
│   │       └── template.events{}  # References canvas node events
│   └── test-trace.otel.json  # Test execution data
└── workflow-b/
    └── ...
```

### Canvas Types

| Extension | Type | Purpose | Node Types |
|-----------|------|---------|------------|
| `.otel.canvas` | `otel` | Workflow/event visualization | `otel-event` |
| `.scopes.canvas` | `scopes` | Instrumentation scope docs | `otel-scope` |
| `.spans.canvas` | `spans` | Span convention docs | `otel-span-convention` |
| `.resources.canvas` | `resources` | OTel resource docs | `otel-resource` |

### OtelMetadata (shared by all OTEL nodes)

All OTEL node types inherit from `OtelMetadata`:

```typescript
interface OtelMetadata {
  status?: 'draft' | 'approved' | 'implemented';
  files?: string[];       // Instrumentation file paths (internal)
  references?: string[];  // External docs/packages
  origin?: 'internal' | 'external';
}
```

**File association properties** (used by manifest):
- `otel.files` - paths to source files containing instrumentation
- `otel.references` - external documentation or package references

**Identification properties** (NOT used by manifest):
- `otel.scope` - tracer scope name (for `otel-scope` nodes)
- `otel.spanPattern` - span naming convention (for `otel-span-convention` nodes)
- `otel.resourceMatch` - resource attribute matching (for `otel-resource` nodes)

### File Sources by Level

| Level | Source | Property | Description |
|-------|--------|----------|-------------|
| **Canvas Node** | OTEL nodes | `otel.files` | Instrumentation file paths |
| **Canvas Node** | OTEL nodes | `otel.references` | External refs/docs |
| **Workflow** | WorkflowTemplate | `files` | Root span instrumentation |
| **Workflow** | WorkflowTemplate | `canvas` | Referenced canvas path |

## Proposed Solution

### Type Definitions

Add to `packages/core/src/discovery/types.ts`:

```typescript
// =============================================================================
// File Classification Types
// =============================================================================

/**
 * Classification of how a file relates to a canvas/workflow
 */
export type CanvasFileRole =
  | 'instrumentation'  // File contains OTEL instrumentation (from otel.files)
  | 'reference'        // External reference/documentation (from otel.references)
  | 'root-span'        // Root span instrumentation (from workflow.files)

/**
 * Origin of the file - internal to repo or external
 */
export type CanvasFileOrigin = 'internal' | 'external';

/**
 * Source level where the file was defined
 */
export type CanvasFileLevel = 'canvas-node' | 'workflow' | 'scenario';

// =============================================================================
// File Entry Types
// =============================================================================

/**
 * A file referenced by a canvas, workflow, or scenario
 */
export interface CanvasFile {
  /** File path (relative to repo root for internal, URL/package ref for external) */
  path: string;

  /** How this file relates to the canvas */
  role: CanvasFileRole;

  /** Whether the file is in this repo or external */
  origin: CanvasFileOrigin;

  /** Where this file reference was defined */
  level: CanvasFileLevel;

  /** IDs of nodes that reference this file (for canvas-node level) */
  nodeIds: string[];

  /** Node types that reference this file */
  nodeTypes: string[];

  /** Workflow IDs that reference this file (for workflow level) */
  workflowIds: string[];

  /** Event names associated with this file's nodes */
  eventNames: string[];
}

// =============================================================================
// Manifest Types
// =============================================================================

/**
 * File manifest for a single canvas (without workflows)
 */
export interface CanvasFileManifest {
  /** Canvas ID */
  canvasId: string;

  /** Canvas path */
  canvasPath: string;

  /** Canvas type */
  canvasType: CanvasType;

  /** All files from canvas nodes, deduplicated */
  files: CanvasFile[];

  /** Quick lookup by role */
  byRole: Record<CanvasFileRole, CanvasFile[]>;

  /** Quick lookup by origin */
  byOrigin: Record<CanvasFileOrigin, CanvasFile[]>;

  /** Reverse mapping: file path -> node IDs */
  fileToNodes: Map<string, string[]>;

  /** Reverse mapping: node ID -> file paths */
  nodeToFiles: Map<string, string[]>;

  /** Reverse mapping: event name -> file paths */
  eventToFiles: Map<string, string[]>;

  /** Summary statistics */
  stats: CanvasFileStats;
}

/**
 * File manifest for a workflow (includes canvas + workflow-level files)
 */
export interface WorkflowFileManifest extends CanvasFileManifest {
  /** Workflow ID */
  workflowId: string;

  /** Workflow path */
  workflowPath: string;

  /** Root span name */
  rootSpan?: string;

  /** Files from workflow.files property */
  workflowFiles: CanvasFile[];

  /** Merged files (canvas + workflow) */
  allFiles: CanvasFile[];

  /** Files filtered by scenario (scenario ID -> files) */
  byScenario: Map<string, CanvasFile[]>;
}

/**
 * File manifest for an entire storyboard
 */
export interface StoryboardFileManifest {
  /** Storyboard ID */
  storyboardId: string;

  /** Storyboard path */
  storyboardPath: string;

  /** Main canvas manifest */
  canvas: CanvasFileManifest;

  /** Workflow manifests */
  workflows: WorkflowFileManifest[];

  /** All files across canvas and all workflows */
  allFiles: CanvasFile[];

  /** Summary statistics */
  stats: StoryboardFileStats;
}

/**
 * Canvas-level statistics
 */
export interface CanvasFileStats {
  totalFiles: number;
  internalFiles: number;
  externalFiles: number;
  instrumentationFiles: number;
  referenceFiles: number;
  nodesWithFiles: number;
  nodesWithoutFiles: number;
  uniqueEventNames: number;
}

/**
 * Storyboard-level statistics
 */
export interface StoryboardFileStats extends CanvasFileStats {
  workflowCount: number;
  scenarioCount: number;
  rootSpanFiles: number;
}

// =============================================================================
// Extended Discovery Types
// =============================================================================

/**
 * Discovered canvas with content AND file manifest
 */
export interface DiscoveredCanvasWithManifest extends DiscoveredCanvasWithContent {
  manifest: CanvasFileManifest;
}

/**
 * Discovered workflow with content AND file manifest
 */
export interface DiscoveredWorkflowWithManifest extends DiscoveredWorkflowWithContent {
  manifest: WorkflowFileManifest;
}

/**
 * Discovered storyboard with content AND file manifest
 */
export interface DiscoveredStoryboardWithManifest extends DiscoveredStoryboardWithContent {
  manifest: StoryboardFileManifest;
}
```

### Implementation

Add `packages/core/src/discovery/CanvasFileManifest.ts`:

```typescript
import type {
  ExtendedCanvas,
  ExtendedCanvasNode,
  OtelNode,
  OtelEventNode
} from '../types/canvas';
import type { WorkflowTemplate, WorkflowScenario } from '../workflow/types';
import type {
  CanvasFileManifest,
  WorkflowFileManifest,
  StoryboardFileManifest,
  CanvasFile,
  CanvasFileRole,
  CanvasFileOrigin,
  CanvasFileLevel,
  CanvasType
} from './types';

// =============================================================================
// Type Guards
// =============================================================================

function isOtelNode(node: ExtendedCanvasNode): node is OtelNode {
  return node.type.startsWith('otel-');
}

function isOtelEventNode(node: ExtendedCanvasNode): node is OtelEventNode {
  return node.type === 'otel-event';
}

// =============================================================================
// Node File Extraction
// =============================================================================

interface ExtractedFile {
  path: string;
  role: CanvasFileRole;
  origin: CanvasFileOrigin;
  eventName?: string;
}

function extractNodeFiles(node: ExtendedCanvasNode): ExtractedFile[] {
  const files: ExtractedFile[] = [];

  // Only process OTEL nodes
  if (!isOtelNode(node) || !node.otel) {
    return files;
  }

  // Get event name if this is an otel-event node
  let eventName: string | undefined;
  if (isOtelEventNode(node)) {
    eventName = node.event?.name ?? node.eventRef;
  }

  const origin: CanvasFileOrigin = node.otel.origin ?? 'internal';

  // Instrumentation files
  if (node.otel.files) {
    for (const path of node.otel.files) {
      files.push({ path, role: 'instrumentation', origin, eventName });
    }
  }

  // References
  if (node.otel.references) {
    for (const path of node.otel.references) {
      files.push({ path, role: 'reference', origin: 'external', eventName });
    }
  }

  return files;
}

// =============================================================================
// Canvas Manifest Builder
// =============================================================================

/**
 * Build a file manifest from a canvas
 */
export function buildCanvasFileManifest(
  canvas: ExtendedCanvas,
  canvasId: string,
  canvasPath: string,
  canvasType: CanvasType = 'otel'
): CanvasFileManifest {
  const fileMap = new Map<string, CanvasFile>();
  const fileToNodes = new Map<string, string[]>();
  const nodeToFiles = new Map<string, string[]>();
  const eventToFiles = new Map<string, string[]>();
  const eventNames = new Set<string>();

  let nodesWithFiles = 0;
  let nodesWithoutFiles = 0;

  for (const node of canvas.nodes ?? []) {
    const nodeFiles = extractNodeFiles(node);

    if (nodeFiles.length > 0) {
      nodesWithFiles++;
      nodeToFiles.set(node.id, nodeFiles.map(f => f.path));
    } else {
      nodesWithoutFiles++;
    }

    for (const { path, role, origin, eventName } of nodeFiles) {
      // Track event names
      if (eventName) {
        eventNames.add(eventName);
        const existingEventFiles = eventToFiles.get(eventName) ?? [];
        if (!existingEventFiles.includes(path)) {
          existingEventFiles.push(path);
          eventToFiles.set(eventName, existingEventFiles);
        }
      }

      // Update fileToNodes mapping
      const existingNodes = fileToNodes.get(path) ?? [];
      if (!existingNodes.includes(node.id)) {
        existingNodes.push(node.id);
        fileToNodes.set(path, existingNodes);
      }

      // Update or create CanvasFile entry
      const existing = fileMap.get(path);
      if (existing) {
        if (!existing.nodeIds.includes(node.id)) {
          existing.nodeIds.push(node.id);
        }
        if (!existing.nodeTypes.includes(node.type)) {
          existing.nodeTypes.push(node.type);
        }
        if (eventName && !existing.eventNames.includes(eventName)) {
          existing.eventNames.push(eventName);
        }
        // Role priority: instrumentation > root-span > reference
        const rolePriority: Record<CanvasFileRole, number> = {
          'instrumentation': 3,
          'root-span': 2,
          'reference': 1
        };
        if (rolePriority[role] > rolePriority[existing.role]) {
          existing.role = role;
        }
      } else {
        fileMap.set(path, {
          path,
          role,
          origin,
          level: 'canvas-node',
          nodeIds: [node.id],
          nodeTypes: [node.type],
          workflowIds: [],
          eventNames: eventName ? [eventName] : []
        });
      }
    }
  }

  const files = Array.from(fileMap.values());

  // Build byRole lookup
  const byRole: Record<CanvasFileRole, CanvasFile[]> = {
    instrumentation: files.filter(f => f.role === 'instrumentation'),
    reference: files.filter(f => f.role === 'reference'),
    'root-span': files.filter(f => f.role === 'root-span')
  };

  // Build byOrigin lookup
  const byOrigin: Record<CanvasFileOrigin, CanvasFile[]> = {
    internal: files.filter(f => f.origin === 'internal'),
    external: files.filter(f => f.origin === 'external')
  };

  return {
    canvasId,
    canvasPath,
    canvasType,
    files,
    byRole,
    byOrigin,
    fileToNodes,
    nodeToFiles,
    eventToFiles,
    stats: {
      totalFiles: files.length,
      internalFiles: byOrigin.internal.length,
      externalFiles: byOrigin.external.length,
      instrumentationFiles: byRole.instrumentation.length,
      referenceFiles: byRole.reference.length,
      nodesWithFiles,
      nodesWithoutFiles,
      uniqueEventNames: eventNames.size
    }
  };
}

// =============================================================================
// Workflow Manifest Builder
// =============================================================================

/**
 * Build a file manifest for a workflow (includes canvas files)
 */
export function buildWorkflowFileManifest(
  canvasManifest: CanvasFileManifest,
  workflow: WorkflowTemplate,
  workflowId: string,
  workflowPath: string
): WorkflowFileManifest {
  // Extract workflow-level files
  const workflowFiles: CanvasFile[] = (workflow.files ?? []).map(path => ({
    path,
    role: 'root-span' as CanvasFileRole,
    origin: 'internal' as CanvasFileOrigin,
    level: 'workflow' as CanvasFileLevel,
    nodeIds: [],
    nodeTypes: [],
    workflowIds: [workflowId],
    eventNames: []
  }));

  // Merge canvas files with workflow files
  const allFilesMap = new Map<string, CanvasFile>();

  // Add canvas files first
  for (const file of canvasManifest.files) {
    allFilesMap.set(file.path, { ...file });
  }

  // Add/merge workflow files
  for (const file of workflowFiles) {
    const existing = allFilesMap.get(file.path);
    if (existing) {
      existing.workflowIds.push(workflowId);
      // Upgrade role if workflow-level
      if (file.role === 'root-span') {
        existing.role = 'root-span';
        existing.level = 'workflow';
      }
    } else {
      allFilesMap.set(file.path, file);
    }
  }

  const allFiles = Array.from(allFilesMap.values());

  // Build scenario -> files mapping
  const byScenario = new Map<string, CanvasFile[]>();
  for (const scenario of workflow.scenarios) {
    const scenarioFiles = getFilesForScenario(scenario, canvasManifest, workflowFiles);
    byScenario.set(scenario.id, scenarioFiles);
  }

  return {
    ...canvasManifest,
    workflowId,
    workflowPath,
    rootSpan: workflow.rootSpan ?? workflow.spanPattern,
    workflowFiles,
    allFiles,
    byScenario
  };
}

/**
 * Get files relevant to a specific scenario
 */
function getFilesForScenario(
  scenario: WorkflowScenario,
  canvasManifest: CanvasFileManifest,
  workflowFiles: CanvasFile[]
): CanvasFile[] {
  const files: CanvasFile[] = [];

  // Always include workflow-level files (root span)
  files.push(...workflowFiles);

  // Get event names from scenario template
  const eventNames = Object.keys(scenario.template.events ?? {});

  // Find files for each event
  for (const eventName of eventNames) {
    const eventFiles = canvasManifest.eventToFiles.get(eventName) ?? [];
    for (const filePath of eventFiles) {
      const canvasFile = canvasManifest.files.find(f => f.path === filePath);
      if (canvasFile && !files.some(f => f.path === filePath)) {
        files.push(canvasFile);
      }
    }
  }

  return files;
}

// =============================================================================
// Storyboard Manifest Builder
// =============================================================================

/**
 * Build a file manifest for an entire storyboard
 */
export function buildStoryboardFileManifest(
  canvasManifest: CanvasFileManifest,
  workflowManifests: WorkflowFileManifest[],
  storyboardId: string,
  storyboardPath: string
): StoryboardFileManifest {
  // Merge all files across canvas and workflows
  const allFilesMap = new Map<string, CanvasFile>();

  for (const file of canvasManifest.files) {
    allFilesMap.set(file.path, { ...file });
  }

  for (const workflow of workflowManifests) {
    for (const file of workflow.workflowFiles) {
      const existing = allFilesMap.get(file.path);
      if (existing) {
        existing.workflowIds.push(...file.workflowIds);
      } else {
        allFilesMap.set(file.path, { ...file });
      }
    }
  }

  const allFiles = Array.from(allFilesMap.values());

  // Count scenarios across all workflows
  const scenarioCount = workflowManifests.reduce(
    (sum, w) => sum + w.byScenario.size,
    0
  );

  return {
    storyboardId,
    storyboardPath,
    canvas: canvasManifest,
    workflows: workflowManifests,
    allFiles,
    stats: {
      ...canvasManifest.stats,
      workflowCount: workflowManifests.length,
      scenarioCount,
      rootSpanFiles: allFiles.filter(f => f.role === 'root-span').length
    }
  };
}
```

## Usage Examples

### Code City Panel - Basic Canvas

```typescript
import { buildCanvasFileManifest } from '@principal-ai/principal-view-core';

// When canvas is loaded
useEffect(() => {
  if (!scopesCanvasContent) return;

  const manifest = buildCanvasFileManifest(
    scopesCanvasContent,
    scopesCanvas?.id ?? 'unknown',
    scopesCanvas?.path ?? '',
    scopesCanvas?.type ?? 'otel'
  );

  // Highlight all instrumentation files in the city
  const filesToHighlight = manifest.byRole.instrumentation.map(f => f.path);
  setHighlightedFiles(filesToHighlight);

  // Show stats
  console.log(`${manifest.stats.instrumentationFiles} instrumentation files`);
  console.log(`${manifest.stats.uniqueEventNames} unique events`);

}, [scopesCanvasContent]);
```

### Code City Panel - With Workflow Context

```typescript
import {
  buildCanvasFileManifest,
  buildWorkflowFileManifest
} from '@principal-ai/principal-view-core';

// When workflow is selected
const handleWorkflowSelect = (workflow: WorkflowTemplate, workflowId: string) => {
  const workflowManifest = buildWorkflowFileManifest(
    canvasManifest,
    workflow,
    workflowId,
    workflowPath
  );

  // Show all files for this workflow
  setHighlightedFiles(workflowManifest.allFiles.map(f => f.path));
};

// When scenario is selected
const handleScenarioSelect = (scenarioId: string) => {
  const scenarioFiles = workflowManifest.byScenario.get(scenarioId) ?? [];

  // Show only files relevant to this scenario
  setHighlightedFiles(scenarioFiles.map(f => f.path));
};
```

### Bidirectional Navigation

```typescript
// When a node is selected in the canvas
const handleNodeSelect = (nodeId: string) => {
  const files = manifest.nodeToFiles.get(nodeId) ?? [];
  zoomToFiles(files);
};

// When a file is selected in the city
const handleFileSelect = (filePath: string) => {
  const nodeIds = manifest.fileToNodes.get(filePath) ?? [];
  highlightCanvasNodes(nodeIds);
};

// When an event is selected
const handleEventSelect = (eventName: string) => {
  const files = manifest.eventToFiles.get(eventName) ?? [];
  zoomToFiles(files);
};
```

## Integration with CanvasDiscovery

Update `DiscoveryOptions`:

```typescript
export interface DiscoveryOptions {
  fileReader?: (path: string) => Promise<string>;
  includeContent?: boolean;

  /** Build file manifests (requires includeContent: true) */
  includeManifest?: boolean;

  /** Include workflow manifests for storyboards */
  includeWorkflowManifests?: boolean;
}
```

## Export from Package

Add to `packages/core/src/index.ts`:

```typescript
// File manifest utilities
export {
  buildCanvasFileManifest,
  buildWorkflowFileManifest,
  buildStoryboardFileManifest
} from './discovery/CanvasFileManifest';

export type {
  CanvasFileManifest,
  WorkflowFileManifest,
  StoryboardFileManifest,
  CanvasFile,
  CanvasFileRole,
  CanvasFileOrigin,
  CanvasFileLevel,
  CanvasFileStats,
  StoryboardFileStats,
  DiscoveredCanvasWithManifest,
  DiscoveredWorkflowWithManifest,
  DiscoveredStoryboardWithManifest
} from './discovery/types';
```

## Migration Notes

1. **No breaking changes** - This is additive functionality
2. **OTEL nodes only** - Only supports new OTEL node types (`otel-event`, `otel-span-convention`, etc.)
3. **Optional** - Consumers can choose when to build manifests

## Testing Checklist

- [ ] Extract files from OTEL event nodes (`otel.files`, `otel.references`)
- [ ] Extract files from OTEL span convention nodes
- [ ] Extract files from OTEL scope/resource/boundary nodes
- [ ] Merge duplicate file references across nodes
- [ ] Build workflow manifest with root span files
- [ ] Filter files by scenario based on event names
- [ ] Build storyboard manifest aggregating all workflows
- [ ] Verify bidirectional mappings (file↔node, file↔event)
