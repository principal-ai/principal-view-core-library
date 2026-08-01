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
	walkTours,
	resolveLocalRepoIdentity,
	resolveUserIdentity,
	type LibraryEntry,
	type UserIdentity,
} from "./library";
import {
	resolveRepoRootFromAlexandria,
	loadAlexandriaRepos,
	registerProjectInAlexandria,
} from "./alexandria";
import { V1EventBridgeProcessor, eventOp, PathNormalizationService } from "@principal-ai/agent-monitoring";
import type { AccumulatedState, AgentSessionEvent, UniversalAgentSessionEvent, RepositoryInfo } from "@principal-ai/agent-monitoring";
import { BunNormalizationAdapter } from "./normalizationAdapter";

function openCodeDBPath(): string {
	const env = process.env as Record<string, string | undefined>;
	if (env["OPENCODE_DATA_DIR"]) return `${env["OPENCODE_DATA_DIR"]}/opencode/opencode.db`;
	const home = env["HOME"] || env["USERPROFILE"] || "/root";
	const xdgData = env["XDG_DATA_HOME"] || `${home}/.local/share`;
	return `${xdgData}/opencode/opencode.db`;
}

const LIBRARY_TAB_ID = "library";
const SESSIONS_TAB_ID = "sessions";
const AGENT_SESSIONS_TAB_ID = "agent-sessions";

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
	title: "Library";
}

interface SessionsTabState {
	id: typeof SESSIONS_TAB_ID;
	kind: "sessions";
	title: "Sessions";
}

interface AgentSessionsTabState {
	id: typeof AGENT_SESSIONS_TAB_ID;
	kind: "agent-sessions";
	title: "Agent Sessions";
}

interface SessionEventsTabState {
	id: string;
	kind: "session-events";
	title: string;
	sessionId: string;
}

interface SessionSummary {
	id: string;
	title: string;
	slug: string;
	createdAt: string;
	durationMs: number;
	eventCount: number;
	isFinished: boolean;
	repoRoot?: string;
	repos?: RepoInfo[];
}

interface SessionGroup {
	parent: SessionSummary;
	children: SessionSummary[];
}

type TabState = LibraryTabState | SessionsTabState | AgentSessionsTabState | SessionEventsTabState | TrailTabState;

const tabs = new Map<string, TabState>();
tabs.set(LIBRARY_TAB_ID, {
	id: LIBRARY_TAB_ID,
	kind: "library",
	title: "Library",
});
tabs.set(SESSIONS_TAB_ID, {
	id: SESSIONS_TAB_ID,
	kind: "sessions",
	title: "Sessions",
});
tabs.set(AGENT_SESSIONS_TAB_ID, {
	id: AGENT_SESSIONS_TAB_ID,
	kind: "agent-sessions",
	title: "Agent Sessions",
});
let activeTabId: string = SESSIONS_TAB_ID;
let nextTabId = 1;

// Pre-load the payload so the renderer's first read is synchronous and any
// parse error surfaces at boot rather than after the window is up.
type PayloadKind = "trail" | "tour";

type LoadedTrail =
	| { ok: true; payload: unknown; path: string; payloadKind: PayloadKind }
	| { ok: false; error: string; payloadKind: PayloadKind };

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
 * always sees `{ markers, views, ... }` directly. (Tours are handled separately
 * by `extractTourPayload`, which copes with their extra nesting.)
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

/**
 * Locate the renderable tour inside a cached/loaded file, coping with every
 * shape the store and CLI emit:
 *   - a bare tour                       — `{ steps, ... }`
 *   - the by-id wrapper                 — `{ owner, repo, entry, payload: <tour> }`
 *   - the newer audio envelope          — `{ ..., payload: { tour: <tour>, audio } }`
 * We pick the first object carrying a `steps[]` array. A tour authored against
 * a repo but cached without `repos[]` (the audio-envelope format drops it) is
 * repaired from the wrapper's `owner`/`repo` so strict `parseTourOrThrow`
 * validation — and the panel's repo resolution — still has a repo to anchor to.
 *
 * Returns `null` when no tour is present (the file is a trail or unrecognized).
 */
function extractTourPayload(raw: unknown): Record<string, unknown> | null {
	if (typeof raw !== "object" || raw === null) return null;
	const root = raw as Record<string, unknown>;
	const payload =
		typeof root["payload"] === "object" && root["payload"] !== null
			? (root["payload"] as Record<string, unknown>)
			: undefined;
	const nestedTour =
		payload && typeof payload["tour"] === "object" && payload["tour"] !== null
			? (payload["tour"] as Record<string, unknown>)
			: undefined;

	let tour: Record<string, unknown> | null = null;
	for (const candidate of [root, payload, nestedTour]) {
		if (candidate && Array.isArray(candidate["steps"])) {
			tour = candidate;
			break;
		}
	}
	if (!tour) return null;

	if (!Array.isArray(tour["repos"]) || (tour["repos"] as unknown[]).length === 0) {
		const owner = typeof root["owner"] === "string" ? (root["owner"] as string) : undefined;
		const name = typeof root["repo"] === "string" ? (root["repo"] as string) : undefined;
		if (owner && name) {
			tour = {
				...tour,
				repos: [
					{
						id: `pkg:github/${owner.toLowerCase()}/${name}`,
						name,
						remote: { host: "github", owner, name },
					},
				],
			};
		}
	}
	return tour;
}

function loadTrailFile(path: string | null): LoadedTrail {
	if (!path) {
		return {
			ok: false,
			error:
				"No trail file. Pass a path as the first arg or set TRAIL_FILE=<path>.",
			payloadKind: "trail",
		};
	}
	// Determine the kind first, from the file contents, so that even a tour that
	// fails to load is reported as a tour. Otherwise the renderer would fall back
	// to the trail panel and crash dereferencing `views[0]` on a tour payload.
	let json: unknown;
	try {
		json = JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		return {
			ok: false,
			error: `Failed to load ${path}: ${(err as Error).message}`,
			payloadKind: detectPayloadKind(path, null),
		};
	}

	const tour = extractTourPayload(json);
	if (tour || /\.tour\.json$/i.test(path)) {
		if (!tour) {
			return {
				ok: false,
				error: `Failed to load ${path}: file has a .tour.json name but no tour steps`,
				payloadKind: "tour",
			};
		}
		// Validate up front so a malformed tour fails at load with a clear message
		// rather than silently rendering an idle, empty city.
		try {
			parseTourOrThrow(JSON.stringify(tour));
		} catch (err) {
			return {
				ok: false,
				error: `Failed to load ${path}: ${(err as Error).message}`,
				payloadKind: "tour",
			};
		}
		return { ok: true, payload: tour, path, payloadKind: "tour" };
	}

	return { ok: true, payload: unwrapPayload(json), path, payloadKind: "trail" };
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

/**
 * The GitHub `owner/name` a tour was authored against, read from its (possibly
 * repaired) `repos[0].remote`. `extractTourPayload` guarantees this is present
 * for every shape we accept, so it's how a library-opened tour finds its repo.
 */
function tourRepoIdentity(
	loaded: LoadedTrail,
): { owner: string; name: string } | null {
	if (!loaded.ok || typeof loaded.payload !== "object" || loaded.payload === null) {
		return null;
	}
	const repos = (loaded.payload as { repos?: unknown }).repos;
	if (!Array.isArray(repos) || repos.length === 0) return null;
	const remote = (repos[0] as { remote?: { owner?: unknown; name?: unknown } })
		.remote;
	if (typeof remote?.owner === "string" && typeof remote?.name === "string") {
		return { owner: remote.owner, name: remote.name };
	}
	return null;
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
	let loaded = loadTrailFile(trailFilePath);
	const payloadKind: PayloadKind = loaded.payloadKind;

	// Tours render against a whole working tree, not a marker-derived remote file
	// set, so they're always local. The CLI `tour view` passes the repoRoot
	// (cwd); a tour opened from the library carries none, so we resolve it from
	// the Alexandria registry by the GitHub owner/repo the tour was authored
	// against. When the registry doesn't know that repo we can't render the city,
	// so we fail the tab with a clear message rather than an empty/idle view.
	let repoRoot: string;
	if (payloadKind === "tour" && !msg.repoRoot) {
		const identity = tourRepoIdentity(loaded);
		const resolved = identity
			? resolveRepoRootFromAlexandria(identity.owner, identity.name)
			: null;
		if (resolved) {
			repoRoot = resolved;
		} else {
			repoRoot = "";
			const repoLabel = identity
				? `${identity.owner}/${identity.name}`
				: "this tour's repository";
			loaded = {
				ok: false,
				error: `We couldn't find a local checkout of ${repoLabel}. This tour renders against the repository's files, but it isn't in your Alexandria registry — open the repo once in the Principal desktop app (or clone it) and reopen the tour.`,
				payloadKind: "tour",
			};
		}
	} else {
		repoRoot = msg.repoRoot ?? dirname(trailFilePath);
	}
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
	kind: "library" | "trail" | "sessions" | "session-events" | "agent-sessions";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
}

interface TabFullState {
	ok: boolean;
	error?: string;
	id: string;
	kind: "library" | "trail" | "sessions" | "session-events" | "agent-sessions";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
	repoRoot?: string;
	trailFilePath?: string;
	sessionId?: string;
	payload?: unknown;
	// Repo identity resolved host-side so the tab header can match the library
	// rows. `owner === "local"` means no GitHub origin was found (repo is then
	// the working-tree folder name); any other owner is a real GitHub identity.
	owner?: string;
	repo?: string;
}

interface SessionEventRow {
	seq: number;
	type: string;
	raw: unknown;
	normalized: Record<string, unknown>;
	accumulated: AgentSessionEvent | null;
}

interface RepoInfo {
	root: string;
	fileCount: number;
	owner: string | null;
	name: string | null;
	editing: boolean;
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
				params: { tabId: string; path?: string };
				response: { files: Array<{ path: string; size: number }> };
			};
			listTrails: {
				params: Record<string, never>;
				response: { entries: LibraryEntry[] };
			};
			listSessions: {
				params: Record<string, never>;
				response: { groups: SessionGroup[]; standalone: SessionSummary[] };
			};
			openTrailFromCache: {
				params: { trailFile: string; mode?: ViewerMode; repoRoot?: string };
				response: { ok: boolean; error?: string; tabId?: string };
			};
			getSessionEvents: {
				params: { sessionId: string };
				response: { ok: boolean; error?: string; events?: SessionEventRow[]; repoRoot?: string; repos?: RepoInfo[]; session?: { slug: string; title: string } };
			};
			discoverSessionsRepos: {
				params: { sessionIds: string[] };
				response: { repos: Record<string, { repoRoot: string; repos: RepoInfo[] }> };
			};
			openSessionTab: {
				params: { sessionId: string; title: string };
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
	if (tab.kind === "library" || tab.kind === "sessions" || tab.kind === "agent-sessions" || tab.kind === "session-events") {
		return { id: tab.id, kind: tab.kind, title: tab.title };
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
	if (tab.kind === "library" || tab.kind === "sessions" || tab.kind === "agent-sessions") {
		return { ok: true, id: tab.id, kind: tab.kind, title: tab.title };
	}
	if (tab.kind === "session-events") {
		return { ok: true, id: tab.id, kind: tab.kind, title: tab.title, sessionId: tab.sessionId };
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
				if (tab.kind === "library" || tab.kind === "sessions" || tab.kind === "agent-sessions" || tab.kind === "session-events") {
					return { ok: false, error: `${tab.kind} tab does not serve files` };
				}
				return tab.mode === "remote"
					? readFileRemote(tab, path, repo)
					: readFileLocal(tab, path);
			},
			getFileTree: async ({ tabId, path }) => {
				const walkPath = path ?? null;
				if (!walkPath) {
					const tab = getTab(tabId);
					if (!tab || tab.kind === "library" || tab.kind === "sessions" || tab.kind === "agent-sessions" || tab.kind === "session-events") return { files: [] };
					return tab.mode === "remote"
						? getFileTreeRemote(tab)
						: { files: await walkFiles(tab.repoRoot) };
				}
				return { files: await walkFiles(walkPath) };
			},
			listTrails: async () => {
				// Merge cached trails and tours into one mtime-sorted list; each row
				// carries a `kind` so the renderer badges and opens it correctly.
				const [trails, tours] = await Promise.all([
					walkLibrary(),
					walkTours(),
				]);
				const entries = [...trails, ...tours].sort(
					(a, b) => b.mtimeMs - a.mtimeMs,
				);
				return { entries };
			},
			listSessions: async () => {
				const dbPath = openCodeDBPath();
				let db: import("bun:sqlite").Database | null = null;
				try {
					const { Database } = await import("bun:sqlite");
					db = new Database(dbPath, { readonly: true });
					const sevenDaysAgo = Date.now() - 7 * 86400000;
					const firstEvents = db
						.prepare(
							`SELECT
								e.aggregate_id,
								e.data,
								(SELECT COUNT(*) FROM event WHERE aggregate_id = e.aggregate_id) AS event_count,
								(SELECT MAX(json_extract(e2.data, '$.info.time.created')) FROM event e2 WHERE e2.aggregate_id = e.aggregate_id) AS last_created
							FROM event e
							WHERE e.seq = (SELECT MIN(e2.seq) FROM event e2 WHERE e2.aggregate_id = e.aggregate_id)
								AND json_extract(e.data, '$.info.time.created') > ?
							ORDER BY e.seq DESC`,
						)
						.all(sevenDaysAgo) as Array<{
						aggregate_id: string;
						data: string;
						event_count: number;
						last_created: number | null;
					}>;
					const idToSummary = new Map<string, SessionSummary>();
					for (const row of firstEvents) {
						let title = row.aggregate_id.slice(0, 12);
						let slug = "";
						let createdAtStr = "";
						let durationMs = 0;
						try {
							const parsed = JSON.parse(row.data) as Record<string, unknown>;
							const info = parsed["info"] as Record<string, unknown> | undefined;
							const rawTitle = info?.["title"];
							if (typeof rawTitle === "string") {
								title = rawTitle;
							}
							const rawSlug = info?.["slug"];
							if (typeof rawSlug === "string") {
								slug = rawSlug;
							}
							const rawTime = info?.["time"] as Record<string, unknown> | undefined;
							const rawCreated = rawTime?.["created"];
							if (typeof rawCreated === "number") {
								createdAtStr = new Date(rawCreated).toISOString();
								if (typeof row.last_created === "number") {
									durationMs = row.last_created - rawCreated;
								}
							}
						} catch {
							// best-effort parse
						}
						idToSummary.set(row.aggregate_id, {
							id: row.aggregate_id,
							title,
							slug,
							createdAt: createdAtStr,
							durationMs,
							eventCount: row.event_count,
							isFinished: false,
						});
					}
					const relations = db
						.prepare(
							`SELECT
								json_extract(data, '$.part.state.metadata.parentSessionId') AS parent_id,
								json_extract(data, '$.part.state.metadata.sessionId') AS child_id,
								json_extract(data, '$.part.state.status') AS status
							FROM event
							WHERE seq IN (
								SELECT MAX(seq)
								FROM event
								WHERE json_extract(data, '$.part.type') = 'tool'
									AND json_extract(data, '$.part.tool') = 'task'
									AND json_extract(data, '$.part.state.metadata.sessionId') IS NOT NULL
								GROUP BY json_extract(data, '$.part.state.metadata.sessionId')
							)`,
						)
						.all() as Array<{ parent_id: string; child_id: string; status: string | null }>;
					const childIds = new Set<string>();
					const groups: SessionGroup[] = [];
					for (const rel of relations) {
						if (!rel.parent_id || !rel.child_id) continue;
						const parent = idToSummary.get(rel.parent_id);
						const child = idToSummary.get(rel.child_id);
						if (parent && child) {
							if (rel.status === "completed" || rel.status === "error") {
								child.isFinished = true;
							}
							childIds.add(rel.child_id);
						}
					}
					for (const summary of idToSummary.values()) {
						if (childIds.has(summary.id)) continue;
						const childList: SessionSummary[] = [];
						for (const rel of relations) {
							if (rel.parent_id === summary.id) {
								const child = idToSummary.get(rel.child_id);
								if (child) childList.push(child);
							}
						}
						if (childList.length > 0) {
							groups.push({ parent: { ...summary }, children: childList });
						}
					}
					const standalone: SessionSummary[] = [];
					for (const summary of idToSummary.values()) {
						if (childIds.has(summary.id)) continue;
						if (!groups.some((g) => g.parent.id === summary.id)) {
							standalone.push(summary);
						}
					}
					return { groups, standalone };
				} catch (err) {
					console.warn(`[trail-viewer] listSessions failed: ${(err as Error).message}`);
					return { groups: [], standalone: [] };
				} finally {
					db?.close();
				}
			},
			createTrailNote: ({ tabId, draft }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library" || tab.kind === "sessions" || tab.kind === "agent-sessions" || tab.kind === "session-events") {
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
				if (!tab || tab.kind === "library" || tab.kind === "sessions" || tab.kind === "agent-sessions" || tab.kind === "session-events") {
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
				if (!tab || tab.kind === "library" || tab.kind === "sessions" || tab.kind === "agent-sessions" || tab.kind === "session-events") {
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
				if (!tab || tab.kind === "library" || tab.kind === "sessions" || tab.kind === "agent-sessions" || tab.kind === "session-events") {
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
			getSessionEvents: async ({ sessionId }) => {
				const dbPath = openCodeDBPath();
				let db: import("bun:sqlite").Database | null = null;
				try {
					const { Database } = await import("bun:sqlite");
					db = new Database(dbPath, { readonly: true });
					const rows = db
						.prepare(
							`SELECT seq, type, data FROM event WHERE aggregate_id = ? ORDER BY seq ASC`,
						)
						.all(sessionId) as Array<{
						seq: number;
						type: string;
						data: string;
					}>;
					// Extract session metadata from first event
					let sessionSlug = "";
					let sessionTitle = sessionId.slice(0, 12);
					if (rows.length > 0) {
						try {
							const firstParsed = JSON.parse(rows[0].data) as Record<string, unknown>;
							const info = firstParsed["info"] as Record<string, unknown> | undefined;
							const rawTitle = info?.["title"];
							if (typeof rawTitle === "string") sessionTitle = rawTitle;
							const rawSlug = info?.["slug"];
							if (typeof rawSlug === "string") sessionSlug = rawSlug;
						} catch {
							// best-effort
						}
					}
					const processor = new V1EventBridgeProcessor();
					const alexandriaRepos = loadAlexandriaRepos();
					const knownRoots = new Map<string, RepositoryInfo>();
					for (const [path, repo] of alexandriaRepos) {
						knownRoots.set(path, {
							root: repo.root,
							remoteUrl: repo.remoteUrl,
							owner: repo.owner,
							repo: repo.repo,
						});
					}
					const adapter = new BunNormalizationAdapter(knownRoots);
					const normalizationService = new PathNormalizationService(adapter);
					const rawEvents: UniversalAgentSessionEvent[] = [];
					const rawDataMap = new Map<number, unknown>();
					for (const row of rows) {
						let raw: unknown = {};
						try {
							raw = JSON.parse(row.data);
						} catch {
							// best-effort parse
						}
						const rawObj = raw as Record<string, unknown>;
						const normalizedEvent = processor.normalize({ type: row.type as "session.created.1" | "session.updated.1" | "message.updated.1" | "message.part.updated.1" | "message.removed.1", data: rawObj, id: "", aggregateId: "", seq: row.seq });
						rawEvents.push(normalizedEvent);
						rawDataMap.set(row.seq, raw);
					}
					const normalizedEvents = await normalizationService.normalizePathsBatch(rawEvents, "");
					// Auto-register any newly discovered git roots
					for (const discovered of adapter.newlyDiscovered) {
						registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
					}
					const accState: AccumulatedState = {
						sessionName: "",
						sessionColor: "",
						readingFiles: new Map(),
						greppingFiles: new Map(),
						activeFiles: new Map(),
						files: new Map(),
						tools: new Map(),
						lastState: "starting",
					};
					const events: SessionEventRow[] = [];
					const repoSet = new Map<string, { root: string; fileCount: number }>();
					for (const normalizedEvent of normalizedEvents) {
						const accResult = eventOp(accState, normalizedEvent);
						const seq = (normalizedEvent.raw as Record<string, unknown>)["seq"] as number ?? 0;
						events.push({
							seq,
							type: (normalizedEvent.raw as Record<string, unknown>)["type"] as string ?? "",
							raw: rawDataMap.get(seq),
							normalized: normalizedEvent as unknown as Record<string, unknown>,
							accumulated: accResult,
						});
						if (normalizedEvent.files) {
							for (const f of normalizedEvent.files) {
								const root = f.repository?.gitRoot;
								if (root) {
									const entry = repoSet.get(root) ?? { root, fileCount: 0 };
									entry.fileCount++;
									repoSet.set(root, entry);
								}
							}
						}
					}
					const lastEvent = events[events.length - 1];
					if (lastEvent) {
						const lastTimestamp = (lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined ?? 0;
						events.push({
							seq: lastEvent.seq + 1,
							type: "finished",
							raw: null,
							normalized: { timestamp: lastTimestamp },
							accumulated: {
								id: "",
								timestamp: lastTimestamp,
								sessionId: sessionSlug,
								sessionName: accState.sessionName,
								sessionColor: accState.sessionColor,
								operation: "finished",
								files: [],
								dependencies: [],
								description: `${accState.sessionName} finished`,
								layers: [],
							},
						});
					}
					const repos = Array.from(repoSet.values())
						.sort((a, b) => b.fileCount - a.fileCount)
						.map((r) => {
							const parts = r.root.replace(/\/+$/, "").split("/");
							const known = knownRoots.get(r.root);
							return { root: r.root, fileCount: r.fileCount, owner: known?.owner ?? null, name: parts[parts.length - 1] ?? null, editing: false };
						});
					const repoRoot = repos.length > 0 ? repos[0].root : undefined;
					return { ok: true, events, repoRoot, repos, session: { slug: sessionSlug, title: sessionTitle } };
				} catch (err) {
					return { ok: false, error: (err as Error).message };
				} finally {
					db?.close();
				}
			},
			discoverSessionsRepos: async ({ sessionIds }) => {
				const dbPath = openCodeDBPath();
				let db: import("bun:sqlite").Database | null = null;
				const result: Record<string, { repoRoot: string; repos: RepoInfo[] }> = {};
				try {
					const { Database } = await import("bun:sqlite");
					db = new Database(dbPath, { readonly: true });
					const processor = new V1EventBridgeProcessor();
					const alexandriaRepos = loadAlexandriaRepos();
					const knownRoots = new Map<string, RepositoryInfo>();
					for (const [path, repo] of alexandriaRepos) {
						knownRoots.set(path, {
							root: repo.root,
							remoteUrl: repo.remoteUrl,
							owner: repo.owner,
							repo: repo.repo,
						});
					}
					const adapter = new BunNormalizationAdapter(knownRoots);
					const normalizationService = new PathNormalizationService(adapter);
					for (const sessionId of sessionIds) {
						const rows = db
							.prepare(
								`SELECT seq, type, data FROM event WHERE aggregate_id = ? ORDER BY seq ASC`,
							)
							.all(sessionId) as Array<{ seq: number; type: string; data: string }>;
						const rawEvents: UniversalAgentSessionEvent[] = [];
						for (const row of rows) {
							let raw: Record<string, unknown> = {};
							try { raw = JSON.parse(row.data) as Record<string, unknown>; } catch {}
							const normalizedEvent = processor.normalize({ type: row.type as "session.created.1" | "session.updated.1" | "message.updated.1" | "message.part.updated.1" | "message.removed.1", data: raw, id: "", aggregateId: "", seq: row.seq });
							rawEvents.push(normalizedEvent);
						}
						const normalizedEvents = await normalizationService.normalizePathsBatch(rawEvents, "");
						// Collect distinct repos and track editing repos via accumulated state
						const accState: AccumulatedState = {
							sessionName: "",
							sessionColor: "",
							readingFiles: new Map(),
							greppingFiles: new Map(),
							activeFiles: new Map(),
							files: new Map(),
							tools: new Map(),
							lastState: "starting",
						};
						const repoFileCount = new Map<string, number>();
						const editRepoRoots = new Set<string>();
						for (const normalizedEvent of normalizedEvents) {
							const accResult = eventOp(accState, normalizedEvent);
							if (normalizedEvent.files) {
								for (const f of normalizedEvent.files) {
									const root = f.repository?.gitRoot;
									if (root) {
										repoFileCount.set(root, (repoFileCount.get(root) ?? 0) + 1);
										if (accResult?.operation === "editing") {
											editRepoRoots.add(root);
										}
									}
								}
							}
						}
						const repos: RepoInfo[] = Array.from(repoFileCount.entries())
							.sort((a, b) => b[1] - a[1])
							.map(([root, fileCount]) => {
								const parts = root.replace(/\/+$/, "").split("/");
								return { root, fileCount, owner: null as string | null, name: parts[parts.length - 1] ?? null, editing: editRepoRoots.has(root) };
							});
						const repoRoot = repos.length > 0 ? repos[0].root : "";
						result[sessionId] = { repoRoot, repos };
					}
					// Auto-register any newly discovered git roots
					for (const discovered of adapter.newlyDiscovered) {
						registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
					}
				} catch (err) {
					console.warn("[trail-viewer] discoverSessionsRepos failed:", err);
				} finally {
					db?.close();
				}
				return { repos: result };
			},
			openSessionTab: ({ sessionId, title }) => {
				for (const existing of tabs.values()) {
					if (existing.kind === "session-events" && existing.sessionId === sessionId) {
						activeTabId = existing.id;
						broadcastTabsChanged();
						return { ok: true, tabId: existing.id };
					}
				}
				const id = String(nextTabId++);
				const tab: SessionEventsTabState = {
					id,
					kind: "session-events",
					title,
					sessionId,
				};
				tabs.set(id, tab);
				activeTabId = id;
				broadcastTabsChanged();
				return { ok: true, tabId: id };
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
	if (id === LIBRARY_TAB_ID || id === SESSIONS_TAB_ID || id === AGENT_SESSIONS_TAB_ID) {
		return { ok: false, error: "permanent tab cannot be closed" };
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
