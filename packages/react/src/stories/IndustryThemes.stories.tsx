import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GraphRenderer } from '../components/GraphRenderer';
import type { ExtendedCanvas } from '@principal-ai/principal-view-core';
import {
  terminalTheme,
  matrixTheme,
  slateTheme,
  regalTheme,
  glassmorphismTheme,
  landingPageTheme,
  defaultEditorTheme,
  ThemeProvider,
} from '@principal-ade/industry-theme';

const meta = {
  title: 'Themes/IndustryThemes',
  component: GraphRenderer,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof GraphRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Theme Registry from @principal-ade/industry-theme
// ============================================================================

interface IndustryTheme {
  colors: {
    text: string;
    background: string;
    primary: string;
    secondary: string;
    accent: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    border: string;
    surface: string;
    [key: string]: string;
  };
  fonts: {
    body: string;
    heading: string;
    monospace: string;
  };
  [key: string]: unknown;
}

const themes: Record<string, { theme: IndustryTheme; name: string; description: string }> = {
  terminal: {
    theme: terminalTheme as IndustryTheme,
    name: 'Terminal',
    description: 'Dark terminal-style theme with monospace fonts',
  },
  matrix: {
    theme: matrixTheme as IndustryTheme,
    name: 'Matrix',
    description: 'Green-on-black hacker aesthetic',
  },
  slate: {
    theme: slateTheme as IndustryTheme,
    name: 'Slate',
    description: 'Modern dark gray theme with amber accents',
  },
  regal: {
    theme: regalTheme as IndustryTheme,
    name: 'Regal',
    description: 'Elegant dark theme with gold accents',
  },
  glassmorphism: {
    theme: glassmorphismTheme as IndustryTheme,
    name: 'Glassmorphism',
    description: 'Frosted glass effect with purple tones',
  },
  landingPage: {
    theme: landingPageTheme as IndustryTheme,
    name: 'Landing Page',
    description: 'Cyan accent on dark background',
  },
  editor: {
    theme: defaultEditorTheme as IndustryTheme,
    name: 'Editor',
    description: 'VS Code inspired dark theme',
  },
};

// ============================================================================
// Sample Canvas that uses theme colors
// ============================================================================

function createThemedCanvas(theme: IndustryTheme): ExtendedCanvas {
  const colors = theme.colors;

  return {
    nodes: [
      {
        id: 'api-gateway',
        type: 'text',
        x: 100,
        y: 200,
        width: 140,
        height: 70,
        text: '# API Gateway',
        pv: {
          nodeType: 'api-gateway',
          shape: 'rectangle',
          icon: 'Globe',
          fill: colors.primary,
        },
      },
      {
        id: 'auth-service',
        type: 'text',
        x: 320,
        y: 100,
        width: 140,
        height: 70,
        text: '# Auth Service',
        pv: {
          nodeType: 'service',
          shape: 'hexagon',
          icon: 'Shield',
          fill: colors.success,
        },
      },
      {
        id: 'user-service',
        type: 'text',
        x: 320,
        y: 300,
        width: 140,
        height: 70,
        text: '# User Service',
        pv: {
          nodeType: 'service',
          shape: 'hexagon',
          icon: 'Users',
          fill: colors.info,
        },
      },
      {
        id: 'database',
        type: 'text',
        x: 540,
        y: 200,
        width: 100,
        height: 100,
        text: '# Database',
        pv: {
          nodeType: 'database',
          shape: 'circle',
          icon: 'Database',
          fill: colors.secondary,
        },
      },
      {
        id: 'cache',
        type: 'text',
        x: 540,
        y: 350,
        width: 80,
        height: 80,
        text: '# Cache',
        pv: {
          nodeType: 'cache',
          shape: 'diamond',
          icon: 'Zap',
          fill: colors.warning,
        },
      },
      {
        id: 'queue',
        type: 'text',
        x: 320,
        y: 450,
        width: 80,
        height: 80,
        text: '# Queue',
        pv: {
          nodeType: 'queue',
          shape: 'diamond',
          icon: 'Inbox',
          fill: colors.accent,
        },
      },
    ],
    edges: [
      {
        id: 'e1',
        fromNode: 'api-gateway',
        toNode: 'auth-service',
        fromSide: 'right',
        toSide: 'left',
        pv: { edgeType: 'http' },
      },
      {
        id: 'e2',
        fromNode: 'api-gateway',
        toNode: 'user-service',
        fromSide: 'right',
        toSide: 'left',
        pv: { edgeType: 'http' },
      },
      {
        id: 'e3',
        fromNode: 'auth-service',
        toNode: 'database',
        fromSide: 'right',
        toSide: 'left',
        pv: { edgeType: 'query' },
      },
      {
        id: 'e4',
        fromNode: 'user-service',
        toNode: 'database',
        fromSide: 'right',
        toSide: 'left',
        pv: { edgeType: 'query' },
      },
      {
        id: 'e5',
        fromNode: 'user-service',
        toNode: 'cache',
        fromSide: 'right',
        toSide: 'top',
        pv: { edgeType: 'cache' },
      },
      {
        id: 'e6',
        fromNode: 'user-service',
        toNode: 'queue',
        fromSide: 'bottom',
        toSide: 'top',
        pv: { edgeType: 'async' },
      },
    ],
    pv: {
      version: '1.0.0',
      name: 'Themed Architecture',
      edgeTypes: {
        http: { style: 'solid', color: colors.primary, directed: true },
        query: { style: 'dashed', color: colors.secondary, directed: true },
        cache: { style: 'dotted', color: colors.warning, directed: true },
        async: { style: 'dashed', color: colors.accent, directed: true },
      },
    },
  };
}

// ============================================================================
// Interactive Theme Switcher Component
// ============================================================================

const ThemeSwitcher = () => {
  const [selectedTheme, setSelectedTheme] = useState<string>('terminal');
  const themeConfig = themes[selectedTheme];
  const canvas = createThemedCanvas(themeConfig.theme);

  return (
    <ThemeProvider theme={themeConfig.theme}>
      <div
        style={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: themeConfig.theme.colors.background,
          color: themeConfig.theme.colors.text,
          fontFamily: themeConfig.theme.fonts.body,
        }}
      >
        {/* Theme Selector Header */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: themeConfig.theme.colors.surface,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            borderBottom: `1px solid ${themeConfig.theme.colors.border}`,
          }}
        >
          <label style={{ fontWeight: 600, fontSize: '14px' }}>Theme:</label>
          <select
            value={selectedTheme}
            onChange={(e) => setSelectedTheme(e.target.value)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              borderRadius: '6px',
              border: `1px solid ${themeConfig.theme.colors.border}`,
              backgroundColor: themeConfig.theme.colors.background,
              color: themeConfig.theme.colors.text,
              cursor: 'pointer',
              minWidth: '200px',
            }}
          >
            {Object.entries(themes).map(([key, config]) => (
              <option key={key} value={key}>
                {config.name}
              </option>
            ))}
          </select>

          <div style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.7 }}>
            @principal-ade/industry-theme
          </div>
        </div>

        {/* Theme Description */}
        <div
          style={{
            padding: '12px 24px',
            backgroundColor: themeConfig.theme.colors.surface,
            borderBottom: `1px solid ${themeConfig.theme.colors.border}`,
            fontSize: '13px',
            opacity: 0.8,
          }}
        >
          <strong>{themeConfig.name}</strong>: {themeConfig.description}
        </div>

        {/* Graph Renderer */}
        <div style={{ flex: 1, position: 'relative' }}>
          <GraphRenderer canvas={canvas} width="100%" height="100%" />
        </div>

        {/* Color Palette Legend */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: themeConfig.theme.colors.surface,
            borderTop: `1px solid ${themeConfig.theme.colors.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {['primary', 'secondary', 'accent', 'success', 'warning', 'error', 'info'].map((colorKey) => (
            <div
              key={colorKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  backgroundColor: themeConfig.theme.colors[colorKey],
                  border: `1px solid ${themeConfig.theme.colors.border}`,
                }}
              />
              <span style={{ fontFamily: themeConfig.theme.fonts.monospace }}>{colorKey}</span>
            </div>
          ))}
        </div>
      </div>
    </ThemeProvider>
  );
};

// ============================================================================
// Stories
// ============================================================================

export const ThemeSwitcherDemo: Story = {
  render: () => <ThemeSwitcher />,
  parameters: {
    docs: {
      description: {
        story: `
**Industry Theme Switcher**

This demo uses the \`@principal-ade/industry-theme\` package to apply different visual themes to the graph.

Available themes:
- **Terminal**: Dark terminal-style with monospace fonts
- **Matrix**: Green-on-black hacker aesthetic
- **Slate**: Modern dark gray with amber accents
- **Regal**: Elegant dark theme with gold accents
- **Glassmorphism**: Frosted glass effect with purple tones
- **Landing Page**: Cyan accent on dark background
- **Editor**: VS Code inspired dark theme

Each theme provides a cohesive color palette that is applied to:
- Node fill colors
- Edge colors
- Background and UI elements
        `,
      },
    },
  },
};

// Individual theme stories for direct access
export const TerminalTheme: Story = {
  render: () => {
    const canvas = createThemedCanvas(terminalTheme as IndustryTheme);
    return (
      <div style={{ backgroundColor: terminalTheme.colors.background, padding: 20 }}>
        <GraphRenderer canvas={canvas} width={800} height={500} />
      </div>
    );
  },
};

export const MatrixTheme: Story = {
  render: () => {
    const canvas = createThemedCanvas(matrixTheme as IndustryTheme);
    return (
      <div style={{ backgroundColor: matrixTheme.colors.background, padding: 20 }}>
        <GraphRenderer canvas={canvas} width={800} height={500} />
      </div>
    );
  },
};

export const SlateTheme: Story = {
  render: () => {
    const canvas = createThemedCanvas(slateTheme as IndustryTheme);
    return (
      <div style={{ backgroundColor: slateTheme.colors.background, padding: 20 }}>
        <GraphRenderer canvas={canvas} width={800} height={500} />
      </div>
    );
  },
};

export const RegalTheme: Story = {
  render: () => {
    const canvas = createThemedCanvas(regalTheme as IndustryTheme);
    return (
      <div style={{ backgroundColor: regalTheme.colors.background, padding: 20 }}>
        <GraphRenderer canvas={canvas} width={800} height={500} />
      </div>
    );
  },
};

export const GlassmorphismTheme: Story = {
  render: () => {
    const canvas = createThemedCanvas(glassmorphismTheme as IndustryTheme);
    return (
      <div style={{ backgroundColor: glassmorphismTheme.colors.background, padding: 20 }}>
        <GraphRenderer canvas={canvas} width={800} height={500} />
      </div>
    );
  },
};

export const LandingPageTheme: Story = {
  render: () => {
    const canvas = createThemedCanvas(landingPageTheme as IndustryTheme);
    return (
      <div style={{ backgroundColor: landingPageTheme.colors.background, padding: 20 }}>
        <GraphRenderer canvas={canvas} width={800} height={500} />
      </div>
    );
  },
};

export const EditorTheme: Story = {
  render: () => {
    const canvas = createThemedCanvas(defaultEditorTheme as IndustryTheme);
    return (
      <div style={{ backgroundColor: defaultEditorTheme.colors.background, padding: 20 }}>
        <GraphRenderer canvas={canvas} width={800} height={500} />
      </div>
    );
  },
};
