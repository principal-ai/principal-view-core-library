import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Served as a project site at https://<user>.github.io/principal-view-core-library/,
  // so all asset URLs must be prefixed with the repo subpath.
  base: '/principal-view-core-library/',
})
