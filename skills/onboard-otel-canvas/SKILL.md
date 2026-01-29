---
name: onboard-otel-canvas
description: Guide users through onboarding existing functionality: create one canvas, add scenarios, and add test execution
---

# Onboard OTEL Canvas Skill

Guide users through onboarding existing functionality into the Principal View OTEL workflow: create one canvas, add scenarios, and add test execution.

## Purpose

This skill provides a **focused onboarding experience** for users who want to start using Principal View OTEL canvases with their existing code. It's designed for the first-time user who needs a complete, working example.

## What is Principal View OTEL?

Principal View OTEL is a workflow for documenting and validating OpenTelemetry event schemas using three file types:

1. **`.otel.canvas`** - Defines your feature and its OTEL event schemas (what events should be emitted and their attributes)
2. **`.workflow.json`** - Defines how to render execution traces as human-readable workflows
3. **`.otel.json`** - Actual execution data captured from instrumented tests (stored in `__executions__/`)

These files work together: the canvas defines the schema, workflows define how to present executions, and execution files contain actual telemetry data that gets validated against the canvas and rendered using workflows.

## When to Use This Skill

Use this skill when the user wants to:
- Get started with Principal View OTEL for the first time
- Document existing functionality with telemetry
- Create their first canvas, scenarios, and tests
- Learn the complete workflow from canvas → scenarios → test execution

## What This Skill Does

This skill provides an **interactive, step-by-step workflow** to:
1. Pick one existing feature/function to document
2. Create a .otel.canvas file mapping its telemetry
3. Create .workflow.json scenarios for success/failure cases
4. Instrument tests to emit OTEL and validate against the canvas
5. Export test execution data for visualization

**Scope**: One feature, one canvas, basic scenarios, working tests. Keep it simple and achievable.

## Interactive Workflow

### Phase 0: Discover Options

**Proactively explore the codebase** to find good candidates for onboarding:

1. **Use the Task tool with subagent_type=Explore** to discover potential features:
   - Search for CLI commands (e.g., files in `src/commands/`, `cli/`, or files with command patterns)
   - Search for API routes (e.g., files in `src/routes/`, `api/`, or files with route handlers)
   - Search for complete operations (e.g., main exported functions, service classes, workflow functions)
   - Search for data processing pipelines (e.g., parser, processor, converter, transformer functions)
   - Look for existing tests to understand what functionality exists

2. **Analyze discovered candidates** for suitability:
   - **Good candidates** are encompassing, complete functionality:
     - **API routes** - Full request/response cycle for an endpoint
     - **CLI commands** - From invocation to completion
     - **Complete operations** - End-to-end workflows like "validate and transform data"
     - **Processing pipelines** - Input through output
   - **Avoid**:
     - Individual helper functions or utilities (too granular)
     - Complex multi-service flows (too complex for first canvas)
     - New unimplemented features (no telemetry yet)
     - Fragmented operations without clear boundaries

3. **Present 3-5 options to the user** using AskUserQuestion:
   - Show feature name and brief description
   - Include file location
   - Explain why it's a good candidate
   - Let user choose or specify their own

**Goal**: Present user with curated options rather than asking them to know what to pick.

### Phase 1: Choose What to Onboard

**Based on discovered options:**

1. **User selects from presented options** or specifies their own feature

2. **Read the implementation** to understand:
   - Get the file path(s) for the selected feature
   - Understand inputs, outputs, and what it does
   - Identify entry and exit points

3. **Ask about scenarios**: "What are the success and failure cases for this feature?"
   - Success: Happy path execution
   - Failure: Common error scenarios (1-2 examples)

**Goal**: Identify a single, concrete feature to document with full context.

### Phase 2: Create the Canvas

Use the `create-otel-canvas` skill to create a canvas for this feature:

1. **Map the telemetry** - What events should be emitted?
   - Start event: When feature begins (e.g., `validation.started`)
   - Progress events: Key steps (optional for first pass)
   - End event: When feature completes (e.g., `validation.complete`)
   - Error event: When feature fails (e.g., `validation.error`)

2. **Define event schemas** - What attributes does each event need?
   - **Required attributes**: Essential data (input size, result count, error message)
   - **Optional attributes**: Nice-to-have data (duration, debug info)
   - Keep it minimal - don't over-engineer

3. **Create the canvas file** with proper structure:
   ```bash
   # Example: .principal-views/data-validator.otel.canvas
   ```

   **IMPORTANT: Canvas Structure**
   - **One node per event type** - Each event gets its own node in the canvas
   - Example: If you have 4 events (`validation.started`, `validation.complete`, `validation.error`, `validation.progress`), create 4 nodes
   - Each node contains ONE event schema in its `pv.event` field
   - Connect nodes with edges to show the event flow (start → progress → complete/error)

   **RECOMMENDED: Node Sizing and Layout**
   - **Use consistent dimensions** for all event nodes: `width: 200, height: 100`
   - This creates a clean, compact layout that's easy to scan

   **Layout Options:**

   **Option 1: Vertical/Top-Down Layout (RECOMMENDED for linear workflows)**
   - Main flow in a single column, flowing downward
   - Error/alternative paths branched to the right
   - Vertical spacing: 200px between nodes (100px height + 100px gap)
   - Horizontal offset for branches: 350px
   - Example positioning:
     ```
     Main flow (x: 100):
       started:    x: 100, y:  50   (top)
       step-1:     x: 100, y: 250   (200px down)
       step-2:     x: 100, y: 450   (200px down)
       complete:   x: 100, y: 650   (200px down)

     Error branch (x: 450, offset 350px right):
       error:      x: 450, y:  50   (aligned with start)
     ```
   - Edges: Connect `fromSide: "bottom"` → `toSide: "top"` for vertical flow
   - Best for: Sequential operations, pipelines, CLI commands

   **Option 2: Horizontal/Left-Right Layout (for parallel operations)**
   - Main flow left-to-right across the top
   - Error/alternative paths below
   - Horizontal spacing: ~300px between nodes (200px width + 100px gap)
   - Vertical spacing: ~220px for branches
   - Example positioning:
     ```
     started:    x: 100, y: 100  (top-left)
     step-1:     x: 400, y: 100  (300px right)
     step-2:     x: 700, y: 100  (300px right)
     complete:   x: 700, y: 320  (220px down)
     error:      x: 100, y: 320  (below start)
     ```
   - Edges: Connect `fromSide: "right"` → `toSide: "left"` for horizontal flow
   - Best for: Parallel processes, service architectures

   **REQUIRED: Sources Field**
   - **All OTEL nodes MUST have a `pv.sources` field** with at least one source file path
   - Sources are exact file paths (relative to repository root) - **NO glob patterns, NO line numbers**
   - Examples:
     - ✅ Good: `"sources": ["src/commands/validate.ts"]`
     - ✅ Good: `"sources": ["lib/data-validator.ts", "lib/validator-utils.ts"]`
     - ❌ Bad: `"sources": ["src/**/*.ts"]` (glob pattern not supported)
     - ❌ Bad: `"sources": ["src/validator.ts:123"]` (line numbers not supported)
   - This tells the system which source files emit the events for this node

   **Format reference**: Canvas files use JSON Canvas format with `pv` (Principal View) extensions. Run `npx @principal-ai/principal-view-cli schema examples` to see example canvas files, or look at existing `.otel.canvas` files in `.principal-views/` directory.

4. **Validate immediately**:
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

**Goal**: Working .otel.canvas file with 2-4 event schemas (start, complete, error).

### Phase 3: Create Workflow Scenarios

Use the `create-workflow-scenarios` skill to create scenarios:

1. **Create .workflow.json file** co-located with canvas:
   ```bash
   # Example: .principal-views/data-validator.workflow.json
   ```

   **Format reference**: See existing workflow files in `.principal-views/` for examples. Run `npx @principal-ai/principal-view-cli workflow validate <file>` to validate your workflow file

   **IMPORTANT: Naming and Description Guidelines**
   - ❌ **Don't** append "Workflows" to the name: `"Package Processor Workflows"`
   - ✅ **Do** use the feature name directly: `"Package Processor"`
   - ❌ **Don't** prefix description with framework boilerplate: `"Human-readable workflows for package extraction..."`
   - ✅ **Do** describe the feature's purpose: `"Package extraction and analysis from repository file trees"`
   - Focus on WHAT the feature does, not WHAT the file contains
   - Keep it concise and domain-focused

2. **Define scenarios** (start with 2-3):
   - **Success scenario** (priority 1): Feature worked correctly
     - Condition: Check for completion event + success attributes
     - Template: "✅ Validated {{record.count}} records successfully"

   - **Failure scenario** (priority 2): Feature failed
     - Condition: Check for error event or error attributes
     - Template: "❌ Validation failed: {{error.message}}"

   - **Fallback scenario** (priority 999): Generic execution
     - Condition: Any event
     - Template: "📋 Execution captured with {{event.count}} events"

3. **Keep templates simple**:
   - Clear summary line
   - 3-5 steps showing flow
   - Key details (IDs, counts, errors)
   - Use emojis for visual scanning

4. **Validate**:
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

**Goal**: Working .workflow.json with success, failure, and fallback scenarios.

### Phase 4: Set Up Test Infrastructure

Use the `setup-otel-testing` skill to set up OTEL in tests:

1. **Check test framework**:
   - Ask: "What test framework are you using? (Bun, Vitest, Jest)"

2. **Install OTEL dependencies** (if needed):
   ```bash
   bun add -d @opentelemetry/api @opentelemetry/sdk-trace-base
   ```

   **Note**: These are the official OpenTelemetry JavaScript libraries:
   - `@opentelemetry/api` - Core tracing API for instrumentation
   - `@opentelemetry/sdk-trace-base` - SDK for test infrastructure (tracers, exporters)
   - See References section for GitHub repos if you need troubleshooting help

3. **Create `test/otel-setup.ts`** (or similar):
   - Set up tracer with InMemorySpanExporter
   - Create helper functions: `startTestSpan()`, `createValidatedSpanEmitter()`
   - Add afterAll hook to export spans to `__executions__/*.otel.json`

4. **IMPORTANT: Ensure `__executions__/` is NOT gitignored**:
   - Check .gitignore - remove `__executions__` if present
   - Execution files must be committed for visualization

**Goal**: Working OTEL test infrastructure ready to use.

### Phase 5: Instrument Source Code and Create Test

Instrument the actual source code, then create a test that captures its telemetry:

1. **Instrument the source code** for the feature:
   ```typescript
   // src/data-validator.ts
   import { trace } from '@opentelemetry/api';

   const tracer = trace.getTracer('data-validator');

   export async function validateData(data: any[]) {
     const span = tracer.startSpan('data.validation');

     // Emit start event
     span.addEvent('validation.started', {
       'input.recordCount': data.length,
     });

     try {
       // Actual validation logic
       const results = performValidation(data);

       // Emit completion event
       span.addEvent('validation.complete', {
         'result.validCount': results.valid,
         'result.invalidCount': results.invalid,
         'duration.ms': results.duration,
       });

       span.end();
       return results;
     } catch (error) {
       // Emit error event
       span.addEvent('validation.error', {
         'error.type': error.name,
         'error.message': error.message,
       });
       span.end();
       throw error;
     }
   }
   ```

2. **Create test that calls instrumented code**:
   ```typescript
   import { test, expect } from 'bun:test';
   import { validateData } from '../src/data-validator';
   // OTEL setup from test/otel-setup.ts ensures events are captured

   test('data validator success case', async () => {
     const testData = [/* test records */];

     // Call the instrumented code - it will emit OTEL events
     const result = await validateData(testData);

     // Verify the business logic
     expect(result.valid).toBeGreaterThan(0);

     // Events are automatically validated against canvas and exported
   });
   ```

3. **Run the test**:
   ```bash
   bun test
   ```

4. **Verify**:
   - Test should pass (business logic works)
   - Events are validated against canvas schema (strict mode in tests)
   - No validation errors means events match your canvas

5. **Check exported file**:
   ```bash
   ls __executions__/
   # Should see: data-validator.otel.json (or test-run.otel.json)
   ```

   **Format reference**: Execution files are OpenTelemetry span data in JSON format. Run `npx @principal-ai/principal-view-cli validate-execution __executions__/*.otel.json` to validate execution files

**Goal**: Instrumented source code with one passing test that captures real telemetry and exports execution data.

### Phase 6: Add Failure Test

Add a test for the failure scenario:

1. **Create test for error case**:
   ```typescript
   test('data validator error case', async () => {
     const invalidData = [/* malformed test records */];

     // Call the instrumented code with invalid data
     // The source code will emit error events automatically
     await expect(validateData(invalidData)).rejects.toThrow();

     // Error events are automatically captured and validated
   });
   ```

   **Note**: The error event emission is already in the source code (Phase 5 step 1).
   The test just needs to trigger the error path - the instrumented code handles the rest.

2. **Run both tests**:
   ```bash
   bun test
   ```

3. **Verify both scenarios export**:
   - Success execution → success workflow
   - Failure execution → failure workflow

**Goal**: Two tests covering success and failure scenarios, both capturing real telemetry from instrumented source code.

### Phase 7: Verify the Complete Workflow

Walk through the end-to-end flow:

1. **Canvas exists and validates**: ✅
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

2. **Scenarios exist and validate**: ✅
   ```bash
   # Check .workflow.json file validates
   ```

3. **Tests run and emit OTEL**: ✅
   ```bash
   bun test
   # See: "Exported N spans to __executions__/..."
   ```

4. **Execution files exist**: ✅
   ```bash
   ls __executions__/*.otel.json
   ```

5. **Show next steps**:
   ```
   Next: Visualize your execution data

   Option 1: In Storybook
   - Load ExecutionViewerPanel
   - Point it to your canvas
   - See workflow rendering of test executions

   Option 2: In ADE
   - Open canvas in ADE
   - View executions tab
   - Click execution files to see workflows
   ```

**Goal**: User has complete, working example they can build on.

## Guidelines for Success

### Keep It Minimal
- **One feature**: Don't try to document everything
- **Basic events**: Start event, end event, error event (2-4 total)
- **One node per event**: Each event type gets its own canvas node
- **Simple scenarios**: Success, failure, fallback
- **Two tests**: Happy path + error case

### Make It Real
- Use actual code from their project
- Real inputs/outputs, not fake examples
- Actual error cases they encounter
- Test data that makes sense

### Be Interactive
- Explore the codebase proactively to find candidates
- Present curated options with explanations
- Ask questions to understand selected code
- Show examples from their codebase
- Get confirmation before creating files
- Explain WHY, not just WHAT

### Validate Early
- Run CLI validation after each file
- Fix issues immediately
- Don't move forward with broken files

## Common Questions to Answer

**Q: "How do you know what to recommend for my first canvas?"**
A: I explore your codebase using the Task tool with the Explore agent to find features that match good canvas criteria. **A canvas should represent encompassing, complete functionality** - a cohesive unit of work with clear start and end boundaries.

I look for:
- **API routes** - Full request handling: `POST /api/users` from request validation through response
- **CLI commands** - Complete tool execution: `validate --input data.json` from args parsing to exit
- **Complete operations** - End-to-end workflows: "validate and transform data", not just "validate" alone
- **Processing pipelines** - Full data flow: CSV input → parsing → validation → output

I avoid recommending:
- Individual helper functions (too granular - these are steps WITHIN a canvas)
- Multi-service workflows (too complex for first canvas)
- New unimplemented features (don't know telemetry yet)
- Core infrastructure (too broad)
- Partial operations without clear completion (where does it end?)

After exploring, I present you with 3-5 curated options to choose from.

**Q: "How many events should I define?"**
A: Start with 2-4:
- 1 start event (feature.started)
- 1 completion event (feature.complete)
- 1 error event (feature.error)
- Optional: 1 progress event if feature has clear steps

**Q: "How should I structure the canvas nodes?"**
A: **One node per event type**. Each event gets its own node in the canvas:
- If you have 3 events (`started`, `complete`, `error`), create 3 nodes
- Each node has ONE event schema defined in its `pv.event` field
- Connect nodes with edges to show the flow (started → complete/error)
- This keeps the visual structure clear and matches the event emission pattern

**Q: "What size should I make the nodes?"**
A: Use **consistent dimensions** for all event nodes:
- **Recommended**: `width: 200, height: 100`
- This creates a clean, compact layout that's easy to scan
- Keep all nodes the same size for visual consistency
- Use consistent spacing between nodes (e.g., 300px horizontal, 220px vertical gaps)

**Q: "What attributes should each event have?"**
A: Only the essential ones:
- **Start event**: Input size/count, config params
- **Complete event**: Output size/count, result summary, duration
- **Error event**: error.type, error.message

Don't add attributes "just in case" - add them when you need them.

**Q: "What is the sources field and why is it required?"**
A: The `pv.sources` field is **required for all OTEL nodes**. It tells the system which source files emit the events for this node:
- **Must be exact file paths** (relative to repository root)
- **No glob patterns allowed** (e.g., `src/**/*.ts` is invalid)
- **No line numbers allowed** (e.g., `src/file.ts:123` is invalid)
- Example: `"sources": ["src/commands/validate.ts"]`
- For features spanning multiple files, list all relevant files: `"sources": ["src/validator.ts", "src/validator-helpers.ts"]`
- Validation will fail if OTEL nodes don't have sources defined

**Q: "Do I instrument my production code or my tests?"**
A: **Instrument your actual source code**, then write tests that call it:
- Add OTEL emit calls to your feature's source code (src/index.ts, src/commands/*.ts, etc.)
- Tests call the instrumented code and capture the real telemetry
- This documents what your actual code does, not simulated behavior
- Tests use `strict: true` validation to ensure events match your canvas schema

**Q: "Where do execution files go?"**
A: Always `__executions__/` directory:
- Co-located with canvases: `.principal-views/__executions__/`
- Or in test directory: `test/__executions__/`
- **MUST be committed to git** (not gitignored)
- Visualization tools need these files tracked

## Success Criteria

After completing onboarding, user should have:

✅ **One working canvas** (.otel.canvas)
- 2-4 event schemas defined
- All OTEL nodes have required `pv.sources` field with exact file paths
- Validates with CLI
- Documents real feature

✅ **Scenarios for workflows** (.workflow.json)
- Success scenario
- Failure scenario
- Fallback scenario
- Validates with CLI

✅ **Test infrastructure** (otel-setup.ts)
- Tracer configured
- Helper functions
- Export to __executions__/

✅ **Instrumented source code** (feature implementation)
- Source code emits OTEL events as it executes
- Events validated against canvas schema in strict mode

✅ **Tests that capture telemetry** (2+ tests)
- Success case test
- Failure case test
- Both call instrumented code and capture real telemetry
- Both export execution data

✅ **Execution files** (__executions__/*.otel.json)
- Exported from test runs
- Committed to git
- Ready for visualization

## What NOT to Do

❌ **Don't over-engineer**:
- No need for dozens of events on first pass
- No need for complex nested attributes
- No need for exhaustive scenario coverage

❌ **Don't skip validation**:
- Always run `npx @principal-ai/principal-view-cli validate`
- Fix issues immediately
- Don't proceed with invalid files

❌ **Don't gitignore executions**:
- __executions__/ must be committed
- Canvas viewers need these files
- Remove from .gitignore if present

❌ **Don't emit fake events in tests**:
- Instrument your actual source code, not test files
- Tests should call instrumented code and capture real telemetry
- Simulated events in tests don't reflect actual behavior

## Example Session

```
User: "I want to get started with Principal View OTEL"

Claude: "Great! I'll guide you through onboarding one feature. Let me explore
your codebase to find good candidates for your first canvas."

[Uses Task tool with subagent_type=Explore to discover features]

Claude: "I've explored your codebase and found several good candidates for
onboarding. Here are the best options:

1. **Data Import Command** (src/commands/import.ts)
   - Reads and validates CSV files, complete workflow from file input to results
   - Good fit: CLI command with clear start/end boundaries

2. **User Authentication API** (src/api/auth.ts)
   - Handles login requests with validation and token generation
   - Good fit: API route with success/error paths

3. **PDF Generator Service** (src/services/pdf-generator.ts)
   - Converts documents to PDF with validation
   - Good fit: Complete operation with input/output transformation

Which would you like to start with?"

User: "Let's do the data import command"

Claude: [Reads file, analyzes function]

"I see your import command. It:
- Takes a CSV file path as input
- Parses the CSV
- Validates each row
- Returns import results or errors

This is encompassing functionality - a complete workflow! Let me create a canvas.
I'll define these events:
- import.started (input.file, expected.rows)
- import.parsing.complete (rows.parsed)
- import.validation.complete (rows.valid, rows.invalid)
- import.complete (rows.imported, duration.ms)
- import.error (error.type, error.message, stage)

Each node will include the required sources field pointing to src/commands/import.ts.
Sound good?"

User: "Yes, let's do it"

Claude: [Creates .otel.canvas, validates, shows file]

"✅ Canvas created and validated!

Next, let's add workflow scenarios. I'll create:
- Success: '✅ Parsed {{rows.count}} rows successfully'
- Error: '❌ CSV parsing failed: {{error.message}}'
- Fallback: '📋 Parsing execution captured'

[Creates .workflow.json, validates]

✅ Scenarios created!

Now let's instrument your import command source code. What test framework
are you using?"

User: "Bun"

Claude: [Sets up otel-setup.ts, instruments src/commands/import.ts]

"I've created test/otel-setup.ts for OTEL infrastructure, and I've
instrumented your src/commands/import.ts to emit events as it executes.

Now here's a test that calls your instrumented code and captures the telemetry:

[Shows test code that calls the instrumented import command]

Would you like me to create this test file, or would you prefer to
update your existing test?"

User: "Create new file"

Claude: [Creates test file]

"✅ Test created! Run it:
  bun test

This will:
1. Validate events match your canvas schema across the full import workflow
2. Export execution to __executions__/import-command.otel.json

After running, you can visualize the complete import operation execution
in Storybook or ADE!"
```

## Integration with Other Skills

This skill orchestrates the other three:
- **create-otel-canvas**: Phase 2 (create canvas)
- **create-workflow-scenarios**: Phase 3 (create scenarios)
- **setup-otel-testing**: Phases 4-5 (setup and instrument tests)

## Templates to Reference

Point users to these examples after onboarding:
- `.principal-views/graph-converter-execution.otel.canvas` - Simple converter example
- `.principal-views/forge-otel-events.otel.canvas` - Real-world feature example
- Test examples in the codebase with OTEL instrumentation

## Final Message

After successful onboarding:

```
🎉 Onboarding complete!

You now have:
✅ Canvas documenting your CSV parser telemetry
✅ Scenarios for success/failure workflows
✅ Instrumented source code emitting validated OTEL
✅ Tests that capture real telemetry from your code
✅ Execution data exported for visualization

Next steps:
1. View your executions in Storybook ExecutionViewerPanel
2. Add more scenarios as you find edge cases
3. Onboard another feature using the same workflow
4. Your instrumented code is ready for production use!

Resources:
- create-otel-canvas skill: Add more features
- create-workflow-scenarios skill: Add more scenarios
- setup-otel-testing skill: Instrument more tests
```

## References

- **create-otel-canvas**: Canvas creation details
- **create-workflow-scenarios**: Scenario creation details
- **setup-otel-testing**: Test instrumentation details
- **CLI schema command**: `npx @principal-ai/principal-view-cli schema` - Canvas format documentation
  - `schema nodes` - Node types and properties
  - `schema edges` - Edge properties
  - `schema vv` - Principal View extension fields (the `pv` field in canvas files)
  - `schema examples` - Complete example canvas files
- **CLI workflow commands**: `npx @principal-ai/principal-view-cli workflow` - Workflow tools
  - `workflow validate <file>` - Validate workflow template syntax and schema
  - `workflow render <workflow> <execution>` - Render workflow with execution data
  - `workflow test <workflow> <execution>` - Test scenario matching
  - `workflow list` - List all workflow files in project
- **CLI validation commands**:
  - `validate` - Validate all OTEL canvas files, workflow templates, and execution artifacts
  - `validate --canvas-only` - Validate only .otel.canvas files (skips regular .canvas files)
  - `validate --workflow-only` - Validate only .workflow.json files
  - `validate --execution-only` - Validate only .otel.json execution files
- **OpenTelemetry JavaScript Libraries**:
  - Main repository: https://github.com/open-telemetry/opentelemetry-js
  - API repository: https://github.com/open-telemetry/opentelemetry-js-api
  - Packages used: `@opentelemetry/api` (core tracing API) and `@opentelemetry/sdk-trace-base` (SDK for test infrastructure)
  - If you encounter issues with OTEL instrumentation, configuration, or API usage, refer to these repositories for documentation and troubleshooting
- **Example files**: See `.principal-views/*.otel.canvas` and `.principal-views/*.workflow.json` in the repository
- docs/guides/adding-opentelemetry-to-tests.md: OTEL patterns and test setup
