import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Showcase Storybook — public gallery of Subsystem View use cases.
 *
 * Deliberately separate from the internal component-development storybook
 * (.storybook): it only picks up stories from `showcase/`, so internal
 * Subsystem stories never appear in the deployed gallery.
 *
 * Deployed to GitHub Pages at /<repo>/examples/ via .github/workflows/pages.yml.
 * STORYBOOK_BASE_PATH is set in CI; unset it locally for `storybook dev`.
 */
const config: StorybookConfig = {
  stories: ['../showcase/**/*.mdx', '../showcase/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-links', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    check: false,
  },
  async viteFinal(config) {
    if (config.resolve) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@storybook/blocks': '@storybook/addon-docs/blocks',
        'handlebars': 'handlebars/dist/handlebars.js',
      };
    }

    const basePath = process.env.STORYBOOK_BASE_PATH;
    if (basePath) {
      config.base = basePath;
    }

    return config;
  },
};

export default config;
