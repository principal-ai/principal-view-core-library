import React, { useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultTheme, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemComponentEdge } from '../subsystem/model';
import type { GraphifyComponentDetail } from '../graphify';
const meta = {
  title: 'Subsystem/Component Graph',
  component: SubsystemComponentGraph,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Build a subsystem graph from a compact spec - helpers
// ---------------------------------------------------------------------------
function components(
  spec: Array<[id: string, name: string, kind: SubsystemComponent['kind'], file: string, purl: string, purpose?: string, symbol?: string, detail?: GraphifyComponentDetail]>,
): SubsystemComponent[] {
  return spec.map(([id, name, kind, file, purl, purpose, symbol, detail]) => ({
    id,
    name,
    kind,
    file,
    purl,
    purpose,
    symbol,
    detail,
  }));
}

function edges(
  spec: Array<[from: string, to: string, mechanism: SubsystemComponentEdge['mechanism'], refs?: string[]]>,
): SubsystemComponentEdge[] {
  return spec.map(([from, to, mechanism, refs], i) => ({
    id: `e${i}`,
    from,
    to,
    mechanism,
    refs,
  }));
}

// ---------------------------------------------------------------------------
// Minimal: two nodes, one edge — the simplest possible label layout test.
// ---------------------------------------------------------------------------
const twoNodeComponents = components([
  ['src', 'TranscriptParser', 'class', 'transcript.ts', 'pkg:github/principal-ai/agent-monitoring', 'parses session records'],
  ['dst', 'SessionReader', 'class', 'SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'normalizes sessions into events'],
]);

const twoNodeEdges = edges([
  ['src', 'dst', 'imports'],
]);

function TwoNodeDemo({ showEdgeLabels = true }: { showEdgeLabels?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SubsystemComponentEdge | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={twoNodeComponents}
        edges={twoNodeEdges}
        onSelect={(id) => setSelected(id)}
        onEdgeSelect={(e) => setSelectedEdge(e)}
        showEdgeLabels={showEdgeLabels}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {selectedEdge
          ? `edge: ${selectedEdge.from} --${selectedEdge.mechanism}--> ${selectedEdge.to}`
          : selected
            ? `selected: ${selected}`
            : 'click a component or edge to select it'}
      </div>
    </div>
  );
}

export const TwoNodeSingleEdge: Story = {
  render: () => <TwoNodeDemo />,
};

export const TwoNodeNoLabels: Story = {
  render: () => <TwoNodeDemo showEdgeLabels={false} />,
};

// ---------------------------------------------------------------------------
// Playground: control the number of nodes in left and right layers.
// All left nodes connect to all right nodes (fan-in / fan-out).
// ---------------------------------------------------------------------------
function PlaygroundDemo({ leftCount, rightCount, showEdgeLabels }: { leftCount: number; rightCount: number; showEdgeLabels: boolean }) {
  const comps: SubsystemComponent[] = [];
  const edgeList: SubsystemComponentEdge[] = [];

  for (let i = 0; i < leftCount; i++) {
    comps.push({
      id: `l${i}`,
      name: `Left${i}`,
      kind: 'class',
      file: `left${i}.ts`,
      purl: 'pkg:github/principal-ai/playground',
      purpose: `left layer node ${i}`,
    });
  }
  for (let i = 0; i < rightCount; i++) {
    comps.push({
      id: `r${i}`,
      name: `Right${i}`,
      kind: 'class',
      file: `right${i}.ts`,
      purl: 'pkg:github/principal-ai/playground',
      purpose: `right layer node ${i}`,
    });
  }

  let ei = 0;
  for (let i = 0; i < leftCount; i++) {
    for (let j = 0; j < rightCount; j++) {
      edgeList.push({ id: `e${ei++}`, from: `l${i}`, to: `r${j}`, mechanism: 'imports' });
    }
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph components={comps} edges={edgeList} showEdgeLabels={showEdgeLabels} />
    </div>
  );
}

export const Playground: Story = {
  render: (args) => <PlaygroundDemo {...args} />,
  args: {
    leftCount: 1,
    rightCount: 1,
    showEdgeLabels: true,
  },
  argTypes: {
    leftCount: { control: { type: 'number', min: 0, max: 6, step: 1 } },
    rightCount: { control: { type: 'number', min: 0, max: 6, step: 1 } },
    showEdgeLabels: { control: 'boolean' },
  },
};

// ---------------------------------------------------------------------------
// Primary: opencode V2 event reader subsystem (agent-monitoring) + consumers
// ---------------------------------------------------------------------------
const readerDetail: GraphifyComponentDetail = {
  kind: 'class',
  methods: [
    { nodeId: 'm1', name: 'normalize', returnType: 'SessionEvent[]' },
    { nodeId: 'm2', name: 'readSession', parameters: ['string'], returnType: 'SessionRecord' },
    { nodeId: 'm3', name: 'toUniversalEvents', returnType: 'UniversalEvent[]' },
  ],
  properties: [{ name: 'sessionId', type: 'string' }],
  extends: [],
  implements: ['SessionReaderLike'],
  instantiations: [{ nodeId: 'caller1', name: 'capture-session' }],
  references: [{ nodeId: 'ref1', name: 'supported-agents', context: 'type' }],
};

const v2ReaderComponents = components([
  ['capture', 'capture script', 'function', 'scripts/capture-session.ts', 'pkg:github/principal-ai/agent-monitoring', 'captures a real session for fixtures'],
  ['transcript', 'transcript', 'module', 'transcript.ts', 'pkg:github/principal-ai/agent-monitoring', 'parses session records + type guards'],
  ['paths', 'paths', 'module', 'paths.ts', 'pkg:github/principal-ai/agent-monitoring', 'extracts tool names + file paths'],
  ['reader', 'SessionReader', 'class', 'SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'normalizes a session into universal events', 'SessionReader.normalize', readerDetail],
  ['registry', 'supported-agents', 'module', 'supported-agents.ts', 'pkg:github/principal-ai/agent-monitoring', 'registry of supported agents (the shared seam)', 'registerAgent'],
]);

const v2ReaderEdges = edges([
  ['transcript', 'reader', 'imports'],
  ['paths', 'reader', 'imports'],
  ['capture', 'reader', 'calls'],
  ['reader', 'registry', 'registers-into', ['supported-agents.ts']],
  // Consumer packages - cross-package edges leave the subgraph
  ['reader', 'trail-viewer-host', 'imports'],
  ['reader', 'core-sessions', 'imports'],
  ['reader', 'cli-session', 'imports'],
]);

function V2ReaderDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SubsystemComponentEdge | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={v2ReaderComponents}
        edges={v2ReaderEdges}
        onSelect={(id) => setSelected(id)}
        onEdgeSelect={(e) => setSelectedEdge(e)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {selectedEdge
          ? `edge: ${selectedEdge.from} --${selectedEdge.mechanism}--> ${selectedEdge.to}${selectedEdge.refs?.length ? ` [refs: ${selectedEdge.refs.join(', ')}]` : ''}`
          : selected
            ? `selected: ${selected}`
            : 'click a component or edge to select it'}
      </div>
    </div>
  );
}

export const V2ReaderSubsystem: Story = {
  render: () => <V2ReaderDemo />,
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export const Empty: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph components={[]} edges={[]} />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Single package (no consumers) - the investigate-and-pin pattern.
// Conveys the idea via LAYERS: readers (input) → accumulator (processing).
// ---------------------------------------------------------------------------
const investigateOnlyComponents: SubsystemComponent[] = [
  {
    id: 'v1',
    name: 'V1EventBridgeProcessor',
    kind: 'class',
    file: 'src/event-processing/V1EventBridge.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'normalizes V1 DB rows into universal events',
    symbol: 'V1EventBridgeProcessor',
  },
  {
    id: 'v2',
    name: 'V2EventBridgeProcessor',
    kind: 'class',
    file: 'src/event-processing/V2EventBridge.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'normalizes V2 durable events into universal events',
    symbol: 'V2EventBridgeProcessor',
  },
  {
    id: 'input',
    name: 'RepoNormalizedUniversalAgentSessionEvent',
    kind: 'type',
    file: 'types/RepoNormalizedUniversalAgentSessionEvent.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'the subsystem\u2019s input type — a repo-normalized universal event the readers produce and the accumulator consumes',
    symbol: 'RepoNormalizedUniversalAgentSessionEvent',
    detail: {
      kind: 'type',
      properties: [
        { name: 'eventType', type: 'NormalizedEventType' },
        { name: 'sessionId', type: 'string' },
        { name: 'timestamp', type: 'number' },
      ],
      usedBy: [{ nodeId: 'acc', name: 'accumulateToAgentSessionEvents', context: 'parameter_type' }],
      implementors: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'acc',
    name: 'accumulateToAgentSessionEvents',
    kind: 'function',
    file: 'src/event-processing/accumulator.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'accumulates normalized events into agent session events',
    symbol: 'accumulateToAgentSessionEvents',
  },
  {
    id: 'out',
    name: 'AgentSessionEvent',
    kind: 'type',
    file: 'src/event-processing/accumulator.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'the subsystem\u2019s output type — an accumulated agent-session event',
    symbol: 'AgentSessionEvent',
    detail: {
      kind: 'type',
      properties: [
        { name: 'sessionName', type: 'string' },
        { name: 'operation', type: 'AgentSessionEventOperation' },
        { name: 'description', type: 'string' },
      ],
      usedBy: [{ nodeId: 'acc', name: 'accumulateToAgentSessionEvents', context: 'return_type' }],
      implementors: [],
    } satisfies GraphifyComponentDetail,
  },
];

const investigateOnlyEdges = edges([
  // Concept-level data flow — the LLM's semantic intent.
  ['v1', 'input', 'produces'],
  ['v2', 'input', 'produces'],
  ['input', 'acc', 'feeds'],
  ['acc', 'out', 'produces'],
]);

export const InvestigateOnly: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph components={investigateOnlyComponents} edges={investigateOnlyEdges} />
    </div>
  ),
};

/** Same pipeline with a narrower `maxNodeWidth` (140) — long names wrap. */
export const NarrowMaxWidth: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={investigateOnlyComponents}
        edges={investigateOnlyEdges}
        maxNodeWidth={140}
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Naming-convention wrap check — one node per common symbol convention.
// ---------------------------------------------------------------------------
const namingConventionComponents: SubsystemComponent[] = [
  {
    id: 'camel',
    name: 'accumulateToAgentSessionEvents',
    kind: 'function',
    file: 'src/event-processing/accumulator.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'accumulateToAgentSessionEvents',
  },
  {
    id: 'snake',
    name: 'repo_normalized_universal_event',
    kind: 'type',
    file: 'src/event-processing/repo_normalized.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'repo_normalized_universal_event',
  },
  {
    id: 'pascal',
    name: 'RepoNormalizedUniversalAgentSessionEvent',
    kind: 'class',
    file: 'src/event-processing/RepoNormalized.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'RepoNormalizedUniversalAgentSessionEvent',
  },
  {
    id: 'acronym',
    name: 'ProcessSSEStreamForEventToken',
    kind: 'function',
    file: 'src/event-processing/sse.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'ProcessSSEStreamForEventToken',
  },
  {
    id: 'method',
    name: 'normalize',
    kind: 'function',
    file: 'src/session/SessionReader.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    symbol: 'SessionReader.normalize',
  },
  {
    id: 'pkg',
    name: 'trail-viewer',
    kind: 'external',
    file: '',
    purl: 'pkg:npm/@principal-ai/trail-viewer',
    symbol: '',
  },
];

/** Nodes with compact `maxNodeWidth` so the different conventions visibly wrap
 *  at their word boundaries (camelCase, snake_case, PascalCase, acronyms). */
export const NamingConventions: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={namingConventionComponents}
        edges={[]}
        maxNodeWidth={180}
      />
    </div>
  ),
};

// ---------------------------------------------------------------------------
// One node per GraphifyComponentDetail kind — what each looks like + drills down
// ---------------------------------------------------------------------------
const detailKindComponents: SubsystemComponent[] = [
  {
    id: 'detail-class',
    name: 'SessionReader',
    kind: 'class',
    file: 'src/session/SessionReader.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'class-like: owns outgoing method edges',
    symbol: '',
    detail: readerDetail,
  },
  {
    id: 'detail-method',
    name: 'normalize',
    kind: 'function',
    file: 'src/session/SessionReader.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'a class method — the specific thing this session focused on',
    symbol: 'SessionReader.normalize',
    detail: {
      kind: 'function',
      parameters: [{ name: 'session', type: 'SessionRecord' }],
      returnType: 'SessionEvent[]',
      callers: [{ nodeId: 'c1', name: 'capture-session', source_location: 'L120' }],
      callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-fn',
    name: 'normalizeSession',
    kind: 'function',
    file: 'src/event-processing/normalize.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'function-like: label ends () with no method edges',
    symbol: 'normalizeSession',
    detail: {
      kind: 'function',
      parameters: [
        { name: 'session', type: 'SessionRecord' },
        { name: 'limit', type: 'number' },
      ],
      returnType: 'SessionEvent[]',
      callers: [{ nodeId: 'c1', name: 'SessionReader.normalize', source_location: 'L120' }],
      callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-type',
    name: 'SessionRecord',
    kind: 'type',
    file: 'src/session/transcript.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'type-like: revealed by incoming implements edges',
    symbol: 'SessionRecord',
    detail: {
      kind: 'type',
      properties: [
        { name: 'id', type: 'string' },
        { name: 'admittedSeq', type: 'number' },
      ],
      usedBy: [{ nodeId: 'u1', name: 'normalizeSession', context: 'type' }],
      implementors: ['SessionReaderLike'],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-module',
    name: 'CodexRolloutRecord',
    kind: 'type',
    file: 'src/session/transcript.ts',
    purl: 'pkg:github/principal-ai/agent-monitoring',
    purpose: 'a type symbol that lives in the transcript module; the node is the symbol, the file is its location',
    symbol: 'CodexRolloutRecord',
    detail: {
      kind: 'type',
      properties: [
        { name: 'type', type: 'string' },
        { name: 'id', type: 'string' },
      ],
      usedBy: [{ nodeId: 'u1', name: 'isCodexRolloutRecord', context: 'type' }],
      implementors: [],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'detail-external',
    // name = the package's name after the namespace; namespace shown above.
    name: 'trail-viewer',
    kind: 'external',
    file: '',
    purl: 'pkg:npm/@principal-ai/trail-viewer',
    purpose: 'an npm package consumer — the whole package as a node',
    symbol: '',
    detail: {
      kind: 'external',
      label: 'pkg:npm/@principal-ai/trail-viewer',
    } satisfies GraphifyComponentDetail,
  },
];

function DetailKindsDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={detailKindComponents}
        edges={[]}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {selected ? `selected: ${selected}` : 'click a component to see its GraphifyComponentDetail'}
      </div>
    </div>
  );
}

export const DetailKinds: Story = {
  render: () => <DetailKindsDemo />,
};

// ---------------------------------------------------------------------------
// Minimal (pre-graphify) vs Resolved (post-graphify) — the SAME subsystem,
// showing what the LLM emits (no detail) and what graphify enrichment adds.
// ---------------------------------------------------------------------------

/** The minimal LLM-authored substrate: symbols only, no `detail`. */
const minimalComponents = components([
  ['reader', 'SessionReader', 'class', 'SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'normalizes a session into universal events', 'SessionReader'],
  ['normalize', 'normalize', 'function', 'SessionReader.ts', 'pkg:github/principal-ai/agent-monitoring', 'maps a session into universal events', 'SessionReader.normalize'],
  ['record', 'SessionRecord', 'type', 'transcript.ts', 'pkg:github/principal-ai/agent-monitoring', 'the parsed codex session record', 'SessionRecord'],
  ['transcript', 'transcript', 'module', 'transcript.ts', 'pkg:github/principal-ai/agent-monitoring', 'parses session records + type guards', 'transcript'],
]);

const sharedEdges = edges([
  ['transcript', 'record', 'defines'],
  ['reader', 'normalize', 'method'],
  ['normalize', 'record', 'references'],
]);

/** The same subsystem after `resolveSubsystemToGraphify` populates `detail`. */
const resolvedComponents: SubsystemComponent[] = [
  { ...minimalComponents[0], detail: readerDetail },
  {
    ...minimalComponents[1],
    detail: {
      kind: 'function',
      parameters: [{ name: 'session', type: 'SessionRecord' }],
      returnType: 'SessionEvent[]',
      callers: [{ nodeId: 'c1', name: 'capture-session', source_location: 'L120' }],
      callees: [{ nodeId: 'c2', name: 'toUniversalEvents', source_location: 'L64' }],
    } satisfies GraphifyComponentDetail,
  },
  {
    ...minimalComponents[2],
    detail: {
      kind: 'type',
      properties: [
        { name: 'id', type: 'string' },
        { name: 'type', type: 'string' },
      ],
      usedBy: [{ nodeId: 'u1', name: 'normalize', context: 'type' }],
      implementors: ['SessionReaderLike'],
    } satisfies GraphifyComponentDetail,
  },
  {
    ...minimalComponents[3],
    detail: {
      kind: 'module',
      exports: ['CodexRolloutRecord', 'CodexSessionMeta'],
      imports: [{ nodeId: 'i1', name: 'paths', relation: 'imports_from' }],
      symbols: ['CodexRolloutRecord', 'CodexSessionMeta'],
    } satisfies GraphifyComponentDetail,
  },
];

function MinimalVsResolvedDemo({ resolved }: { resolved: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={resolved ? resolvedComponents : minimalComponents}
        edges={sharedEdges}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        {resolved
          ? 'post-graphify: click a component to see the enriched GraphifyComponentDetail'
          : 'pre-graphify: LLM-authored symbols only — no detail yet'}
      </div>
    </div>
  );
}

export const MinimalPreGraphify: Story = {
  render: () => <MinimalVsResolvedDemo resolved={false} />,
};

export const ResolvedPostGraphify: Story = {
  render: () => <MinimalVsResolvedDemo resolved />,
};

// ---------------------------------------------------------------------------
// Investigation-derived subsystem — grok session 019fd2a9 (t3code)
// Read-only analysis of "provider / event threading". Components are occupied
// (analyzed, not edited) — no code touched, but a coherent concept was worked.
// ---------------------------------------------------------------------------
const investigationComponents: SubsystemComponent[] = [
  {
    id: 'adapter',
    name: 'OpenCodeAdapter',
    kind: 'module',
    file: 'apps/server/src/provider/Layers/OpenCodeAdapter.ts',
    purl: 'pkg:github/t3code/t3code',
    purpose: 'adapts opencode session/threads + events to the t3 runtime',
    symbol: 'makeOpenCodeAdapter',
    capture: 'analyzed',
    detail: {
      kind: 'module',
      exports: ['makeOpenCodeAdapter', 'OpenCodeAdapterLiveOptions'],
      imports: [{ nodeId: 'i1', name: 'orchestration', relation: 'imports_from' }],
      symbols: ['makeOpenCodeAdapter', 'isOpenCodeNotFound', 'OpenCodeSessionContext'],
    } satisfies GraphifyComponentDetail,
  },
  {
    id: 'ingestion',
    name: 'ProviderRuntimeIngestion',
    kind: 'module',
    file: 'apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts',
    purl: 'pkg:github/t3code/t3code',
    purpose: 'ingests provider events into the runtime',
    symbol: 'ProviderRuntimeIngestion',
    capture: 'analyzed',
  },
  {
    id: 'contracts',
    name: 'orchestration',
    kind: 'module',
    file: 'packages/contracts/src/orchestration.ts',
    purl: 'pkg:github/t3code/t3code',
    purpose: 'contracts for orchestration/providers',
    symbol: 'ORCHESTRATION_WS_METHODS',
    capture: 'analyzed',
  },
];

const investigationEdges = edges([
  ['adapter', 'contracts', 'imports_from'],
  ['ingestion', 'adapter', 'uses'],
  ['ingestion', 'contracts', 'references'],
]);

function InvestigationDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={investigationComponents}
        edges={investigationEdges}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        read-only investigation snapshot (grok 019fd2a9) — components analyzed, not edited
        {selected ? ` · selected: ${selected}` : ''}
      </div>
    </div>
  );
}

export const InvestigationDerived: Story = {
  render: () => <InvestigationDemo />,
};

// ---------------------------------------------------------------------------
// Mermaid diagram rendering pipeline (industry-themed-markdown)
// ---------------------------------------------------------------------------
const mermaidPurl = 'pkg:github/principal-ade/industry-themed-markdown';

const mermaidComponents: SubsystemComponent[] = [
  {
    id: 'input',
    name: 'MarkdownContent',
    kind: 'type',
    file: 'industryMarkdown/components/IndustryMarkdownSlide.tsx',
    purl: mermaidPurl,
    purpose: 'raw markdown string — the slide\u2019s input',
    symbol: 'MarkdownContent',
  },
  {
    id: 'slide',
    name: 'IndustryMarkdownSlide',
    kind: 'class',
    file: 'industryMarkdown/components/IndustryMarkdownSlide.tsx',
    purl: mermaidPurl,
    purpose: 'orchestrator — parses markdown into chunks, maps mermaid chunks to diagrams',
    symbol: 'IndustryMarkdownSlide',
  },
  {
    id: 'chunk',
    name: 'MermaidChunk',
    kind: 'type',
    file: 'industryMarkdown/types/customMarkdownChunks.ts',
    purl: mermaidPurl,
    purpose: 'parsed chunk — code string + id, the slide\u2019s output per mermaid block',
    symbol: 'MermaidChunk',
  },
  {
    id: 'lazy',
    name: 'IndustryLazyMermaidDiagram',
    kind: 'class',
    file: 'industryMarkdown/components/IndustryLazyMermaidDiagram.tsx',
    purl: mermaidPurl,
    purpose: 'IntersectionObserver lazy-loading wrapper \u2014 defers render until scrolled into view',
    symbol: 'IndustryLazyMermaidDiagram',
  },
  {
    id: 'diagram',
    name: 'IndustryMermaidDiagram',
    kind: 'class',
    file: 'industryMarkdown/components/IndustryMermaidDiagram.tsx',
    purl: mermaidPurl,
    purpose: 'core renderer \u2014 picks engine (beautiful-mermaid vs mermaid.js), renders themed SVG',
    symbol: 'IndustryMermaidDiagram',
  },
  {
    id: 'helpers',
    name: 'beautifulMermaid',
    kind: 'module',
    file: 'industryMarkdown/utils/beautifulMermaid.ts',
    purl: mermaidPurl,
    purpose: 'engine detection, theme\u2192options mapping, SVG post-processing',
    symbol: 'beautifulMermaid',
  },
];

const mermaidEdges = edges([
  ['input', 'slide', 'feeds'],
  ['slide', 'chunk', 'produces'],
  ['chunk', 'lazy', 'feeds'],
  ['lazy', 'diagram', 'wraps'],
  ['diagram', 'helpers', 'uses'],
]);

function MermaidDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={mermaidComponents}
        edges={mermaidEdges}
        onSelect={(id) => setSelected(id)}
      />
      <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, color: '#aaa' }}>
        mermaid diagram rendering pipeline — lazy → render → zoom → modal
        {selected ? ` · selected: ${selected}` : ''}
      </div>
    </div>
  );
}

export const MermaidPipeline: Story = {
  render: () => <MermaidDemo />,
};
