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

import { BrowserView, BrowserWindow, type RPCSchema } from "electrobun/bun";
import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readFileRemote as fetchRemoteSlice } from "./remote-files";
import { handoffToRunning, startIpcServer, type LoadTrailMessage } from "./ipc";
import { walkLibrary, type LibraryEntry } from "./library";

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
	title: "Library";
}

type TabState = LibraryTabState | TrailTabState;

const tabs = new Map<string, TabState>();
tabs.set(LIBRARY_TAB_ID, {
	id: LIBRARY_TAB_ID,
	kind: "library",
	title: "Library",
});
let activeTabId: string = LIBRARY_TAB_ID;
let nextTabId = 1;

// Pre-load the payload so the renderer's first read is synchronous and any
// parse error surfaces at boot rather than after the window is up.
type LoadedTrail =
	| { ok: true; payload: unknown; path: string }
	| { ok: false; error: string };

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
		return { ok: true, payload: parsed, path };
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
	const tab: TabState = {
		id,
		kind: "trail",
		title: deriveTitle(loaded, trailFilePath),
		mode: msg.mode,
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
	console.log(`[trail-viewer] tab ${id} added: ${trailFilePath} (${msg.mode})`);
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
}

interface TabFullState {
	ok: boolean;
	error?: string;
	id: string;
	kind: "library" | "trail";
	title: string;
	mode?: ViewerMode;
	repoRoot?: string;
	trailFilePath?: string;
	payload?: unknown;
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
				params: { trailFile: string; mode?: ViewerMode };
				response: { ok: boolean; error?: string; tabId?: string };
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

function summarize(tab: TabState): TabSummary {
	if (tab.kind === "library") {
		return { id: tab.id, kind: "library", title: tab.title };
	}
	return { id: tab.id, kind: "trail", title: tab.title, mode: tab.mode };
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
			repoRoot: tab.repoRoot,
			trailFilePath: tab.trailFilePath,
		};
	}
	return {
		ok: true,
		id: tab.id,
		kind: "trail",
		title: tab.title,
		mode: tab.mode,
		repoRoot: tab.repoRoot,
		trailFilePath: tab.trailFilePath,
		payload: tab.loaded.payload,
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
			closeTab: ({ id }) => {
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
			},
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
			openTrailFromCache: async ({ trailFile, mode }) => {
				try {
					const msg: LoadTrailMessage = {
						kind: "LOAD_TRAIL",
						trailFile,
						mode: mode ?? "remote",
					};
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
	title: "Trail Viewer",
	url: "views://mainview/index.html",
	rpc,
	frame: { width: 1200, height: 800, x: 100, y: 100 },
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
