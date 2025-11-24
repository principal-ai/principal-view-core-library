import type { Meta, StoryObj } from '@storybook/react';
import { useState, useEffect } from 'react';
import { GraphRenderer } from '../components/GraphRenderer';
import { ConfigurationSelector } from '../components/ConfigurationSelector';
import type { ConfigurationFile, NodeState, EdgeState } from '@principal-ai/visual-validation-core';
import { ConfigurationLoader, InMemoryFileSystemAdapter } from '@principal-ai/visual-validation-core';

const meta: Meta<typeof GraphRenderer> = {
  title: 'Multi-Config/Configuration Switcher',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof GraphRenderer>;

// Helper to create sample configurations in memory
function createSampleConfigurations(): ConfigurationFile[] {
  const fsAdapter = new InMemoryFileSystemAdapter();
  fsAdapter.createDir('/project/.vgc');

  // Simple Service Config
  const simpleServiceYaml = `
metadata:
  name: Simple Service
  version: 1.0.0
  description: Basic 3-tier service architecture

nodeTypes:
  api:
    shape: rectangle
    color: '#4A90E2'
    dataSchema:
      name:
        type: string
        required: true
  service:
    shape: hexagon
    color: '#7ED321'
    dataSchema:
      name:
        type: string
        required: true
  database:
    shape: circle
    color: '#BD10E0'
    dataSchema:
      name:
        type: string
        required: true

edgeTypes:
  api_call:
    style: solid
    color: '#4A90E2'
    width: 2
    directed: true
  data_access:
    style: dashed
    color: '#BD10E0'
    width: 2
    directed: true

allowedConnections:
  - from: api
    to: service
    via: api_call
  - from: service
    to: database
    via: data_access
`;

  // Microservices Config
  const microservicesYaml = `
metadata:
  name: Microservices
  version: 2.0.0
  description: Distributed microservices architecture

nodeTypes:
  gateway:
    shape: rectangle
    color: '#00C853'
    dataSchema:
      name:
        type: string
        required: true
  auth_service:
    shape: rectangle
    color: '#FF6B6B'
    dataSchema:
      name:
        type: string
        required: true
  user_service:
    shape: rectangle
    color: '#4A90E2'
    dataSchema:
      name:
        type: string
        required: true
  cache:
    shape: circle
    color: '#3498DB'
    dataSchema:
      name:
        type: string
        required: true
  database:
    shape: circle
    color: '#27AE60'
    dataSchema:
      name:
        type: string
        required: true

edgeTypes:
  http_request:
    style: solid
    color: '#4A90E2'
    width: 2
    directed: true
    animated: true
  cache_access:
    style: dotted
    color: '#3498DB'
    width: 2
    directed: true

allowedConnections:
  - from: gateway
    to: auth_service
    via: http_request
  - from: gateway
    to: user_service
    via: http_request
  - from: auth_service
    to: cache
    via: cache_access
  - from: user_service
    to: database
    via: http_request
`;

  // Data Pipeline Config
  const dataPipelineYaml = `
metadata:
  name: Data Pipeline
  version: 1.0.0
  description: ETL data processing pipeline

nodeTypes:
  data_source:
    shape: rectangle
    color: '#6C5CE7'
    dataSchema:
      name:
        type: string
        required: true
  validator:
    shape: diamond
    color: '#00B894'
    dataSchema:
      name:
        type: string
        required: true
  transformer:
    shape: hexagon
    color: '#FD79A8'
    dataSchema:
      name:
        type: string
        required: true
  data_warehouse:
    shape: circle
    color: '#0984E3'
    dataSchema:
      name:
        type: string
        required: true

edgeTypes:
  data_flow:
    style: solid
    color: '#0984E3'
    width: 3
    directed: true
    animated: true
  validation_flow:
    style: solid
    color: '#00B894'
    width: 2
    directed: true

allowedConnections:
  - from: data_source
    to: validator
    via: validation_flow
  - from: validator
    to: transformer
    via: data_flow
  - from: transformer
    to: data_warehouse
    via: data_flow
`;

  fsAdapter.writeFile('/project/.vgc/simple-service.yaml', simpleServiceYaml);
  fsAdapter.writeFile('/project/.vgc/microservices.yaml', microservicesYaml);
  fsAdapter.writeFile('/project/.vgc/data-pipeline.yaml', dataPipelineYaml);

  const loader = new ConfigurationLoader(fsAdapter);
  const result = loader.loadAll('/project');

  return result.configs;
}

// Helper to generate sample nodes and edges for a configuration
function generateSampleData(config: ConfigurationFile): { nodes: NodeState[]; edges: EdgeState[] } {
  const nodes: NodeState[] = [];
  const edges: EdgeState[] = [];

  // Generate sample nodes based on node types
  const nodeTypes = Object.keys(config.config.nodeTypes);
  nodeTypes.forEach((nodeType, index) => {
    nodes.push({
      id: `${nodeType}-1`,
      type: nodeType,
      state: 'active',
      data: {
        name: `${nodeType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} 1`,
      },
      createdAt: Date.now() - (nodeTypes.length - index) * 1000,
    });
  });

  // Generate edges based on allowed connections
  config.config.allowedConnections.forEach((connection, index) => {
    const sourceNode = nodes.find(n => n.type === connection.from);
    const targetNode = nodes.find(n => n.type === connection.to);

    if (sourceNode && targetNode) {
      edges.push({
        id: `edge-${index}`,
        from: sourceNode.id,
        to: targetNode.id,
        type: connection.via,
        data: {},
      });
    }
  });

  return { nodes, edges };
}

// Multi-config switcher component
function MultiConfigDemo() {
  const [configurations] = useState<ConfigurationFile[]>(() => createSampleConfigurations());
  const [selectedConfigName, setSelectedConfigName] = useState<string>(
    configurations[0]?.name || ''
  );
  const [nodes, setNodes] = useState<NodeState[]>([]);
  const [edges, setEdges] = useState<EdgeState[]>([]);

  // Update nodes and edges when configuration changes
  useEffect(() => {
    const selectedConfig = configurations.find(c => c.name === selectedConfigName);
    if (selectedConfig) {
      const data = generateSampleData(selectedConfig);
      setNodes(data.nodes);
      setEdges(data.edges);
    }
  }, [selectedConfigName, configurations]);

  const selectedConfig = configurations.find(c => c.name === selectedConfigName);

  if (!selectedConfig) {
    return <div>No configuration loaded</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header with configuration selector */}
      <div
        style={{
          padding: '16px',
          backgroundColor: '#f5f5f5',
          borderBottom: '1px solid #ddd',
        }}
      >
        <ConfigurationSelector
          configurations={configurations}
          selectedConfig={selectedConfigName}
          onConfigChange={setSelectedConfigName}
          showDescription
          showVersion
          style={{ maxWidth: '400px' }}
        />
      </div>

      {/* Graph visualization */}
      <div style={{ flex: 1 }}>
        <GraphRenderer
          configuration={selectedConfig.config}
          configName={selectedConfigName}
          nodes={nodes}
          edges={edges}
          showMinimap
          showControls
          showBackground
        />
      </div>
    </div>
  );
}

// Story: Basic multi-config switcher
export const ConfigurationSwitcher: Story = {
  render: () => <MultiConfigDemo />,
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates switching between multiple graph configurations. Each configuration has different node types, edge types, and visual styles. Use the dropdown to switch between configurations.',
      },
    },
  },
};

// Story: Configuration selector only
export const SelectorComponent: Story = {
  render: () => {
    const [configurations] = useState<ConfigurationFile[]>(() => createSampleConfigurations());
    const [selectedConfigName, setSelectedConfigName] = useState<string>(
      configurations[0]?.name || ''
    );

    return (
      <div style={{ padding: '24px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <h2>Configuration Selector Component</h2>
        <p>A standalone component for selecting between configurations.</p>

        <div style={{ marginTop: '24px', maxWidth: '500px' }}>
          <ConfigurationSelector
            configurations={configurations}
            selectedConfig={selectedConfigName}
            onConfigChange={setSelectedConfigName}
            showDescription
            showVersion
          />

          <div
            style={{
              marginTop: '24px',
              padding: '16px',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Selected Configuration</h3>
            <pre style={{ fontSize: '12px', overflow: 'auto' }}>
              {JSON.stringify(
                configurations.find(c => c.name === selectedConfigName)?.config.metadata,
                null,
                2
              )}
            </pre>
          </div>
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'The ConfigurationSelector component in isolation. Shows how to use it as a standalone UI element.',
      },
    },
  },
};

// Story: Side-by-side comparison
export const SideBySideComparison: Story = {
  render: () => {
    const [configurations] = useState<ConfigurationFile[]>(() => createSampleConfigurations());
    const [leftConfig, setLeftConfig] = useState<string>(configurations[0]?.name || '');
    const [rightConfig, setRightConfig] = useState<string>(configurations[1]?.name || '');

    const leftConfigData = configurations.find(c => c.name === leftConfig);
    const rightConfigData = configurations.find(c => c.name === rightConfig);

    const leftData = leftConfigData ? generateSampleData(leftConfigData) : { nodes: [], edges: [] };
    const rightData = rightConfigData
      ? generateSampleData(rightConfigData)
      : { nodes: [], edges: [] };

    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div
          style={{
            padding: '16px',
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid #ddd',
            display: 'flex',
            gap: '16px',
          }}
        >
          <ConfigurationSelector
            configurations={configurations}
            selectedConfig={leftConfig}
            onConfigChange={setLeftConfig}
            label="Left Configuration"
            style={{ flex: 1 }}
          />
          <ConfigurationSelector
            configurations={configurations}
            selectedConfig={rightConfig}
            onConfigChange={setRightConfig}
            label="Right Configuration"
            style={{ flex: 1 }}
          />
        </div>

        {/* Side by side graphs */}
        <div style={{ flex: 1, display: 'flex' }}>
          {leftConfigData && (
            <div style={{ flex: 1, borderRight: '1px solid #ddd' }}>
              <GraphRenderer
                configuration={leftConfigData.config}
                configName={leftConfig}
                nodes={leftData.nodes}
                edges={leftData.edges}
                showMinimap={false}
                showControls
                showBackground
              />
            </div>
          )}
          {rightConfigData && (
            <div style={{ flex: 1 }}>
              <GraphRenderer
                configuration={rightConfigData.config}
                configName={rightConfig}
                nodes={rightData.nodes}
                edges={rightData.edges}
                showMinimap={false}
                showControls
                showBackground
              />
            </div>
          )}
        </div>
      </div>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Compare two different graph configurations side-by-side. Useful for understanding architectural differences or analyzing multiple aspects of your system simultaneously.',
      },
    },
  },
};
