# Add CLI command for Storybook telemetry setup

---
status: To Do
labels: [cli, storybook, telemetry, documentation]
---

## Summary

Add a CLI command to help users set up Storybook telemetry integration and test with the electron-app.

## Suggested Command

`privu setup storybook` or `privu docs storybook`

## What it should cover

1. **Installing the addon**
   - `npm install --save-dev @principal-ai/storybook-addon-otel`

2. **Configuring `.storybook/main.ts`**
   - Adding `'@principal-ai/storybook-addon-otel'` to the addons array

3. **Configuring `.storybook/preview.ts`**
   - Import `OtelExportConfig` type
   - Add `otelExport` parameter with:
     - `enabled: true`
     - `endpoint: 'http://localhost:4318/v1/traces'`
     - `serviceName` (should match library.yaml)
     - `resourceAttributes` (environment, project)

4. **Registering in `library.yaml`**
   - Adding the service to the `resources` section
   - Ensuring `service.name` matches `serviceName` in preview.ts

5. **Testing with electron-app**
   - Instructions for running the electron-app to receive traces
   - Verifying traces appear correctly

## Reference Implementations

- `industry-themed-backlogmd-kanban-panel`
- `industry-themed-repository-composition-panels`

Both projects have working Storybook OTEL setups that can be used as examples.
