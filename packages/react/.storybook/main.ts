import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  async viteFinal(config) {
    // Add plugin to handle .canvas files as JSON modules
    const fs = await import('fs');

    config.plugins = config.plugins || [];
    config.plugins.push({
      name: 'canvas-json-loader',
      enforce: 'pre',
      load(id) {
        if (id.endsWith('.canvas')) {
          const jsonContent = fs.readFileSync(id, 'utf-8');
          const parsed = JSON.parse(jsonContent);
          return `export default ${JSON.stringify(parsed)}`;
        }
      },
    });

    return config;
  },
};

export default config;
