/**
 * Formats command - Display documentation about file formats
 */

import { Command } from 'commander';
import chalk from 'chalk';

const FORMAT_SECTIONS = {
  overview: `
${chalk.bold.cyan('Principal View OTEL File Formats')}
${chalk.dim('═'.repeat(70))}

The Principal View OTEL workflow uses three main file types:

${chalk.bold('1. Canvas Files')} ${chalk.yellow('.otel.canvas')}
   Define OTEL event schemas and telemetry structure for a feature.
   These are the single source of truth for what events should be emitted.

${chalk.bold('2. Workflow Files')} ${chalk.yellow('.workflow.json')}
   Define scenarios and templates for rendering executions as human-readable
   workflows based on the emitted events.

${chalk.bold('3. Execution Files')} ${chalk.yellow('.otel.json')}
   Captured OTEL spans from test runs or production code, exported for
   visualization and validation against canvas schemas.

${chalk.bold('4. Library Files')} ${chalk.yellow('library.yaml')}
   Define service registry and component libraries for the project.
   Documents OTEL resource attributes and service metadata.

Run ${chalk.cyan('npx @principal-ai/principal-view-cli formats <section>')} for details on:
  ${chalk.yellow('canvas')}       .otel.canvas format and event schemas
  ${chalk.yellow('workflow')}    .workflow.json format and scenario structure
  ${chalk.yellow('execution')}    .otel.json format for captured spans
  ${chalk.yellow('library')}      library.yaml format and service registry
  ${chalk.yellow('examples')}     Complete example files
`,

  canvas: `
${chalk.bold.cyan('Canvas Format (.otel.canvas)')}
${chalk.dim('═'.repeat(70))}

Canvas files define the OTEL event schemas for a feature. They document what
events should be emitted and what attributes each event must/may contain.

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('<feature-name>.otel.canvas')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"nodes"')}: [                  ${chalk.dim('// Array of event schemas')}      ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"id"')}: "event-id",      ${chalk.dim('// Unique identifier')}         ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"type"')}: "text",                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"text"')}: "# Event Name", ${chalk.dim('// Markdown description')}     ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"x"')}: 0, ${chalk.yellow('"y"')}: 0, ${chalk.yellow('"width"')}: 200, ${chalk.yellow('"height"')}: 100,                   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.green('"pv"')}: {                                                        ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"event"')}: "feature.event.name",  ${chalk.dim('// Event name')}          ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"sources"')}: ["src/file.ts"],     ${chalk.dim('// Source files')}        ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"otel"')}: {                       ${chalk.dim('// OTEL metadata')}       ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.yellow('"kind"')}: "event",                                       ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.yellow('"category"')}: "lifecycle"                               ${chalk.dim('│')}
${chalk.dim('│')}         },                                                           ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"dataSchema"')}: {                 ${chalk.dim('// Attribute definitions')} ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.yellow('"attr.name"')}: {                                         ${chalk.dim('│')}
${chalk.dim('│')}             ${chalk.green('"type"')}: "string",                                    ${chalk.dim('│')}
${chalk.dim('│')}             ${chalk.green('"required"')}: true                                     ${chalk.dim('│')}
${chalk.dim('│')}           }                                                          ${chalk.dim('│')}
${chalk.dim('│')}         }                                                            ${chalk.dim('│')}
${chalk.dim('│')}       }                                                                ${chalk.dim('│')}
${chalk.dim('│')}     }                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ],                                                                   ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"edges"')}: [],                ${chalk.dim('// Optional: event relationships')} ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"pv"')}: {                                                          ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"name"')}: "Feature Name",  ${chalk.dim('// Feature name (NOT "...Canvas")')} ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('"version"')}: "1.0.0"                                            ${chalk.dim('│')}
${chalk.dim('│')}   }                                                                    ${chalk.dim('│')}
${chalk.dim('│')} }                                                                      ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Event Schema Best Practices:')}

${chalk.cyan('1. Canvas represents complete, encompassing functionality:')}
   ✅ API route - Full request/response cycle
   ✅ CLI command - Complete tool execution
   ✅ Business operation - End-to-end workflow
   ❌ Individual helper functions (too granular)

${chalk.cyan('2. Event naming convention:')}
   ${chalk.yellow('<feature>.<operation>.<state>')}
   Examples:
   - validation.started
   - validation.complete
   - validation.error
   - import.parsing.complete

${chalk.cyan('3. Start simple (2-4 events):')}
   - ${chalk.green('started')}  - When feature begins
   - ${chalk.green('complete')} - When feature succeeds
   - ${chalk.green('error')}    - When feature fails
   - (optional) progress events for clear intermediate steps

${chalk.cyan('4. Attribute naming conventions:')}
   ${chalk.yellow('<category>.<name>')}
   - input.*     (input.size, input.recordCount)
   - output.*    (output.count, output.success)
   - result.*    (result.validCount, result.invalidCount)
   - error.*     (error.type, error.message, error.stage)
   - duration.*  (duration.ms)

${chalk.cyan('5. Required vs Optional attributes:')}
   - ${chalk.green('required')}: Essential data needed for validation
   - ${chalk.yellow('optional')}: Nice-to-have context, won't fail validation if missing

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-view-cli validate')}
`,

  workflow: `
${chalk.bold.cyan('Workflow Format (.workflow.json)')}
${chalk.dim('═'.repeat(70))}

Workflow files define scenarios for rendering execution data as human-readable
stories. Scenarios are matched based on required events (derived from template.events).

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('<feature-name>.workflow.json')}
  ${chalk.dim('(co-located with corresponding .otel.canvas file)')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"version"')}: "1.0.0",          ${chalk.dim('// Schema version (required)')}    ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"canvas"')}: "./feature.otel.canvas",  ${chalk.dim('// Canvas reference')}     ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"name"')}: "Feature Name",      ${chalk.dim('// NOT "Feature Name Workflows"')} ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"description"')}: "What the feature does",                        ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"spanPattern"')}: "feature.operation",  ${chalk.dim('// Exact span name')}     ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"mode"')}: "span-tree",         ${chalk.dim('// "span-tree" or "timeline"')}   ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"scenarioSelection"')}: "first-match",  ${chalk.dim('// Optional')}            ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"scenarios"')}: [                                                 ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"id"')}: "success",         ${chalk.dim('// Unique scenario ID')}         ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"priority"')}: 1,           ${chalk.dim('// Lower = higher priority')}   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"description"')}: "Successful execution",                    ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"template"')}: {            ${chalk.dim('// Workflow template')}        ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"events"')}: {                ${chalk.dim('// REQUIRED: per-event templates')} ${chalk.dim('│')}
${chalk.dim('│')}           "event.started": "Started {{attr}}",                   ${chalk.dim('│')}
${chalk.dim('│')}           "event.complete": "Completed successfully"             ${chalk.dim('│')}
${chalk.dim('│')}         },                                                         ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"summary"')}: "Completed {{count}} items"  ${chalk.dim('// Optional')}    ${chalk.dim('│')}
${chalk.dim('│')}       }                                                            ${chalk.dim('│')}
${chalk.dim('│')}     }                                                              ${chalk.dim('│')}
${chalk.dim('│')}   ]                                                                ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Required Fields:')}

  ${chalk.cyan('version')}            Schema version (e.g., "1.0.0")
  ${chalk.cyan('canvas')}             Path to .otel.canvas file
  ${chalk.cyan('name')}               Human-readable name (NOT "...Workflows")
  ${chalk.cyan('description')}        Feature purpose (NOT "Workflows for...")
  ${chalk.cyan('spanPattern')}        Exact span name to match
  ${chalk.cyan('mode')}               "span-tree" (hierarchy) or "timeline" (chronological)
  ${chalk.cyan('scenarios')}          Array of scenario definitions

${chalk.bold('Optional Fields:')}

  ${chalk.cyan('scope')}              Instrumentation scope (must be in library.yaml owned-scopes)
  ${chalk.cyan('status')}             "draft", "approved", or "implemented"
  ${chalk.cyan('files')}              Source files (required if status is approved/implemented)
  ${chalk.cyan('scenarioSelection')}  "first-match" (default) or "manual"
  ${chalk.cyan('formatting')}         Display options (showTimestamps, showDuration, etc.)

${chalk.bold('Scenario Best Practices:')}

${chalk.cyan('1. Required scenario fields:')}
   - ${chalk.green('id')}          Unique identifier (kebab-case)
   - ${chalk.green('priority')}    Selection order (lower = higher priority)
   - ${chalk.green('description')} What this scenario represents
   - ${chalk.green('template')}    Template with events mapping

${chalk.cyan('2. Priority ordering (scenarios evaluated in order):')}
   - ${chalk.green('1-10')}    Specific scenarios (success/failure cases)
   - ${chalk.yellow('999')}     Fallback scenario (catches anything)

${chalk.cyan('3. Standard scenario set:')}
   - ${chalk.green('Success')} (priority 1): Feature completed successfully
   - ${chalk.yellow('Failure')} (priority 2): Feature encountered error
   - ${chalk.dim('Fallback')} (priority 999): Generic execution captured

${chalk.cyan('4. Template syntax (Handlebars):')}
   Templates use Handlebars syntax for dynamic content:

   ${chalk.bold('Variables:')}
   - {{variable}}           Simple variable
   - {{result.count}}       Nested property
   - {{error.message}}      Deeply nested

   ${chalk.bold('Conditionals:')}
   - {{#if condition}}...{{/if}}                    If block
   - {{#if condition}}...{{else}}...{{/if}}         If-else
   - {{#if (eq status "ok")}}✅{{else}}❌{{/if}}    Comparison

   ${chalk.bold('Loops:')}
   - {{#each items}}{{this}}{{/each}}               Iterate array
   - {{#each items}}{{@index}}: {{this}}{{/each}}   With index

   ${chalk.bold('Comparison helpers:')}
   - eq, ne, lt, gt, lte, gte, and, or, not
   - Example: {{#if (gt count 10)}}Many{{/if}}

   ${chalk.bold('Span attributes (@span):')}
   Access parent span attributes without duplicating them in events:

   - {{@span.output.status}}        Span attribute "output.status"
   - {{@span.project.name}}         Nested span attribute

   ${chalk.dim('Why use @span?')}
   Span attributes are set once on the span and apply to the entire operation.
   Event attributes are specific to that moment. Using @span avoids duplicating
   span-level data into every event:

   ${chalk.dim('// In telemetry code - no duplication needed:')}
   ${chalk.dim('span.setAttributes({ "output.status": "success" });')}
   ${chalk.dim('span.addEvent("task.completed", { "task.id": "123" });')}

   ${chalk.dim('// In template - access both:')}
   ${chalk.dim('"Task {{task.id}} done (status: {{@span.output.status}})"')}

${chalk.cyan('5. Template requirements:')}
   ${chalk.bold('IMPORTANT:')} The ${chalk.yellow('"events"')} field is ${chalk.bold('REQUIRED')} in all templates
   - Must be a non-empty object mapping event names to templates
   - All event names must exist in the canvas
   - Required events are ${chalk.bold('automatically derived')} from template.events keys
   - Example: { "event.name": "Template with {{variables}}" }

${chalk.cyan('6. Template style:')}
   - Clear, concise summary line
   - 3-5 detail steps showing workflow
   - Use emojis for visual scanning (✅ ❌ 📋)
   - Include key metrics and IDs

${chalk.red.bold('DEPRECATED - DO NOT USE:')}
   The ${chalk.yellow('"condition"')} field is no longer supported.
   Required events are now automatically derived from template.events keys.
   Remove any "condition" fields from your workflow files.

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-view-cli workflow validate')}
`,

  execution: `
${chalk.bold.cyan('Execution Format (.otel.json)')}
${chalk.dim('═'.repeat(70))}

Execution files use the ${chalk.bold('standard OTLP (OpenTelemetry Protocol) JSON format')}.
These files are exported by OpenTelemetry SDK and used for visualization
and validation against canvas schemas.

${chalk.bold('File Location:')}
  ${chalk.yellow('__executions__/')}${chalk.dim('<feature-name>.otel.json')}
  ${chalk.dim('(auto-generated by test infrastructure with OpenTelemetry SDK)')}

${chalk.bold('IMPORTANT:')} __executions__/ directory must be committed to git!

${chalk.bold('File Structure (OTLP JSON Format):')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"resourceSpans"')}: [                  ${chalk.dim('// OTLP root structure')}      ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"resource"')}: {                                                  ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"attributes"')}: [                                              ${chalk.dim('│')}
${chalk.dim('│')}           { "key": "service.name", "value": { "stringValue": "..." }} ${chalk.dim('│')}
${chalk.dim('│')}         ]                                                          ${chalk.dim('│')}
${chalk.dim('│')}       },                                                            ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"scopeSpans"')}: [                                               ${chalk.dim('│')}
${chalk.dim('│')}         {                                                          ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.cyan('"scope"')}: { "name": "...", "version": "..." },           ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.cyan('"spans"')}: [                                                ${chalk.dim('│')}
${chalk.dim('│')}             {                                                      ${chalk.dim('│')}
${chalk.dim('│')}               "traceId": "4bf92f3577b34da6...",  ${chalk.dim('// 32 hex chars')}   ${chalk.dim('│')}
${chalk.dim('│')}               "spanId": "00f067aa0ba902b7",      ${chalk.dim('// 16 hex chars')}   ${chalk.dim('│')}
${chalk.dim('│')}               "name": "test:feature-name",       ${chalk.dim('// Span name')}      ${chalk.dim('│')}
${chalk.dim('│')}               "kind": 0,                         ${chalk.dim('// 0=INTERNAL')}     ${chalk.dim('│')}
${chalk.dim('│')}               "startTimeUnixNano": "1703...",    ${chalk.dim('// Unix nanoseconds')} ${chalk.dim('│')}
${chalk.dim('│')}               "endTimeUnixNano": "1703...",      ${chalk.dim('// Unix nanoseconds')} ${chalk.dim('│')}
${chalk.dim('│')}               "attributes": [                    ${chalk.dim('// Key-value pairs')} ${chalk.dim('│')}
${chalk.dim('│')}                 { "key": "input.size", "value": { "intValue": 42 } } ${chalk.dim('│')}
${chalk.dim('│')}               ],                                                    ${chalk.dim('│')}
${chalk.dim('│')}               "events": [                        ${chalk.dim('// Span events')}    ${chalk.dim('│')}
${chalk.dim('│')}                 {                                                  ${chalk.dim('│')}
${chalk.dim('│')}                   "timeUnixNano": "1703...",                      ${chalk.dim('│')}
${chalk.dim('│')}                   "name": "validation.started",                   ${chalk.dim('│')}
${chalk.dim('│')}                   "attributes": [...]                             ${chalk.dim('│')}
${chalk.dim('│')}                 }                                                  ${chalk.dim('│')}
${chalk.dim('│')}               ]                                                    ${chalk.dim('│')}
${chalk.dim('│')}             }                                                      ${chalk.dim('│')}
${chalk.dim('│')}           ]                                                        ${chalk.dim('│')}
${chalk.dim('│')}         }                                                          ${chalk.dim('│')}
${chalk.dim('│')}       ]                                                            ${chalk.dim('│')}
${chalk.dim('│')}     }                                                              ${chalk.dim('│')}
${chalk.dim('│')}   ]                                                                ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('OTLP Format Details:')}

${chalk.cyan('resourceSpans')} ${chalk.dim('(array, required)')}
  Root array containing resource-grouped spans

${chalk.cyan('resource.attributes')} ${chalk.dim('(array)')}
  Metadata about the service (e.g., service.name)

${chalk.cyan('scopeSpans')} ${chalk.dim('(array, required)')}
  Instrumentation scope-grouped spans

${chalk.cyan('spans')} ${chalk.dim('(array, required)')}
  Array of span objects with OTLP structure

${chalk.bold('Span Fields (OTLP Standard):')}

${chalk.cyan('traceId')} ${chalk.dim('(string)')} - Unique trace identifier (32 hex chars)
${chalk.cyan('spanId')} ${chalk.dim('(string)')} - Unique span identifier (16 hex chars)
${chalk.cyan('parentSpanId')} ${chalk.dim('(string, optional)')} - Parent span ID
${chalk.cyan('name')} ${chalk.dim('(string)')} - Operation name
${chalk.cyan('kind')} ${chalk.dim('(number)')} - 0=UNSPECIFIED, 1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER
${chalk.cyan('startTimeUnixNano')} ${chalk.dim('(string)')} - Start time in Unix nanoseconds
${chalk.cyan('endTimeUnixNano')} ${chalk.dim('(string)')} - End time in Unix nanoseconds
${chalk.cyan('attributes')} ${chalk.dim('(array)')} - Key-value pairs: [{ key, value: { stringValue|intValue|... } }]
${chalk.cyan('events')} ${chalk.dim('(array)')} - Span events with timestamps and attributes
${chalk.cyan('status')} ${chalk.dim('(object)')} - Status: { code: 1=OK, 2=ERROR }

${chalk.bold('Attribute Value Format:')}
  { "stringValue": "..." }  ${chalk.dim('// For strings')}
  { "intValue": 42 }        ${chalk.dim('// For integers')}
  { "doubleValue": 3.14 }   ${chalk.dim('// For floats')}
  { "boolValue": true }     ${chalk.dim('// For booleans')}

${chalk.bold('Generation:')}
  Use OpenTelemetry SDK with OTLP JSON exporter
  Example: @opentelemetry/sdk-trace-node + InMemorySpanExporter
  See: tests/otel-setup.ts in the add-skill repository

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-view-cli validate-execution <file>')}

${chalk.bold('Resources:')}
  OTLP Spec: https://opentelemetry.io/docs/specs/otlp/
  OpenTelemetry JS: https://github.com/open-telemetry/opentelemetry-js
`,

  library: `
${chalk.bold.cyan('Library Format (library.yaml)')}
${chalk.dim('═'.repeat(70))}

Library files define the service registry and component libraries for a project.
They document OTEL resource attributes and provide a central registry of all
services in the repository.

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('library.yaml')}
  ${chalk.dim('(created by npx @principal-ai/principal-view-cli init)')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} ${chalk.green('version')}: "1.0.0"                                                  ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('name')}: "@org/package-name"      ${chalk.dim('// npm package name')}           ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('description')}: "Package description"                                ${chalk.dim('│')}
${chalk.dim('│')}                                                                    ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# Service resource registry')}                                        ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# Define all services in this repository with their OTEL resource')} ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# attributes. Each service configures its own resources at runtime,')} ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# but declaring them here provides:')}                                ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# - Service documentation/registry')}                                 ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# - Expected resource schema for validation')}                        ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.yellow('# - Dev workspace trace routing')}                                    ${chalk.dim('│')}
${chalk.dim('│')}                                                                    ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('resources')}:                                                          ${chalk.dim('│')}
${chalk.dim('│')}   my-service:                    ${chalk.dim('// Service identifier')}            ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.cyan('service.name')}: "my-service"  ${chalk.dim('// OTEL service.name attribute')} ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.cyan('service.version')}: "1.0.0"    ${chalk.dim('// OTEL service.version')}        ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.cyan('deployment.environment')}: "development"  ${chalk.dim('// Environment')}      ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.cyan('project')}: "my-project"       ${chalk.dim('// Project/feature name')}        ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('# service.repository.url and service.commit.sha are auto-detected')} ${chalk.dim('│')}
${chalk.dim('│')}     ${chalk.yellow('# from git locally and set via environment variables in production')} ${chalk.dim('│')}
${chalk.dim('│')}                                                                    ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('nodeComponents')}: {}             ${chalk.dim('// Optional component library')}    ${chalk.dim('│')}
${chalk.dim('│')} ${chalk.green('edgeComponents')}: {}             ${chalk.dim('// Optional component library')}    ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Service Resource Registry:')}

The ${chalk.cyan('resources')} section documents all services in the repository that emit
OpenTelemetry traces. Each service entry should match the resource attributes
configured in your OTEL SDK initialization.

${chalk.bold('Required Fields:')}
  ${chalk.cyan('version')}             Library version (string)
  ${chalk.cyan('name')}                Package name, typically npm package name
  ${chalk.cyan('description')}         Brief description of the package
  ${chalk.cyan('resources')}           Service registry object (can be empty {})
  ${chalk.cyan('nodeComponents')}      Component definitions (can be empty {})
  ${chalk.cyan('edgeComponents')}      Component definitions (can be empty {})

${chalk.bold('Common OTEL Resource Attributes:')}

${chalk.cyan('service.name')} ${chalk.dim('(required)')}
  The logical name of the service. This is the primary identifier used to
  group traces from the same service.
  Example: "my-api-server", "storybook", "integration-tests"

${chalk.cyan('service.version')} ${chalk.dim('(recommended)')}
  The version of the service. Typically matches the package.json version.
  Example: "1.2.3", "0.14.0"

${chalk.cyan('deployment.environment')} ${chalk.dim('(recommended)')}
  The deployment environment.
  Common values: "development", "staging", "production"

${chalk.bold('Auto-Detected Attributes:')}

The following attributes are typically auto-detected from git:
  ${chalk.cyan('service.repository.url')}  Git repository URL
  ${chalk.cyan('service.commit.sha')}      Current commit hash

${chalk.bold('Use Cases:')}

${chalk.cyan('1. Storybook with OTEL Addon:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} resources:                                                         ${chalk.dim('│')}
${chalk.dim('│')}   my-storybook:                                                    ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "my-storybook"                                   ${chalk.dim('│')}
${chalk.dim('│')}     service.version: "0.1.0"                                       ${chalk.dim('│')}
${chalk.dim('│')}     deployment.environment: "development"                          ${chalk.dim('│')}
${chalk.dim('│')}     project: "ui-components"                                       ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.cyan('2. Multiple Services in Monorepo:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} resources:                                                         ${chalk.dim('│')}
${chalk.dim('│')}   api-server:                                                      ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "api-server"                                     ${chalk.dim('│')}
${chalk.dim('│')}     service.version: "2.0.0"                                       ${chalk.dim('│')}
${chalk.dim('│')}     deployment.environment: "production"                           ${chalk.dim('│')}
${chalk.dim('│')}   worker-service:                                                  ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "worker-service"                                 ${chalk.dim('│')}
${chalk.dim('│')}     service.version: "1.5.0"                                       ${chalk.dim('│')}
${chalk.dim('│')}     deployment.environment: "production"                           ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.cyan('3. Test Environment:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} resources:                                                         ${chalk.dim('│')}
${chalk.dim('│')}   integration-tests:                                               ${chalk.dim('│')}
${chalk.dim('│')}     service.name: "integration-tests"                              ${chalk.dim('│')}
${chalk.dim('│')}     service.version: "1.0.0"                                       ${chalk.dim('│')}
${chalk.dim('│')}     deployment.environment: "test"                                 ${chalk.dim('│')}
${chalk.dim('│')}     test.suite: "integration"                                      ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Best Practices:')}

${chalk.cyan('1. Service Name Consistency:')}
   Ensure the ${chalk.yellow('service.name')} in library.yaml matches the resource attributes
   configured in your OTEL SDK initialization code.

${chalk.cyan('2. Version Synchronization:')}
   Keep ${chalk.yellow('service.version')} in sync with your package.json version.

${chalk.cyan('3. Document All Services:')}
   Add an entry for every service in your repository that emits traces.
   This creates a central registry for understanding trace sources.

${chalk.cyan('4. Use Descriptive Service Names:')}
   Service names should clearly identify the component:
   ✅ "payment-processor-api"
   ✅ "user-dashboard-ui"
   ❌ "service1"
   ❌ "app"

${chalk.bold('Integration with OTEL SDK:')}

Your OTEL SDK configuration should match library.yaml resources:

${chalk.dim('// Example: @opentelemetry/sdk-trace-web initialization')}
${chalk.dim('const provider = new WebTracerProvider({')}
${chalk.dim('  resource: new Resource({')}
${chalk.dim('    [SEMRESATTRS_SERVICE_NAME]: "my-storybook",')}
${chalk.dim('    [SEMRESATTRS_SERVICE_VERSION]: "0.1.0",')}
${chalk.dim('    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: "development",')}
${chalk.dim('  }),')}
${chalk.dim('});')}

${chalk.bold('Initialization:')}
  ${chalk.cyan('npx @principal-ai/principal-view-cli init')}
  Creates .principal-views/library.yaml with template and comments

${chalk.bold('More Info:')}
  OpenTelemetry Resource Spec: https://opentelemetry.io/docs/specs/semconv/resource/
  OpenTelemetry JS: https://github.com/open-telemetry/opentelemetry-js
`,

  examples: `
${chalk.bold.cyan('Complete File Examples')}
${chalk.dim('═'.repeat(70))}

${chalk.bold('Example 1: Data Validator Canvas')}
${chalk.dim('─'.repeat(70))}
${chalk.yellow('.principal-views/data-validator.otel.canvas')}

{
  "nodes": [
    {
      "id": "validation-started",
      "type": "text",
      "text": "# validation.started\\n\\nEmitted when validation begins",
      "x": 0, "y": 0, "width": 200, "height": 100,
      "pv": {
        "event": "validation.started",
        "sources": ["src/validator.ts"],
        "otel": {
          "kind": "event",
          "category": "lifecycle"
        },
        "dataSchema": {
          "input.recordCount": {
            "type": "number",
            "required": true
          },
          "input.source": {
            "type": "string",
            "required": false
          }
        }
      }
    },
    {
      "id": "validation-complete",
      "type": "text",
      "text": "# validation.complete\\n\\nEmitted when validation succeeds",
      "x": 250, "y": 0, "width": 200, "height": 100,
      "pv": {
        "event": "validation.complete",
        "sources": ["src/validator.ts"],
        "otel": {
          "kind": "event",
          "category": "lifecycle"
        },
        "dataSchema": {
          "result.validCount": {
            "type": "number",
            "required": true
          },
          "result.invalidCount": {
            "type": "number",
            "required": true
          },
          "duration.ms": {
            "type": "number",
            "required": false
          }
        }
      }
    },
    {
      "id": "validation-error",
      "type": "text",
      "text": "# validation.error\\n\\nEmitted when validation fails",
      "x": 500, "y": 0, "width": 200, "height": 100,
      "pv": {
        "event": "validation.error",
        "sources": ["src/validator.ts"],
        "otel": {
          "kind": "event",
          "category": "error"
        },
        "dataSchema": {
          "error.type": {
            "type": "string",
            "required": true
          },
          "error.message": {
            "type": "string",
            "required": true
          },
          "error.stage": {
            "type": "string",
            "required": false
          }
        }
      }
    }
  ],
  "edges": [],
  "pv": {
    "name": "Data Validator",
    "version": "1.0.0"
  }
}

${chalk.bold('Example 2: Workflow Scenarios')}
${chalk.dim('─'.repeat(70))}
${chalk.yellow('.principal-views/data-validator.workflow.json')}

{
  "version": "1.0.0",
  "canvas": "./data-validator.otel.canvas",
  "name": "Data Validator",
  "description": "Validates data records against defined schemas",
  "spanPattern": "validation.process",
  "mode": "span-tree",
  "scenarioSelection": "first-match",
  "scenarios": [
    {
      "id": "success",
      "priority": 1,
      "description": "Validation completed successfully",
      "template": {
        "events": {
          "validation.started": "Started validation of {{input.recordCount}} records",
          "validation.complete": "Processed {{result.validCount}} valid, {{result.invalidCount}} invalid (batch: {{@span.batch.id}})"
        },
        "summary": "Validated {{result.validCount}} records successfully"
      }
    },
    {
      "id": "error",
      "priority": 2,
      "description": "Validation encountered an error",
      "template": {
        "events": {
          "validation.started": "Started validation",
          "validation.error": "Error: {{error.message}} (type: {{error.type}})"
        },
        "summary": "Validation failed: {{error.message}}"
      }
    },
    {
      "id": "fallback",
      "priority": 999,
      "description": "Generic validation execution",
      "template": {
        "events": {
          "validation.started": "Validation started"
        },
        "summary": "Validation execution captured"
      }
    }
  ]
}

${chalk.bold('Example 3: Execution File')}
${chalk.dim('─'.repeat(70))}
${chalk.yellow('__executions__/data-validator.otel.json')}

{
  "exportedAt": "2025-01-21T10:30:45.123Z",
  "serviceName": "my-app-tests",
  "spanCount": 3,
  "spans": [
    {
      "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
      "spanId": "00f067aa0ba902b7",
      "parentSpanId": null,
      "name": "test:data-validator",
      "kind": "INTERNAL",
      "startTime": 1703548800000,
      "endTime": 1703548800150,
      "duration": 150,
      "attributes": {
        "test.name": "data validator success case"
      },
      "status": { "code": "OK" },
      "events": []
    },
    {
      "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
      "spanId": "abc123def4567890",
      "parentSpanId": "00f067aa0ba902b7",
      "name": "validation.started",
      "kind": "INTERNAL",
      "startTime": 1703548800010,
      "endTime": 1703548800015,
      "duration": 5,
      "attributes": {
        "input.recordCount": 100,
        "input.source": "test-data.csv"
      },
      "status": { "code": "OK" },
      "events": []
    },
    {
      "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
      "spanId": "def789abc1234567",
      "parentSpanId": "00f067aa0ba902b7",
      "name": "validation.complete",
      "kind": "INTERNAL",
      "startTime": 1703548800140,
      "endTime": 1703548800145,
      "duration": 5,
      "attributes": {
        "result.validCount": 95,
        "result.invalidCount": 5,
        "duration.ms": 130
      },
      "status": { "code": "OK" },
      "events": []
    }
  ]
}

${chalk.bold('Next Steps:')}
  ${chalk.cyan('npx @principal-ai/principal-view-cli validate')}          Validate canvas
  ${chalk.cyan('npx @principal-ai/principal-view-cli workflow validate')} Validate workflows
  ${chalk.cyan('npx @principal-ai/principal-view-cli validate-execution')}  Validate execution
`,
};

export function createFormatsCommand(): Command {
  const command = new Command('formats');

  command
    .description('Display documentation about file formats')
    .argument(
      '[section]',
      'Section to display: overview, canvas, workflow, execution, examples'
    )
    .action((section?: string) => {
      const validSections = Object.keys(FORMAT_SECTIONS);

      if (!section) {
        console.log(FORMAT_SECTIONS.overview);
        return;
      }

      const normalizedSection = section.toLowerCase();

      if (!validSections.includes(normalizedSection)) {
        console.log(chalk.red(`Unknown section: ${section}`));
        console.log(`Valid sections: ${validSections.join(', ')}`);
        process.exit(1);
      }

      console.log(FORMAT_SECTIONS[normalizedSection as keyof typeof FORMAT_SECTIONS]);
    });

  return command;
}
