# Site

React + TypeScript + Vite app deployed to GitHub Pages at
`https://principal-ai.github.io/principal-view-core-library/`.

It lives in `site/` (top level, not `packages/`) because it is not a
publishable npm package — it is never built or released by the root
`bun run build` flow.

## Develop

```bash
cd site
bun install
bun dev
```

## Build

```bash
bun run build
```

This typechecks, bundles to `dist/`, and copies `dist/index.html` to
`dist/404.html` so client-side routes survive refreshes and deep links
on GitHub Pages.

## Deploy

Deploys happen automatically via `.github/workflows/pages.yml` on pushes
to `main` that touch `site/`. One-time setup: in the repo on GitHub, go to
**Settings → Pages** and set **Source** to **GitHub Actions**.

## GitHub Pages specifics

- `vite.config.ts` sets `base: '/principal-view-core-library/'` because a
  project site is served from a repo subpath, not the domain root.
- The router uses `basename={import.meta.env.BASE_URL}` so it stays in
  sync with that base automatically.
- If the repo is ever renamed, update `base` in `vite.config.ts`.
