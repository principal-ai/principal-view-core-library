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
2. **`.narrative.json`** - Defines how to render execution traces as human-readable narratives
3. **`.otel.json`** - Actual execution data captured from instrumented tests (stored in `__executions__/`)

These files work together: the canvas defines the schema, narratives define how to present executions, and execution files contain actual telemetry data that gets validated against the canvas and rendered using narratives.

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
3. Create .narrative.json scenarios for success/failure cases
4. Instrument tests to emit OTEL and validate against the canvas
5. Export test execution data for visualization

**Scope**: One feature, one canvas, basic scenarios, working tests. Keep it simple and achievable.

## Interactive Workflow

### Phase 1: Choose What to Onboard

**Ask the user:**

1. **"What existing feature or function would you like to start with?"**
   - Look for something small and well-understood
   - **A canvas should capture encompassing, complete functionality** - a full unit of work from start to finish
   - Good examples:
     - **API route** - the full request/response cycle for an endpoint
     - **CLI command/tool call** - from invocation to completion
     - **Complete business operation** - like "validate and transform data"
     - **Data processing pipeline** - input through output
   - Avoid:
     - Individual helper functions or utilities
     - Complex multi-service flows (too complex)
     - New unimplemented features (don't know telemetry yet)
     - Fragmented operations without clear boundaries

2. **"Can you point me to the code for this feature?"**
   - Get the file path(s) to read the implementation
   - Understand inputs, outputs, and what it does

3. **"What are the success and failure cases for this feature?"**
   - Success: Happy path execution
   - Failure: Common error scenarios (1-2 examples)

**Goal**: Identify a single, concrete feature to document.

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

3. **Create the canvas file**:
   ```bash
   # Example: .principal-views/data-validator.otel.canvas
   ```

   **Format reference**: Canvas files use JSON Canvas format with `pv` (Principal View) extensions. The canvas defines nodes (your feature components) with their OTEL event schemas in the `pv.events` field. Run `npx @principal-ai/principal-view-cli schema examples` to see example canvas files, or look at existing `.otel.canvas` files in `.principal-views/` directory.

4. **Validate immediately**:
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

**Goal**: Working .otel.canvas file with 2-4 event schemas (start, complete, error).

### Phase 3: Create Narrative Scenarios

Use the `create-narrative-scenarios` skill to create scenarios:

1. **Create .narrative.json file** co-located with canvas:
   ```bash
   # Example: .principal-views/data-validator.narrative.json
   ```

   **Format reference**: See existing narrative files in `.principal-views/` for examples. Run `npx @principal-ai/principal-view-cli narrative validate <file>` to validate your narrative file

   **IMPORTANT: Naming and Description Guidelines**
   - ❌ **Don't** append "Narratives" to the name: `"Package Processor Narratives"`
   - ✅ **Do** use the feature name directly: `"Package Processor"`
   - ❌ **Don't** prefix description with framework boilerplate: `"Human-readable narratives for package extraction..."`
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

**Goal**: Working .narrative.json with success, failure, and fallback scenarios.

### Phase 4: Set Up Test Infrastructure

Use the `setup-otel-testing` skill to set up OTEL in tests:

1. **Check test framework**:
   - Ask: "What test framework are you using? (Bun, Vitest, Jest)"

2. **Install OTEL dependencies** (if needed):
   ```bash
   bun add -d @opentelemetry/api @opentelemetry/sdk-trace-base
   ```

3. **Create `test/otel-setup.ts`** (or similar):
   - Set up tracer with InMemorySpanExporter
   - Create helper functions: `startTestSpan()`, `createValidatedSpanEmitter()`
   - Add afterAll hook to export spans to `__executions__/*.otel.json`

4. **IMPORTANT: Ensure `__executions__/` is NOT gitignored**:
   - Check .gitignore - remove `__executions__` if present
   - Execution files must be committed for visualization

**Goal**: Working OTEL test infrastructure ready to use.

### Phase 5: Instrument One Test

Instrument a test for the chosen feature:

1. **Find or create a test file** for the feature

2. **Add OTEL instrumentation**:
   ```typescript
   import { test, expect } from 'bun:test';
   import { startTestSpan, createValidatedSpanEmitter } from './otel-setup';
   import canvas from '../.principal-views/data-validator.otel.canvas';

   test('data validator emits correct telemetry', async () => {
     const span = startTestSpan('test: data validator');
     const emit = createValidatedSpanEmitter(canvas, 'data-validator', span);

     // Emit start event
     emit('validation.started', {
       'input.recordCount': 100,
     });

     // Run the feature
     const result = await validateData(testData);

     // Emit completion event
     emit('validation.complete', {
       'result.validCount': result.valid,
       'result.invalidCount': result.invalid,
       'duration.ms': result.duration,
     });

     span.end();

     expect(result.valid).toBeGreaterThan(0);
   });
   ```

3. **Run the test**:
   ```bash
   bun test
   ```

4. **Verify validation** - Test should pass and validate events match schema

5. **Check exported file**:
   ```bash
   ls __executions__/
   # Should see: data-validator.otel.json (or test-run.otel.json)
   ```

   **Format reference**: Execution files are OpenTelemetry span data in JSON format. Run `npx @principal-ai/principal-view-cli validate-execution __executions__/*.otel.json` to validate execution files

**Goal**: One passing test that emits validated OTEL events and exports execution data.

### Phase 6: Add Failure Test

Add a test for the failure scenario:

1. **Create test for error case**:
   ```typescript
   test('data validator emits error telemetry', async () => {
     const span = startTestSpan('test: data validator error');
     const emit = createValidatedSpanEmitter(canvas, 'data-validator', span);

     emit('validation.started', {
       'input.recordCount': 10,
     });

     try {
       await validateData(invalidTestData);
     } catch (error) {
       // Emit error event
       emit('validation.error', {
         'error.type': error.name,
         'error.message': error.message,
       });
     }

     span.end();
   });
   ```

2. **Run both tests**:
   ```bash
   bun test
   ```

3. **Verify both scenarios export**:
   - Success execution → success narrative
   - Failure execution → failure narrative

**Goal**: Two tests covering success and failure scenarios.

### Phase 7: Verify the Complete Workflow

Walk through the end-to-end flow:

1. **Canvas exists and validates**: ✅
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

2. **Scenarios exist and validate**: ✅
   ```bash
   # Check .narrative.json file validates
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
   - See narrative rendering of test executions

   Option 2: In ADE
   - Open canvas in ADE
   - View executions tab
   - Click execution files to see narratives
   ```

**Goal**: User has complete, working example they can build on.

## Guidelines for Success

### Keep It Minimal
- **One feature**: Don't try to document everything
- **Basic events**: Start event, end event, error event (2-4 total)
- **Simple scenarios**: Success, failure, fallback
- **Two tests**: Happy path + error case

### Make It Real
- Use actual code from their project
- Real inputs/outputs, not fake examples
- Actual error cases they encounter
- Test data that makes sense

### Be Interactive
- Ask questions to understand their code
- Show examples from their codebase
- Get confirmation before creating files
- Explain WHY, not just WHAT

### Validate Early
- Run CLI validation after each file
- Fix issues immediately
- Don't move forward with broken files

## Common Questions to Answer

**Q: "What should I pick for my first canvas?"**
A: Something you understand well, that's small and self-contained. **A canvas should represent encompassing, complete functionality** - a cohesive unit of work with clear start and end boundaries.

Good examples:
- **API route** - Full request handling: `POST /api/users` from request validation through response
- **CLI command** - Complete tool execution: `validate --input data.json` from args parsing to exit
- **Complete operation** - End-to-end workflow: "validate and transform data", not just "validate" alone
- **Processing pipeline** - Full data flow: CSV input → parsing → validation → output

Avoid:
- Individual helper functions (too granular - these are steps WITHIN a canvas)
- Multi-service workflows (too complex for first canvas)
- New unimplemented features (don't know telemetry yet)
- Core infrastructure (too broad)
- Partial operations without clear completion (where does it end?)

**Q: "How many events should I define?"**
A: Start with 2-4:
- 1 start event (feature.started)
- 1 completion event (feature.complete)
- 1 error event (feature.error)
- Optional: 1 progress event if feature has clear steps

**Q: "What attributes should each event have?"**
A: Only the essential ones:
- **Start event**: Input size/count, config params
- **Complete event**: Output size/count, result summary, duration
- **Error event**: error.type, error.message

Don't add attributes "just in case" - add them when you need them.

**Q: "Do I need to instrument my production code?"**
A: Not yet! Start with tests:
- Tests use `strict: true` validation (catches issues early)
- Production can use `strict: false` (permissive, won't break)
- Onboarding focuses on test instrumentation

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
- Validates with CLI
- Documents real feature

✅ **Scenarios for narratives** (.narrative.json)
- Success scenario
- Failure scenario
- Fallback scenario
- Validates with CLI

✅ **Test infrastructure** (otel-setup.ts)
- Tracer configured
- Helper functions
- Export to __executions__/

✅ **Instrumented tests** (2+ tests)
- Success case test
- Failure case test
- Both emit validated OTEL
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

❌ **Don't instrument production first**:
- Start with tests
- Tests have strict validation
- Production can come later

## Example Session

```
User: "I want to get started with Principal View OTEL"

Claude: "Great! I'll guide you through onboarding one feature. Let's start simple.

What existing feature or function would you like to document first?
Remember, a canvas should capture complete, encompassing functionality - like
an API route, CLI command, or end-to-end operation with clear boundaries."

User: "I have a data import CLI command that reads and validates CSV files"

Claude: "Perfect! That's a great fit - it's a complete operation from command
invocation to completion. Can you point me to the code for this command?"

User: "It's in src/commands/import.ts"

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

Sound good?"

User: "Yes, let's do it"

Claude: [Creates .otel.canvas, validates, shows file]

"✅ Canvas created and validated!

Next, let's add narrative scenarios. I'll create:
- Success: '✅ Parsed {{rows.count}} rows successfully'
- Error: '❌ CSV parsing failed: {{error.message}}'
- Fallback: '📋 Parsing execution captured'

[Creates .narrative.json, validates]

✅ Scenarios created!

Now let's instrument a test. What test framework are you using?"

User: "Bun"

Claude: [Sets up otel-setup.ts, shows test example]

"I've created test/otel-setup.ts with helpers. Here's how to instrument
your import command test to capture the full workflow:

[Shows instrumented test code]

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
- **create-narrative-scenarios**: Phase 3 (create scenarios)
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
✅ Scenarios for success/failure narratives
✅ Instrumented tests emitting validated OTEL
✅ Execution data exported for visualization

Next steps:
1. View your executions in Storybook ExecutionViewerPanel
2. Add more scenarios as you find edge cases
3. Onboard another feature using the same workflow
4. Eventually add OTEL to production code (tests first proved it works!)

Resources:
- create-otel-canvas skill: Add more features
- create-narrative-scenarios skill: Add more scenarios
- setup-otel-testing skill: Instrument more tests
```

## References

- **create-otel-canvas**: Canvas creation details
- **create-narrative-scenarios**: Scenario creation details
- **setup-otel-testing**: Test instrumentation details
- **CLI schema command**: `npx @principal-ai/principal-view-cli schema` - Canvas format documentation
  - `schema nodes` - Node types and properties
  - `schema edges` - Edge properties
  - `schema vv` - Principal View extension fields (the `pv` field in canvas files)
  - `schema examples` - Complete example canvas files
- **CLI narrative commands**: `npx @principal-ai/principal-view-cli narrative` - Narrative tools
  - `narrative validate <file>` - Validate narrative template syntax and schema
  - `narrative render <narrative> <execution>` - Render narrative with execution data
  - `narrative test <narrative> <execution>` - Test scenario matching
  - `narrative list` - List all narrative files in project
- **CLI validation commands**:
  - `validate` - Validate .canvas configuration files
  - `validate-execution` - Validate .otel.json execution files
- **Example files**: See `.principal-views/*.otel.canvas` and `.principal-views/*.narrative.json` in the repository
- docs/guides/adding-opentelemetry-to-tests.md: OTEL patterns and test setup
