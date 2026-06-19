/**
 * Trail viewer host (bun process).
 *
 * Receives a trail file path via argv[2] (or TRAIL_FILE env), optional repo
 * root via argv[3] (or TRAIL_REPO_ROOT env, default cwd), and exposes a tiny
 * RPC surface to the mainview so it can render the trail and resolve slice
 * snippets.
 *
 * Slice resolution has two modes (see docs/TRAIL_VIEWER_MODES.md):
 *   - 'local' (default): files come from the working tree at repoRoot.
 *   - 'remote':          files come from raw.githubusercontent.com keyed by
 *                        each repo's authored sha. Selected via TRAIL_MODE env.
 *
 * Replaces the prior OTEL events manager prototype; see git history if you
 * need that back.
 */

import {
	ApplicationMenu,
	BrowserView,
	BrowserWindow,
	Utils,
	type RPCSchema,
} from "electrobun/bun";
import { promises as fs } from "node:fs";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
	extractPurlFromRemoteUrl,
	parsePurl,
} from "@principal-ai/alexandria-core-library";
import { parseTourOrThrow } from "@principal-ai/file-city-builder";
import { readFileRemote as fetchRemoteSlice } from "./remote-files";
import { handoffToRunning, startIpcServer, type LoadTrailMessage } from "./ipc";
import {
	walkLibrary,
	resolveLocalRepoIdentity,
	resolveUserIdentity,
	type LibraryEntry,
	type UserIdentity,
} from "./library";

const LIBRARY_TAB_ID = "library";

// ---------------------------------------------------------------------------
// CLI args / env
// ---------------------------------------------------------------------------

type ViewerMode = "local" | "remote";

function resolveMode(): ViewerMode {
	const raw = process.env["TRAIL_MODE"];
	if (raw === "remote") return "remote";
	if (raw === "local" || raw === undefined || raw === "") return "local";
	console.warn(
		`[trail-viewer] unknown TRAIL_MODE='${raw}', falling back to 'local'`,
	);
	return "local";
}

function resolveTrailFilePath(): string | null {
	const argPath = process.argv[2];
	const envPath = process.env["TRAIL_FILE"];
	const raw = argPath ?? envPath ?? null;
	if (!raw) return null;
	return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function resolveRepoRoot(trailFilePath: string | null): string {
	const argRoot = process.argv[3];
	const envRoot = process.env["TRAIL_REPO_ROOT"];
	const raw = argRoot ?? envRoot;
	if (raw) return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
	// Sensible default: parent dir of the trail file. Lets `principal-ai trail
	// view` drop a json next to a repo and have things "just work".
	if (trailFilePath) return dirname(trailFilePath);
	return process.cwd();
}

// Per-tab state. Trail tabs are fully self-contained views of one trail; the
// library tab is a permanent first tab that lists cached trails. Tabs from
// different repos do not share env vars, repoRoot, or sandboxing.
interface TrailTabState {
	id: string;
	kind: "trail";
	title: string;
	mode: ViewerMode;
	/** Whether this tab holds a trail (`markers`/`views`) or a File City
	 *  introduction tour (`steps` + `focusDirectory`). Both render in the same
	 *  tab machinery; only the renderer's panel choice differs. */
	payloadKind: PayloadKind;
	trailFilePath: string;
	repoRoot: string;
	loaded: LoadedTrail;
	repoOwner?: string;
	repoName?: string;
	repoPurl?: string;
	ghToken?: string;
}

interface LibraryTabState {
	id: typeof LIBRARY_TAB_ID;
	kind: "library";
	title: "Trail Library";
}

type TabState = LibraryTabState | TrailTabState;

const tabs = new Map<string, TabState>();
tabs.set(LIBRARY_TAB_ID, {
	id: LIBRARY_TAB_ID,
	kind: "library",
	title: "Trail Library",
});
let activeTabId: string = LIBRARY_TAB_ID;
let nextTabId = 1;

// Pre-load the payload so the renderer's first read is synchronous and any
// parse error surfaces at boot rather than after the window is up.
type PayloadKind = "trail" | "tour";

type LoadedTrail =
	| { ok: true; payload: unknown; path: string; payloadKind: PayloadKind }
	| { ok: false; error: string };

/**
 * Distinguish a File City introduction tour from a trail. The filename is the
 * canonical signal — the tours skill always writes `*.tour.json` — with a
 * payload-shape fallback (`steps[]` and no `markers`) for files that don't
 * carry the suffix.
 */
function detectPayloadKind(path: string, payload: unknown): PayloadKind {
	if (/\.tour\.json$/i.test(path)) return "tour";
	if (typeof payload === "object" && payload !== null) {
		const obj = payload as Record<string, unknown>;
		if (Array.isArray(obj["steps"]) && !("markers" in obj)) return "tour";
	}
	return "trail";
}

/**
 * web-ade's `/api/trails/by-id/<id>` returns a wrapper around the trail
 * payload: `{ entry, owner, repo, payload }`. Hand-authored / local files are
 * just the bare TrailPayload. Detect the wrapper and unwrap so the renderer
 * always sees `{ markers, views, ... }` directly.
 */
function unwrapPayload(raw: unknown): unknown {
	if (typeof raw !== "object" || raw === null) return raw;
	const obj = raw as Record<string, unknown>;
	const inner = obj["payload"];
	if (
		typeof inner === "object" &&
		inner !== null &&
		"markers" in (inner as Record<string, unknown>)
	) {
		return inner;
	}
	return raw;
}

function loadTrailFile(path: string | null): LoadedTrail {
	if (!path) {
		return {
			ok: false,
			error:
				"No trail file. Pass a path as the first arg or set TRAIL_FILE=<path>.",
		};
	}
	try {
		const raw = readFileSync(path, "utf8");
		const parsed = unwrapPayload(JSON.parse(raw));
		const payloadKind = detectPayloadKind(path, parsed);
		// Validate tours up front so a malformed *.tour.json fails at load with a
		// clear message rather than silently rendering an idle, empty city.
		if (payloadKind === "tour") parseTourOrThrow(JSON.stringify(parsed));
		return { ok: true, payload: parsed, path, payloadKind };
	} catch (err) {
		return {
			ok: false,
			error: `Failed to load ${path}: ${(err as Error).message}`,
		};
	}
}

/**
 * Resolve a marker's `sourcePath` against a tab's repoRoot, refusing path
 * traversal. Returns the absolute path on disk.
 */
function resolveSandboxed(repoRoot: string, rawPath: string): string {
	let cleaned = rawPath;
	if (cleaned.startsWith("/")) cleaned = cleaned.slice(1);
	if (cleaned.startsWith("GitHub/")) cleaned = cleaned.slice("GitHub/".length);
	const absolute = resolve(repoRoot, cleaned);
	if (!absolute.startsWith(repoRoot)) {
		throw new Error(`Path escapes repo root: ${rawPath}`);
	}
	return absolute;
}

function deriveTitle(loaded: LoadedTrail, fallbackPath: string): string {
	if (loaded.ok && typeof loaded.payload === "object" && loaded.payload !== null) {
		const t = (loaded.payload as { title?: unknown }).title;
		if (typeof t === "string" && t) return t;
	}
	const base = fallbackPath.split("/").pop() ?? fallbackPath;
	return base.replace(/\.json$/i, "");
}

function addTabFromMessage(msg: LoadTrailMessage): string {
	const trailFilePath = msg.trailFile;
	// Dedupe: re-firing the same trail (same on-disk path) focuses the existing
	// tab rather than spawning a duplicate. Closing and reopening a tab is the
	// way to force a re-load with different mode/auth.
	for (const existing of tabs.values()) {
		if (existing.kind === "trail" && existing.trailFilePath === trailFilePath) {
			activeTabId = existing.id;
			console.log(`[trail-viewer] tab ${existing.id} focused (already open): ${trailFilePath}`);
			return existing.id;
		}
	}

	const id = String(nextTabId++);
	const repoRoot = msg.repoRoot ?? dirname(trailFilePath);
	const loaded = loadTrailFile(trailFilePath);
	const payloadKind: PayloadKind = loaded.ok
		? loaded.payloadKind
		: detectPayloadKind(trailFilePath, null);
	// Tours reference whole directories (`focusDirectory`), so they can only be
	// served from a local working tree — there's no marker list to derive a
	// remote file set from. Pin them to 'local' regardless of the incoming mode.
	const mode: ViewerMode = payloadKind === "tour" ? "local" : msg.mode;
	const tab: TabState = {
		id,
		kind: "trail",
		title: deriveTitle(loaded, trailFilePath),
		mode,
		payloadKind,
		trailFilePath,
		repoRoot,
		loaded,
		repoOwner: msg.repoOwner,
		repoName: msg.repoName,
		repoPurl: msg.repoPurl,
		ghToken: msg.ghToken,
	};
	tabs.set(id, tab);
	activeTabId = id;
	console.log(`[trail-viewer] tab ${id} added: ${trailFilePath} (${payloadKind}, ${mode})`);
	return id;
}

async function walkFiles(
	root: string,
): Promise<Array<{ path: string; size: number }>> {
	const out: Array<{ path: string; size: number }> = [];
	async function walk(dir: string, rel: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			const relPath = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				await walk(full, relPath);
			} else if (entry.isFile()) {
				try {
					const stat = await fs.stat(full);
					out.push({ path: relPath, size: stat.size });
				} catch {
					// skip unreadable
				}
			}
		}
	}
	await walk(root, "");
	return out;
}

// ---------------------------------------------------------------------------
// RPC schema + handlers
// ---------------------------------------------------------------------------

interface TabSummary {
	id: string;
	kind: "library" | "trail";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
}

interface TabFullState {
	ok: boolean;
	error?: string;
	id: string;
	kind: "library" | "trail";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
	repoRoot?: string;
	trailFilePath?: string;
	payload?: unknown;
	// Repo identity resolved host-side so the tab header can match the library
	// rows. `owner === "local"` means no GitHub origin was found (repo is then
	// the working-tree folder name); any other owner is a real GitHub identity.
	owner?: string;
	repo?: string;
}

type TrailViewerRPC = {
	bun: RPCSchema<{
		requests: {
			listTabs: {
				params: Record<string, never>;
				response: { tabs: TabSummary[]; activeTabId: string };
			};
			getTab: {
				params: { id: string };
				response: TabFullState;
			};
			setActiveTab: {
				params: { id: string };
				response: { ok: boolean; error?: string };
			};
			closeTab: {
				params: { id: string };
				response: { ok: boolean; error?: string };
			};
			readFile: {
				params: { tabId: string; path: string; repo?: string };
				response: { ok: boolean; content?: string; error?: string };
			};
			getFileTree: {
				params: { tabId: string };
				response: { files: Array<{ path: string; size: number }> };
			};
			listTrails: {
				params: Record<string, never>;
				response: { entries: LibraryEntry[] };
			};
			openTrailFromCache: {
				params: { trailFile: string; mode?: ViewerMode; repoRoot?: string };
				response: { ok: boolean; error?: string; tabId?: string };
			};
			createTrailNote: {
				params: { tabId: string; draft: unknown };
				response: { ok: boolean; error?: string; note?: unknown };
			};
			updateTrailNote: {
				params: { tabId: string; noteId: string; body: string };
				response: { ok: boolean; error?: string; note?: unknown };
			};
			deleteTrailNote: {
				params: { tabId: string; noteId: string };
				response: { ok: boolean; error?: string };
			};
			openExternal: {
				params: { url: string };
				response: { ok: boolean };
			};
			shareTrail: {
				params: { tabId: string };
				response: {
					ok: boolean;
					error?: string;
					shareId?: string;
					shareUrl?: string;
				};
			};
			getUserIdentity: {
				params: Record<string, never>;
				response: UserIdentity;
			};
		};
		messages: {
			// Fired when the tab list or active tab changes (LOAD_TRAIL, close,
			// switch). Renderer re-runs listTabs to refresh the strip.
			tabsChanged: null;
		};
	}>;
	webview: RPCSchema<{
		requests: Record<string, never>;
		messages: Record<string, never>;
	}>;
};

function getTab(id: string): TabState | null {
	return tabs.get(id) ?? null;
}

async function readFileLocal(tab: TrailTabState, path: string): Promise<{ ok: boolean; content?: string; error?: string }> {
	try {
		const absolute = resolveSandboxed(tab.repoRoot, path);
		const content = await fs.readFile(absolute, "utf8");
		return { ok: true, content };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

async function readFileRemote(tab: TrailTabState, path: string, repo?: string): Promise<{ ok: boolean; content?: string; error?: string }> {
	if (!tab.loaded.ok) return { ok: false, error: tab.loaded.error };
	return fetchRemoteSlice(
		tab.loaded.payload,
		{
			ghToken: tab.ghToken,
			fallbackOwner: tab.repoOwner,
			fallbackName: tab.repoName,
			fallbackPurl: tab.repoPurl,
		},
		path,
		repo,
	);
}

async function getFileTreeRemote(tab: TrailTabState): Promise<{ files: Array<{ path: string; size: number }> }> {
	if (!tab.loaded.ok || typeof tab.loaded.payload !== "object" || tab.loaded.payload === null) {
		return { files: [] };
	}
	const markers = (tab.loaded.payload as { markers?: Array<{ sourcePath?: unknown }> }).markers;
	if (!Array.isArray(markers)) return { files: [] };

	const seen = new Set<string>();
	const files: Array<{ path: string; size: number }> = [];
	for (const marker of markers) {
		const raw = marker?.sourcePath;
		if (typeof raw !== "string" || !raw) continue;
		const cleaned = raw.replace(/^\/+/, "").replace(/^GitHub\//, "");
		if (!cleaned || cleaned.includes("..")) continue;
		if (seen.has(cleaned)) continue;
		seen.add(cleaned);
		files.push({ path: cleaned, size: 0 });
	}
	return { files };
}

/**
 * Apply a mutation to the trail's `notes[]` and persist it back to disk.
 *
 * Re-reads the file each call so a concurrent rewrite (e.g. the same trail
 * being edited via another tool's MCP bridge while a tab is open) doesn't get
 * clobbered by stale in-memory state. The `{ entry, payload }` wrapper from
 * web-ade fetches is preserved on write — we only ever mutate the inner
 * payload's `notes` field.
 *
 * On success, also patches `tab.loaded.payload.notes` so subsequent
 * snippet/file-tree resolvers see the new notes array without a reload.
 */
function persistNoteMutation<T>(
	tab: TrailTabState,
	mutate: (notes: unknown[]) => { notes: unknown[]; result: T },
): { ok: true; result: T } | { ok: false; error: string } {
	try {
		const raw = readFileSync(tab.trailFilePath, "utf8");
		const root = JSON.parse(raw) as Record<string, unknown>;
		const wrappedInner =
			typeof root["payload"] === "object" &&
			root["payload"] !== null &&
			"markers" in (root["payload"] as Record<string, unknown>)
				? (root["payload"] as Record<string, unknown>)
				: null;
		const inner = wrappedInner ?? root;
		const existing = Array.isArray(inner["notes"]) ? (inner["notes"] as unknown[]) : [];
		const { notes, result } = mutate(existing);
		inner["notes"] = notes;
		writeFileSync(tab.trailFilePath, `${JSON.stringify(root, null, 2)}\n`, "utf8");
		if (tab.loaded.ok && typeof tab.loaded.payload === "object" && tab.loaded.payload !== null) {
			(tab.loaded.payload as Record<string, unknown>)["notes"] = notes;
		}
		return { ok: true, result };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

/**
 * Set `payload.share = { id }` on the trail file. Mirrors `persistNoteMutation`'s
 * wrapper-preserving write: re-reads from disk, unwraps `{ entry, payload }`
 * when present, writes the updated root back. Also patches `tab.loaded.payload`
 * so the renderer's next slice fetch sees the new share field without needing
 * a tab reload.
 */
function persistShareMutation(
	tab: TrailTabState,
	share: { id: string },
): { ok: true } | { ok: false; error: string } {
	try {
		const raw = readFileSync(tab.trailFilePath, "utf8");
		const root = JSON.parse(raw) as Record<string, unknown>;
		const wrappedInner =
			typeof root["payload"] === "object" &&
			root["payload"] !== null &&
			"markers" in (root["payload"] as Record<string, unknown>)
				? (root["payload"] as Record<string, unknown>)
				: null;
		const inner = wrappedInner ?? root;
		inner["share"] = share;
		writeFileSync(tab.trailFilePath, `${JSON.stringify(root, null, 2)}\n`, "utf8");
		if (tab.loaded.ok && typeof tab.loaded.payload === "object" && tab.loaded.payload !== null) {
			(tab.loaded.payload as Record<string, unknown>)["share"] = share;
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

function summarize(tab: TabState): TabSummary {
	if (tab.kind === "library") {
		return { id: tab.id, kind: "library", title: tab.title };
	}
	return {
		id: tab.id,
		kind: "trail",
		title: tab.title,
		mode: tab.mode,
		payloadKind: tab.payloadKind,
	};
}

function fullState(tab: TabState): TabFullState {
	if (tab.kind === "library") {
		return { ok: true, id: tab.id, kind: "library", title: tab.title };
	}
	if (!tab.loaded.ok) {
		return {
			ok: false,
			error: tab.loaded.error,
			id: tab.id,
			kind: "trail",
			title: tab.title,
			mode: tab.mode,
			payloadKind: tab.payloadKind,
			repoRoot: tab.repoRoot,
			trailFilePath: tab.trailFilePath,
		};
	}
	// Resolve repo identity the same way the library listing does: prefer an
	// explicit owner/name carried by the open message (web-ade / remote trails),
	// otherwise recover it from the working tree's git origin. This is what lets
	// the tab header show `owner/name` (+ GitHub link) for local trails instead
	// of `local / <path>`.
	const identity =
		tab.repoOwner && tab.repoName
			? { owner: tab.repoOwner, repo: tab.repoName }
			: resolveLocalRepoIdentity(tab.repoRoot);
	return {
		ok: true,
		id: tab.id,
		kind: "trail",
		title: tab.title,
		mode: tab.mode,
		payloadKind: tab.payloadKind,
		repoRoot: tab.repoRoot,
		trailFilePath: tab.trailFilePath,
		payload: tab.loaded.payload,
		owner: identity.owner,
		repo: identity.repo,
	};
}

const rpc = BrowserView.defineRPC<TrailViewerRPC>({
	maxRequestTime: 5000,
	handlers: {
		requests: {
			listTabs: () => ({
				tabs: Array.from(tabs.values()).map(summarize),
				activeTabId,
			}),
			getTab: ({ id }) => {
				const tab = getTab(id);
				if (!tab) {
					return {
						ok: false,
						error: `unknown tab: ${id}`,
						id,
						kind: "trail",
						title: "",
					};
				}
				return fullState(tab);
			},
			setActiveTab: ({ id }) => {
				if (!tabs.has(id)) return { ok: false, error: `unknown tab: ${id}` };
				activeTabId = id;
				broadcastTabsChanged();
				return { ok: true };
			},
			closeTab: ({ id }) => closeTabById(id),
			readFile: async ({ tabId, path, repo }) => {
				const tab = getTab(tabId);
				if (!tab) return { ok: false, error: `unknown tab: ${tabId}` };
				if (tab.kind === "library") {
					return { ok: false, error: "library tab does not serve files" };
				}
				return tab.mode === "remote"
					? readFileRemote(tab, path, repo)
					: readFileLocal(tab, path);
			},
			getFileTree: async ({ tabId }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library") return { files: [] };
				return tab.mode === "remote"
					? getFileTreeRemote(tab)
					: { files: await walkFiles(tab.repoRoot) };
			},
			listTrails: async () => ({ entries: await walkLibrary() }),
			createTrailNote: ({ tabId, draft }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library") {
					return { ok: false, error: `unknown trail tab: ${tabId}` };
				}
				if (tab.payloadKind === "tour") {
					return { ok: false, error: "tours do not support notes" };
				}
				if (typeof draft !== "object" || draft === null) {
					return { ok: false, error: "draft must be an object" };
				}
				const now = new Date().toISOString();
				const note = {
					...(draft as Record<string, unknown>),
					id: randomUUID(),
					createdAt: now,
					updatedAt: now,
				};
				const outcome = persistNoteMutation(tab, (notes) => ({
					notes: [...notes, note],
					result: note,
				}));
				if (!outcome.ok) return { ok: false, error: outcome.error };
				return { ok: true, note: outcome.result };
			},
			updateTrailNote: ({ tabId, noteId, body }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library") {
					return { ok: false, error: `unknown trail tab: ${tabId}` };
				}
				if (tab.payloadKind === "tour") {
					return { ok: false, error: "tours do not support notes" };
				}
				const now = new Date().toISOString();
				let updated: unknown = null;
				const outcome = persistNoteMutation(tab, (notes) => {
					const next = notes.map((n) => {
						if (typeof n !== "object" || n === null) return n;
						const obj = n as Record<string, unknown>;
						if (obj["id"] !== noteId) return n;
						const patched = { ...obj, body, updatedAt: now };
						updated = patched;
						return patched;
					});
					return { notes: next, result: updated };
				});
				if (!outcome.ok) return { ok: false, error: outcome.error };
				if (!outcome.result) return { ok: false, error: `note not found: ${noteId}` };
				return { ok: true, note: outcome.result };
			},
			openExternal: ({ url }) => {
				if (url.startsWith("debug:")) {
					console.log("[scroll-debug] " + url.slice(6));
					return { ok: true };
				}
				// Hand-off to the OS shell. The webview never navigates externally —
				// we always route through this so https links open in the user's
				// browser rather than replacing the viewer's view stack.
				const ok = Utils.openExternal(url);
				return { ok };
			},
			getUserIdentity: async () => {
				// Source repoRoot/token from a trail tab (active first, else any) for
				// the git/token fallbacks. The gh-CLI path needs neither.
				const active = getTab(activeTabId);
				const trailTab =
					active && active.kind === "trail"
						? active
						: (Array.from(tabs.values()).find(
								(t): t is TrailTabState => t.kind === "trail",
						  ) ?? null);
				return resolveUserIdentity(trailTab?.repoRoot, trailTab?.ghToken);
			},
			shareTrail: ({ tabId }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library") {
					return { ok: false, error: `unknown trail tab: ${tabId}` };
				}
				if (tab.payloadKind === "tour") {
					return { ok: false, error: "tours cannot be shared" };
				}
				// 1. Sniff the GitHub remote from the working tree. The publish
				//    endpoint gates by `<owner>/<repo>` access; without a remote we
				//    have no identity to publish under.
				const gitResult = spawnSync(
					"git",
					["-C", tab.repoRoot, "remote", "get-url", "origin"],
					{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
				);
				const remoteUrl = gitResult.stdout?.trim() ?? "";
				if (gitResult.status !== 0 || !remoteUrl) {
					return {
						ok: false,
						error: `No git origin remote at ${tab.repoRoot}. Add one pointing at GitHub before sharing.`,
					};
				}
				const purl = extractPurlFromRemoteUrl(remoteUrl);
				const parsed = purl ? parsePurl(purl) : null;
				if (!parsed || parsed.type !== "github" || !parsed.namespace) {
					return {
						ok: false,
						error: `Publishing requires a GitHub remote. Current origin: ${remoteUrl}`,
					};
				}
				const owner = parsed.namespace;
				const repo = parsed.name;

				// 2. Shell out to the published CLI to publish. Keeps token
				//    resolution (gh / git credential helper) and the POST in one
				//    place; we just orchestrate. `PRINCIPAL_AI_CLI` overrides the
				//    npx fallback for local dev where iterating on the CLI matters.
				const cliOverride = process.env["PRINCIPAL_AI_CLI"];
				const [command, baseArgs] = cliOverride
					? [cliOverride, [] as string[]]
					: ["npx", ["-y", "@principal-ai/principal-view-cli@latest"]];
				const publishResult = spawnSync(
					command,
					[
						...baseArgs,
						"trail",
						"publish",
						tab.trailFilePath,
						"--owner",
						owner,
						"--repo",
						repo,
					],
					{
						encoding: "utf8",
						stdio: ["ignore", "pipe", "pipe"],
						cwd: tab.repoRoot,
					},
				);
				if (publishResult.status !== 0) {
					const stderr = publishResult.stderr?.trim();
					return {
						ok: false,
						error: stderr || `Publish failed (exit ${publishResult.status})`,
					};
				}
				const shareUrl = publishResult.stdout?.trim() ?? "";
				const idMatch = shareUrl.match(/\/trail\/([^/?#]+)/);
				if (!shareUrl || !idMatch) {
					return {
						ok: false,
						error: `Publish succeeded but returned an unparseable URL: '${shareUrl}'`,
					};
				}
				const shareId = idMatch[1]!;

				// 3. Persist `share: { id }` back to the trail JSON. The renderer
				//    swaps the header chrome based on this — and the next tab open
				//    will read the persisted value from disk.
				const outcome = persistShareMutation(tab, { id: shareId });
				if (!outcome.ok) return { ok: false, error: outcome.error };

				return { ok: true, shareId, shareUrl };
			},
			deleteTrailNote: ({ tabId, noteId }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library") {
					return { ok: false, error: `unknown trail tab: ${tabId}` };
				}
				if (tab.payloadKind === "tour") {
					return { ok: false, error: "tours do not support notes" };
				}
				const outcome = persistNoteMutation(tab, (notes) => {
					const next = notes.filter((n) => {
						if (typeof n !== "object" || n === null) return true;
						return (n as Record<string, unknown>)["id"] !== noteId;
					});
					return { notes: next, result: undefined };
				});
				if (!outcome.ok) return { ok: false, error: outcome.error };
				return { ok: true };
			},
			openTrailFromCache: async ({ trailFile, mode, repoRoot }) => {
				try {
					// Default mode: `local` when the caller (library tab) has resolved
					// a working tree on disk, otherwise `remote`. Local trails carry no
					// `repos[].remote`, so remote mode is guaranteed to fail snippet
					// fetches; the library row decides which it is and passes both.
					const resolvedMode = mode ?? (repoRoot ? "local" : "remote");
					const msg: LoadTrailMessage = {
						kind: "LOAD_TRAIL",
						trailFile,
						mode: resolvedMode,
					};
					if (repoRoot) msg.repoRoot = repoRoot;
					const tabId = addTabFromMessage(msg);
					broadcastTabsChanged();
					try {
						browserWindow.focus();
					} catch {
						// non-fatal
					}
					return { ok: true, tabId };
				} catch (err) {
					return { ok: false, error: (err as Error).message };
				}
			},
		},
		messages: {},
	},
});

function broadcastTabsChanged(): void {
	try {
		(rpc.send as unknown as Record<string, (payload: unknown) => void>)[
			"tabsChanged"
		](null);
	} catch (err) {
		console.warn(`[trail-viewer] could not notify renderer: ${(err as Error).message}`);
	}
}

// ---------------------------------------------------------------------------
// IPC handoff + server
// ---------------------------------------------------------------------------

function bootMessage(): LoadTrailMessage | null {
	const initialMode = resolveMode();
	const initialTrailFile = resolveTrailFilePath();
	if (!initialTrailFile) return null;
	const initialRepoRoot = resolveRepoRoot(initialTrailFile);
	const msg: LoadTrailMessage = {
		kind: "LOAD_TRAIL",
		trailFile: initialTrailFile,
		mode: initialMode,
	};
	if (initialRepoRoot) msg.repoRoot = initialRepoRoot;
	const ghToken = process.env["TRAIL_GH_TOKEN"];
	if (ghToken) msg.ghToken = ghToken;
	const repoOwner = process.env["TRAIL_REPO_OWNER"];
	if (repoOwner) msg.repoOwner = repoOwner;
	const repoName = process.env["TRAIL_REPO_NAME"];
	if (repoName) msg.repoName = repoName;
	const repoPurl = process.env["TRAIL_REPO_PURL"];
	if (repoPurl) msg.repoPurl = repoPurl;
	return msg;
}

const initialMessage = bootMessage();
if (initialMessage) {
	const handed = await handoffToRunning(initialMessage);
	if (handed) {
		console.log("[trail-viewer] handed off to running instance");
		process.exit(0);
	}
	// Become server. Seed the first tab from boot args before the window opens
	// so the renderer's first listTabs call sees it.
	addTabFromMessage(initialMessage);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

const browserWindow = new BrowserWindow({
	title: "Principal AI",
	url: "views://mainview/index.html",
	rpc,
	// Initial frame is just the fallback the window briefly opens at before we
	// maximize it below; it's also what `unmaximize` restores to.
	frame: { width: 1200, height: 800, x: 100, y: 100 },
});

// Open filling the screen's work area. We maximize rather than hardcode a size
// so it adapts to whatever display the user is on; `setFullScreen(true)` would
// instead push it into the borderless macOS fullscreen space, which isn't what
// we want for a windowed viewer.
browserWindow.maximize();

function closeTabById(id: string): { ok: boolean; error?: string } {
	if (id === LIBRARY_TAB_ID) {
		return { ok: false, error: "library tab cannot be closed" };
	}
	if (!tabs.has(id)) return { ok: false, error: `unknown tab: ${id}` };
	tabs.delete(id);
	if (activeTabId === id) {
		const remaining = Array.from(tabs.keys());
		activeTabId = remaining[remaining.length - 1] ?? LIBRARY_TAB_ID;
	}
	broadcastTabsChanged();
	return { ok: true };
}

// Application menu — without one macOS has no Cmd+Q binding and no way to
// surface Cmd+W to close the active tab. We register a minimal menu rather
// than a full standard set to keep the viewer chrome lean; expand if the
// trail panel grows text-editing affordances that need the Edit menu's
// native roles.
ApplicationMenu.setApplicationMenu([
	{
		submenu: [
			{ role: "about", label: "About Trail Viewer" },
			{ type: "separator" },
			{ role: "hide" },
			{ role: "hideOthers" },
			{ role: "showAll" },
			{ type: "separator" },
			{ role: "quit", accelerator: "CommandOrControl+Q" },
		],
	},
	{
		label: "File",
		submenu: [
			{
				label: "Close Tab",
				action: "closeActiveTab",
				accelerator: "CommandOrControl+W",
			},
			{ role: "close", label: "Close Window", accelerator: "Shift+CommandOrControl+W" },
		],
	},
]);

ApplicationMenu.on("application-menu-clicked", (event) => {
	// Electrobun wraps the payload — `{ data: { action, id?, data? } }`.
	const action = (event as { data?: { action?: string } }).data?.action;
	if (action === "closeActiveTab") closeTabById(activeTabId);
});

console.log("[trail-viewer] window opened");

startIpcServer(async (msg) => {
	try {
		addTabFromMessage(msg);
		broadcastTabsChanged();
		try {
			browserWindow.focus();
		} catch (err) {
			console.warn(`[trail-viewer] could not focus window: ${(err as Error).message}`);
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
});
