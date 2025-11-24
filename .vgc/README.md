# Visual Validation Framework Configuration Directory

This directory (`.vgc/`) contains graph configuration files for the Visual Validation Framework.

## Overview

The Visual Validation Framework supports **multiple graph configurations** stored in this directory. Each configuration file defines a different aspect of your system's architecture, data flow, or validation rules.

## Configuration Files

This directory includes the following example configurations:

### `simple-service.yaml`
A basic 3-component example demonstrating core concepts:
- API layer
- Business logic/service layer
- Database layer

Perfect for learning the framework or setting up a simple service architecture.

### `microservices.yaml`
Complex microservices architecture featuring:
- API Gateway
- Authentication service
- User, Order, and Payment services
- Caching and message queue infrastructure
- Multiple communication patterns (HTTP, gRPC, messaging)

Ideal for distributed systems and microservices monitoring.

### `data-pipeline.yaml`
ETL (Extract, Transform, Load) pipeline configuration:
- Data ingestion from multiple sources
- Validation and transformation stages
- Data enrichment and aggregation
- Storage in data warehouse and data lake
- Error handling and dead letter queue

Designed for data engineering and pipeline visualization.

### `test-validation.yaml`
Testing and validation graph:
- Test runners with state transitions
- Mock services
- Assertion engine
- Coverage tracking
- Test reporting

Useful for visualizing test execution and validation flows.

## File Format

All configuration files use **YAML** format and must have either `.yaml` or `.yml` extension.

### Required Structure

Each configuration file must include:

```yaml
metadata:
  name: "Your Graph Name"
  version: "1.0.0"
  description: "Optional description"

nodeTypes:
  # Define your node types here
  node_type_name:
    shape: circle | rectangle | hexagon | diamond | custom
    color: '#HEXCOLOR'
    dataSchema:
      field_name:
        type: string | number | boolean | object | array
        required: true | false
    # Optional: source path mapping for log association
    sources:
      - 'path/to/files/**/*.ts'

edgeTypes:
  # Define your edge types here
  edge_type_name:
    style: solid | dashed | dotted | animated
    color: '#HEXCOLOR'

allowedConnections:
  # Define allowed connections between nodes
  - from: source_node_type
    to: target_node_type
    via: edge_type
```

## Naming Conventions

- Use **kebab-case** for file names: `my-config.yaml`
- File names should be descriptive and indicate the configuration purpose
- Avoid spaces and special characters in file names
- Prefix related configs with common names:
  - `architecture-frontend.yaml`
  - `architecture-backend.yaml`
  - `architecture-infrastructure.yaml`

## Creating New Configurations

To create a new configuration:

1. **Create a new YAML file** in this directory:
   ```bash
   touch .vgc/my-new-config.yaml
   ```

2. **Add the required structure** (see above)

3. **Define your node types** based on your system components

4. **Define edge types** for connections between components

5. **Specify allowed connections** between node types

6. **Add source path mappings** (optional) to associate log files with components:
   ```yaml
   nodeTypes:
     my_component:
       sources:
         - 'src/my-component/**/*.ts'
         - 'lib/my-component/**/*.js'
   ```

## Loading Configurations

### Using ConfigurationLoader

```typescript
import { ConfigurationLoader, InMemoryFileSystemAdapter } from '@principal-ai/visual-validation-core';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction';

// Create a file system adapter (Node.js)
const fsAdapter = new NodeFileSystemAdapter();

// Create the loader
const loader = new ConfigurationLoader(fsAdapter);

// List all available configurations
const configNames = loader.listConfigurations(process.cwd());
console.log('Available configs:', configNames);

// Load a specific configuration
const config = loader.loadByName('simple-service', process.cwd());
if (config) {
  console.log('Loaded:', config.config.metadata.name);
}

// Load all configurations
const result = loader.loadAll(process.cwd());
console.log(`Loaded ${result.configs.length} configurations`);
if (result.errors.length > 0) {
  console.error('Errors:', result.errors);
}
```

### Using with React Components

```typescript
import { GraphRenderer } from '@principal-ai/visual-validation-react';
import { ConfigurationLoader } from '@principal-ai/visual-validation-core';

function MyApp() {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);

  useEffect(() => {
    const loader = new ConfigurationLoader(fsAdapter);
    const result = loader.loadAll(projectRoot);
    setConfigs(result.configs);
    if (result.configs.length > 0) {
      setSelectedConfig(result.configs[0]);
    }
  }, []);

  return (
    <div>
      <select onChange={(e) => {
        const config = configs.find(c => c.name === e.target.value);
        setSelectedConfig(config);
      }}>
        {configs.map(c => (
          <option key={c.name} value={c.name}>{c.config.metadata.name}</option>
        ))}
      </select>

      {selectedConfig && (
        <GraphRenderer config={selectedConfig.config} />
      )}
    </div>
  );
}
```

## Best Practices

1. **Separate Concerns**: Create different configs for different aspects of your system
   - `architecture.yaml` - System component architecture
   - `data-flow.yaml` - Data flow between components
   - `deployment.yaml` - Deployment topology
   - `security.yaml` - Security boundaries and zones

2. **Version Your Configs**: Include version numbers in metadata and update them when making breaking changes

3. **Use Descriptive Names**: Make node and edge type names clear and meaningful

4. **Document Complex Configs**: Add descriptions in metadata to explain the purpose

5. **Keep Configs Focused**: Avoid combining unrelated concerns in a single configuration

6. **Source Mapping**: Use source path patterns to automatically associate logs with components

## Validation

Configurations are automatically validated when loaded. Common validation errors:

- Missing required fields (metadata, nodeTypes, edgeTypes, allowedConnections)
- Invalid YAML syntax
- Invalid color values
- Unknown node/edge types in allowedConnections
- Invalid data schema types

Check the errors array in `ConfigurationLoadResult` for validation issues.

## Documentation

For complete documentation, see:
- [Configuration Reference](../docs/CONFIGURATION_REFERENCE.md)
- [Path-Based Association Guide](../docs/PATH_BASED_ASSOCIATION.md)
- [Implementation Milestones](../docs/IMPLEMENTATION_MILESTONES.md)
- [Manual Layout Guide](../docs/MANUAL_LAYOUT_GUIDE.md)

## Migration from Old Format

If you have an existing `vvf.config.yaml` file at the project root:

```bash
# Create .vgc directory
mkdir -p .vgc

# Move your config
mv vvf.config.yaml .vgc/main.yaml

# Or copy to preserve the original
cp vvf.config.yaml .vgc/main.yaml
```

See [MIGRATION.md](../docs/MIGRATION.md) for detailed migration instructions.
