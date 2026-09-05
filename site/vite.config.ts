import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const siteRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(siteRoot, '..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served as a project site at https://<user>.github.io/principal-view-core-library/,
  // so all asset URLs must be prefixed with the repo subpath.
  base: '/principal-view-core-library/',
  resolve: {
    alias: {
      '@schemas': path.resolve(repoRoot, 'packages/core/schemas'),
    },
  },
  server: {
    fs: {
      // Allow importing the live schema from packages/core during dev.
      allow: [repoRoot],
    },
  },
  optimizeDeps: {
    include: [
      '@stoplight/json-schema-viewer',
      '@stoplight/mosaic',
      '@stoplight/mosaic-code-viewer',
      '@stoplight/markdown-viewer',
    ],
  },
})
