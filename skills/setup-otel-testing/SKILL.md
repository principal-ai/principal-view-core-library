# Setup OTEL Testing Skill

Guide users through setting up OpenTelemetry instrumentation in their tests and validating that test output matches their .otel.canvas schemas.

## When to Use This Skill

Use this skill when the user wants to:
- Instrument their tests to emit OTEL spans and events
- Validate test output against .otel.canvas event schemas
- Set up OTEL test infrastructure from scratch
- Troubleshoot OTEL test instrumentation issues
- Export test execution data for visualization in Storybook

## What This Skill Does

This skill provides an **interactive, step-by-step workflow** to:
1. Assess the user's current setup and needs
2. Create/update .otel.canvas files with event schemas (if needed)
3. Set up OTEL test infrastructure (tracer, helpers, exporters)
4. Instrument tests to emit spans and events
5. Validate that emitted events match canvas schemas
6. Export test data to workflow folders in storyboard structure (`.principal-views/<storyboard>/<workflow>/*.otel.json`)
7. Troubleshoot common issues

## Interactive Workflow

### Phase 1: Discovery

**Ask the user these questions to understand their needs:**

1. **Do you have an existing .otel.canvas file?**
   - Yes → Ask for the path, read it, analyze event schemas
   - No → Offer to create one using the "create-otel-canvas" skill first

2. **What are you trying to test?**
   - A specific feature/component → Identify the component
   - An execution flow → Identify the flow steps
   - Integration between services → Identify the services

3. **What test framework are you using?**
   - Bun (bun:test)
   - Vitest
   - Jest
   - Other

4. **Do you already have OTEL dependencies installed?**
   - Check for @opentelemetry/api, @opentelemetry/sdk-trace-base
   - If missing, offer to install them

### Phase 2: Canvas Review (if exists)

If the user has a canvas file:

1. **Read and analyze the canvas**
   - Extract all event schemas from nodes
   - Identify which nodes have events defined
   - List the expected events and their required attributes

2. **Show the user what needs to be instrumented**
   ```
   Found event schemas in your canvas:

   Node: graph-converter
   Events to emit:
   - conversion.started
     Required: config.nodeTypes (number), config.edgeTypes (number)
   - conversion.complete
     Required: result.nodes.count (number), result.edges.count (number)
     Optional: duration.ms (number)

   Node: validation-engine
   Events to emit:
   - validation.started
     Required: rules.count (number)
   - validation.complete
     Required: violations.count (number)
   ```

3. **Ask: "Would you like me to set up test instrumentation for these events?"**

### Phase 3: Setup Test Infrastructure

Create or update the test setup file with OTEL infrastructure:

1. **Create `test/otel-setup.ts`** (or similar based on their structure)
   - Import OTEL dependencies
   - Create BasicTracerProvider with InMemorySpanExporter
   - Export tracer instance
   - Create helper functions: `traced()`, `withSpan()`, `startTestSpan()`
   - Create validated emitter: `createValidatedSpanEmitter()`
   - Set up afterAll hook to export spans to JSON

2. **Show the user the created file**

3. **Explain the helpers:**
   ```
   - traced(name, fn): Wrap entire test in a span
   - withSpan(name, fn, parent?): Create child span for operations
   - startTestSpan(name): Start a test span manually
   - createValidatedSpanEmitter(canvas, nodeId, span): Create validator
   ```

### Phase 3.5: Dependency Injection for Entry Point Testing

**CRITICAL: When testing at the entry point level (IPC handlers, API endpoints, service facades), you MUST have proper dependency injection enabled.**

1. **Identify the Testing Level:**
   - **Service-level**: Testing individual services (e.g., `PackageProcessor`, `FileTreeBuilder`)
     - Easier to mock - just mock external dependencies (fs, network)
   - **Entry point-level**: Testing IPC handlers, API controllers, facades
     - Harder to mock - calls multiple internal services

2. **For Entry Point Testing, Check DI Support:**
   ```typescript
   // ❌ BAD - hardcoded dependencies, can't mock
   class RepositoryMonitoringServer {
     constructor() {
       this.fileTreeBuilder = new FileTreeBuilder();
       this.cacheRegistry = new CacheRegistry();
     }
   }

   // ✅ GOOD - accepts dependencies, supports DI
   class RepositoryMonitoringServer {
     constructor(
       fileTreeBuilder?: FileTreeBuilder,
       packageProcessor?: PackageProcessor,
       cacheRegistry?: CacheRegistry
     ) {
       this.fileTreeBuilder = fileTreeBuilder ?? new FileTreeBuilder();
       this.packageProcessor = packageProcessor ?? new PackageProcessor();
       this.cacheRegistry = cacheRegistry ?? new CacheRegistry();
     }
   }
   ```

3. **If DI is Missing, Two Options:**
   - **Option A (Recommended)**: Add DI support to the service
     - Refactor constructor to accept optional dependencies
     - Enables proper unit testing
     - Follows SOLID principles
   - **Option B**: Use integration-style tests
     - Accept that tests will hit real implementations
     - Use actual filesystem, temporary directories
     - Slower but still valuable

4. **Mocking All Dependencies:**
   ```typescript
   // Example: Testing GET_FILE_TREE entry point
   const mockFileTreeBuilder = {
     buildFileTree: jest.fn().mockResolvedValue(mockTree)
   };

   const mockCacheRegistry = {
     getOrBuild: jest.fn().mockImplementation(async (path, slice, builder) => {
       const data = await builder();
       return { data, version: 1, timestamp: Date.now() };
     }),
     on: jest.fn(),
     getSnapshot: jest.fn()
   };

   const server = new RepositoryMonitoringServer(
     mockFileTreeBuilder,
     undefined, // other deps
     mockCacheRegistry
   );
   ```

5. **Why This Matters:**
   - Entry points orchestrate multiple services
   - Without DI: tests hit real filesystem, network, databases
   - With DI: tests are fast, isolated, deterministic
   - Enables proper OTEL instrumentation testing

**Ask the user:**
- "Are you testing at the service level or entry point level?"
- "Does your service support dependency injection?"
- "Would you like help adding DI support?"

### Phase 4: Instrument Tests

Guide the user through instrumenting their tests:

1. **Show example test instrumentation**
   - Import the helpers from otel-setup
   - Load the canvas file
   - Create validated emitter for the node
   - Emit events at appropriate points

2. **For each node with events in the canvas, generate example test code:**
   ```typescript
   import { test, expect } from 'bun:test';
   import { startTestSpan, createValidatedSpanEmitter } from './otel-setup';
   import canvas from '../.principal-views/my-feature/my-feature.otel.canvas';

   test('graph converter emits correct telemetry', async () => {
     const span = startTestSpan('test: graph converter telemetry');
     const emit = createValidatedSpanEmitter(canvas, 'graph-converter', span);

     const converter = new GraphConverter();

     // Emit validated event
     emit('conversion.started', {
       'config.nodeTypes': 2,
       'config.edgeTypes': 1,
     });

     const result = await converter.convert(config);

     emit('conversion.complete', {
       'result.nodes.count': result.nodes.length,
       'result.edges.count': result.edges.length,
       'duration.ms': Date.now() - start,
     });

     span.end();

     expect(result.nodes).toHaveLength(2);
   });
   ```

3. **Ask: "Would you like me to create instrumented test files for your components?"**

### Phase 5: Validation

Set up validation to ensure tests emit correct events:

1. **Add validation assertions to tests:**
   ```typescript
   // After test execution, validate events were emitted
   const events = span.events;
   expect(events).toContainEqual(
     expect.objectContaining({
       name: 'conversion.started',
       attributes: expect.objectContaining({
         'config.nodeTypes': 2,
         'config.edgeTypes': 1,
       }),
     })
   );
   ```

2. **Show how to run validation:**
   ```bash
   # Run tests with validation
   bun test

   # Validation errors will be thrown if:
   # - Required attributes are missing
   # - Attribute types are wrong
   # - Unknown events are emitted
   ```

### Phase 6: Export Configuration

Set up export to workflow folders in storyboard structure:

1. **Add afterAll hook to otel-setup.ts:**
   ```typescript
   afterAll(() => {
     const spans = memoryExporter.getFinishedSpans();
     // Export to workflow folder within storyboard structure
     const outputPath = join(__dirname, '../.principal-views/my-feature/test-execution/test-run.otel.json');

     mkdirSync(dirname(outputPath), { recursive: true });

     writeFileSync(
       outputPath,
       JSON.stringify({
         exportedAt: new Date().toISOString(),
         serviceName: SERVICE_NAME,
         spanCount: spans.length,
         spans: spans.map(span => ({
           traceId: span.spanContext().traceId,
           spanId: span.spanContext().spanId,
           parentSpanId: span.parentSpanId,
           name: span.name,
           kind: span.kind,
           startTime: span.startTime,
           endTime: span.endTime,
           attributes: span.attributes,
           events: span.events,
           status: span.status,
         })),
       }, null, 2)
     );

     console.log(`Exported ${spans.length} spans to ${outputPath}`);
   });
   ```

   **Structure:**
   ```
   .principal-views/
     └── my-feature/              ← Storyboard folder
         ├── my-feature.otel.canvas
         └── test-execution/       ← Workflow folder for test outputs
             └── test-run.otel.json ← Execution file
   ```

2. **IMPORTANT: Execution files must be git-tracked**
   - Canvas viewers need to find these files in the repository
   - The execution artifacts must be committed for visualization
   - Ensure `.principal-views/` is tracked in git (not gitignored)
   - **DEPRECATED:** The `__executions__/` directory structure is no longer used

3. **Show how to use exported data:**
   ```typescript
   // In Storybook stories
   import testSpans from '../.principal-views/my-feature/test-execution/test-run.otel.json';

   export const RealTestExecution: Story = {
     args: {
       canvas: myCanvas,
       spans: testSpans.spans,
     },
   };
   ```

### Phase 7: Verify Collector Setup

Before running tests that send traces to a collector, verify the collector is running:

1. **Check collector status:**
   ```bash
   principal-ai collector status
   ```
   Output:
   ```
   OTEL Collector Status
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

     Endpoint:        http://localhost:4318
     Status:          ✓ healthy
     Traces received: 142
     Logs received:   38

     Services (2 active):
       ✓ my-service          last seen 30s ago    (52 traces)
       ✓ auth-service        last seen 2m ago     (90 traces)

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Collector is ready to receive traces.
   ```

2. **Test end-to-end connectivity:**
   ```bash
   principal-ai collector check
   ```
   This sends a test trace and verifies it was received.

3. **Run comprehensive diagnostics:**
   ```bash
   principal-ai collector diagnose
   ```
   Checks all ports, endpoints, and recent activity.

4. **Use JSON output for scripts/CI:**
   ```bash
   principal-ai collector status --json
   principal-ai collector check --json
   ```

**Ask the user:**
- "Is the collector running? Let's verify with `principal-ai collector status`"
- "Are traces being received? Run `principal-ai collector check` to send a test trace"

### Phase 8: Troubleshooting

Offer to help with common issues:

1. **Collector not receiving traces?**
   - Run `principal-ai collector status` to check health
   - Run `principal-ai collector check` to test connectivity
   - Run `principal-ai collector diagnose` for detailed diagnostics
   - Common issues: collector not running, wrong port, auth required

2. **No spans exported?**
   - Check that afterAll hook runs
   - Verify spans are being created (console.log)
   - Ensure export path is correct

2. **Validation errors?**
   - Show the schema from canvas
   - Show what was emitted
   - Highlight the mismatch

3. **Context propagation issues (Bun)?**
   - Explain Bun's async_hooks limitations
   - Show how to pass parent span explicitly
   - Provide workaround examples

4. **Events not appearing in visualization?**
   - Check event names match canvas
   - Verify JSON export format
   - Confirm Storybook is loading the file

## Best Practices to Teach

1. **Canvas-First Development:**
   - Create .otel.canvas file BEFORE implementing
   - Define event schemas upfront
   - Use canvas as contract between architecture and code

2. **Strict Mode in Tests:**
   - Always use `strict: true` for validation in tests
   - Use `strict: false` (permissive) in production code
   - Tests catch schema violations early

3. **Event Naming:**
   - Use `phase.action` pattern (conversion.started, validation.complete)
   - Use dot notation for attributes (config.nodeTypes, result.nodes.count)

4. **Required vs Optional:**
   - Mark essential data as `required: true`
   - Mark timing/debug data as `required: false`

5. **Export Organization:**
   - Use workflow folders within storyboard structure for execution artifacts
   - Structure: `.principal-views/<storyboard>/<workflow>/<execution>.otel.json`
   - Create a dedicated workflow folder for test outputs (e.g., `test-execution/`)
   - **DO NOT gitignore** - canvas viewers need these files tracked in git
   - Files should be committed so visualization works for all team members
   - **DEPRECATED:** The `__executions__/` directory is no longer used

## Templates to Use

Provide these templates based on user's framework:

### Bun Test Setup
Location: `templates/bun-otel-setup.ts`

### Vitest Test Setup
Location: `templates/vitest-otel-setup.ts`

### Jest Test Setup
Location: `templates/jest-otel-setup.ts`

### Example Instrumented Test
Location: `templates/example-test.ts`

### Export Configuration
Location: `templates/export-config.ts`

## Integration with Other Skills

- **create-otel-canvas**: Use first to create canvas if user doesn't have one
- **code-review**: Can review generated test instrumentation

## Success Criteria

User should be able to:
- ✅ Verify collector is running with `principal-ai collector status`
- ✅ Test collector connectivity with `principal-ai collector check`
- ✅ Run tests that emit OTEL spans and events
- ✅ See validation errors when events don't match schema
- ✅ Export test execution data to workflow folders in storyboard structure
- ✅ Load exported data in Storybook for visualization
- ✅ Understand the canvas → test → visualization workflow

## Example Session Flow

```
User: "I need to setup OTEL testing for my feature"

Claude: "I'd be happy to help! Let me ask a few questions to understand your setup:

1. Do you have an .otel.canvas file for this feature?
2. What test framework are you using (Bun, Vitest, Jest)?
3. What component or flow are you testing?"

User: "I have a canvas at .principal-views/data-pipeline/data-pipeline.otel.canvas, using Bun"

Claude: [Reads canvas, analyzes event schemas]

"Great! I found your canvas. It defines these event schemas:

Node: data-processor
- processing.started (requires: input.size)
- processing.complete (requires: output.size, duration.ms)

Let me set up OTEL testing for you. I'll:
1. Create test/otel-setup.ts with helpers
2. Generate example test instrumentation
3. Configure export to workflow folders in storyboard structure

[Creates files and shows examples]

Would you like me to instrument your existing tests or create new test files?"

User: "Instrument existing tests"

Claude: [Shows specific changes to make to existing test files]

"I've shown the changes needed. After making these changes, run:
  bun test

The tests will validate events against your canvas and export to:
  .principal-views/data-pipeline/test-execution/test-run.otel.json

You can then load this in Storybook for visualization!"
```

## References

- EVENT-SCHEMA-VALIDATION-GUIDE.md - Event validation details
- docs/guides/adding-opentelemetry-to-tests.md - OTEL test setup guide
- TEST-INSTRUMENTATION-GUIDE.md - Instrumentation patterns
- `principal-ai collector` CLI commands - Collector status, connectivity checks, diagnostics

## Notes

- Always be interactive - ask questions, show examples, get confirmation
- Read existing files to understand project structure
- Adapt templates to user's specific setup
- Explain WHY things are done, not just HOW
- Validate created files before finishing
