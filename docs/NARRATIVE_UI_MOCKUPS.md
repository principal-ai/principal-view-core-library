# Narrative UI Mockups

## Current UI (Before)

```
┌─────────────────────────────────────────────────────────────────┐
│ Test Event Panel                                                │
├─────────────────────────────────────────────────────────────────┤
│ ← Prev    Test 1 of 5    Next →          All Passed ✓    ?     │
│                                                                 │
│ Test: should convert simple config to nodes and edges          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┃ EVENT: setup.started                                         │
│ ┃   GraphConverter.test.ts:28                                  │
│ ┃ ┌───────────────────────────────────────────────────────────┐ │
│ ┃ │ description: Creating test configuration                  │ │
│ ┃ │ config.nodes: 2                                           │ │
│ ┃ │ config.edges: 1                                           │ │
│ ┃ └───────────────────────────────────────────────────────────┘ │
│ ┃                                                               │
│ ┃ EVENT: execution.started                                     │
│ ┃   GraphConverter.ts:15                                       │
│ ┃ ┌───────────────────────────────────────────────────────────┐ │
│ ┃ │ action: GraphConverter.configToGraph()                    │ │
│ ┃ └───────────────────────────────────────────────────────────┘ │
│ ┃                                                               │
│ ● LOG: INFO                                                     │
│   ┌───────────────────────────────────────────────────────────┐ │
│   │ Converting configuration...                               │ │
│   └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┃ EVENT: execution.complete                                    │
│ ┃   GraphConverter.ts:43                                       │
│ ┃ ┌───────────────────────────────────────────────────────────┐ │
│ ┃ │ result.nodes.count: 2                                     │ │
│ ┃ │ result.edges.count: 1                                     │ │
│ ┃ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Pain Points:**
- ❌ Hard to see the big picture
- ❌ Lots of YAML noise
- ❌ Difficult to scan quickly
- ❌ Technical attributes dominate

---

## New UI - Phase 1: Simple Toggle (After)

```
┌─────────────────────────────────────────────────────────────────┐
│ Test Event Panel                                                │
├─────────────────────────────────────────────────────────────────┤
│ ← Prev    Test 1 of 5    Next →                                │
│                                                                 │
│ View: [Raw Events] [✓ Narrative]              All Passed ✓  ?  │
│                                                                 │
│ Test: should convert simple config to nodes and edges          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ✅ Graph Converter Test - PASSED                                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                 │
│ → Setup Phase                                                   │
│   🔧 Setting up test: Creating test configuration              │
│   ✅ Setup complete                                             │
│     • Nodes: 2                                                  │
│     • Edges: 1                                                  │
│     • Positions: not defined                                    │
│                                                                 │
│ → Execution Phase                                               │
│   🔄 Executing: GraphConverter.configToGraph()                 │
│   ✅ Execution complete                                         │
│     • Generated nodes: 2                                        │
│     • Generated edges: 1                                        │
│                                                                 │
│ → Assertion Phase                                               │
│   🔍 Verifying: Nodes and edges structure                      │
│   ✅ All 11 assertions passed!                                  │
│                                                                 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                 │
│ ✅ TEST PASSED                                                  │
│                                                                 │
│ All 11 assertions passed successfully.                         │
│                                                                 │
│ Results:                                                        │
│   • Nodes generated: 2                                          │
│   • Edges generated: 1                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Clear story of what happened
- ✅ Easy to scan
- ✅ Human-readable
- ✅ Key information highlighted

---

## Phase 2: Split View Mode

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Test Event Panel                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ ← Prev  Test 1 of 5  Next →    View: [Raw] [Narrative] [✓ Split]     ?    │
├────────────────────────────────┬────────────────────────────────────────────┤
│ NARRATIVE                      │ RAW EVENTS                                 │
│                                │                                            │
│ ✅ Test - PASSED               │ ┃ EVENT: setup.started                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ ┃ ┌────────────────────────────────────┐ │
│                                │ ┃ │ description: Creating test...      │ │
│ → Setup Phase              ◄───┼─┃ │ config.nodes: 2                    │ │
│   🔧 Setting up...             │ ┃ └────────────────────────────────────┘ │
│   ✅ Setup complete            │ ┃                                          │
│     • Nodes: 2                 │ ┃ EVENT: setup.complete                    │
│     • Edges: 1                 │ ┃ ┌────────────────────────────────────┐ │
│                                │ ┃ │ config.nodes: 2                    │ │
│ → Execution Phase              │ ┃ │ config.edges: 1                    │ │
│   🔄 Executing...              │ ┃ └────────────────────────────────────┘ │
│   ✅ Complete                  │ ┃                                          │
│     • Nodes: 2                 │ ● LOG: INFO                                │
│                                │   ┌────────────────────────────────────┐   │
│ → Assertion                    │   │ Converting configuration...        │   │
│   ✅ All 11 passed!            │   └────────────────────────────────────┘   │
│                                │                                            │
└────────────────────────────────┴────────────────────────────────────────────┘
```

**Interaction:**
- Hover over narrative section → highlights corresponding raw events
- Click on narrative line → scrolls to event in raw panel
- Visual arrow shows current hover mapping

---

## Phase 2: Scenario Switcher

```
┌─────────────────────────────────────────────────────────────────┐
│ Test Event Panel                                                │
├─────────────────────────────────────────────────────────────────┤
│ ← Prev    Test 1 of 5    Next →          All Passed ✓    ?     │
│                                                                 │
│ View: [Raw Events] [✓ Narrative]                               │
│                                                                 │
│ Scenario: [test-passed ▼] (2 other scenarios available)        │
│   ▸ test-passed      - Test passed all assertions              │
│   ○ test-failed      - Test failed with assertion failures     │
│   ○ default          - Default fallback scenario               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ✅ Graph Converter Test - PASSED                                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                 │
│ → Setup Phase                                                   │
│   ...                                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 3: Full-Screen Graph + Narrative Overlay

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Test Execution Visualization                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│         ┌────────┐                                                          │
│         │  Test  │                                                          │
│         │  Suite │                                                          │
│         └───┬────┘                                                          │
│             │                                                               │
│             ↓                                                               │
│      ┌──────────┐      ┌───────────┐      ┌───────────┐                   │
│      │  Setup   │─────→│ Execution │─────→│ Assertion │                   │
│      └──────────┘      └───────────┘      └───────────┘                   │
│             │                 │                  │                          │
│             └─────────────────┴──────────────────┘                          │
│                              ↓                                              │
│                        ┌───────────┐                                        │
│                        │  Result   │                                        │
│                        └───────────┘                                        │
│                                                                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────┐                   │
│  │ 📋 Narrative                                  [✕]   │                   │
│  ├─────────────────────────────────────────────────────┤                   │
│  │ ✅ Test - PASSED                                    │                   │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │                   │
│  │ → Setup Phase                                       │                   │
│  │   ✅ Complete                                       │                   │
│  │ → Execution Phase                                   │                   │
│  │   ✅ Success                                        │                   │
│  │ → Assertion Phase                                   │                   │
│  │   ✅ All passed                                     │                   │
│  └─────────────────────────────────────────────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Interaction:**
- Narrative appears as overlay/sidebar
- Can be dragged, resized, minimized
- Synchronized highlighting with graph nodes
- Hover graph node → highlights narrative section
- Click narrative section → highlights graph node

---

## Mobile/Responsive View

```
┌─────────────────────────┐
│ Test Event Panel        │
├─────────────────────────┤
│ Test 1 of 5             │
│ [← Prev] [Next →]       │
│                         │
│ [Raw] [✓ Narrative]     │
├─────────────────────────┤
│                         │
│ ✅ Test - PASSED        │
│ ━━━━━━━━━━━━━━━━━━━━━━ │
│                         │
│ → Setup                 │
│   ✅ Complete           │
│     • Nodes: 2          │
│                         │
│ → Execution             │
│   ✅ Success            │
│                         │
│ → Assertion             │
│   ✅ Passed             │
│                         │
│ ━━━━━━━━━━━━━━━━━━━━━━ │
│ ✅ PASSED               │
│                         │
│ [View Details ▼]        │
│                         │
└─────────────────────────┘
```

---

## Dark Theme

```
┌─────────────────────────────────────────────────────────────────┐
│ Test Event Panel                                    🌙 Dark     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ✅ Graph Converter Test - PASSED                                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                 │
│ → Setup Phase                                                   │
│   🔧 Setting up test: Creating test configuration              │
│   ✅ Setup complete                                             │
│     • Nodes: 2                                                  │
│     • Edges: 1                                                  │
│                                                                 │
│ → Execution Phase                                               │
│   🔄 Executing: GraphConverter.configToGraph()                 │
│   ✅ Execution complete                                         │
│     • Generated nodes: 2                                        │
│     • Generated edges: 1                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Colors:
  Background: #0a0a0a (dark)
  Text: #e5e7eb (light gray)
  Success: #4ade80 (green)
  Error: #f87171 (red)
  Warning: #fbbf24 (yellow)
  Info: #60a5fa (blue)
  Separator: #4b5563 (gray)
```

---

## Error State

```
┌─────────────────────────────────────────────────────────────────┐
│ Test Event Panel                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ❌ Graph Converter Test - FAILED                                │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                 │
│ → Setup Phase                                                   │
│   🔧 Setting up test: Creating test configuration              │
│   ✅ Setup complete                                             │
│     • Nodes: 2                                                  │
│     • Edges: 1                                                  │
│                                                                 │
│ → Execution Phase                                               │
│   🔄 Executing: GraphConverter.configToGraph()                 │
│   ✅ Execution complete                                         │
│     • Generated nodes: 2                                        │
│     • Generated edges: 1                                        │
│                                                                 │
│ → Assertion Phase                                               │
│   🔍 Verifying: Nodes and edges structure                      │
│   ❌ Assertions: 9 passed, 2 failed                             │
│                                                                 │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                                 │
│ ❌ TEST FAILED                                                  │
│                                                                 │
│ Assertion Results:                                              │
│   • Passed: 9                                                   │
│   • Failed: 2                                                   │
│                                                                 │
│ [View Raw Events →]                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Loading State

```
┌─────────────────────────────────────────────────────────────────┐
│ Test Event Panel                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│                         ⟳ Loading narrative...                  │
│                                                                 │
│                    Rendering template for test 1 of 5           │
│                                                                 │
│                                                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## No Template Available

```
┌─────────────────────────────────────────────────────────────────┐
│ Test Event Panel                                                │
├─────────────────────────────────────────────────────────────────┤
│ View: [✓ Raw Events] [Narrative (unavailable)]                 │
│                                                                 │
│ ⓘ No narrative template available for this execution           │
│                                                                 │
│   Create a narrative template to see a human-readable          │
│   summary of this test execution.                              │
│                                                                 │
│   [Create Template] [Learn More]                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┃ EVENT: setup.started                                         │
│ ┃ ┌───────────────────────────────────────────────────────────┐ │
│ ┃ │ description: Creating test configuration                  │ │
│ ┃ └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

These mockups show the progression from raw event display to rich narrative presentation, with various interaction modes and states to handle different user scenarios.
