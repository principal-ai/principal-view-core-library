# Trail viewer — local vs. remote modes

Design doc for splitting the standalone Electrobun trail viewer (`@principal-ai/trail-viewer`) into two operating modes so it can be used by people who **do** have the repo cloned and by people who **don't**, without forcing them to install the full Principal ADE desktop app.

Companion to:
- [`TRAIL_REPO_PURL_ROLLOUT.md`](https://github.com/principal-ai/industry-themed-file-city-panels) — phased adoption of `TrailRepo.id: Purl`. This doc assumes Phase 2 is done (CLI + trail-viewer surfaces in this repo are both already converted).
- The CLI `trail` command at [`packages/cli/src/commands/trail.ts`](../packages/cli/src/commands/trail.ts).
- The viewer host at [`packages/trail-viewer/src/bun/index.ts`](../packages/trail-viewer/src/bun/index.ts) and renderer at [`packages/trail-viewer/src/mainview/index.tsx`](../packages/trail-viewer/src/mainview/index.tsx).

## TL;DR

The viewer has one job: render a trail and resolve the file slices its markers point at. Today it does both from local disk. We're adding a second path that fetches the trail JSON from web-ade and resolves slices via the GitHub API — so a user with no clone of the repo can still walk the trail.

**Mode A — local.** Trail JSON from disk (or `~/.principal/trails/<ns>/<name>/<id>.json` cache). Slices resolved from a working tree at `repoRoot`. Today's behaviour, kept.

**Mode B — remote.** Trail JSON from `https://app.principal-ade.com/api/trails/by-id/<id>`. Slices resolved by fetching `raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>` keyed by `authoredAt.sha` (single-repo) or `repos[i].authoredAtSha` (multi-repo).

The CLI gains a `trail view <id>` subcommand that picks the mode automatically: clone present in Alexandria → A, clone absent → B. Users who want the other can override with a flag.

## Why

Two real-world entry points:

1. **You authored the trail.** You ran `principal-ai trail publish` from your working tree. You probably want to view it locally afterward — same tree, same paths, no network round-trip per click.
2. **Somebody sent you a trail link.** You don't have their repo cloned. You don't want to clone it just to read a trail walkthrough. You want to click through the markers and see the snippets the author chose.

Today only #1 works. #2 forces either "clone the repo first" or "install the full ADE desktop app." The viewer is supposed to be the lightweight option that bypasses both.

## Mode definitions

| Axis | Mode A (local) | Mode B (remote) |
|---|---|---|
| Trail JSON source | argv path / `TRAIL_FILE` env / `~/.principal/trails/...` cache | `https://app.principal-ade.com/api/trails/by-id/<id>` |
| Slice resolution | sandboxed `fs.readFile` under `repoRoot` | `raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>` |
| File tree shape | walk `repoRoot` minus `.git` / `node_modules` / dotfiles | derive from `markers[].sourcePath` set (no full tree) |
| Auth required | none | GitHub token for private repos and to escape the 60 req/hr anonymous rate limit |
| Sha pinning | not used; reads HEAD of working tree | required; `authoredAt.sha` (or per-repo `authoredAtSha`) determines which file version is fetched |
| Failure modes | path escape, file deleted, line range past EOF | network, 404 (file moved/renamed since `sha`), 403 (no read access), rate limit |

`authoredAt.sha` becoming load-bearing in Mode B is the most important single fact in this doc. Without a sha, the remote resolver has nothing to pin against and the snippet contents could drift under the reader's feet.

## Mode-selection logic

The CLI's new `trail view <id-or-url>` subcommand decides the mode and starts the viewer with the right inputs. Pseudocode:

```ts
const trail = readTrailCache(id) ?? await fetchAndCacheTrail(id);
const purl = trail.repos?.[0]?.id ?? authoredAtPurl(trail);
const localClone = purl ? findClonesByPurl(purl) : null;

if (opts.remote) launchViewer({ mode: 'remote', trail });
else if (opts.local) launchViewer({ mode: 'local', trail, repoRoot: opts.repoRoot ?? localClone });
else if (localClone) launchViewer({ mode: 'local', trail, repoRoot: localClone });
else launchViewer({ mode: 'remote', trail });
```

`findClonesByPurl` is the Alexandria registry lookup the rollout doc references (Phase 3 #1). For the v1 of this work we can shortcut to checking whether the *current working directory* of the CLI is a working tree of `repos[0]` — that's the common case (user runs `trail view <id>` from inside the repo). Full Alexandria lookup is a follow-up.

Flags:

- `--refresh` — bypass the trail-JSON cache and re-fetch.
- `--remote` — force Mode B even when a clone exists. Useful for previewing what a recipient will see.
- `--local [path]` — force Mode A and use `path` (or cwd) as `repoRoot`.

## Code surfaces that need to change

| # | Where | Change |
|---|---|---|
| 1 | `packages/cli/src/commands/trail.ts` | Add `trail view <id-or-url>` subcommand. Resolves trail JSON with cache, picks mode, spawns viewer. Needs cache helpers (read/write `~/.principal/trails/<ns>/<name>/<id>.json`) and a tiny clone-discovery helper. |
| 2 | `packages/cli/src/commands/trail.ts` | Factor token resolution (`resolveTokenViaGh` + `resolveTokenViaGitCredential`) so the viewer host can reuse it. Either move into a shared util the viewer can also import, or pass the token to the spawned viewer via env (`TRAIL_GH_TOKEN`). The env path is simpler and avoids the viewer needing its own gh-CLI dependency. |
| 3 | `packages/trail-viewer/src/bun/index.ts` | Add a `mode` discriminator. Today `loaded` is always `{ ok, payload, path }`; replace with `{ mode: 'local' | 'remote', payload, ... }`. Source-of-truth for mode: env (`TRAIL_MODE`) or inferred from absence of `TRAIL_REPO_ROOT`. |
| 4 | `packages/trail-viewer/src/bun/index.ts` (`readFile` RPC) | Two implementations behind the discriminator. Local: today's `resolveSandboxed` + `fs.readFile`. Remote: build the `raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>` URL from `repos[i]` (or `authoredAt`) matching the request's repo Purl, fetch with `Authorization: Bearer <TRAIL_GH_TOKEN>` if present, cache the response at `~/.principal/cache/files/<purl>/<sha>/<path>`. |
| 5 | `packages/trail-viewer/src/bun/index.ts` (`getFileTree` RPC) | In remote mode, derive a synthetic tree from `markers[].sourcePath` instead of walking `repoRoot`. Buildings only need to exist for paths the trail references — no full tree required. |
| 6 | `packages/trail-viewer/src/mainview/index.tsx` | Multi-repo `repository` resolution: when `payload.repos.length > 1`, the renderer needs to know which `repo` a given `readFile` call belongs to. Phase 3 #5 in the rollout doc covers the `(repo: Purl, path: string)` action contract. v1 single-repo can ship with the existing fallback we just put in. |
| 7 | `packages/trail-viewer/src/bun/index.ts` (RPC schema) | Extend `readFile` params from `{ path }` to `{ path, repo?: Purl }` so multi-repo trails can route the right slice request to the right `repos[i]`. Backward-compatible: missing `repo` falls back to `repos[0]` / `authoredAt`. |

Items 1–5 are the v1 minimum for a working `principal-ai trail view <id>` against single-repo trails. 6–7 are the multi-repo follow-up.

## Local storage layout

```
~/.principal/
├── trails/                     # Trail JSON cache, populated by `principal-ai trail view` and `principal-ai trail` (fetch).
│   └── <purl-namespace>/       # e.g. `principal-ai`
│       └── <purl-name>/        # e.g. `auth-server`
│           ├── <id>.json
│           └── ...
└── cache/
    └── files/                  # Sha-pinned file content cache, populated by viewer in Mode B.
        └── <purl-encoded>/     # e.g. `pkg-github-principal-ai-auth-server`
            └── <sha>/
                └── <path>      # e.g. `src/routes/workos.ts`
```

Why Purl-shaped paths instead of `<owner>/<repo>/`: matches Phase 3 #6 (share-anchor derivation from `parsePurl(repos[0].id)`) and gives a sensible spot for `pkg:generic/local/...` and `pkg:gitlab/...` trails without inventing a second naming scheme. The downside is paths look unfamiliar to humans browsing the cache — fine, this isn't user-facing.

## Caching policy

Trail JSON and file content have **different invariants** and need different policies.

**Trail JSON — mutable.** Re-publishing a trail with the same id replaces the server-side payload. Cache needs invalidation:

- Default TTL: 1 hour. Short enough that a re-publish reaches viewers within a working session, long enough to absorb repeat clicks.
- `--refresh` flag bypasses the cache entirely and rewrites it.
- If web-ade exposes `ETag` / `Last-Modified` on `/api/trails/by-id/<id>`, prefer conditional `GET` (`If-None-Match`) over wall-clock TTL — gets us "fresh on every click but cheap when unchanged" for free. Worth confirming with web-ade before committing to the TTL design.
- On a 304 Not Modified, refresh the cache file's mtime so the TTL extends.

**File content — immutable in practice.** Keyed by `(purl, sha, path)`. A `sha` is a content hash; the bytes at that path at that sha cannot change. Cache forever, no TTL needed.

- The only "invalidation" is disk-pressure cleanup. A trivial size cap (e.g. evict oldest when total cache exceeds 100MB) is enough; trail viewing is a tiny working set per session.
- Note: when GitHub returns 404 for `(sha, path)` because the path didn't exist at that commit, that's a *correct* answer — cache it as a negative result with a short TTL (~24h) so we don't re-hit the API on every click of the same dead marker.

## Authentication

GitHub token resolution order, matching what the CLI already does at `packages/cli/src/commands/trail.ts:31-60`:

1. `gh auth token` if `gh` is installed and authenticated.
2. `git credential fill` against `https://github.com` otherwise.
3. Fall back to anonymous request — works for public repos at the cost of a 60 req/hr rate limit.

The token never appears in argv, env exposed by `ps`, stdout, or stderr. The CLI passes it to the spawned viewer via the viewer's process env (`TRAIL_GH_TOKEN`), which is private to the child process tree; the viewer reads it once at boot and never logs it.

For non-GitHub remotes (`pkg:gitlab/...`, `pkg:bitbucket/...`), v1 falls back to anonymous. A real implementation per provider can land alongside the user demand for it.

## Single-repo vs multi-repo

| Property | Single-repo | Multi-repo |
|---|---|---|
| Sha source | `payload.authoredAt.sha` | `payload.repos[i].authoredAtSha` (per-repo) |
| Marker → repo binding | implicit; every marker belongs to the one repo | explicit `marker.repo: Purl` references `repos[i].id` |
| RPC `readFile` params | `{ path }` | `{ path, repo: Purl }` |
| Renderer `repository` | one entry, what we just fixed in `mainview/index.tsx` | one entry per repo, picked by marker context |

v1 of this doc's work targets single-repo. Multi-repo is a clean follow-up — the schema already carries everything we need (Phase 1), the missing pieces are the two RPC/renderer changes called out as items 6 and 7 above.

## Failure modes Mode B has and Mode A doesn't

Worth surfacing these in the UI as distinguishable error states rather than a generic "couldn't load":

- **404 on `(sha, path)`** — file was renamed or deleted between the trail being authored and the GitHub API request. Recoverable: show the marker description but suppress the snippet drawer with "file no longer at this path."
- **403 forbidden** — token lacks read scope, or the repo is private and we're anonymous. Tell the user how to authenticate (`gh auth login`).
- **Rate limit** — 60/hr anonymous, 5000/hr authenticated. Surface the `X-RateLimit-Reset` time and ask the user to retry or authenticate.
- **Stale trail JSON** — TTL hasn't expired but the server has a newer version. Recoverable via `--refresh`. If the viewer can detect this (e.g. it shows a `_revision` count and the server returns higher), surface a "newer version available" toast.

## Out of scope for v1

- **Non-GitHub providers.** GitLab and Bitbucket use the same Purl shape but different APIs; deferred until there's a user.
- **Authoring or editing trails inside the viewer.** The viewer is read-only. Annotations come from the renderer's note composer in the full ADE app, not here.
- **Offline mode.** If the trail JSON isn't cached and the network is down, Mode B fails. Acceptable — the same is true for the `trail` (fetch) command today.
- **Multi-repo Mode B.** Schema is ready, RPC + renderer aren't. Single-repo first.
- **Cross-host clone discovery.** v1 only checks the CLI's cwd for a clone; full Alexandria registry lookup is a follow-up.

## Open decisions

These don't block v1 but should be answered before a wider rollout:

1. **Conditional `GET` vs TTL** for trail-JSON cache. Depends on whether web-ade returns `ETag`. Lower-effort + better fidelity if it does.
2. **Mode discriminator surface**: env (`TRAIL_MODE=remote|local`) vs. inferred from absence of `TRAIL_REPO_ROOT`. Inferring is less explicit but means the CLI doesn't have to set an extra var. Lean toward explicit env so the viewer can be launched standalone for testing without a CLI in the loop.
3. **File-content cache cap**: hard 100MB? LRU? Per-trail quota? A trivial cap is fine for v1; a real eviction policy can wait.
4. **Negative-cache TTL for 404s**: 24h is a guess. If users frequently encounter dead markers across long-lived trails, this might want to be longer.
5. **What to do when Mode B's GitHub request 404s on a path that *does* exist locally** (because the user's clone is ahead of `authoredAt.sha`). Probably surface as "your clone has diverged from the trail's authored sha — view in Mode A to see your version, or `git checkout <sha>` to match."

## Rollout

This is a feature add, not a phased schema migration like `TRAIL_REPO_PURL_ROLLOUT.md`. The v1 path:

1. **Cache infra** (CLI). `~/.principal/trails/...` write/read helpers. No viewer changes yet — just makes the existing `trail <id>` (fetch) populate the cache as a side effect, and `trail view <id>` reads from it.
2. **Mode discriminator** (viewer host). Add the `mode` field, keep Mode A as the default, no Mode B implementation yet. Confirms nothing breaks.
3. **Mode B `readFile`** (viewer host). Implement against `raw.githubusercontent.com`. Test against a public repo trail end-to-end.
4. **Mode B `getFileTree`** (viewer host). Synthesize from `markers[].sourcePath`.
5. **CLI `trail view <id>`** (CLI). Wire the mode picker, spawn the viewer with the right env. This is the user-facing milestone.
6. (Follow-up) Multi-repo RPC + renderer changes.
7. (Follow-up) Alexandria-based clone discovery.

Each step is independently shippable and reversible. The first user-visible value lands at step 5; the steps before it are all internal plumbing that doesn't change observable behaviour.
