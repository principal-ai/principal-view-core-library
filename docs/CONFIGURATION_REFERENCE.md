# Configuration Reference

Complete reference for the Visual Validation Framework configuration system.

## Table of Contents

- [File Location](#file-location)
- [Basic Structure](#basic-structure)
- [Metadata](#metadata)
- [Node Types (Components)](#node-types-components)
- [Edge Types (Connections)](#edge-types-connections)
- [Allowed Connections](#allowed-connections)
- [Path-Based Configuration](#path-based-configuration)
- [Display Configuration](#display-configuration)
- [Complete Examples](#complete-examples)

---

## File Location

**Visual Validation Framework now supports multiple configurations** stored in the `.vgc/` folder.

Place your configurations in the `.vgc/` directory at the project root:

```
your-project/
  .vgc/                      ← Configuration folder
    ├── architecture.yaml    ← System architecture graph
    ├── data-flow.yaml       ← Data flow visualization
    ├── deployment.yaml      ← Deployment topology
    └── test-suite.yaml      ← Test validation graph
  src/
  lib/
  package.json
```

**Naming Conventions:**
- Use `.yaml` or `.yml` extensions
- Use kebab-case: `my-config.yaml`
- Descriptive names that indicate purpose
- Group related configs with common prefixes (e.g., `arch-frontend.yaml`, `arch-backend.yaml`)

**Loading Configurations:**

```typescript
import { ConfigurationLoader } from '@principal-ai/visual-validation-core';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction';

// Create a file system adapter
const fsAdapter = new NodeFileSystemAdapter();
const loader = new ConfigurationLoader(fsAdapter);

// List all available configurations
const configNames = loader.listConfigurations(process.cwd());
console.log('Available configs:', configNames);

// Load a specific configuration
const config = loader.loadByName('architecture', process.cwd());

// Load all configurations
const result = loader.loadAll(process.cwd());
console.log(`Loaded ${result.configs.length} configurations`);
if (result.errors.length > 0) {
  console.error('Errors:', result.errors);
}
```

See [.vgc/README.md](../.vgc/README.md) for complete usage guide.

---

## Multi-Config Benefits

Having multiple configurations allows you to:

1. **Separate Concerns**: Different graphs for different aspects
   - `architecture.yaml` - System components and their relationships
   - `data-flow.yaml` - How data moves through your system
   - `deployment.yaml` - Infrastructure and deployment topology
   - `security.yaml` - Security boundaries and authentication flows

2. **Different Granularity**: View your system at different levels
   - `high-level.yaml` - Bird's eye view of major components
   - `detailed.yaml` - Detailed view with all interactions
   - `api-only.yaml` - Focus on API endpoints and contracts

3. **Environment-Specific**: Different configs for different environments
   - `dev-architecture.yaml` - Development environment setup
   - `prod-architecture.yaml` - Production infrastructure

4. **Team-Specific**: Different views for different teams
   - `frontend-arch.yaml` - Frontend team's view
   - `backend-arch.yaml` - Backend team's view
   - `infra-arch.yaml` - Infrastructure team's view

5. **Comparison**: Compare different architectural approaches side-by-side using the React `ConfigurationSelector` component

---

## Basic Structure

**Note**: Each YAML file in the `.vgc/` folder follows this structure:

```yaml
# Project metadata
metadata:
  name: string
  version: string
  description: string (optional)

# Component definitions
nodeTypes:
  [component-id]:
    # Visual appearance
    shape: circle | rectangle | hexagon | diamond
    icon: string (optional)
    color: string (hex or named)
    size:
      width: number
      height: number

    # Path-based log association (Milestone 1)
    sources:
      - "path/to/file.ts"
      - "path/**/*.ts"

    # Action patterns (Milestone 2 - optional)
    actions:
      - pattern: "regex pattern"
        event: "event_name"
        state: "state_name"
        metadata:
          key: "$captureGroup"

# Connection definitions
edgeTypes:
  [edge-id]:
    style: solid | dashed | dotted | animated
    color: string
    width: number
    directed: boolean

    # Edge activation (Milestone 2 - optional)
    activatedBy:
      - action: "event_name"
        animation: flow | particle | pulse | glow
        direction: forward | backward | bidirectional
        duration: number (milliseconds)

# Connection rules
allowedConnections:
  - from: "component-id"
    to: "component-id"
    via: "edge-id"

# Path-based options
pathBasedConfig:
  projectRoot: string (optional, defaults to config file location)
  captureSource: boolean (default: true)
  enableActionPatterns: boolean (default: false)
  logLevel: debug | info | warn | error (default: info)
  ignoreUnsourced: boolean (default: false)

# Display preferences
display:
  layout: hierarchical | force-directed | circular | manual
  theme:
    primary: string
    success: string
    warning: string
    danger: string
    info: string
  animations:
    enabled: boolean
    speed: number
```

---

## Metadata

Project information displayed in the visualization.

```yaml
metadata:
  name: "Repository Traffic Controller"
  version: "1.0.0"
  description: "GitHub webhook processing system"
```

**Fields:**
- `name` (required): Human-readable project name
- `version` (required): Semantic version
- `description` (optional): Brief project description

---

## Node Types (Components)

Define the components in your system.

### Basic Node Definition

```yaml
nodeTypes:
  lock-manager:
    shape: rectangle
    icon: lock
    color: "#3b82f6"  # Blue
    size:
      width: 150
      height: 80
    dataSchema: {}  # Required but can be empty
```

### Visual Properties

**shape**: Component visual shape
- `circle` - Round node (good for services, APIs)
- `rectangle` - Box (good for processes, managers)
- `hexagon` - Six-sided (good for databases, storage)
- `diamond` - Decision points, routers

**icon**: Icon identifier (supports Lucide icons)
- Examples: `lock`, `database`, `server`, `github`, `mail`, `file`

**color**: Hex color or CSS color name
- Examples: `"#3b82f6"`, `"blue"`, `"rgb(59, 130, 246)"`

**size**: Node dimensions in pixels
```yaml
size:
  width: 150
  height: 80
```

### Source Path Mapping (Milestone 1)

Associate components with source files for automatic log tracking.

```yaml
nodeTypes:
  lock-manager:
    shape: rectangle
    icon: lock
    color: "#3b82f6"
    dataSchema: {}

    # Map this component to source files
    sources:
      # Exact file path
      - "lib/lock-manager.ts"

      # Multiple files
      - "lib/branch-aware-lock-manager.ts"

      # Wildcard (single directory)
      - "lib/lock-*.ts"

      # Recursive wildcard (all subdirectories)
      - "lib/locks/**/*.ts"

      # Alternatives
      - "{lib,src}/lock-manager.ts"

      # Complex patterns
      - "services/{lock,mutex}/**/*.{ts,js}"
```

**Pattern Syntax:**
- `*` - Match any characters except `/` (single directory level)
- `**` - Match any characters including `/` (recursive)
- `?` - Match single character
- `[abc]` - Match any character in set
- `{a,b,c}` - Match any alternative

**Example Patterns:**

| Pattern | Matches | Doesn't Match |
|---------|---------|---------------|
| `lib/*.ts` | `lib/foo.ts` | `lib/sub/foo.ts` |
| `lib/**/*.ts` | `lib/sub/foo.ts`, `lib/a/b/c.ts` | `src/foo.ts` |
| `lib/lock-*.ts` | `lib/lock-manager.ts`, `lib/lock-utils.ts` | `lib/manager.ts` |
| `{lib,src}/**/*.ts` | `lib/foo.ts`, `src/bar.ts` | `test/foo.ts` |

### Action Patterns (Milestone 2 - Optional)

Extract structured events from logs using regex patterns.

```yaml
nodeTypes:
  lock-manager:
    shape: rectangle
    icon: lock
    color: "#3b82f6"
    dataSchema: {}
    sources:
      - "lib/lock-manager.ts"

    # Optional: Extract specific actions from logs
    actions:
      # Pattern with capture groups
      - pattern: "Lock acquired for (?<lockId>\\S+)"
        event: lock_acquired
        state: acquired
        metadata:
          lockId: "$lockId"  # Extract from capture group

      # Pattern without metadata
      - pattern: "Lock released"
        event: lock_released
        state: idle

      # Pattern with multiple captures
      - pattern: "Lock acquisition failed: (?<reason>.*) for (?<lockId>\\S+)"
        event: lock_failed
        state: error
        metadata:
          reason: "$reason"
          lockId: "$lockId"
```

**Action Fields:**
- `pattern` (required): JavaScript regex pattern
  - Use `(?<name>...)` for named capture groups
  - Escape backslashes: `\\s` not `\s`
- `event` (required): Event type identifier
- `state` (optional): Component state to transition to
- `metadata` (optional): Extract data from capture groups
  - Key: metadata field name
  - Value: `"$groupName"` to extract from capture group

**Common Regex Patterns:**

| Pattern | Description | Example Match |
|---------|-------------|---------------|
| `(?<id>\\S+)` | Non-whitespace ID | `branch-123` |
| `(?<msg>.*)` | Everything to end | `connection timeout` |
| `(?<num>\\d+)` | Number | `42` |
| `(?<status>success\|failure)` | Alternatives | `success` |

### State Definitions (Optional)

Define visual states for components.

```yaml
nodeTypes:
  lock-manager:
    # ... other fields ...
    states:
      idle:
        color: "#94a3b8"  # Gray
        icon: unlock
        label: "Idle"

      acquired:
        color: "#22c55e"  # Green
        icon: lock
        label: "Lock Held"

      waiting:
        color: "#eab308"  # Yellow
        icon: clock
        label: "Waiting"

      error:
        color: "#ef4444"  # Red
        icon: alert-circle
        label: "Error"
```

---

## Edge Types (Connections)

Define how components connect.

### Basic Edge Definition

```yaml
edgeTypes:
  api-request:
    style: solid
    color: "#3b82f6"
    width: 2
    directed: true

    label:
      position: middle
      field: "requestType"  # Show data field on edge

    animation:
      type: flow
      duration: 2000
      color: "#60a5fa"
```

### Visual Properties

**style**: Line style
- `solid` - Continuous line
- `dashed` - Dashed line
- `dotted` - Dotted line
- `animated` - Animated flow

**width**: Line width in pixels (default: 2)

**directed**: Show arrow (default: true)

**color**: Line color (hex or CSS name)

### Animation Configuration

```yaml
edgeTypes:
  data-flow:
    style: solid
    color: "#3b82f6"
    width: 2
    directed: true

    animation:
      type: flow      # flow | pulse | particle | glow
      duration: 2000  # Milliseconds
      color: "#60a5fa"
```

**Animation Types:**
- `flow` - Moving gradient along edge
- `pulse` - Pulsing line thickness
- `particle` - Particle traveling along edge
- `glow` - Glowing effect

### Edge Activation (Milestone 2 - Optional)

Trigger edge animations based on component actions.

```yaml
edgeTypes:
  lock-request:
    style: solid
    color: "#3b82f6"
    width: 2
    directed: true

    # Activate this edge when specific actions occur
    activatedBy:
      - action: lock_acquired     # When this action happens...
        animation: flow           # ...play flow animation
        direction: forward
        duration: 2000

      - action: lock_released
        animation: particle
        direction: backward
        duration: 1500
```

**Activation Fields:**
- `action` (required): Action event name (from component actions)
- `animation` (required): Animation type to play
- `direction` (optional): `forward` | `backward` | `bidirectional`
- `duration` (optional): Animation duration in milliseconds

---

## Allowed Connections

Define which components can connect and how.

```yaml
allowedConnections:
  # Basic connection
  - from: request-handler
    to: lock-manager
    via: lock-request

  # Connection with constraints
  - from: lock-manager
    to: github-api
    via: api-request
    constraints:
      maxInstances: 1        # Only one connection allowed
      bidirectional: false   # One-way connection
      exclusive: true        # Can't have other connection types
```

**Fields:**
- `from` (required): Source component ID
- `to` (required): Target component ID
- `via` (required): Edge type ID

**Constraints:**
- `maxInstances`: Maximum number of this connection type
- `bidirectional`: Allow reverse connection
- `exclusive`: No other edge types allowed between these components

---

## Path-Based Configuration

Global options for path-based log association.

```yaml
pathBasedConfig:
  # Project root for normalizing paths (default: config file location)
  projectRoot: "/absolute/path/to/project"

  # Enable source capture from stack traces (default: true)
  captureSource: true

  # Enable Milestone 2 action pattern matching (default: false)
  enableActionPatterns: true

  # Minimum log level to process (default: info)
  # debug | info | warn | error
  logLevel: info

  # Ignore logs without source information (default: false)
  ignoreUnsourced: false
```

---

## Display Configuration

Visualization preferences.

```yaml
display:
  # Layout algorithm
  layout: hierarchical  # hierarchical | force-directed | circular | manual

  # Color theme
  theme:
    primary: "#3b82f6"
    success: "#22c55e"
    warning: "#f59e0b"
    danger: "#ef4444"
    info: "#06b6d4"

  # Animation settings
  animations:
    enabled: true
    speed: 1.0  # Multiplier (0.5 = slower, 2.0 = faster)
```

---

## Complete Examples

All examples below should be saved as separate files in the `.vgc/` folder (e.g., `.vgc/simple-service.yaml`, `.vgc/repository-traffic.yaml`, etc.).

### Milestone 1: Basic Path-Based Association

**File**: `.vgc/simple-service.yaml`

Simple configuration with component activity tracking only.

```yaml
metadata:
  name: "Simple Service"
  version: "1.0.0"

nodeTypes:
  api-handler:
    shape: rectangle
    icon: server
    color: "#3b82f6"
    dataSchema: {}
    sources:
      - "src/api/**/*.ts"

  database:
    shape: hexagon
    icon: database
    color: "#8b5cf6"
    dataSchema: {}
    sources:
      - "src/db/**/*.ts"

  logger:
    shape: circle
    icon: file-text
    color: "#06b6d4"
    dataSchema: {}
    sources:
      - "src/logger.ts"

edgeTypes:
  data-flow:
    style: solid
    color: "#64748b"
    width: 2
    directed: true

allowedConnections:
  - from: api-handler
    to: database
    via: data-flow

  - from: api-handler
    to: logger
    via: data-flow

  - from: database
    to: logger
    via: data-flow

pathBasedConfig:
  logLevel: info
  captureSource: true
```

### Milestone 2: Full Action Patterns & Edge Activation

**File**: `.vgc/repository-traffic.yaml`

Advanced configuration with state tracking and edge triggers.

```yaml
metadata:
  name: "Repository Traffic Controller"
  version: "1.0.0"
  description: "GitHub webhook processing with lock management"

nodeTypes:
  request-handler:
    shape: rectangle
    icon: server
    color: "#3b82f6"
    dataSchema: {}
    sources:
      - "app/handlers/**/*.ts"
    actions:
      - pattern: "Webhook received: (?<event>\\S+)"
        event: webhook_received
        metadata:
          eventType: "$event"

  lock-manager:
    shape: rectangle
    icon: lock
    color: "#8b5cf6"
    dataSchema: {}
    sources:
      - "lib/lock-manager.ts"
      - "lib/branch-aware-lock-manager.ts"
    states:
      idle:
        color: "#94a3b8"
        icon: unlock
      acquired:
        color: "#22c55e"
        icon: lock
      waiting:
        color: "#eab308"
        icon: clock
      error:
        color: "#ef4444"
        icon: alert-circle
    actions:
      - pattern: "Lock acquired for (?<lockId>\\S+)"
        event: lock_acquired
        state: acquired
        metadata:
          lockId: "$lockId"

      - pattern: "Lock released for (?<lockId>\\S+)"
        event: lock_released
        state: idle
        metadata:
          lockId: "$lockId"

      - pattern: "Lock acquisition failed: (?<reason>.*)"
        event: lock_failed
        state: error
        metadata:
          reason: "$reason"

  github-api:
    shape: hexagon
    icon: github
    color: "#22c55e"
    dataSchema: {}
    sources:
      - "lib/github-api-client.ts"
      - "services/github/**/*.ts"
    actions:
      - pattern: "API call: (?<method>\\S+) (?<endpoint>\\S+)"
        event: api_call
        metadata:
          method: "$method"
          endpoint: "$endpoint"

      - pattern: "API response: (?<status>\\d+)"
        event: api_response
        metadata:
          statusCode: "$status"

edgeTypes:
  webhook-flow:
    style: solid
    color: "#3b82f6"
    width: 3
    directed: true
    animation:
      type: flow
      duration: 1500

  lock-request:
    style: dashed
    color: "#8b5cf6"
    width: 2
    directed: true
    activatedBy:
      - action: lock_acquired
        animation: flow
        direction: forward
        duration: 2000

      - action: lock_released
        animation: particle
        direction: backward
        duration: 1000

  api-call:
    style: solid
    color: "#22c55e"
    width: 2
    directed: true
    activatedBy:
      - action: api_call
        animation: particle
        direction: forward
        duration: 2000

      - action: api_response
        animation: pulse
        direction: backward
        duration: 1000

allowedConnections:
  - from: request-handler
    to: lock-manager
    via: lock-request

  - from: lock-manager
    to: github-api
    via: api-call

  - from: request-handler
    to: github-api
    via: webhook-flow

pathBasedConfig:
  captureSource: true
  enableActionPatterns: true
  logLevel: debug
  ignoreUnsourced: false

display:
  layout: hierarchical
  theme:
    primary: "#3b82f6"
    success: "#22c55e"
    warning: "#eab308"
    danger: "#ef4444"
    info: "#06b6d4"
  animations:
    enabled: true
    speed: 1.0
```

### Real-World Example: Microservice Architecture

**File**: `.vgc/ecommerce-platform.yaml`

```yaml
metadata:
  name: "E-Commerce Platform"
  version: "2.1.0"

nodeTypes:
  api-gateway:
    shape: diamond
    icon: router
    color: "#3b82f6"
    dataSchema: {}
    sources:
      - "services/gateway/src/**/*.ts"

  auth-service:
    shape: rectangle
    icon: shield
    color: "#8b5cf6"
    dataSchema: {}
    sources:
      - "services/auth/src/**/*.ts"

  product-service:
    shape: rectangle
    icon: package
    color: "#06b6d4"
    dataSchema: {}
    sources:
      - "services/products/src/**/*.ts"

  order-service:
    shape: rectangle
    icon: shopping-cart
    color: "#f59e0b"
    dataSchema: {}
    sources:
      - "services/orders/src/**/*.ts"

  database:
    shape: hexagon
    icon: database
    color: "#64748b"
    dataSchema: {}
    sources:
      - "shared/db/**/*.ts"

  message-queue:
    shape: circle
    icon: activity
    color: "#ec4899"
    dataSchema: {}
    sources:
      - "shared/queue/**/*.ts"

edgeTypes:
  http-request:
    style: solid
    color: "#3b82f6"
    width: 2
    directed: true

  db-query:
    style: dashed
    color: "#64748b"
    width: 2
    directed: true

  queue-message:
    style: dotted
    color: "#ec4899"
    width: 2
    directed: true
    animation:
      type: particle
      duration: 1500

allowedConnections:
  - from: api-gateway
    to: auth-service
    via: http-request

  - from: api-gateway
    to: product-service
    via: http-request

  - from: api-gateway
    to: order-service
    via: http-request

  - from: auth-service
    to: database
    via: db-query

  - from: product-service
    to: database
    via: db-query

  - from: order-service
    to: database
    via: db-query

  - from: order-service
    to: message-queue
    via: queue-message

pathBasedConfig:
  logLevel: info
  captureSource: true

display:
  layout: hierarchical
  animations:
    enabled: true
    speed: 1.0
```

---

## Validation

The VVF validates your configuration and reports issues:

```typescript
import { PathBasedEventProcessor } from '@principal-ai/visual-validation-core';

const processor = new PathBasedEventProcessor(config);
const issues = processor.validate();

issues.forEach(issue => {
  console.log(`[${issue.type}] ${issue.message}`);
  if (issue.componentId) {
    console.log(`  Component: ${issue.componentId}`);
  }
});
```

**Common Issues:**
- Overlapping source patterns (warning)
- Invalid regex in action patterns (error)
- Missing component references in edges (error)
- Invalid glob patterns (error)

---

## Tips & Best Practices

### Source Path Mapping

1. **Start broad, refine later**: Begin with `"src/**/*.ts"` and narrow down as needed
2. **Avoid overlaps**: Each file should match only one component
3. **Test patterns**: Use `PathMatcher.matches('path/to/file.ts', 'pattern')` to verify
4. **Use consistent paths**: Relative to project root

### Action Patterns

1. **Start simple**: Basic logs work fine without action patterns (M1)
2. **Name capture groups**: Use `(?<name>...)` for clarity
3. **Test regex**: Use online regex testers before adding to config
4. **Be specific**: Match exact log formats to avoid false positives

### Performance

1. **Sampling**: Use `samplingRate` for high-volume logging
2. **Log level**: Set appropriate `logLevel` to filter noise
3. **Disable M2**: Keep `enableActionPatterns: false` if not needed

### Organization

1. **Comments**: YAML supports comments - use them!
2. **Consistent naming**: Use kebab-case for IDs
3. **Color scheme**: Pick a consistent palette
4. **Icons**: Use meaningful Lucide icons

---

## Using with React Components

The React package provides components for working with multiple configurations:

```typescript
import {
  ConfigurationSelector,
  GraphRenderer
} from '@principal-ai/visual-validation-react';
import { ConfigurationLoader } from '@principal-ai/visual-validation-core';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction';

function App() {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState('');

  useEffect(() => {
    const fsAdapter = new NodeFileSystemAdapter();
    const loader = new ConfigurationLoader(fsAdapter);
    const result = loader.loadAll(process.cwd());

    setConfigs(result.configs);
    if (result.configs.length > 0) {
      setSelectedConfig(result.configs[0].name);
    }
  }, []);

  const config = configs.find(c => c.name === selectedConfig);

  return (
    <div>
      <ConfigurationSelector
        configurations={configs}
        selectedConfig={selectedConfig}
        onConfigChange={setSelectedConfig}
        showDescription
        showVersion
      />

      {config && (
        <GraphRenderer
          configuration={config.config}
          configName={selectedConfig}
          nodes={nodes}
          edges={edges}
        />
      )}
    </div>
  );
}
```

---

## Schema Validation

Configurations are automatically validated when loaded using `ConfigurationLoader`. The validation checks for:

- Required fields (metadata, nodeTypes, edgeTypes, allowedConnections)
- Valid YAML syntax
- Valid color values
- Node/edge type references in connections
- Invalid glob patterns in source mappings

```typescript
const result = loader.loadAll(process.cwd());

// Check for errors
if (result.errors.length > 0) {
  result.errors.forEach(error => {
    console.error(`[${error.file}] ${error.error}`);
  });
}

// All successfully loaded configs
console.log(`Loaded ${result.configs.length} valid configurations`);
```
