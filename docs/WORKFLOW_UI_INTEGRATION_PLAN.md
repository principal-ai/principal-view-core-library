# Workflow Template System - UI Integration Plan

## Current State Analysis

### Existing Components

**TestEventPanel.tsx** (packages/react/src/components/TestEventPanel.tsx)
- Displays test execution events in chronological order
- Shows OTEL logs interleaved with span events
- Uses YAML formatting for event attributes
- Features:
  - Test navigation (prev/next)
  - Severity-based color coding
  - Phase highlighting (setup/execution/assertion)
  - Code filepath tracking (test file vs code under test)
  - Timeline-based display

**Current Display Mode:**
```
EVENT: setup.started
code.filepath: GraphConverter.test.ts:28
───────────────────
description: Creating test configuration
config.nodes: 2
config.edges: 1
```

**What We Want:**
```
✅ Graph Converter Test - PASSED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

→ Setup Phase
  🔧 Creating test configuration
    • Nodes: 2
    • Edges: 1

→ Execution Phase
  🔄 Converting graph
  ✅ Generated 2 nodes and 1 edge

→ Assertion Phase
  🔍 Verifying results
  ✅ All 11 assertions passed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ TEST PASSED

All 11 assertions passed successfully.
```

## Integration Approach

### Phase 1: Add Workflow View Toggle (Quick Win)

**1.1 Create WorkflowRenderer Component**

New file: `packages/react/src/components/WorkflowRenderer.tsx`

```typescript
interface WorkflowRendererProps {
  template: WorkflowTemplate;
  events: OtelEvent[];
  className?: string;
}

export const WorkflowRenderer: React.FC<WorkflowRendererProps> = ({
  template,
  events,
  className
}) => {
  const result = renderWorkflow(template, events);

  return (
    <div className={className}>
      <pre style={monospacedStyle}>
        {result.text}
      </pre>

      {/* Optional metadata panel */}
      <WorkflowMetadata metadata={result.metadata} />
    </div>
  );
};
```

**1.2 Add View Mode Toggle to TestEventPanel**

Update `TestEventPanel.tsx`:

```typescript
type ViewMode = 'raw' | 'workflow';

export interface TestEventPanelProps {
  // ... existing props
  viewMode?: ViewMode;
  workflowTemplate?: WorkflowTemplate;
  onViewModeChange?: (mode: ViewMode) => void;
}

export const TestEventPanel = ({
  // ... existing props
  viewMode = 'raw',
  workflowTemplate,
  onViewModeChange
}) => {
  // Add toggle button in header
  <div style={{ display: 'flex', gap: '8px' }}>
    <button onClick={() => onViewModeChange?.('raw')}>
      Raw Events
    </button>
    <button onClick={() => onViewModeChange?.('workflow')}>
      Workflow
    </button>
  </div>

  // Render based on mode
  {viewMode === 'workflow' && workflowTemplate ? (
    <WorkflowRenderer
      template={workflowTemplate}
      events={convertToOtelEvents(currentSpan, logs)}
    />
  ) : (
    // ... existing timeline rendering
  )}
};
```

**1.3 Load Workflow Templates**

Create utility to load `.workflow.json` files alongside `.otel.canvas` files:

```typescript
// packages/react/src/utils/workflow-loader.ts
export async function loadWorkflowTemplate(
  canvasPath: string
): Promise<WorkflowTemplate | null> {
  const workflowPath = canvasPath.replace('.otel.canvas', '.workflow.json');
  try {
    const response = await fetch(workflowPath);
    return await response.json();
  } catch {
    return null; // No workflow template available
  }
}
```

### Phase 2: Enhanced Workflow View (Rich Features)

**2.1 Split View Mode**

Add a "split" view mode showing workflow + raw events side-by-side:

```
┌─────────────────┬─────────────────┐
│   Workflow     │   Raw Events    │
│                 │                 │
│ ✅ Test Passed  │ EVENT: setup... │
│                 │ attributes:     │
│ → Setup         │   config.nodes  │
│   🔧 Setup...   │   ...           │
│                 │                 │
│ → Execution     │ EVENT: exec...  │
│   ✅ Success    │ attributes:     │
│                 │   result.count  │
└─────────────────┴─────────────────┘
```

**2.2 Interactive Event Mapping**

Add hover/click interactions to map between workflow and raw events:

- Hover over workflow line → highlight corresponding raw event
- Click on workflow section → scroll to that event in raw view
- Visual indicators showing which raw events contribute to each workflow line

```typescript
interface WorkflowSegment {
  text: string;
  sourceEvents: string[]; // Event names that produced this line
  lineNumber: number;
}

// Parse workflow with source tracking
const segments = parseWorkflowWithSources(result.text, events);

// Render with interaction
{segments.map((segment, idx) => (
  <div
    key={idx}
    onMouseEnter={() => highlightEvents(segment.sourceEvents)}
    onClick={() => scrollToEvent(segment.sourceEvents[0])}
    style={{
      cursor: 'pointer',
      background: hoveredSegment === idx ? 'highlight' : 'transparent'
    }}
  >
    {segment.text}
  </div>
))}
```

**2.3 Scenario Switcher**

Allow users to view alternative scenarios:

```typescript
// Show scenario selector when multiple scenarios match
{result.applicableScenarios.length > 1 && (
  <div style={scenarioSelectorStyle}>
    <label>View as:</label>
    <select
      value={selectedScenarioId}
      onChange={(e) => setSelectedScenarioId(e.target.value)}
    >
      {result.applicableScenarios.map(scenario => (
        <option key={scenario.id} value={scenario.id}>
          {scenario.description}
        </option>
      ))}
    </select>
  </div>
)}
```

**2.4 Workflow Syntax Highlighting**

Add syntax highlighting to the workflow text:

```typescript
// Color different elements
const highlightWorkflow = (text: string) => {
  return text
    .replace(/^✅|❌|⚠️|📋/gm, '<span class="emoji">$&</span>')
    .replace(/^→ /gm, '<span class="arrow">→ </span>')
    .replace(/^\s+•/gm, '<span class="bullet">•</span>')
    .replace(/\d+/g, '<span class="number">$&</span>');
};
```

### Phase 3: Template Management UI (Advanced)

**3.1 Template Selector**

When multiple workflow templates are available for a canvas:

```typescript
interface TemplateMetadata {
  name: string;
  description: string;
  mode: WorkflowMode;
  scenarioCount: number;
}

<TemplateSelector
  templates={availableTemplates}
  selected={currentTemplate}
  onChange={setCurrentTemplate}
/>
```

**3.2 Visual Template Editor (Future)**

Interactive editor for creating/modifying workflow templates:

```
┌─────────────────────────────────────────┐
│ Template Editor                         │
├─────────────────────────────────────────┤
│ Name: Graph Converter Test Workflow   │
│ Mode: [span-tree ▼]                     │
│                                         │
│ Scenarios:                              │
│ ┌─────────────────────────────────────┐ │
│ │ ▶ test-passed (priority: 1)         │ │
│ │   Condition:                        │ │
│ │     assertions.failed = 0           │ │
│ │                                     │ │
│ │   Template:                         │ │
│ │     Introduction: ✅ Test Passed    │ │
│ │     Summary: All {...} passed       │ │
│ │                                     │ │
│ │   [Edit] [Delete]                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [+ Add Scenario]                        │
└─────────────────────────────────────────┘
```

**3.3 Live Preview**

Show live workflow preview as you edit the template:

```
┌──────────────┬──────────────┐
│   Editor     │   Preview    │
│              │              │
│ Template:    │ ✅ Test...   │
│   intro:     │              │
│   "✅ {...}" │ → Setup      │
│              │   ...        │
│ [Save]       │              │
└──────────────┴──────────────┘
```

## Implementation Roadmap

### Sprint 1: Basic Workflow View (1-2 days)
- [ ] Create `WorkflowRenderer` component
- [ ] Add view mode toggle to `TestEventPanel`
- [ ] Convert TestEventPanel data to OtelEvent format
- [ ] Load workflow templates from JSON
- [ ] Basic styling for workflow display

**Deliverable:** Users can toggle between raw events and workflow view

### Sprint 2: Enhanced Experience (2-3 days)
- [ ] Add split view mode
- [ ] Implement scenario switcher
- [ ] Add syntax highlighting
- [ ] Create hover interactions
- [ ] Add metadata panel

**Deliverable:** Rich, interactive workflow experience

### Sprint 3: Template Discovery (1-2 days)
- [ ] Auto-discover workflow templates for canvas files
- [ ] Template selector UI
- [ ] Template validation
- [ ] Error handling for missing/invalid templates

**Deliverable:** Seamless template loading and selection

### Sprint 4: Advanced Features (3-5 days)
- [ ] Visual template editor
- [ ] Live preview
- [ ] Template testing tools
- [ ] Export workflows (markdown, PDF)
- [ ] Share workflow URLs

**Deliverable:** Full template management system

## Component Architecture

```
TestEventPanel
├── ViewModeToggle
│   ├── RawButton
│   ├── WorkflowButton
│   └── SplitButton
├── WorkflowView (when viewMode = 'workflow')
│   ├── ScenarioSelector
│   ├── WorkflowRenderer
│   │   ├── WorkflowText (with syntax highlighting)
│   │   └── InteractionLayer (hover/click handlers)
│   └── WorkflowMetadata
└── RawEventsView (when viewMode = 'raw')
    └── TimelineItems
        ├── EventItem
        └── LogItem
```

## Data Flow

```
1. Load Canvas
   ↓
2. Discover Workflow Template (.workflow.json)
   ↓
3. Collect OTEL Events (from test spans + logs)
   ↓
4. User Selects View Mode
   ↓
   ├─→ Raw Mode: Display events as YAML
   │
   └─→ Workflow Mode:
       ├─→ renderWorkflow(template, events)
       ├─→ Select matching scenario
       ├─→ Parse template expressions
       └─→ Display formatted workflow
```

## Example Integration

**In Storybook:**

```typescript
// packages/react/src/stories/RealTestExecution.stories.tsx

import workflowTemplate from '../../../.principal-views/graph-converter-test.workflow.json';

export const WithWorkflow: Story = {
  render: () => {
    const [viewMode, setViewMode] = useState<ViewMode>('workflow');

    return (
      <div style={{ display: 'flex', width: '100vw', height: '100vh' }}>
        <div style={{ flex: '0 0 50%' }}>
          <TestEventPanel
            spans={spans}
            logs={logs}
            currentSpanIndex={currentSpanIndex}
            currentEventIndex={currentEventIndex}
            viewMode={viewMode}
            workflowTemplate={workflowTemplate}
            onViewModeChange={setViewMode}
          />
        </div>
        <div style={{ flex: '0 0 50%' }}>
          <GraphRenderer canvas={testExecutionCanvas} />
        </div>
      </div>
    );
  }
};
```

## Design Considerations

### Styling

Use monospace font for workflow text to match the terminal/log aesthetic:

```typescript
const workflowStyle = {
  fontFamily: theme.fonts.monospace,
  fontSize: '14px',
  lineHeight: '1.6',
  padding: '20px',
  whiteSpace: 'pre-wrap',
  color: theme.colors.text,
  backgroundColor: theme.colors.background,
};
```

### Color Palette

Map semantic elements to colors:
- ✅ Success: `#4ade80` (green)
- ❌ Error: `#f87171` (red)
- ⚠️ Warning: `#fbbf24` (yellow)
- 📋 Info: `#60a5fa` (blue)
- → Arrow: `#9ca3af` (gray)
- Numbers: `#c084fc` (purple)
- Separators: `#4b5563` (dark gray)

### Accessibility

- Ensure color contrast meets WCAG AA standards
- Support keyboard navigation for scenario switching
- Provide ARIA labels for interactive elements
- Support screen readers with semantic HTML

### Performance

- Memoize workflow rendering results
- Lazy load templates
- Virtual scrolling for long workflows
- Debounce hover interactions

## Integration with Existing Features

### Phase Highlighting

Map workflow sections to graph phases:

```typescript
// When user hovers over Setup phase in graph
<WorkflowRenderer
  template={template}
  events={events}
  highlightedSection="setup" // Highlight setup-related lines
/>
```

### Event Correlation

Maintain bidirectional links between workflow and raw events:

```typescript
interface WorkflowLine {
  text: string;
  eventNames: string[];
  eventIndices: number[];
}

// Click workflow line → highlight in raw view
// Click raw event → highlight in workflow
```

### Search and Filter

Add search capability across workflow text:

```typescript
<WorkflowSearch
  workflow={result.text}
  onMatch={(lineNumber) => scrollToLine(lineNumber)}
/>
```

## Benefits

### For Developers
- **Quick Understanding**: See human-readable execution summary
- **Debugging**: Easily spot where tests fail
- **Context Switching**: Less mental overhead vs raw YAML

### For QA/Testing
- **Test Reports**: Generate readable test execution reports
- **Issue Documentation**: Copy workflow for bug reports
- **Regression Analysis**: Compare workflows across runs

### For Product/Management
- **Observability**: Understand system behavior without technical depth
- **Communication**: Share execution stories in meetings
- **Documentation**: Auto-generate execution documentation

## Success Metrics

- [ ] Users can toggle between raw/workflow views with 1 click
- [ ] Workflow loads in <100ms for typical test execution
- [ ] 90%+ of test executions have matching workflow templates
- [ ] Users report workflows are "much easier to read" than raw YAML
- [ ] Adoption: 70%+ of users prefer workflow view after trying it

## Future Enhancements

1. **AI-Generated Workflows**: Use LLM to generate workflow templates from examples
2. **Workflow Diff**: Compare workflows across test runs to spot changes
3. **Export Formats**: Markdown, HTML, PDF export
4. **Template Library**: Share workflow templates across projects
5. **Smart Highlighting**: ML-based highlighting of important sections
6. **Timeline Visualization**: Visual timeline alongside workflow
7. **Collaborative Editing**: Multi-user template editing
8. **Version Control**: Track template changes over time

---

## Next Steps

**Immediate (Week 1):**
1. Create `WorkflowRenderer` component
2. Add view toggle to `TestEventPanel`
3. Test with existing workflow templates

**Short Term (Week 2-3):**
1. Add split view mode
2. Implement scenario switcher
3. Polish styling and interactions

**Medium Term (Month 2):**
1. Build template management UI
2. Add template validation
3. Create documentation

This plan provides a clear path to integrate the workflow template system into the React UI, starting with simple view toggling and progressively adding richer features.
