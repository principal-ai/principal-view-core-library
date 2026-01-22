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

${chalk.bold('2. Narrative Files')} ${chalk.yellow('.narrative.json')}
   Define scenarios and templates for rendering executions as human-readable
   narratives based on the emitted events.

${chalk.bold('3. Execution Files')} ${chalk.yellow('.otel.json')}
   Captured OTEL spans from test runs or production code, exported for
   visualization and validation against canvas schemas.

Run ${chalk.cyan('npx @principal-ai/principal-view-cli formats <section>')} for details on:
  ${chalk.yellow('canvas')}       .otel.canvas format and event schemas
  ${chalk.yellow('narrative')}    .narrative.json format and scenario structure
  ${chalk.yellow('execution')}    .otel.json format for captured spans
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
${chalk.dim('│')}         ${chalk.cyan('"otelEvent"')}: {          ${chalk.dim('// OTEL event definition')}    ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.yellow('"name"')}: "feature.event.name",                          ${chalk.dim('│')}
${chalk.dim('│')}           ${chalk.cyan('"attributes"')}: {       ${chalk.dim('// Required & optional attrs')} ${chalk.dim('│')}
${chalk.dim('│')}             ${chalk.green('"required"')}: ["attr.name", ...],                     ${chalk.dim('│')}
${chalk.dim('│')}             ${chalk.green('"optional"')}: ["attr.name", ...]                      ${chalk.dim('│')}
${chalk.dim('│')}           }                                                            ${chalk.dim('│')}
${chalk.dim('│')}         }                                                              ${chalk.dim('│')}
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

  narrative: `
${chalk.bold.cyan('Narrative Format (.narrative.json)')}
${chalk.dim('═'.repeat(70))}

Narrative files define scenarios for rendering execution data as human-readable
stories. They evaluate conditions against captured events to select the best
matching narrative template.

${chalk.bold('File Location:')}
  ${chalk.dim('.principal-views/')}${chalk.yellow('<feature-name>.narrative.json')}
  ${chalk.dim('(co-located with corresponding .otel.canvas file)')}

${chalk.bold('Required Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"name"')}: "Feature Name",      ${chalk.dim('// NOT "Feature Name Narratives"')} ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"description"')}: "What the feature does",  ${chalk.dim('// Purpose, not "Narratives for..."')} ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"scenarios"')}: [                                                 ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"priority"')}: 1,           ${chalk.dim('// Lower = higher priority')}   ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"condition"')}: "...",      ${chalk.dim('// JSONPath/logic expression')} ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"template"')}: {            ${chalk.dim('// Narrative template')}        ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"summary"')}: "...",    ${chalk.dim('// One-line summary')}          ${chalk.dim('│')}
${chalk.dim('│')}         ${chalk.cyan('"details"')}: [        ${chalk.dim('// Step-by-step details')}      ${chalk.dim('│')}
${chalk.dim('│')}           "Step 1: ...",                                          ${chalk.dim('│')}
${chalk.dim('│')}           "Step 2: ...",                                          ${chalk.dim('│')}
${chalk.dim('│')}         ]                                                          ${chalk.dim('│')}
${chalk.dim('│')}       }                                                            ${chalk.dim('│')}
${chalk.dim('│')}     }                                                              ${chalk.dim('│')}
${chalk.dim('│')}   ]                                                                ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Naming Guidelines:')}

  ❌ DON'T append "Narratives" to the name:
     "name": "Package Processor Narratives"

  ✅ DO use the feature name directly:
     "name": "Package Processor"

  ❌ DON'T prefix description with boilerplate:
     "description": "Human-readable narratives for package extraction..."

  ✅ DO describe the feature's purpose:
     "description": "Package extraction and analysis from repository file trees"

${chalk.bold('Scenario Best Practices:')}

${chalk.cyan('1. Priority ordering (scenarios evaluated in order):')}
   - ${chalk.green('1-10')}    Specific scenarios (success/failure cases)
   - ${chalk.yellow('999')}     Fallback scenario (catches anything)

${chalk.cyan('2. Standard scenario set:')}
   - ${chalk.green('Success')} (priority 1): Feature completed successfully
   - ${chalk.yellow('Failure')} (priority 2): Feature encountered error
   - ${chalk.dim('Fallback')} (priority 999): Generic execution captured

${chalk.cyan('3. Template interpolation:')}
   Use {{path.to.value}} to reference event attributes
   Examples:
   - {{record.count}}
   - {{error.message}}
   - {{result.invalidCount}}

${chalk.cyan('4. Template style:')}
   - Clear, concise summary line
   - 3-5 detail steps showing workflow
   - Use emojis for visual scanning (✅ ❌ 📋)
   - Include key metrics and IDs

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-view-cli narrative validate')}
`,

  execution: `
${chalk.bold.cyan('Execution Format (.otel.json)')}
${chalk.dim('═'.repeat(70))}

Execution files contain captured OTEL spans from test runs or production code.
These files are exported by your test infrastructure and used for visualization
and validation against canvas schemas.

${chalk.bold('File Location:')}
  ${chalk.yellow('__executions__/')}${chalk.dim('<feature-name>.otel.json')}
  ${chalk.dim('(auto-generated by test infrastructure)')}

${chalk.bold('IMPORTANT:')} __executions__/ directory must be committed to git!

${chalk.bold('File Structure:')}
${chalk.dim('┌────────────────────────────────────────────────────────────────────┐')}
${chalk.dim('│')} {                                                                  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"exportedAt"')}: "2025-01-21T10:30:00.000Z",  ${chalk.dim('// ISO timestamp')} ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"serviceName"')}: "my-service",               ${chalk.dim('// Service name')}  ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"spanCount"')}: 5,                            ${chalk.dim('// Total spans')}   ${chalk.dim('│')}
${chalk.dim('│')}   ${chalk.green('"spans"')}: [                                                     ${chalk.dim('│')}
${chalk.dim('│')}     {                                                              ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"traceId"')}: "4bf92f3577b34da6...",  ${chalk.dim('// 32 hex chars')}     ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"spanId"')}: "00f067aa0ba902b7",     ${chalk.dim('// 16 hex chars')}     ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"parentSpanId"')}: "abc123...",      ${chalk.dim('// Parent span (null for root)')} ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"name"')}: "test:feature-name",     ${chalk.dim('// Span name')}         ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"kind"')}: "INTERNAL",              ${chalk.dim('// Span kind')}         ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"startTime"')}: 1703548800000,      ${chalk.dim('// Unix ms')}           ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"endTime"')}: 1703548800050,        ${chalk.dim('// Unix ms')}           ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"duration"')}: 50,                  ${chalk.dim('// Duration in ms')}    ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"attributes"')}: {                  ${chalk.dim('// Event attributes')}  ${chalk.dim('│')}
${chalk.dim('│')}         "input.size": 42,                                        ${chalk.dim('│')}
${chalk.dim('│')}         "output.success": true                                   ${chalk.dim('│')}
${chalk.dim('│')}       },                                                          ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"status"')}: {                                                 ${chalk.dim('│')}
${chalk.dim('│')}         "code": "OK"                    ${chalk.dim('// OK, ERROR, UNSET')}    ${chalk.dim('│')}
${chalk.dim('│')}       },                                                          ${chalk.dim('│')}
${chalk.dim('│')}       ${chalk.yellow('"events"')}: []                      ${chalk.dim('// Optional span events')}  ${chalk.dim('│')}
${chalk.dim('│')}     }                                                              ${chalk.dim('│')}
${chalk.dim('│')}   ]                                                                ${chalk.dim('│')}
${chalk.dim('│')} }                                                                  ${chalk.dim('│')}
${chalk.dim('└────────────────────────────────────────────────────────────────────┘')}

${chalk.bold('Field Descriptions:')}

${chalk.cyan('exportedAt')} ${chalk.dim('(string, required)')}
  ISO 8601 timestamp when the file was exported

${chalk.cyan('serviceName')} ${chalk.dim('(string, required)')}
  Name of the service/test suite that generated these spans

${chalk.cyan('spanCount')} ${chalk.dim('(number, required)')}
  Total number of spans in this execution

${chalk.cyan('spans')} ${chalk.dim('(array, required)')}
  Array of span objects containing OTEL trace data

${chalk.bold('Span Object Fields:')}

${chalk.cyan('traceId')} ${chalk.dim('(string, 32 hex chars)')}
  Unique identifier for the entire trace

${chalk.cyan('spanId')} ${chalk.dim('(string, 16 hex chars)')}
  Unique identifier for this specific span

${chalk.cyan('parentSpanId')} ${chalk.dim('(string | null)')}
  Parent span ID, or null for root span

${chalk.cyan('name')} ${chalk.dim('(string)')}
  Descriptive name for the operation

${chalk.cyan('kind')} ${chalk.dim('(string)')}
  Span kind: INTERNAL, CLIENT, SERVER, PRODUCER, CONSUMER

${chalk.cyan('startTime')} ${chalk.dim('(number)')}
  Unix timestamp in milliseconds when span started

${chalk.cyan('endTime')} ${chalk.dim('(number)')}
  Unix timestamp in milliseconds when span ended

${chalk.cyan('duration')} ${chalk.dim('(number)')}
  Duration in milliseconds (endTime - startTime)

${chalk.cyan('attributes')} ${chalk.dim('(object)')}
  Key-value pairs of event attributes (validated against canvas schema)

${chalk.cyan('status')} ${chalk.dim('(object)')}
  Status code (OK, ERROR, UNSET) and optional message

${chalk.cyan('events')} ${chalk.dim('(array)')}
  Optional array of timestamped events within the span

${chalk.bold('Generation:')}
  Set up test infrastructure with OTEL exporters that write to __executions__/
  See: docs/guides/adding-opentelemetry-to-tests.md

${chalk.bold('Validation:')}
  ${chalk.cyan('npx @principal-ai/principal-view-cli validate-execution <file>')}
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
        "otelEvent": {
          "name": "validation.started",
          "attributes": {
            "required": ["input.recordCount"],
            "optional": ["input.source"]
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
        "otelEvent": {
          "name": "validation.complete",
          "attributes": {
            "required": ["result.validCount", "result.invalidCount"],
            "optional": ["duration.ms"]
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
        "otelEvent": {
          "name": "validation.error",
          "attributes": {
            "required": ["error.type", "error.message"],
            "optional": ["error.stage"]
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

${chalk.bold('Example 2: Narrative Scenarios')}
${chalk.dim('─'.repeat(70))}
${chalk.yellow('.principal-views/data-validator.narrative.json')}

{
  "name": "Data Validator",
  "description": "Validates data records against defined schemas",
  "scenarios": [
    {
      "priority": 1,
      "condition": "events[?name=='validation.complete']",
      "template": {
        "summary": "✅ Validated {{result.validCount}} records successfully",
        "details": [
          "🔍 Started validation",
          "📊 Processed {{input.recordCount}} records",
          "✅ {{result.validCount}} valid",
          "❌ {{result.invalidCount}} invalid"
        ]
      }
    },
    {
      "priority": 2,
      "condition": "events[?name=='validation.error']",
      "template": {
        "summary": "❌ Validation failed: {{error.message}}",
        "details": [
          "🔍 Started validation",
          "💥 Error occurred: {{error.message}}",
          "🏷️  Error type: {{error.type}}"
        ]
      }
    },
    {
      "priority": 999,
      "condition": "true",
      "template": {
        "summary": "📋 Validation execution captured",
        "details": [
          "📦 Captured {{spans.length}} events",
          "⏱️  Duration: {{duration.ms}}ms"
        ]
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
  ${chalk.cyan('npx @principal-ai/principal-view-cli narrative validate')} Validate narratives
  ${chalk.cyan('npx @principal-ai/principal-view-cli validate-execution')}  Validate execution
`,
};

export function createFormatsCommand(): Command {
  const command = new Command('formats');

  command
    .description('Display documentation about file formats')
    .argument(
      '[section]',
      'Section to display: overview, canvas, narrative, execution, examples'
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
