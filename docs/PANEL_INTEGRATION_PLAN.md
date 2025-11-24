# Panel Integration Plan: Visual Validation Graph

Plan for integrating the Visual Validation Framework into the industry-themed-panel-starter as a displayable panel.

## Overview

Create a **Visual Validation Graph Panel** that visualizes configurations from the `.vgc/` folder as interactive graph diagrams within the Panel Extension Framework. The framework now supports multiple configurations, allowing users to switch between different architectural views (e.g., architecture, data-flow, deployment) within the same panel.

## Phase 1: Setup & Dependencies

### 1.1 Add VVF Dependencies to Panel Starter

```bash
cd /Users/griever/Developer/industry-themed-panels/industry-themed-panel-starter

# Add our published packages
bun add @principal-ai/visual-validation-core@0.3.1
bun add @principal-ai/visual-validation-react@0.3.1
bun add @principal-ai/repository-abstraction@0.2.5

# Add required peer dependencies (if not already present)
bun add @xyflow/react framer-motion
```

### 1.2 Verify Package Compatibility

Check that versions align:
- React 19+ (already in starter)
- TypeScript 5+ (already in starter)
- Lucide React (already in starter)

---

## Phase 2: Create the Graph Panel Component

### 2.1 File Structure

```
src/panels/
├── VisualValidationGraphPanel.tsx          # Main panel component
├── VisualValidationGraphPanel.stories.tsx  # Storybook stories
├── visual-validation/
│   ├── ConfigManager.tsx                   # Loads configs from .vgc/ folder
│   ├── GraphContainer.tsx                  # Wrapper for GraphRenderer
│   ├── ConfigSelector.tsx                  # Switch between configs
│   ├── ConfigEditor.tsx                    # Optional: Edit config
│   └── NodeDetailPanel.tsx                 # Shows node details on click
```

### 2.2 Main Panel Component

**File**: `src/panels/VisualValidationGraphPanel.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import type { PanelComponentProps } from '@principal-ade/panel-framework-core';
import { ThemeProvider, useTheme } from '@principal-ade/industry-theme';
import {
  GraphRenderer,
  ConfigurationSelector
} from '@principal-ai/visual-validation-react';
import {
  ConfigurationLoader,
  type ConfigurationFile
} from '@principal-ai/visual-validation-core';
import { FileText, AlertCircle, Loader } from 'lucide-react';

interface GraphPanelState {
  configurations: ConfigurationFile[];
  selectedConfig: string | null;
  nodes: any[];
  edges: any[];
  loading: boolean;
  error: string | null;
}

export const VisualValidationGraphPanel: React.FC<PanelComponentProps> = ({
  context,
  actions,
  events
}) => {
  const { theme } = useTheme();
  const [state, setState] = useState<GraphPanelState>({
    configurations: [],
    selectedConfig: null,
    nodes: [],
    edges: [],
    loading: true,
    error: null
  });

  // Load all configurations from .vgc/ folder
  useEffect(() => {
    loadConfigurations();
  }, []);

  // Subscribe to file system events
  useEffect(() => {
    const unsubscribe = events.on('data:refresh', () => {
      loadConfigurations();
    });

    return unsubscribe;
  }, [events]);

  const loadConfigurations = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Check if fileTree slice is available
      if (!context.hasSlice('fileTree')) {
        throw new Error('File tree data not available');
      }

      const fileTree = context.getSlice('fileTree');

      // Create a file system adapter from the file tree
      const fsAdapter = createFileTreeAdapter(fileTree);

      // Use ConfigurationLoader to load all configs from .vgc/
      const loader = new ConfigurationLoader(fsAdapter);
      const result = loader.loadAll(context.getProjectRoot());

      if (result.errors.length > 0) {
        console.warn('Configuration loading errors:', result.errors);
      }

      if (result.configs.length === 0) {
        throw new Error('No configurations found in .vgc/ folder');
      }

      // Select the first config by default
      const selectedConfig = result.configs[0].name;

      // Convert selected config to nodes/edges
      const { nodes, edges } = configToGraph(result.configs[0].config);

      setState({
        configurations: result.configs,
        selectedConfig,
        nodes,
        edges,
        loading: false,
        error: null
      });
    } catch (error) {
      setState({
        configurations: [],
        selectedConfig: null,
        nodes: [],
        edges: [],
        loading: false,
        error: error.message
      });
    }
  };

  const handleConfigChange = (configName: string) => {
    const config = state.configurations.find(c => c.name === configName);
    if (config) {
      const { nodes, edges } = configToGraph(config.config);
      setState(prev => ({
        ...prev,
        selectedConfig: configName,
        nodes,
        edges
      }));
    }
  };

  const handleNodeClick = (nodeId: string) => {
    // Open the source file associated with this node
    const node = state.nodes.find(n => n.id === nodeId);
    if (node?.data?.sources?.[0]) {
      actions.openFile(node.data.sources[0]);
    }
  };

  if (state.loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: theme.colors.textMuted
      }}>
        <Loader size={24} className="animate-spin" />
        <span style={{ marginLeft: theme.space[2] }}>
          Loading configuration...
        </span>
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: theme.space[4],
        color: theme.colors.error
      }}>
        <AlertCircle size={48} />
        <h3 style={{ marginTop: theme.space[3] }}>Configuration Error</h3>
        <p style={{ color: theme.colors.textMuted, marginTop: theme.space[2] }}>
          {state.error}
        </p>
        <button
          onClick={loadConfiguration}
          style={{
            marginTop: theme.space[4],
            padding: `${theme.space[2]} ${theme.space[4]}`,
            backgroundColor: theme.colors.primary,
            color: theme.colors.background,
            border: 'none',
            borderRadius: theme.radii[1],
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <GraphRenderer
        configuration={state.config}
        nodes={state.nodes}
        edges={state.edges}
        onNodeClick={handleNodeClick}
      />
    </div>
  );
};

// Helper functions
function findConfigFile(fileTree: any): any {
  // Search for vvf.config.yaml or .vvf.yaml
  // Implementation depends on FileTree structure
}

function parseYamlConfig(content: string): PathBasedGraphConfiguration {
  // Parse YAML to PathBasedGraphConfiguration
  // Would use js-yaml or similar
}

function configToGraph(config: PathBasedGraphConfiguration): { nodes: any[], edges: any[] } {
  // Convert PathBasedGraphConfiguration to nodes/edges
  // Use existing converter utilities or create new ones
}
```

### 2.3 Register Panel

**File**: `src/index.tsx`

```typescript
import { VisualValidationGraphPanel } from './panels/VisualValidationGraphPanel';

export const panels: PanelComponent[] = [
  {
    id: 'org.principal-ai.visual-validation-graph',
    name: 'Visual Validation Graph',
    component: VisualValidationGraphPanel,
    version: '0.1.0',
    description: 'Visualizes vvf.config.yaml as an interactive graph',
    tags: ['visualization', 'configuration', 'graph'],
    requiredSlices: ['fileTree'],
    optionalSlices: ['quality', 'git'],
    icon: 'network', // Lucide icon name
  },
  // ... other panels
];
```

---

## Phase 3: Configuration Loading

### 3.1 Add YAML Parser

```bash
bun add js-yaml
bun add -d @types/js-yaml
```

### 3.2 Create Config Loader Utility

**File**: `src/panels/visual-validation/ConfigLoader.tsx`

```typescript
import YAML from 'js-yaml';
import type { PathBasedGraphConfiguration } from '@principal-ai/visual-validation-core';

export class ConfigLoader {
  /**
   * Find vvf.config.yaml in file tree
   */
  static findConfigFile(fileTree: any): string | null {
    // Search for:
    // - vvf.config.yaml
    // - vvf.config.yml
    // - .vvf.yaml
    // - .vvf.yml

    const configNames = [
      'vvf.config.yaml',
      'vvf.config.yml',
      '.vvf.yaml',
      '.vvf.yml'
    ];

    // Iterate through file tree
    for (const name of configNames) {
      const file = this.searchFileTree(fileTree, name);
      if (file) return file;
    }

    return null;
  }

  /**
   * Parse YAML content to config object
   */
  static parseYaml(content: string): PathBasedGraphConfiguration {
    try {
      const config = YAML.load(content) as any;

      // Validate config structure
      this.validateConfig(config);

      return config as PathBasedGraphConfiguration;
    } catch (error) {
      throw new Error(`Invalid YAML: ${error.message}`);
    }
  }

  /**
   * Validate config has required fields
   */
  static validateConfig(config: any): void {
    if (!config.metadata) {
      throw new Error('Missing metadata section');
    }
    if (!config.nodeTypes) {
      throw new Error('Missing nodeTypes section');
    }
    // Add more validation as needed
  }

  private static searchFileTree(tree: any, filename: string): string | null {
    // Implementation depends on FileTree structure
    // Recursively search for filename
  }
}
```

### 3.3 Create Graph Converter

**File**: `src/panels/visual-validation/GraphConverter.tsx`

```typescript
import type { PathBasedGraphConfiguration } from '@principal-ai/visual-validation-core';
import type { NodeState, EdgeState } from '@principal-ai/visual-validation-core';

export class GraphConverter {
  /**
   * Convert configuration to nodes and edges
   */
  static configToGraph(config: PathBasedGraphConfiguration): {
    nodes: NodeState[];
    edges: EdgeState[];
  } {
    const nodes: NodeState[] = [];
    const edges: EdgeState[] = [];

    // Create nodes from nodeTypes
    Object.entries(config.nodeTypes).forEach(([id, nodeType]) => {
      nodes.push({
        id,
        type: id,
        data: {
          label: id,
          shape: nodeType.shape,
          icon: nodeType.icon,
          color: nodeType.color,
          sources: nodeType.sources || [],
          actions: nodeType.actions || []
        },
        state: 'idle',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    // Create edges from allowedConnections
    config.allowedConnections.forEach((connection, index) => {
      edges.push({
        id: `${connection.from}-${connection.to}-${index}`,
        type: connection.via,
        from: connection.from,
        to: connection.to,
        data: {
          label: config.edgeTypes[connection.via]?.label || connection.via
        },
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    return { nodes, edges };
  }
}
```

---

## Phase 4: Create Storybook Stories

### 4.1 Mock Configuration Data

**File**: `src/mocks/vvfConfig.ts`

```typescript
import type { PathBasedGraphConfiguration } from '@principal-ai/visual-validation-core';

export const mockSimpleConfig: PathBasedGraphConfiguration = {
  metadata: {
    name: 'Example Service',
    version: '1.0.0'
  },
  nodeTypes: {
    'api-handler': {
      shape: 'rectangle',
      icon: 'server',
      color: '#3b82f6',
      dataSchema: {},
      sources: ['src/api/**/*.ts']
    },
    'database': {
      shape: 'hexagon',
      icon: 'database',
      color: '#8b5cf6',
      dataSchema: {},
      sources: ['src/db/**/*.ts']
    }
  },
  edgeTypes: {
    'query': {
      style: 'solid',
      color: '#64748b',
      width: 2,
      directed: true
    }
  },
  allowedConnections: [
    {
      from: 'api-handler',
      to: 'database',
      via: 'query'
    }
  ]
};

export const mockComplexConfig: PathBasedGraphConfiguration = {
  // ... larger example with multiple components, actions, edge activation
};
```

### 4.2 Panel Stories

**File**: `src/panels/VisualValidationGraphPanel.stories.tsx`

```typescript
import type { Meta, StoryObj } from '@storybook/react';
import { VisualValidationGraphPanel } from './VisualValidationGraphPanel';
import { createMockContext, createMockActions, createMockEvents, MockPanelProvider } from '../mocks/panelContext';
import { mockSimpleConfig, mockComplexConfig } from '../mocks/vvfConfig';

const meta: Meta<typeof VisualValidationGraphPanel> = {
  title: 'Panels/VisualValidationGraph',
  component: VisualValidationGraphPanel,
  decorators: [
    (Story) => (
      <div style={{ height: '600px', width: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof VisualValidationGraphPanel>;

export const SimpleConfiguration: Story = {
  render: () => {
    const context = createMockContext({
      repository: { path: '/example', name: 'example-repo' },
      slices: {
        fileTree: {
          files: [
            { path: 'vvf.config.yaml', content: /* YAML string of mockSimpleConfig */ }
          ]
        }
      }
    });

    return (
      <MockPanelProvider context={context}>
        <VisualValidationGraphPanel
          context={context}
          actions={createMockActions()}
          events={createMockEvents()}
        />
      </MockPanelProvider>
    );
  },
};

export const ComplexConfiguration: Story = {
  // Similar but with mockComplexConfig
};

export const LoadingState: Story = {
  render: () => {
    const context = createMockContext({
      repository: { path: '/example', name: 'example-repo' },
      slices: {
        fileTree: { loading: true }
      }
    });

    return (
      <MockPanelProvider context={context}>
        <VisualValidationGraphPanel
          context={context}
          actions={createMockActions()}
          events={createMockEvents()}
        />
      </MockPanelProvider>
    );
  },
};

export const NoConfiguration: Story = {
  render: () => {
    const context = createMockContext({
      repository: { path: '/example', name: 'example-repo' },
      slices: {
        fileTree: { files: [] } // No config file
      }
    });

    return (
      <MockPanelProvider context={context}>
        <VisualValidationGraphPanel
          context={context}
          actions={createMockActions()}
          events={createMockEvents()}
        />
      </MockPanelProvider>
    );
  },
};

export const InvalidConfiguration: Story = {
  // Mock with invalid YAML
};

export const WithInteractiveNodes: Story = {
  // Mock with click handlers, tooltips, etc.
};
```

---

## Phase 5: Enhanced Features

### 5.1 Node Detail Panel

When a node is clicked, show details in a sidebar:

```typescript
interface NodeDetailPanelProps {
  node: NodeState;
  onClose: () => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, onClose }) => {
  const { theme } = useTheme();

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      width: '300px',
      height: '100%',
      backgroundColor: theme.colors.background,
      borderLeft: `1px solid ${theme.colors.border}`,
      padding: theme.space[4],
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.space[4] }}>
        <h3>{node.data.label}</h3>
        <button onClick={onClose}>×</button>
      </div>

      <section>
        <h4>Source Files</h4>
        <ul>
          {node.data.sources?.map(source => (
            <li key={source}>
              <button onClick={() => actions.openFile(source)}>
                {source}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {node.data.actions && (
        <section>
          <h4>Action Patterns</h4>
          <ul>
            {node.data.actions.map(action => (
              <li key={action.event}>
                <code>{action.pattern}</code> → {action.event}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
```

### 5.2 Legend Component

```typescript
const Legend: React.FC<{ nodeTypes: Record<string, any> }> = ({ nodeTypes }) => {
  const { theme } = useTheme();

  return (
    <div style={{
      position: 'absolute',
      bottom: theme.space[4],
      left: theme.space[4],
      backgroundColor: theme.colors.background,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.radii[1],
      padding: theme.space[3]
    }}>
      <h4 style={{ marginBottom: theme.space[2] }}>Components</h4>
      {Object.entries(nodeTypes).map(([id, nodeType]) => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', marginBottom: theme.space[1] }}>
          <div style={{
            width: '16px',
            height: '16px',
            backgroundColor: nodeType.color,
            marginRight: theme.space[2],
            borderRadius: nodeType.shape === 'circle' ? '50%' : '2px'
          }} />
          <span>{id}</span>
        </div>
      ))}
    </div>
  );
};
```

### 5.3 Live Reload on Config Change

Subscribe to file change events:

```typescript
useEffect(() => {
  const unsubscribe = events.on('file:changed', (event) => {
    if (event.path.endsWith('vvf.config.yaml')) {
      loadConfiguration();
    }
  });

  return unsubscribe;
}, [events]);
```

---

## Phase 6: Build & Test

### 6.1 Development Workflow

```bash
# Start Storybook for development
bun run storybook

# Run type checking
bun run typecheck

# Run linter
bun run lint

# Build for production
bun run build
```

### 6.2 Test Checklist

- [ ] Panel loads with valid config
- [ ] Panel shows error with invalid config
- [ ] Panel shows loading state while fetching
- [ ] Panel shows empty state when no config found
- [ ] Nodes are clickable and open source files
- [ ] Legend displays correctly
- [ ] Theme integration works
- [ ] Live reload works on config change
- [ ] All Storybook stories render

---

## Phase 7: Publishing

### 7.1 Update Package Metadata

**File**: `package.json`

```json
{
  "name": "@principal-ai/visual-validation-panel",
  "version": "0.1.0",
  "description": "Panel extension for visualizing Visual Validation Framework configurations",
  "keywords": [
    "panel-extension",
    "visual-validation",
    "graph-visualization"
  ],
  "peerDependencies": {
    "react": ">=19.0.0",
    "react-dom": ">=19.0.0"
  },
  "dependencies": {
    "@principal-ai/visual-validation-core": "^0.2.0",
    "@principal-ai/visual-validation-react": "^0.2.0",
    "@principal-ade/panel-framework-core": "^0.1.2",
    "@principal-ade/industry-theme": "^0.1.2",
    "@xyflow/react": "^12.0.0",
    "framer-motion": "^11.0.0",
    "js-yaml": "^4.1.0"
  }
}
```

### 7.2 Build and Publish

```bash
bun run build
npm publish --access public
```

---

## Implementation Timeline

### Week 1: Core Integration
- [ ] Day 1-2: Setup dependencies, create basic panel structure
- [ ] Day 3-4: Implement config loading and YAML parsing
- [ ] Day 5: Create graph converter utility

### Week 2: UI & Polish
- [ ] Day 1-2: Implement node detail panel and legend
- [ ] Day 3-4: Create comprehensive Storybook stories
- [ ] Day 5: Add live reload and file watching

### Week 3: Testing & Publishing
- [ ] Day 1-2: Test with real configurations
- [ ] Day 3: Bug fixes and refinements
- [ ] Day 4: Documentation
- [ ] Day 5: Build and publish

---

## Success Criteria

✅ Panel loads and displays vvf.config.yaml visualizations
✅ Nodes are interactive (click to open source files)
✅ Legend shows component types
✅ Error states handled gracefully
✅ Live reload works on config changes
✅ Theme integration consistent with industry theme
✅ All Storybook stories functional
✅ Published to npm as panel extension
✅ Documentation complete

---

## Future Enhancements (Post-MVP)

1. **Configuration Editor**: Edit config directly in panel
2. **Validation Feedback**: Real-time validation of config
3. **Export**: Export graph as SVG/PNG
4. **Zoom Controls**: Better graph navigation
5. **Search**: Filter/search nodes and edges
6. **Minimap**: Overview of large graphs
7. **Metrics Integration**: Show quality metrics on nodes
8. **Git Integration**: Show changed files highlighted on graph
9. **Action Pattern Testing**: Test regex patterns inline
10. **Multiple Configs**: Compare different configurations
