# Version Registry Implementation

## Overview

This PR adds type definitions and an in-memory implementation for a Version Registry system that stores versioned snapshots of storyboard definitions. This enables traces to reference the exact workflow definitions that were active at specific commits.

## Changes Made

### 1. New Type Definitions (`packages/core/src/types/version-registry.ts`)

Added comprehensive type definitions for the version registry:

- **`VersionIdentifier`**: Repository URL + commit SHA
- **`VersionSnapshot`**: Complete snapshot of storyboards at a specific version, includes:
  - `repositoryUrl`: Git repository URL
  - `commitSha`: Full 40-character commit hash
  - `storyboards`: Array of `DiscoveredStoryboard` objects (full metadata)
  - `registeredAt`: Timestamp
  - `metadata`: Optional build/deployment info
- **`RegisterVersionRequest`**: Request format for registering versions
- **`GetVersionResponse`**: Response format for querying versions
- **`VersionRegistry`**: Interface defining registry operations

### 2. In-Memory Implementation (`packages/core/src/registry/VersionRegistry.ts`)

Created `InMemoryVersionRegistry` class for testing and development:

```typescript
import { createInMemoryVersionRegistry } from '@principal-ai/principal-view-core';

const registry = createInMemoryVersionRegistry();

// Register a version
await registry.register({
  repositoryUrl: 'https://github.com/org/repo',
  commitSha: 'abc123...',
  storyboards: discoveredStoryboards,
});

// Query a version
const response = await registry.get(
  'https://github.com/org/repo',
  'abc123...'
);
```

### 3. Test Coverage (`packages/core/src/registry/VersionRegistry.test.ts`)

Comprehensive test suite covering:
- Version registration and retrieval
- Existence checking
- Version deletion
- Listing versions per repository
- Edge cases and error handling

### 4. Export Updates (`packages/core/src/index.ts`)

Added exports for the new version registry functionality:

```typescript
export type {
  VersionIdentifier,
  VersionSnapshot,
  RegisterVersionRequest,
  GetVersionResponse,
  VersionRegistry,
} from './types/version-registry';

export {
  InMemoryVersionRegistry,
  createInMemoryVersionRegistry,
} from './registry/VersionRegistry';
```

### 5. Panel Integration Updates

Updated `TraceListPanel` to use the proper types:

```typescript
import type { VersionSnapshot } from '@principal-ai/principal-view-core';

// Get schematics from version registry
const schematicsSlice = context.getSlice<VersionSnapshot[]>('schematics');
```

### 6. Storybook Examples

Updated `TraceListPanel.stories.tsx` with realistic `VersionSnapshot` mock data showing:
- Multiple repositories
- Complete storyboard metadata (paths, canvas info, workflow details)
- Workflow templates with scenarios

## Data Structure

### What's Stored in the Registry

The version registry stores **complete `DiscoveredStoryboard` objects**, not just scenario data. Each storyboard includes:

```typescript
{
  id: string;                       // "ecommerce-journey"
  name: string;                     // "E-Commerce User Journey"
  path: string;                     // ".principal-views/ecommerce.otel.canvas"
  basename: string;                 // "ecommerce"
  scope: 'root' | 'package';
  packageName?: string;             // For monorepos
  canvas: {
    id: string;
    name: string;
    path: string;
    type: 'otel' | 'regular';
    // ...
  };
  workflows: Array<{
    id: string;                     // "authentication-workflow"
    name: string;                   // "Authentication Workflow"
    path: string;                   // ".principal-views/.../workflow.json"
    storyboardId: string;
    testTraces: [];
    content?: WorkflowTemplate;     // Optional: includes scenarios
  }>;
}
```

## Usage in Production

### During CI/CD Build

When building/deploying a version:

```typescript
import { CanvasDiscovery } from '@principal-ai/principal-view-core';
import { FilesystemService } from '@principal-ai/codebase-composition/node';

// 1. Discover storyboards from the codebase
const discovery = new CanvasDiscovery();
const fileTree = await buildFileSystemTree(repoPath);
const result = await discovery.discover(fileTree, {
  includeContent: true,  // Include workflow templates with scenarios
  fileReader: async (path) => fs.readFile(path, 'utf-8'),
});

// 2. Register in version registry
await versionRegistry.register({
  repositoryUrl: process.env.GIT_REPO_URL,
  commitSha: process.env.GIT_COMMIT_SHA,
  storyboards: result.storyboards,
  metadata: {
    environment: 'production',
    branch: process.env.GIT_BRANCH,
  },
});
```

### During Trace Processing

When a trace arrives with version attributes:

```typescript
// Extract version info from trace attributes
const repositoryUrl = getAttributeValue(trace.resource, 'repository.url');
const commitSha = getAttributeValue(trace.resource, 'repository.commit');

// Query version registry
const response = await versionRegistry.get(repositoryUrl, commitSha);

if (response.found) {
  // Populate schematics slice with versioned storyboards
  context.setSlice('schematics', response.snapshot.storyboards);
}
```

## Implementation Notes

### For Production Use

The `InMemoryVersionRegistry` is suitable for:
- Testing
- Development
- Single-instance deployments

For production, implement the `VersionRegistry` interface with:
- **Database**: PostgreSQL, MongoDB, DynamoDB
- **Key-value store**: Redis (with persistence)
- **Object storage**: S3 with index
- **Hybrid**: Database for metadata + S3 for storyboard content

### Key Features

1. **Complete Metadata**: Stores full file paths, canvas info, package names
2. **Workflow Content**: Can include scenario definitions via `includeContent`
3. **Monorepo Support**: Package-aware storyboard organization
4. **Versioned Snapshots**: Exact state at specific commits

## Benefits

1. **Trace-to-Workflow Matching**: Traces can reference exact workflow versions
2. **Historical Analysis**: Compare workflow changes across versions
3. **Debugging**: See what scenarios were available when traces were captured
4. **Consistency**: Same UI for local and versioned storyboards

## Next Steps

1. Implement persistent version registry backend
2. Add version registration to CI/CD pipeline
3. Connect telemetry ingestion to query version registry
4. Populate `schematics` slice from version registry data
5. Consider adding workflow template caching for performance
