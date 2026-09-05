# Principal View

**Verifiable System Diagrams.**

A **Subsystem View** is a JSON definition of a subsystem: named components (each tagged with what it is — class, function, store — and anchored to a real source file), typed edges between them, and the end-to-end flows the subsystem must support. Principal View renders it as a diagram, then verification anchors every component to its real declaration — so the view can't silently drift from the code.

## How it works

One Subsystem View, three jobs:

**1. Define** — components, typed edges, and the files behind them:

```json
{
  "title": "Checkout",
  "components": [
    {
      "id": "checkout-api",
      "construct": "function",
      "symbol": "checkoutApi",
      "file": "src/checkout/api.ts",
      "purl": "pkg:github/you/your-app",
      "purpose": "Handles cart requests.",
      "role": "entry"
    },
    {
      "id": "cart-store",
      "construct": "store",
      "symbol": "cartStore",
      "file": "src/checkout/cartStore.ts",
      "purl": "pkg:github/you/your-app",
      "purpose": "Retained cart state."
    },
    {
      "id": "stripe",
      "construct": "external",
      "name": "Stripe",
      "role": "service",
      "purl": "external"
    }
  ],
  "edges": [
    { "id": "e1", "from": "checkout-api", "to": "cart-store", "mechanism": "writes" },
    { "id": "e2", "from": "checkout-api", "to": "stripe", "mechanism": "calls" }
  ]
}
```

**2. Render** — `SubsystemComponentGraph` from `@principal-ai/principal-view-react` lays the document out as a clickable graph: components grouped by process, construct-colored nodes, mechanism-labeled edges — and every node opens its source file.

**3. Verify** — verification anchors each component to its declaration (file + symbol + declaration freshness), checks kinds and signatures, and walks every throughline. The report is written back onto the document:

```json
"verification": {
  "checkedAt": "2026-09-04T19:04:58.596Z",
  "verifiedCount": 7,
  "missingCount": 0,
  "throughlinesChecked": 17,
  "throughlinesFailed": 0
}
```

## Why Principal View?

- **Plain JSON** — no proprietary format or tooling; commit it next to your code
- **Typed edges** — 19 mechanisms from `imports` to `writes`/`reads`, each backed by concrete refs
- **Construct-tagged components** — what it is (class, function, store), where it sits (entry, service), where it runs (process)
- **Verified, not decorative** — missing symbols, renamed declarations, and broken throughlines fail verification
- **Framework-agnostic** — works with any codebase, any language with files

## Render a Subsystem View

```bash
npm install @principal-ai/principal-view-react
```

```tsx
import { SubsystemComponentGraph } from '@principal-ai/principal-view-react';
import checkout from './checkout.graph.json';

<SubsystemComponentGraph
  components={checkout.components}
  edges={checkout.edges}
  title={checkout.title}
/>
```

See the [React package README](./packages/react/README.md) for the full API.

## Architecture Canvas CLI

Principal View started as architecture-canvas validation on [JSON Canvas](https://jsoncanvas.org/) — that tooling still ships here: draw architecture views in `.canvas` files, edit them in Obsidian or any JSON Canvas tool, and validate them against your codebase from the terminal, git hooks, or CI.

## Quick Start

### No Installation Required

Use `npx` to run commands without installing:

```bash
npx @principal-ai/principal-view-cli --help
```

**Optional**: Install globally for shorter commands:

```bash
npm install -g @principal-ai/principal-view-cli
# Then use: principal-ai --help
```

### Initialize Your Project

```bash
# Create .principal-views folder with template files
npx @principal-ai/principal-view-cli init

# Or create a specific canvas file
npx @principal-ai/principal-view-cli create --name my-architecture
```

This creates a `.principal-views/` folder in your project with starter `.canvas` files.

### Create Your Architecture

Edit your `.canvas` file in any JSON Canvas compatible editor (like Obsidian) or directly in JSON:

```json
{
  "nodes": [
    {
      "id": "api-server",
      "type": "custom",
      "x": 0,
      "y": 0,
      "width": 200,
      "height": 100,
      "pv": {
        "nodeType": "service",
        "shape": "hexagon",
        "references": ["src/**/*.ts"]
      }
    }
  ],
  "edges": [],
  "pv": {
    "name": "my-architecture",
    "version": "1.0.0"
  }
}
```

### Validate Your Architecture

```bash
# Validate all .canvas files
npx @principal-ai/principal-view-cli validate

# Check configuration health
npx @principal-ai/principal-view-cli doctor

# List all canvas files
npx @principal-ai/principal-view-cli list
```

## CLI Commands

All commands can be run with `npx @principal-ai/principal-view-cli` (or `principal-ai` if installed globally).

### `init`

Initialize your project with a `.principal-views/` folder and template files:

```bash
npx @principal-ai/principal-view-cli init                    # Create default structure
npx @principal-ai/principal-view-cli init --name my-app      # Custom canvas name
npx @principal-ai/principal-view-cli init --force            # Overwrite existing files
```

Sets up git hooks for automatic validation on commit.

### `create`

Create a new canvas file:

```bash
npx @principal-ai/principal-view-cli create --name my-architecture
npx @principal-ai/principal-view-cli create --name api-design --force
```

### `validate`

Validate `.canvas` configuration files:

```bash
npx @principal-ai/principal-view-cli validate                      # Validate all .canvas files
npx @principal-ai/principal-view-cli validate path/to/file.canvas  # Validate specific file
npx @principal-ai/principal-view-cli validate "**/*.canvas"        # Glob pattern
npx @principal-ai/principal-view-cli validate --quiet              # Only show errors
npx @principal-ai/principal-view-cli validate --json               # JSON output for CI/CD
```

**Validation checks:**
- Required `pv` extension with name and version
- All nodes have required fields (id, type, x, y, width, height)
- Custom node types have valid `pv.nodeType` and `pv.shape`
- Edge references point to existing nodes
- Edge types reference defined edge type definitions

### `doctor`

Health check for your architecture configuration:

```bash
npx @principal-ai/principal-view-cli doctor                  # Full health check
npx @principal-ai/principal-view-cli doctor --quiet          # Only warnings and errors
npx @principal-ai/principal-view-cli doctor --errors-only    # For CI/CD pipelines
npx @principal-ai/principal-view-cli doctor --json           # JSON output
```

Checks for configuration staleness and validates source patterns.

### `lint`

Lint configuration files with custom rules:

```bash
npx @principal-ai/principal-view-cli lint                    # Lint all files
npx @principal-ai/principal-view-cli lint --quiet            # Only show errors
npx @principal-ai/principal-view-cli lint --fix              # Auto-fix issues
```

Configure rules in `.privurc` file.

### `list` (alias: `ls`)

List all canvas files in your project:

```bash
npx @principal-ai/principal-view-cli list                    # List .principal-views/ files
npx @principal-ai/principal-view-cli ls --all                # Search all directories
npx @principal-ai/principal-view-cli ls --json               # JSON output
```

### `schema`

Display canvas format documentation:

```bash
npx @principal-ai/principal-view-cli schema                  # Overview
npx @principal-ai/principal-view-cli schema nodes            # Node types and shapes
npx @principal-ai/principal-view-cli schema edges            # Edge properties
npx @principal-ai/principal-view-cli schema pv               # Principal View extensions
npx @principal-ai/principal-view-cli schema examples         # Complete examples
```

### `hooks`

Manage git hooks for validation:

```bash
npx @principal-ai/principal-view-cli hooks install           # Install pre-commit hook
npx @principal-ai/principal-view-cli hooks uninstall         # Remove pre-commit hook
```

## Canvas File Format

Principal View uses the [JSON Canvas](https://jsoncanvas.org/) format with Principal View extensions. This means your architecture diagrams are compatible with tools like Obsidian while adding validation capabilities.

### Basic Structure

```json
{
  "nodes": [...],
  "edges": [...],
  "pv": {
    "name": "my-architecture",
    "version": "1.0.0"
  }
}
```

### Node Types

**Standard types** (no additional metadata required):
- `text` - Text content
- `group` - Container for other nodes
- `file` - File reference
- `link` - URL link

**Custom types** require `pv` extension:

```json
{
  "id": "service-1",
  "type": "custom",
  "x": 0,
  "y": 0,
  "width": 200,
  "height": 100,
  "pv": {
    "nodeType": "microservice",
    "shape": "hexagon",
    "color": "#3498db"
  }
}
```

**Available shapes:** `circle`, `rectangle`, `hexagon`, `diamond`, `custom`

### Edge Types

Define reusable edge styles:

```json
{
  "pv": {
    "name": "my-architecture",
    "version": "1.0.0",
    "edgeTypes": {
      "data-flow": {
        "style": "dashed",
        "color": "#3498db",
        "width": 2,
        "animated": true
      },
      "api-call": {
        "style": "solid",
        "color": "#2ecc71",
        "width": 3
      }
    }
  }
}
```

Use in edges:

```json
{
  "id": "edge-1",
  "fromNode": "service-1",
  "toNode": "service-2",
  "pv": {
    "edgeType": "api-call"
  }
}
```

### Component Library

Define reusable node and edge components in `library.yaml`:

```yaml
nodeComponents:
  api-service:
    icon: Server
    color: '#3498db'
    shape: hexagon
    size:
      width: 200
      height: 120

edgeComponents:
  http-request:
    style: solid
    color: '#2ecc71'
    animated: false
```

Reference components in your canvas files using the `pv.nodeType` or `pv.edgeType` fields.

## CI/CD Integration

Integrate Principal View validation into your CI/CD pipeline:

### GitHub Actions

```yaml
name: Validate Architecture

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Validate architecture
        run: npx @principal-ai/principal-view-cli validate --json
      - name: Health check
        run: npx @principal-ai/principal-view-cli doctor --errors-only
```

### Pre-commit Hook

Automatically installed with `npx @principal-ai/principal-view-cli init` or manually:

```bash
npx @principal-ai/principal-view-cli hooks install
```

This runs validation on staged `.canvas` files before each commit.

## Advanced Usage

### Programmatic API

For advanced use cases, you can use the core packages programmatically:

#### Core Package (`@principal-ai/visual-validation-core`)

Framework-agnostic core library with zero UI dependencies:

```typescript
import {
  EventProcessor,
  ValidationEngine,
  GraphInstrumentationHelper,
} from '@principal-ai/visual-validation-core';

// Load and parse canvas files
const canvas = JSON.parse(readFileSync('.principal-views/my-arch.canvas', 'utf8'));

// Create event processor for runtime validation
const processor = new EventProcessor(canvas);

// Use in tests or monitoring
const helper = new GraphInstrumentationHelper(canvas, (event) => {
  const result = processor.processEvent(event);
  if (!result.validation.isValid) {
    console.error('Validation failed:', result.validation.errors);
  }
});

helper.emitNodeCreated('service-1', 'microservice', { status: 'running' });
```

#### React Package (`@principal-ai/visual-validation-react`)

React component library for building visualization panels:

```typescript
import { GraphRenderer } from '@principal-ai/visual-validation-react';

function ArchitectureViewer({ canvas }) {
  return (
    <GraphRenderer
      configuration={canvas}
      configName="my-architecture"
      nodes={canvas.nodes}
      edges={canvas.edges}
    />
  );
}
```

See the [packages README files](./packages/) for detailed API documentation.

## Features

- ✅ **JSON Canvas Compatible** - Works with Obsidian and other JSON Canvas tools
- ✅ **CLI-First** - Complete command-line interface for validation and management
- ✅ **Multi-config Support** - Store multiple architecture diagrams in `.principal-views/`
- ✅ **Validation Engine** - Strict validation of canvas files with detailed error messages
- ✅ **Component Library** - Reusable node and edge components via `library.yaml`
- ✅ **Git Hooks** - Automatic validation on commit
- ✅ **CI/CD Ready** - JSON output for pipeline integration
- ✅ **Linting & Auto-fix** - Configurable rules with `.privurc`
- ✅ **TypeScript Support** - Full type definitions for programmatic usage
- ✅ **Framework Agnostic** - Core library works with any JavaScript environment
- ✅ **React Components** - Optional visualization components for building panels

## Project Structure

### Recommended: Storyboard Structure (v0.15.0+)

```
principal-view/
├── .principal-views/           # Your architecture files
│   ├── checkout-flow/          # Storyboard: feature/component grouping
│   │   ├── checkout-flow.otel.canvas
│   │   ├── happy-path/         # Workflow: scenario variations
│   │   │   ├── happy-path.workflow.json
│   │   │   └── success-1.otel.json    # Execution files
│   │   └── payment-failures/
│   │       ├── payment-failures.workflow.json
│   │       └── declined-1.otel.json
│   ├── library.yaml           # Optional component library
│   └── .privurc               # Linting configuration
├── packages/
│   ├── cli/                   # CLI tool (principal-ai)
│   ├── core/                  # Core validation engine
│   ├── react/                 # React visualization components
│   └── logger/                # Logging utilities
└── README.md
```

**Hierarchy:** Storyboard (feature) → Workflows (scenarios) → Executions (test runs)

See [Storyboard Discovery Design](./docs/STORYBOARD_DISCOVERY_DESIGN.md) for details.

### Legacy Flat Structure (Deprecated)

```
.principal-views/
├── my-architecture.canvas
├── my-architecture.workflow.json
└── __executions__/
    └── test-1.otel.json
```

🚫 **This structure is fully deprecated as of v1.0.0 and will produce validation errors.** Migrate immediately using the [Migration Guide](./docs/MIGRATION_GUIDE.md).

## Development

Contributing to Principal View? Here's how to set up the development environment:

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Watch mode for development
bun run dev:core
bun run dev:react

# Run tests
bun test
bun run test:coverage

# Type checking and linting
bun run typecheck
bun run lint
bun run format
```

### Package Development

- **`packages/cli/`** - The CLI tool built with Commander.js
- **`packages/core/`** - Core validation logic (framework-agnostic)
- **`packages/react/`** - React visualization components
- **`packages/logger/`** - Shared logging utilities

## Documentation

### 📚 Getting Started
- **[Cost Savings Executive Summary](./docs/TELEMETRY_COST_OPTIMIZATION_EXECUTIVE_SUMMARY.md)** - ⭐ 5-min read: Save 90%+ on observability
- **[Telemetry Cost Optimization](./docs/TELEMETRY_COST_OPTIMIZATION.md)** - ⭐ Full guide: Industry shift & detailed savings
- **[Observability Compliance Guide](./docs/OBSERVABILITY_COMPLIANCE_GUIDE.md)** - ⭐ GDPR, HIPAA, SOC 2 compliance made possible
- **[Storyboard Discovery Design](./docs/STORYBOARD_DISCOVERY_DESIGN.md)** - ⭐ Recommended project organization
- **[Hierarchical Workflow Composition](./docs/HIERARCHICAL_WORKFLOW_COMPOSITION.md)** - ⭐ Cross-library telemetry & composable workflows
- **[Migration Guide](./docs/MIGRATION_GUIDE.md)** - Upgrade from legacy flat structure
- **[Configuration Docs](./docs/CONFIGURATION.md)** - Canvas format details
- **[Full Documentation](./docs/README.md)** - Complete guide index

### 📦 Package Documentation
- **[CLI Package README](./packages/cli/README.md)** - Detailed CLI documentation
- **[Core Package README](./packages/core/README.md)** - Core API documentation
- **[React Package README](./packages/react/README.md)** - React components guide

## Requirements

- Node.js >= 18
- npm (for running npx commands)

## License

Apache-2.0

## Support

- **Issues**: [GitHub Issues](https://github.com/principal-ai/principal-view/issues)
- **Discussions**: [GitHub Discussions](https://github.com/principal-ai/principal-view/discussions)
- **Documentation**: [Full Docs](./docs/README.md)
