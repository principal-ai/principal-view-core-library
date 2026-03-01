# Visual Validation React - Documentation

Complete documentation for the Visual Validation React component library.

## Documentation Index

### 📚 Core Guides

1. **[Configuration Guide](./CONFIGURATION.md)**

   - Graph configuration structure
   - Node and edge type definitions
   - Connection rules and validation
   - Complete examples with Mermaid diagrams

2. **[Event System Guide](./EVENT_SYSTEM.md)**

   - Event types and structure
   - Event stream protocol
   - Processing and validation
   - Real-time streaming examples

3. **[Usage Guide](./USAGE.md)**

   - Installation and setup
   - Component API reference
   - Building complete panels
   - Advanced patterns and recipes

### 💰 Cost Optimization

4. **[Telemetry Cost Optimization - Executive Summary](./TELEMETRY_COST_OPTIMIZATION_EXECUTIVE_SUMMARY.md)** ⭐ Start Here (5 min read)

   - Quick overview of observability costs and savings
   - Real-world cost comparison ($159K-165K savings/year)
   - Industry shift toward event-based observability
   - Why Principal View's local aggregation approach wins
   - Business impact for CTOs, Platform Engineers, and Developers

5. **[Telemetry Cost Optimization - Full Guide](./TELEMETRY_COST_OPTIMIZATION.md)** ⭐ Deep Dive

   - Understanding observability platform costs (Datadog, Splunk, etc.)
   - Detailed breakdown of metrics, traces, and logs pricing
   - Industry standard: Events-to-metrics conversion patterns
   - How Principal View does it better (local vs server-side aggregation)
   - Implementation best practices and configuration examples

### 🔒 Compliance & Privacy

6. **[Observability Compliance Guide](./OBSERVABILITY_COMPLIANCE_GUIDE.md)** ⭐ Must-Read

   - GDPR, HIPAA, SOC 2, and data residency requirements
   - Why traditional observability platforms fail compliance
   - How Principal View enables compliant deletion, data sovereignty
   - Implementation guide with code examples
   - Real-world compliance scenarios and checklists

### 🗂️ Project Organization

7. **[Storyboard Discovery Design](./STORYBOARD_DISCOVERY_DESIGN.md)** ⭐ Recommended

   - Hierarchical storyboard structure (canvas → workflows → executions)
   - Organizing multiple workflows per feature
   - Discovery system and validation
   - Technical specification

8. **[Hierarchical Workflow Composition](./HIERARCHICAL_WORKFLOW_COMPOSITION.md)** ⭐ New

   - Telemetry across library boundaries
   - Span-to-workflow mapping convention
   - Composable, reusable workflows
   - Production trace mapping to canvas
   - Implementation guide and examples

9. **[Migration Guide](./MIGRATION_GUIDE.md)**
   - Migrating from legacy flat structure to storyboards
   - Step-by-step migration instructions
   - Common issues and solutions
   - Best practices for organization

### 🧪 Telemetry Guides

10. **[Adding OpenTelemetry to Tests](./guides/adding-opentelemetry-to-tests.md)**

    - Basic test OTEL setup for bun/vitest/jest
    - In-memory span collection
    - Exporting traces to files
    - Troubleshooting Bun async context issues

11. **[Configuring Telemetry Routing](./guides/configuring-telemetry-routing.md)** ⭐ New

    - Setting up `library.yaml` with `resources` and `owned-scopes`
    - Adding `scope` field to `workflow.json`
    - Test telemetry with OTLP exporter to dev workspace
    - Storybook telemetry with `@principal-ai/storybook-otel-addon`
    - Complete routing configuration examples

### 🎨 Visual Examples

Each guide includes Mermaid diagrams showing:

- System architecture
- Graph structures
- Event flows
- State transitions
- Component layouts

### 🚀 Quick Links

**Getting Started:**

```bash
# Install the library
npm install @principal-ai/visual-validation-react @principal-ai/visual-validation-core

# Start Storybook to see examples
bun run storybook
```

**Learn by Example:**

- Check out the [Storybook stories](../src/stories/) for interactive examples
- See [CONFIGURATION.md](./CONFIGURATION.md) for complete configuration examples
- Read [EVENT_SYSTEM.md](./EVENT_SYSTEM.md) for event streaming patterns

### 📖 API Reference

For detailed TypeScript types and interfaces, see:

- Core types: `@principal-ai/visual-validation-core/types`
- React component props: Component files in `src/components/`

### 🎯 Common Use Cases

| Use Case               | Guide Section                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------- |
| **Understand cost savings** | [Executive Summary (5 min)](./TELEMETRY_COST_OPTIMIZATION_EXECUTIVE_SUMMARY.md) ⭐ |
| **Reduce telemetry costs** | [Full Cost Optimization Guide](./TELEMETRY_COST_OPTIMIZATION.md) ⭐ |
| **GDPR/HIPAA compliance** | [Observability Compliance Guide](./OBSERVABILITY_COMPLIANCE_GUIDE.md) ⭐ |
| **Add OTEL to tests** | [Adding OpenTelemetry to Tests](./guides/adding-opentelemetry-to-tests.md) |
| **Route traces to storyboards** | [Configuring Telemetry Routing](./guides/configuring-telemetry-routing.md) ⭐ |
| Define graph structure | [Configuration Guide - Node Types](./CONFIGURATION.md#node-types)                     |
| Create connections     | [Configuration Guide - Connection Rules](./CONFIGURATION.md#connection-rules)         |
| Stream events          | [Event System Guide - Event Stream Protocol](./EVENT_SYSTEM.md#event-stream-protocol) |
| Build a panel          | [Usage Guide - Building a Complete Panel](./USAGE.md#building-a-complete-panel)       |
| Real-time updates      | [Usage Guide - Real-time Event Streaming](./USAGE.md#real-time-event-streaming)       |
| Add validation         | [Configuration Guide - Validation Rules](./CONFIGURATION.md#validation-rules)         |

### 🔍 Example Systems

The documentation includes complete examples for:

- **E-commerce Order Processing** - Track orders from customer to warehouse
- **Data Processing Pipeline** - Monitor data flow through ETL stages
- **Microservices Architecture** - Visualize service dependencies and API calls

Each example includes:

- Full configuration code
- Mermaid diagrams
- Event sequences
- Validation rules

### 💡 Tips

- Start with the [Configuration Guide](./CONFIGURATION.md) to understand the data model
- Use [Event System Guide](./EVENT_SYSTEM.md) to learn how to update the graph
- Follow [Usage Guide](./USAGE.md) to integrate with your React application
- Run Storybook (`bun run storybook`) to see live examples

### ⚠️ Important: File Structure

**If you're using the legacy flat structure** (canvas files directly in `.principal-views/` with `__executions__/` subdirectory):

- This structure is **fully deprecated** as of v1.0.0 and will produce validation errors
- **Required:** Migrate to the storyboard structure immediately
- **See:** [Migration Guide](./MIGRATION_GUIDE.md) for step-by-step upgrade instructions

**For new projects:** Use the storyboard structure described in [Storyboard Discovery Design](./STORYBOARD_DISCOVERY_DESIGN.md)

### 🐛 Troubleshooting

Common issues and solutions:

**Configuration not working?**

- Check that all node types referenced in `allowedConnections` are defined in `nodeTypes`
- Verify edge types in `allowedConnections` exist in `edgeTypes`

**Events not processing?**

- Ensure event payload matches the expected structure for the category
- Check that node/edge IDs in events match existing nodes/edges
- Validate timestamps are in milliseconds

**Validation failing?**

- Review state transition rules in configuration
- Check connection constraints
- Verify cardinality rules aren't violated

### 🤝 Contributing

Found an error in the docs? Want to add examples?

- Documentation source is in `packages/react/docs/`
- Storybook examples are in `packages/react/src/stories/`

### 📝 License

MIT - See root LICENSE file
