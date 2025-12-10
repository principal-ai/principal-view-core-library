# Visual Validation CLI

A command-line tool for validating and managing `.canvas` configuration files for the Visual Validation Framework.

## Installation

```bash
npm install -g @principal-ai/visual-validation-cli
```

## Usage

The CLI provides two command aliases: `vv` (primary) and `visual-validation`.

### Commands

#### `init` - Initialize Project Structure

Set up a new `.principal-views` folder with template files:

```bash
vv init
vv init --name my-architecture
vv init --force  # Overwrite existing files
```

#### `validate` - Validate Canvas Files

Strict validation of `.canvas` configuration files:

```bash
vv validate                    # Validates all .principal-views/*.canvas files
vv validate path/to/file.canvas
vv validate "**/*.canvas"      # Glob pattern
vv validate --quiet            # Only output errors
vv validate --json             # Output as JSON
```

**Validation checks:**
- Required `vv` extension with name and version
- All nodes have required fields (id, type, x, y, width, height)
- Custom node types must have `vv.nodeType` and valid `vv.shape`
- Edge references point to existing nodes
- Edge types reference defined edge type definitions

#### `list` (alias: `ls`) - List Canvas Files

Display all canvas files in the project with metadata:

```bash
vv list
vv ls --all     # Search all directories
vv ls --json    # Output as JSON
```

#### `schema` - Display Format Documentation

Show detailed documentation about the canvas format:

```bash
vv schema              # Overview
vv schema nodes        # Node types, shapes, colors
vv schema edges        # Edge properties and styles
vv schema vv           # Visual Validation extension fields
vv schema examples     # Complete examples
```

#### `doctor` - Configuration Health Check

Check configuration staleness and validate source patterns:

```bash
vv doctor
vv doctor --quiet        # Only show errors and warnings
vv doctor --errors-only  # For pre-commit hooks
vv doctor --json         # Output as JSON
```

## Canvas Format

Canvas files follow the [JSON Canvas](https://jsoncanvas.org/) specification with Visual Validation extensions that maintain compatibility with standard tools like Obsidian.

### Required Structure

```json
{
  "nodes": [...],
  "edges": [...],
  "vv": {
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

**Custom types** require `vv` extension:
```json
{
  "id": "node-1",
  "type": "custom",
  "x": 0, "y": 0,
  "width": 200, "height": 100,
  "vv": {
    "nodeType": "service",
    "shape": "rectangle"
  }
}
```

**Available shapes:** `circle`, `rectangle`, `hexagon`, `diamond`, `custom`

### Edge Types

Define reusable edge styles at the canvas level:

```json
{
  "vv": {
    "edgeTypes": {
      "data-flow": {
        "style": "dashed",
        "color": "#3498db",
        "width": 2
      }
    }
  }
}
```

Use in edges:

```json
{
  "id": "edge-1",
  "fromNode": "node-1",
  "toNode": "node-2",
  "vv": {
    "edgeType": "data-flow"
  }
}
```

## Requirements

- Node.js >= 18

## License

MIT
