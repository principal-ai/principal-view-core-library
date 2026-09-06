import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemComponentEdge } from '../../../subsystem/model';

const meta = {
  title: 'Subsystem/ComponentGraph/FrameworkStereotype',
  component: SubsystemComponentGraph,
  parameters: { layout: 'fullscreen' },
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

const purl = 'pkg:github/principal-ai/principal-view-core-library';

/**
 * Same language construct (`function`) with and without framework stereotypes.
 * Badge text prefers `framework · stereotype` so UI units read as components /
 * hooks instead of plain functions; construct color stays function-indigo.
 */
const reactUiComponents: SubsystemComponent[] = [
  {
    id: 'create-graph',
    name: 'createSubsystemGraph',
    construct: 'function',
    file: 'packages/trail-viewer/src/bun/subsystem-graph-store.ts',
    purl,
    symbol: 'createSubsystemGraph',
    purpose: 'language-only helper — no framework / stereotype',
    process: 'trail-viewer/host',
    layer: 1,
  },
  {
    id: 'http-entry',
    name: 'handleSubsystemGraphRequest',
    construct: 'function',
    file: 'packages/trail-viewer/src/bun/http-server.ts',
    purl,
    symbol: 'handleSubsystemGraphRequest',
    purpose: 'HTTP bridge entry — topology role, still no React stereotype',
    role: 'entry',
    process: 'trail-viewer/host',
    layer: 1,
  },
  {
    id: 'sessions-view',
    name: 'AgentSessionsOverviewView',
    construct: 'function',
    file: 'packages/trail-viewer/src/mainview/views/AgentSessions.tsx',
    purl,
    symbol: 'AgentSessionsOverviewView',
    purpose: 'React view — construct stays function; stereotype labels it',
    framework: 'react',
    stereotype: 'component',
    process: 'trail-viewer/renderer',
    layer: 2,
  },
  {
    id: 'analysis-view',
    name: 'AnalysisView',
    construct: 'function',
    file: 'packages/trail-viewer/src/mainview/views/AnalysisView.tsx',
    purl,
    symbol: 'AnalysisView',
    purpose: 'another React component alongside a hook',
    framework: 'react',
    stereotype: 'component',
    process: 'trail-viewer/renderer',
    layer: 2,
  },
  {
    id: 'drawings-host',
    name: 'useDrawingsHost',
    construct: 'function',
    file: 'packages/trail-viewer/src/mainview/hooks/useDrawingsHost.ts',
    purl,
    symbol: 'useDrawingsHost',
    purpose: 'React hook — same construct, different stereotype',
    framework: 'react',
    stereotype: 'hook',
    process: 'trail-viewer/renderer',
    layer: 2,
  },
  {
    id: 'graph-doc-type',
    name: 'SubsystemGraphDocument',
    construct: 'type_alias',
    file: 'packages/core/src/types/subsystem-graph.ts',
    purl,
    symbol: 'SubsystemGraphDocument',
    purpose: 'type-only — framework / stereotype stay empty',
    layer: 3,
  },
];

const reactUiEdges: SubsystemComponentEdge[] = [
  {
    id: 'http-to-create',
    from: 'http-entry',
    to: 'create-graph',
    mechanism: 'calls',
  },
  {
    id: 'sessions-uses-hook',
    from: 'sessions-view',
    to: 'drawings-host',
    mechanism: 'uses',
  },
  {
    id: 'analysis-uses-type',
    from: 'analysis-view',
    to: 'graph-doc-type',
    mechanism: 'references',
  },
  {
    id: 'sessions-to-analysis',
    from: 'sessions-view',
    to: 'analysis-view',
    mechanism: 'feeds',
  },
];

export const ReactComponentsAndHooks: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Framework + stereotype"
        description="construct stays language-shaped (function / type_alias). framework + stereotype label React units as component / hook without inventing a react_component construct. Empty fields mean language-only."
        components={reactUiComponents}
        edges={reactUiEdges}
      />
    </div>
  ),
};

/** Nest-style stereotypes on the same ontology — controller / middleware / guard. */
const nestComponents: SubsystemComponent[] = [
  {
    id: 'graphs-controller',
    name: 'SubsystemGraphsController',
    construct: 'class',
    file: 'src/graphs/graphs.controller.ts',
    purl: 'pkg:github/acme/api',
    symbol: 'SubsystemGraphsController',
    purpose: 'Nest HTTP controller',
    framework: 'nestjs',
    stereotype: 'controller',
    role: 'entry',
    layer: 1,
  },
  {
    id: 'auth-guard',
    name: 'AuthGuard',
    construct: 'class',
    file: 'src/auth/auth.guard.ts',
    purl: 'pkg:github/acme/api',
    symbol: 'AuthGuard',
    purpose: 'request guard',
    framework: 'nestjs',
    stereotype: 'guard',
    layer: 1,
  },
  {
    id: 'logging-mw',
    name: 'LoggingMiddleware',
    construct: 'function',
    file: 'src/logging/logging.middleware.ts',
    purl: 'pkg:github/acme/api',
    symbol: 'LoggingMiddleware',
    purpose: 'Express-style middleware function under Nest',
    framework: 'nestjs',
    stereotype: 'middleware',
    layer: 1,
  },
  {
    id: 'graphs-service',
    name: 'GraphsService',
    construct: 'class',
    file: 'src/graphs/graphs.service.ts',
    purl: 'pkg:github/acme/api',
    symbol: 'GraphsService',
    purpose: 'injectable service — stereotype without UI',
    framework: 'nestjs',
    stereotype: 'injectable',
    layer: 2,
  },
];

const nestEdges: SubsystemComponentEdge[] = [
  { id: 'mw-to-guard', from: 'logging-mw', to: 'auth-guard', mechanism: 'uses' },
  { id: 'guard-to-ctrl', from: 'auth-guard', to: 'graphs-controller', mechanism: 'uses' },
  { id: 'ctrl-to-svc', from: 'graphs-controller', to: 'graphs-service', mechanism: 'calls' },
];

export const NestControllerStack: Story = {
  render: () => (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        title="Nest framework stereotypes"
        description="Same optional fields work outside React: class/function constructs plus nestjs controller / guard / middleware / injectable stereotypes."
        components={nestComponents}
        edges={nestEdges}
      />
    </div>
  ),
};
