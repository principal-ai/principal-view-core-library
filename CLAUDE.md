# Repository Structure and Publishing Requirements

## Overview
This repository is a monorepo containing multiple packages, but **does NOT use npm/yarn workspaces**. Each package is published independently to npm.

## Packages
- `packages/logger` - @principal-ai/logger
- `packages/core` - @principal-ai/core
- `packages/react` - @principal-ai/react
- `packages/cli` - @principal-ai/cli

## Dependency Management

### Inter-package Dependencies
Since this repository does not use workspaces, packages that depend on each other reference the published npm versions, not local file paths.

**CRITICAL**: When making changes to a package that other packages depend on, you MUST:

1. Build the changed package
2. Publish the package to npm
3. Update the version in dependent packages' `package.json`
4. Install dependencies in dependent packages

### Example Workflow

If you modify `packages/core`:

```bash
# 1. Build core package
cd packages/core
bun run build

# 2. Publish to npm (requires npm credentials)
npm publish

# 3. Update version in dependent packages
# Edit packages/react/package.json to use new @principal-ai/core version
# Edit packages/cli/package.json to use new @principal-ai/core version

# 4. Install updated dependencies
cd packages/react
bun install

cd packages/cli
bun install
```

## Build Order
Due to dependencies, builds should follow this order:
1. `packages/logger` (no internal dependencies)
2. `packages/core` (depends on logger)
3. `packages/react` (depends on logger and core)
4. `packages/cli` (depends on logger and core)

The root `bun run build` script handles this order automatically.

## Important Notes

- **Never use workspace: protocol** - All internal dependencies must reference published npm versions
- **Version bumps are required** - Any change to a dependency requires publishing and version updates
- **Testing changes locally** - To test changes before publishing, you may need to use `npm link` or similar techniques
- **Publishing is manual** - There is no automated publishing pipeline; releases must be done manually
