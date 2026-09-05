import React from 'react';
import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../../../subsystem/SubsystemComponentGraph';
import type {
  SubsystemComponent,
  SubsystemComponentEdge,
  SubsystemThroughline,
} from '../../../subsystem/model';

const meta = {
  title: 'Subsystem/ComponentGraph/Flows',
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
// Mirror of the retrofitted electron-app drawing graph: the sidebar's Files
// panel swaps to a Flows panel listing three throughlines (open / save /
// delete). Clicking a flow row toggles its steps; clicking a step focuses
// that step's edge and frames it on the canvas. Other opened flows stay
// dimmed; the rest of the graph is hidden.
// ---------------------------------------------------------------------------

const drawingComponents: SubsystemComponent[] = [
  {
    id: 'panel',
    name: 'DrawingsLeftPanel',
    construct: 'class',
    file: 'src/panels/DrawingsLeftPanel.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'lists drawings; emits open/delete intents',
    symbol: 'DrawingsLeftPanel',
    process: 'draw-list',
  },
  {
    id: 'host',
    name: 'useDrawingsHost',
    construct: 'function',
    file: 'src/hooks/useDrawingsHost.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'hosts drawing CRUD; dispatches to storage and shell',
    symbol: 'useDrawingsHost',
    process: 'draw-list',
  },
  {
    id: 'storage',
    name: 'DrawingsStorage',
    construct: 'class',
    file: 'src/storage/drawingsStorage.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'persists drawings as files',
    symbol: 'DrawingsStorage',
    process: 'draw-host',
  },
  {
    id: 'fs',
    name: 'FileSystemService',
    construct: 'external',
    file: 'src/services/fileSystem.ts',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'sandboxed host fd/fs access',
    symbol: 'FileSystemService',
    role: 'service',
  },
  {
    id: 'shell',
    name: 'WorkspaceShell',
    construct: 'class',
    file: 'src/workspace/WorkspaceShell.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'mounts tabs for opened drawings',
    symbol: 'WorkspaceShell',
    process: 'draw-host',
  },
  {
    id: 'tab',
    name: 'DrawingTabContent',
    construct: 'class',
    file: 'src/components/DrawingTabContent.tsx',
    purl: 'pkg:github/principal-ai/desktop-app',
    purpose: 'loads/saves an open drawing',
    symbol: 'DrawingTabContent',
    process: 'draw-host',
  },
];

const drawingEdges: SubsystemComponentEdge[] = [
  { id: 'e-scan', from: 'panel', to: 'storage', mechanism: 'calls' },
  { id: 'e-open-event', from: 'panel', to: 'host', mechanism: 'produces' },
  { id: 'e-refresh', from: 'host', to: 'panel', mechanism: 'produces' },
  { id: 'e-open', from: 'host', to: 'storage', mechanism: 'calls' },
  { id: 'e-read', from: 'storage', to: 'fs', mechanism: 'calls' },
  { id: 'e-delete', from: 'host', to: 'fs', mechanism: 'calls' },
  { id: 'e-show', from: 'host', to: 'shell', mechanism: 'produces' },
  { id: 'e-mount', from: 'shell', to: 'tab', mechanism: 'feeds' },
  { id: 'e-tab-io', from: 'tab', to: 'fs', mechanism: 'calls' },
  { id: 'e-saved-event', from: 'tab', to: 'host', mechanism: 'produces' },
];

const drawingThroughlines: SubsystemThroughline[] = [
  {
    id: 'tl-open-drawing',
    title: 'Open drawing',
    steps: [
      { edgeId: 'e-scan', file: 'src/panels/DrawingsLeftPanel.tsx', line: 56, symbol: 'DrawingsLeftPanel.scan' },
      { edgeId: 'e-open-event', file: 'src/panels/DrawingsLeftPanel.tsx', line: 85, symbol: 'DrawingsLeftPanel.openDrawing' },
      { edgeId: 'e-open', file: 'src/hooks/useDrawingsHost.ts', line: 45, symbol: 'useDrawingsHost.openDrawing' },
      { edgeId: 'e-show', file: 'src/workspace/WorkspaceShell.tsx', line: 369, symbol: 'WorkspaceShell.openTab' },
      { edgeId: 'e-mount', file: 'src/workspace/WorkspaceShell.tsx', line: 372, symbol: 'WorkspaceShell.mountTab' },
      { edgeId: 'e-read', file: 'src/storage/drawingsStorage.ts', line: 90, symbol: 'DrawingsStorage.read' },
      { edgeId: 'e-tab-io', file: 'src/components/DrawingTabContent.tsx', line: 83, symbol: 'DrawingTabContent.load' },
    ],
  },
  {
    id: 'tl-save-drawing',
    title: 'Save drawing',
    steps: [
      { edgeId: 'e-tab-io', file: 'src/components/DrawingTabContent.tsx', line: 112, symbol: 'DrawingTabContent.save' },
      { edgeId: 'e-saved-event', file: 'src/components/DrawingTabContent.tsx', line: 121, symbol: 'DrawingTabContent.emitSaved' },
      { edgeId: 'e-refresh', file: 'src/hooks/useDrawingsHost.ts', line: 64, symbol: 'useDrawingsHost.onSaved' },
      { edgeId: 'e-scan', file: 'src/panels/DrawingsLeftPanel.tsx', line: 56, symbol: 'DrawingsLeftPanel.scan' },
    ],
  },
  {
    id: 'tl-delete-drawing',
    title: 'Delete drawing',
    steps: [
      { edgeId: 'e-delete', file: 'src/hooks/useDrawingsHost.ts', line: 64, symbol: 'useDrawingsHost.deleteDrawing' },
      { edgeId: 'e-refresh', file: 'src/hooks/useDrawingsHost.ts', line: 66, symbol: 'useDrawingsHost.refreshList' },
      { edgeId: 'e-scan', file: 'src/panels/DrawingsLeftPanel.tsx', line: 56, symbol: 'DrawingsLeftPanel.scan' },
    ],
  },
];

function FlowsDemo() {
  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SubsystemComponentGraph
        components={drawingComponents}
        edges={drawingEdges}
        throughlines={drawingThroughlines}
        title="drawing-files flow"
        description="Three throughlines over one graph — opening, saving, and deleting a drawing. The sidebar's **Flows** panel lists each step by **symbol** (the frame at that hop); clicking a step focuses that edge on the canvas."
        renderFileViewer={(file, opts) => (
          <div
            style={{
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 12,
              color: '#bbb',
              whiteSpace: 'pre',
            }}
          >
            {`// ${file}`}
            {opts?.startLine != null ? `\n  // → focus line ${opts.startLine}` : ''}
            {'\n  …'}
          </div>
        )}
      />
    </div>
  );
}

export const ThreeFlows: Story = {
  render: () => <FlowsDemo />,
};