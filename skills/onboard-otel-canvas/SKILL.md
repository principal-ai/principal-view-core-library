---
name: onboard-otel-canvas
description: Guide users through onboarding existing functionality: create a canvas and workflow scenarios
---

# Onboard OTEL Canvas Skill

Guide users through documenting existing functionality with Principal View OTEL: create a canvas defining event schemas and workflow scenarios for human-readable rendering.

## Purpose

This skill provides a **focused onboarding experience** for users who want to document their features with OTEL canvases and workflows. It's designed for the first-time user who needs to understand the schema and rendering layer.

## What is Principal View OTEL?

Principal View OTEL is a system for documenting and rendering OpenTelemetry event schemas using a hierarchical structure:

### The Hierarchy

**Storyboard** (Feature Area) -> **Workflow** (Span/Use Case) -> **Scenario** (Execution Outcome)

**File Types:**
1. **`.otel.canvas`** - Defines event schemas (what events can be emitted and their attributes)
2. **`.workflow.json`** - Defines how to render span events as human-readable text (contains scenarios)

### Key Concepts

**Storyboard:** Organizational folder for a feature area (e.g., `checkout/`, `data-validation/`)
- Groups related workflows together
- Contains one canvas defining event schemas for the entire feature

**Workflow:** ONE span in your code - a specific use case or variation (e.g., `credit-card-payment/`, `csv-import/`)
- Create separate workflows for semantically different operations
- Each workflow = one span name in your instrumentation
- Don't create workflows for parameter variations (use scenarios instead)

**Scenario:** Conditional template based on execution outcome (e.g., success, failure, timeout)
- Multiple scenarios per workflow.json file
- Same span, different event combinations
- Matched based on which events/attributes appear

**See:** `docs/STORYBOARDS_WORKFLOWS_SCENARIOS_GUIDE.md` for detailed guidance on when to create workflows vs scenarios.

## When to Use This Skill

Use this skill when the user wants to:
- Get started with Principal View OTEL for the first time
- Document existing functionality with telemetry schemas
- Create their first canvas and workflow scenarios
- Understand the schema and rendering layer before instrumenting code

## What This Skill Does

This skill provides an **interactive, step-by-step workflow** to:
1. Pick one existing feature/function to document
2. Create a .otel.canvas file defining its event schemas
3. Create .workflow.json scenarios for success/failure cases

**Scope**: One feature, one canvas, basic scenarios. Keep it simple and achievable.

**Next step after this skill**: Use the `setup-otel-testing` skill to instrument your code and validate telemetry against your canvas.

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

3. **Ask about use case variations**: "Are there different variations of this operation?"

   **Determine if you need multiple workflows or one workflow with scenarios:**

   **Multiple workflows (different span names)** if:
   - Different events emitted (e.g., `card.authorized` vs `ach.verified`)
   - Different implementations/services (e.g., Stripe API vs bank API)
   - Semantically different operations (e.g., `oauth-signup` vs `standard-signup`)

   **One workflow with scenarios** if:
   - Same operation, different outcomes (success vs failure)
   - Same events, different attribute values
   - Parameter variations (priority: high/medium/low)

   **See:** `docs/STORYBOARDS_WORKFLOWS_SCENARIOS_GUIDE.md` for detailed decision tree

4. **Ask about execution outcomes**: "What are the success and failure cases?"
   - Success: Happy path execution
   - Failure: Common error scenarios (1-2 examples)
   - These become scenarios in workflow.json files

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
   # Example: .principal-views/data-validator/data-validator.otel.canvas
   ```

   **IMPORTANT: Storyboard Structure**
   All canvases must use the hierarchical storyboard structure:
   ```
   .principal-views/
     └── <storyboard-name>/
         ├── <storyboard-name>.otel.canvas
         └── <workflow-name>/
             └── <workflow-name>.workflow.json
   ```

   The flat structure (files directly in `.principal-views/`) is deprecated and will produce validation errors.

   **IMPORTANT: Canvas Structure**
   - **One node per event type** - Each event gets its own node in the canvas
   - Example: If you have 4 events (`validation.started`, `validation.complete`, `validation.error`, `validation.progress`), create 4 nodes
   - Each node contains ONE event schema in its `pv.event` field
   - Connect nodes with edges to show the event flow (start -> progress -> complete/error)

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
   - Edges: Connect `fromSide: "bottom"` -> `toSide: "top"` for vertical flow
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
   - Edges: Connect `fromSide: "right"` -> `toSide: "left"` for horizontal flow
   - Best for: Parallel processes, service architectures

   **REQUIRED NODE FIELDS:**

   Each node in an OTEL canvas requires:

   1. **`color`** - Hex color for the node (e.g., `"#4CAF50"`)

   2. **`pv.status`** - Implementation status: `"draft"`, `"approved"`, or `"implemented"`

   3. **`pv.event`** - Event schema as an **object** (NOT a string!):
      ```json
      "event": {
        "name": "validation.started",
        "attributes": {
          "input.recordCount": {
            "type": "integer",
            "description": "Number of records to validate",
            "required": true
          }
        }
      }
      ```

   4. **`pv.references`** - Source file paths (exact paths, no globs):
      - Good: `"references": ["src/commands/validate.ts"]`
      - Bad: `"references": ["src/**/*.ts"]` (glob pattern not supported)

   **REQUIRED CANVAS-LEVEL FIELDS:**

   The canvas `pv` extension requires:
   - `pv.name` - Feature name
   - `pv.version` - Schema version
   - `pv.markdown` - Path to documentation file (e.g., `".principal-views/feature.md"`)

   **REQUIRED EDGE FIELDS:**

   Each edge requires:
   - `pv.edgeType` - Must reference an edge type defined in `pv.edgeTypes`

   **DEPRECATED:** `pv.sources` - Use `pv.references` instead

   **Format reference**: Run `npx @principal-ai/principal-view-cli formats canvas` to see full format documentation, or look at existing `.otel.canvas` files in `.principal-views/` directory.

4. **Validate immediately**:
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

**Goal**: Working .otel.canvas file with event schemas that capture the shape of the code.

### Phase 3: Create Workflow Scenarios

Use the `create-workflow-scenarios` skill to create scenarios:

1. **Determine workflow structure** based on Phase 1 discovery:

   **If you have ONE use case/variation:**
   ```bash
   # Example: Simple data validator with one execution path
   .principal-views/data-validator/
   ├── data-validator.otel.canvas
   └── validate-data/                              # One workflow
       └── validate-data.workflow.json             # Scenarios: success, failure, timeout
   ```

   **If you have MULTIPLE use case variations:**
   ```bash
   # Example: Data import with different format types
   .principal-views/data-import/
   ├── data-import.otel.canvas
   ├── csv-import/                                 # Workflow variation 1
   │   └── csv-import.workflow.json                # Scenarios: success, parse-error
   ├── json-import/                                # Workflow variation 2
   │   └── json-import.workflow.json               # Scenarios: success, schema-error
   └── xml-import/                                 # Workflow variation 3
       └── xml-import.workflow.json                # Scenarios: success, dtd-error
   ```

   **Key principle:** Each workflow = ONE span name in your instrumentation

2. **Create workflow.json files** for each variation identified in Phase 1

   **Format reference**: See existing workflow files in `.principal-views/` for examples. Run `npx @principal-ai/principal-view-cli workflow validate <file>` to validate your workflow file

   **REQUIRED: spanPattern field**
   - Each workflow.json must include a `spanPattern` field with the exact span name (e.g., "data.validation", "csv.import")
   - This must match the span name used in your instrumentation code
   - Must be unique across all workflow files (CLI validation will detect duplicates)
   - Example: `"spanPattern": "data.validation"`

   **IMPORTANT: Naming and Description Guidelines**
   - **Don't** append "Workflows" to the name: `"Package Processor Workflows"`
   - **Do** use the feature name directly: `"Package Processor"`
   - **Don't** prefix description with framework boilerplate: `"Human-readable workflows for package extraction..."`
   - **Do** describe the feature's purpose: `"Package extraction and analysis from repository file trees"`
   - Focus on WHAT the feature does, not WHAT the file contains
   - Keep it concise and domain-focused

3. **Define scenarios within each workflow.json** (start with 2-3 per file):

   **Remember:** Scenarios are execution outcomes WITHIN the same workflow (same span)

   **NEW (v0.23.0+):** Scenarios are matched based on which events are present in the trace. Required events are automatically derived from `template.events` keys.

   - **Success scenario** (priority 1): Workflow completed successfully
     - Template: "[SUCCESS] Validated {{record.count}} records successfully"
     - Example events: `{ "validation.started": "...", "validation.complete": "..." }`

   - **Failure scenario** (priority 2): Workflow failed
     - Template: "[ERROR] Validation failed: {{error.message}}"
     - Example events: `{ "validation.started": "...", "validation.error": "..." }`
     - Note: Mutually exclusive with success due to different distinguishing events (validation.complete vs validation.error)

   **Important:** Scenarios must be mutually exclusive. Each scenario should have at least one unique event that distinguishes it from others. No scenario's events can be a strict subset of another's.

5. **Keep templates simple**:
   - Clear summary line
   - 3-5 steps showing flow
   - Key details (IDs, counts, errors)

6. **Validate**:
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

**Goal**: Working .workflow.json with success, failure, and fallback scenarios.

### Phase 4: Verify and Next Steps

Walk through verification and explain next steps:

1. **Canvas validates**:
   ```bash
   npx @principal-ai/principal-view-cli validate
   ```

2. **Workflow validates**:
   ```bash
   npx @principal-ai/principal-view-cli validate
   # Both canvas and workflow files are validated
   ```

3. **Explain what they have**:
   ```
   You now have:
   - A canvas defining what events your feature should emit
   - Workflow scenarios defining how to render those events as readable text

   These serve as the "contract" for your feature's telemetry.
   ```

4. **Show next steps**:
   ```
   Next: Instrument your code and tests

   Use the `setup-otel-testing` skill to:
   - Set up OTEL test infrastructure
   - Configure a local OTEL collector
   - Instrument your source code to emit events
   - Validate emitted events against your canvas schemas
   ```

**Goal**: User understands their canvas and workflow files and is ready for instrumentation.

## Guidelines for Success

### Capture the Shape of the Code
- **One feature**: Don't try to document everything
- **Match the code structure**: Events should reflect the actual flow and decision points in the code
- **One node per event**: Each event type gets its own canvas node
- **Scenarios reflect outcomes**: Each distinct execution path becomes a scenario

### Make It Real
- Use actual code from their project as reference
- Real inputs/outputs they actually use
- Actual error cases they encounter
- Event schemas that reflect real behavior

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
- **Processing pipelines** - Full data flow: CSV input -> parsing -> validation -> output

I avoid recommending:
- Individual helper functions (too granular - these are steps WITHIN a canvas)
- Multi-service workflows (too complex for first canvas)
- New unimplemented features (don't know telemetry yet)
- Core infrastructure (too broad)
- Partial operations without clear completion (where does it end?)

After exploring, I present you with 3-5 curated options to choose from.

**Q: "How many events should I define?"**
A: Let the code guide you - events should capture the **shape of the code**:
- Events mark key decision points and state transitions in the actual implementation
- If the code has branching logic, those branches likely need distinct events
- If the code has phases or stages, those are natural event boundaries
- Don't invent events that don't map to real code paths
- Don't artificially limit yourself - if the code has 7 distinct stages, create 7 events

**Q: "How do I match workflows to spans?"**
A: Use the `spanPattern` field in your workflow.json:
- Set `spanPattern` to the exact span name used in your instrumentation
- Example: If your code does `tracer.startSpan('data.validation')`, use `"spanPattern": "data.validation"`
- Each workflow file must have a unique spanPattern
- CLI validation will detect duplicate spanPatterns across workflows

**Q: "How should I structure the canvas nodes?"**
A: **One node per event type**. Each event gets its own node in the canvas:
- If you have 3 events (`started`, `complete`, `error`), create 3 nodes
- Each node has ONE event schema defined in its `pv.event` field
- Connect nodes with edges to show the flow (started -> complete/error)
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

**Q: "What is the references field?"**
A: The `pv.references` field documents which source files emit events for this node:
- **Must be exact file paths** (relative to repository root)
- **No glob patterns allowed** (e.g., `src/**/*.ts` is invalid)
- **No line numbers allowed** (e.g., `src/file.ts:123` is invalid)
- Example: `"references": ["src/commands/validate.ts"]`
- For features spanning multiple files, list all relevant files: `"references": ["src/validator.ts", "src/validator-helpers.ts"]`

**Note:** `pv.sources` is deprecated - use `pv.references` instead.

**Q: "How do I actually emit these events from my code?"**
A: That's covered in the `setup-otel-testing` skill. This skill focuses on defining *what* events should be emitted. The testing skill covers *how* to instrument your code to emit them and validate against your canvas.

## Success Criteria

After completing onboarding, user should have:

**One working canvas** (.otel.canvas)
- Event schemas that capture the shape of the code (as many as needed)
- All nodes have required fields: `color`, `pv.status`, `pv.event` (object format)
- Canvas has required `pv.markdown` field
- Edges have `pv.edgeType` referencing defined edge types
- Validates with CLI
- Documents real feature

**Scenarios for workflows** (.workflow.json)
- Required `spanPattern` field matching the span name they'll use
- Success scenario
- Failure scenario
- Mutually exclusive scenarios (no subsets)
- Validates with CLI

**Understanding of next steps**
- User knows they need to instrument their code to emit these events
- User knows to use `setup-otel-testing` skill for instrumentation

## What NOT to Do

**Don't over-engineer**:
- No need for dozens of events on first pass
- No need for complex nested attributes
- No need for exhaustive scenario coverage

**Don't skip validation**:
- Always run `npx @principal-ai/principal-view-cli validate`
- Fix issues immediately
- Don't proceed with invalid files

**Don't design events in isolation**:
- Look at the actual code to understand what data is available
- Event schemas should reflect real behavior
- Think about what information would be useful for debugging

## Example Session

```
User: "I want to get started with Principal View OTEL"

Claude: "Great! I'll guide you through documenting one feature with a canvas
and workflow scenarios. Let me explore your codebase to find good candidates."

[Uses Task tool with subagent_type=Explore to discover features]

Claude: "I've explored your codebase and found several good candidates.
Here are the best options:

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

Each node will have the required fields:
- color (hex color for visual display)
- pv.status: 'draft' (since this is new)
- pv.event: object with name and attributes
- pv.references pointing to src/commands/import.ts

Sound good?"

User: "Yes, let's do it"

Claude: [Creates .otel.canvas, validates, shows file]

"Canvas created and validated!

Next, let's add workflow scenarios. I'll create a workflow.json with:
- spanPattern: "data.import"
- Success scenario: Events [import.started, import.complete] -> '[SUCCESS] Imported {{rows.count}} rows'
- Error scenario: Events [import.started, import.error] -> '[ERROR] Import failed: {{error.message}}'

These scenarios are mutually exclusive because they have different distinguishing events.

[Creates .workflow.json, validates]

Scenarios created and validated!

You now have:
- A canvas defining what events your import command should emit
- Workflow scenarios defining how to render those events as readable text

These serve as the 'contract' for your feature's telemetry.

**Next step**: Use the `setup-otel-testing` skill to:
- Set up OTEL test infrastructure
- Instrument your source code to emit these events
- Validate emitted events against your canvas schemas"
```

## Integration with Other Skills

This skill orchestrates:
- **create-otel-canvas**: Phase 2 (create canvas)
- **create-workflow-scenarios**: Phase 3 (create scenarios)

**Follow-up skill**:
- **setup-otel-testing**: After completing this skill, users should use setup-otel-testing to instrument their code and validate telemetry

## Templates to Reference

Point users to these examples after onboarding:
- `.principal-views/validation/validation.otel.canvas` - Real storyboard structure example
- `.principal-views/validation/validation-workflow/` - Example workflow folder

**Note:** Legacy flat structure examples may exist but are deprecated.

## Final Message

After successful onboarding:

```
Onboarding complete!

You now have:
- Canvas documenting your feature's telemetry schema
- Workflow scenarios for success/failure rendering

These files define the "contract" for your feature's telemetry:
- What events should be emitted
- What attributes each event should have
- How to render events as human-readable workflows

Next step:
Use the `setup-otel-testing` skill to instrument your code and
validate that it emits the events defined in your canvas.

Resources:
- create-otel-canvas skill: Add canvases for more features
- create-workflow-scenarios skill: Add more scenarios to existing workflows
- setup-otel-testing skill: Instrument code and set up telemetry validation
```

## References

- **create-otel-canvas**: Canvas creation details
- **create-workflow-scenarios**: Scenario creation details
- **setup-otel-testing**: Test instrumentation details (use after this skill)
- **CLI schema command**: `npx @principal-ai/principal-view-cli schema` - Canvas format documentation
  - `schema nodes` - Node types and properties
  - `schema edges` - Edge properties
  - `schema pv` - Principal View extension fields (the `pv` field in canvas files)
  - `schema examples` - Complete example canvas files
- **CLI workflow commands**: `npx @principal-ai/principal-view-cli workflow` - Workflow tools
  - `workflow validate <file>` - Validate workflow template syntax and schema
  - `workflow list` - List all workflow files in project
- **CLI validation commands**:
  - `validate` - Validate all OTEL canvas files and workflow templates
  - `validate --canvas-only` - Validate only .otel.canvas files (skips regular .canvas files)
  - `validate --workflow-only` - Validate only .workflow.json files
- **Example files**: See `.principal-views/validation/` storyboard structure in the repository for the correct organization pattern
