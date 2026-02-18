import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    preset: 'src/preset.ts',
    manager: 'src/manager.tsx',
    preview: 'src/preview.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: false, // Already cleaned by build:clean script
  splitting: false, // Disable code splitting to avoid duplicate module loading
  bundle: true, // Bundle all dependencies except external
  external: [
    'react',
    'react-dom',
    'storybook',
    '@opentelemetry/api',
  ],
  noExternal: [
    /@opentelemetry\/.*/,
  ],
  esbuildOptions(options) {
    options.conditions = ['module', 'browser'];
    options.platform = 'browser';
    options.mainFields = ['browser', 'module', 'main'];
  },
});
