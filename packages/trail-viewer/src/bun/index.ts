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
import {
	normalizeEventsWithAdapter,
	accumulateEvents,
	collectRepositories,
	opencodeRowsToUniversalEvents,
} from "@principal-ai/principal-view-core/pipeline";
import { parseTourOrThrow } from "@principal-ai/file-city-builder";
import { readFileRemote as fetchRemoteSlice } from "./remote-files";
import { handoffToRunning, startIpcServer, type LoadTrailMessage } from "./ipc";
import {
	walkLibrary,
	walkTours,
	resolveLocalRepoIdentity,
	resolveUserIdentity,
} from "./library";
import { analyses, newAnalysisId, stubConceptCard } from "./analyses";
import type {
	PayloadKind,
	RepoInfo,
	SessionEventRow,
	SessionGroup,
	SessionSummary,
	TabFullState,
	TabSummary,
	TrailViewerMessages,
	TrailViewerRequests,
	ViewerMode,
} from "../shared/contract";
import {
	resolveRepoRootFromAlexandria,
	loadAlexandriaRepos,
	registerProjectInAlexandria,
} from "./alexandria";
import {
	createAccumulatedState,
	eventOp,
	PathNormalizationService,
	ClineSessionReader,
	cleanClinePrompt,
	PiSessionReader,
	GrokSessionReader,
	CodexSessionReader,
} from "@principal-ai/agent-monitoring";
import type { AgentSessionEvent, UniversalAgentSessionEvent, RepositoryInfo } from "@principal-ai/agent-monitoring";
import { BunNormalizationAdapter } from "./normalizationAdapter";

function openCodeDBPath(): string {
	const env = process.env as Record<string, string | undefined>;
	if (env["OPENCODE_DATA_DIR"]) return `${env["OPENCODE_DATA_DIR"]}/opencode/opencode.db`;
	const home = env["HOME"] || env["USERPROFILE"] || "/root";
	const xdgData = env["XDG_DATA_HOME"] || `${home}/.local/share`;
	return `${xdgData}/opencode/opencode.db`;
}

// When set to "1", getSessionEvents responses include the full raw event payload
// and the full normalized event. Default (unset) ships only the trimmed fields
// the File City renderer consumes (timestamp + accumulated) — opencode raw
// payloads reach hundreds of MB per session and freeze the agent drawer. A
// future diagnosing UI that compares the raw → normalized → accumulated
// pipeline enables this to get the full shapes.
const INCLUDE_RAW_EVENT_PAYLOADS =
	((process.env as Record<string, string | undefined>)["TRAIL_INCLUDE_RAW"] ?? "") === "1";

// Cline CLI stores its durable data under its own convention (~/.cline/data),
// not XDG. The reader handles the path resolution; we just need a singleton
// and a way to tell Cline sessions apart from opencode sessions.
const clineReader = new ClineSessionReader();

function isClineSession(sessionId: string): boolean {
	return clineReader.readSession(sessionId) !== null;
}

// pi CLI stores its durable sessions under ~/.pi/agent/sessions (JSONL files).
// Same durable-transcript pattern as Cline: one file per session, tree-shaped.
const piReader = new PiSessionReader();

function isPiSession(sessionId: string): boolean {
	return piReader.readSession(sessionId) !== null;
}

// Grok Build stores durable sessions under ~/.grok/sessions/<cwd>/<id>/
// (summary.json + updates.jsonl). Same stage-1 reader shape as Cline/pi.
const grokReader = new GrokSessionReader();

function isGrokSession(sessionId: string): boolean {
	return grokReader.readSession(sessionId) !== null;
}

// Codex stores durable rollout JSONL under ~/.codex/sessions.
const codexReader = new CodexSessionReader();

function isCodexSession(sessionId: string): boolean {
	return codexReader.readSession(sessionId) !== null;
}

// Shared Cline pipeline: reader → normalizePathsBatch → eventOp loop.
// Returns the same shapes getSessionEvents build so the Cline branch can
// drop into the existing response assembly with no extra plumbing.
interface ClinePipelineResult {
	rawEvents: UniversalAgentSessionEvent[];
	normalizedEvents: import("@principal-ai/agent-monitoring").RepoNormalizedUniversalAgentSessionEvent[];
	accState: ReturnType<typeof createAccumulatedState>;
	events: SessionEventRow[];
	repos: RepoInfo[];
	repoRoot: string | undefined;
	sessionTitle: string;
	sessionSlug: string;
}

async function runClinePipeline(sessionId: string): Promise<ClinePipelineResult | null> {
	const record = clineReader.readSession(sessionId);
	if (!record) return null;

	// Title/name: prefer the (tag-stripped) session prompt, truncated; fall back
	// to a readable label rather than the raw session id string.
	const promptText = cleanClinePrompt(record.metadata.prompt ?? "");
	const sessionTitle = promptText
		? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
		: "Cline session";
	const sessionSlug = "";

	const rawEvents = clineReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

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

	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.metadata.workspace_root || record.metadata.cwd || "",
	);

	// Auto-register any newly discovered git roots
	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();

	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
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

	// Append a "finished" row like the opencode path does
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
				sessionId: sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
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

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}

// Shared pi pipeline: reader → normalizePathsBatch → eventOp loop.
// Same shapes as runClinePipeline so both drop into the existing response
// assembly with no extra plumbing.
async function runPiPipeline(sessionId: string): Promise<ClinePipelineResult | null> {
	const record = piReader.readSession(sessionId);
	if (!record) return null;

	// Title/name: prefer the first user prompt, truncated; fall back to a
	// readable label rather than the raw session id string.
	const promptText = record.firstPrompt;
	const sessionTitle = promptText
		? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
		: "pi session";
	const sessionSlug = "";

	const rawEvents = piReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

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

	// The pi session header carries the working directory; that is the repo to
	// normalize against (the ~/.pi sessions dir itself is never a repo).
	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.header.cwd || "",
	);

	// Auto-register any newly discovered git roots
	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();

	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
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

	// Append a "finished" row like the opencode path does
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
				sessionId: sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
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

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}

// Shared Grok pipeline: reader → normalizePathsBatch → eventOp loop.
// Same shapes as runClinePipeline / runPiPipeline.
async function runGrokPipeline(sessionId: string): Promise<ClinePipelineResult | null> {
	const record = grokReader.readSession(sessionId);
	if (!record) return null;

	const promptText = (record.firstPrompt ?? "").trim();
	const sessionTitle =
		record.title ||
		(promptText
			? promptText.length > 80
				? `${promptText.slice(0, 80)}…`
				: promptText
			: "Grok session");
	const sessionSlug = "";

	const rawEvents = grokReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

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

	// summary.info.cwd is the project working directory — not ~/.grok/sessions.
	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.cwd || "",
	);

	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();

	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
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
				sessionId: sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
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
	const repoRoot = repos.length > 0 ? repos[0].root : (record.cwd || undefined);

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}

// Codex uses the same durable-reader → normalize → accumulate path as Grok.
async function runCodexPipeline(sessionId: string): Promise<ClinePipelineResult | null> {
	const record = codexReader.readSession(sessionId);
	if (!record) return null;

	const promptText = record.firstPrompt.trim();
	const sessionTitle = promptText
		? promptText.length > 80
			? `${promptText.slice(0, 80)}…`
			: promptText
		: "Codex session";
	const sessionSlug = "";
	const rawEvents = codexReader.toUniversalEvents(sessionId);
	if (rawEvents.length === 0) return null;

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
	const normalizedEvents = await normalizationService.normalizePathsBatch(
		rawEvents,
		record.cwd || "",
	);

	for (const discovered of adapter.newlyDiscovered) {
		registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
	}

	const accState = createAccumulatedState(sessionTitle);
	const events: SessionEventRow[] = [];
	const repoSet = new Map<string, { root: string; fileCount: number }>();
	for (let i = 0; i < normalizedEvents.length; i++) {
		const normalizedEvent = normalizedEvents[i];
		const accResult = eventOp(accState, normalizedEvent);
		events.push({
			seq: i,
			type: normalizedEvent.eventType,
			raw: INCLUDE_RAW_EVENT_PAYLOADS ? normalizedEvent.raw : undefined,
			normalized: INCLUDE_RAW_EVENT_PAYLOADS
				? (normalizedEvent as unknown as Record<string, unknown>)
				: { timestamp: normalizedEvent.timestamp },
			accumulated: accResult,
		});
		for (const file of normalizedEvent.files ?? []) {
			const root = file.repository?.gitRoot;
			if (!root) continue;
			const entry = repoSet.get(root) ?? { root, fileCount: 0 };
			entry.fileCount++;
			repoSet.set(root, entry);
		}
	}

	const lastEvent = events[events.length - 1];
	if (lastEvent) {
		const lastTimestamp =
			((lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined) ?? 0;
		events.push({
			seq: lastEvent.seq + 1,
			type: "finished",
			raw: null,
			normalized: { timestamp: lastTimestamp },
			accumulated: {
				id: "",
				timestamp: lastTimestamp,
				sessionId,
				sessionName: accState.sessionName,
				sessionColor: accState.sessionColor,
				operation: "finished",
				files: [],
				dependencies: [],
				description: `${accState.sessionName} finished`,
				layers: [],
				contextTokens: accState.contextTokens,
			},
		});
	}

	const repos = Array.from(repoSet.values())
		.sort((a, b) => b.fileCount - a.fileCount)
		.map((repo) => {
			const parts = repo.root.replace(/\/+$/, "").split("/");
			const known = knownRoots.get(repo.root);
			return {
				root: repo.root,
				fileCount: repo.fileCount,
				owner: known?.owner ?? null,
				name: parts[parts.length - 1] ?? null,
				editing: false,
			};
		});
	const repoRoot = repos.length > 0 ? repos[0].root : record.cwd || undefined;

	return { rawEvents, normalizedEvents, accState, events, repos, repoRoot, sessionTitle, sessionSlug };
}

// opencode stores a placeholder title ("New session - <iso timestamp>") on
// sessions it never generated a title for. Surface the first real user prompt
// text instead so the agent-sessions list reads as actual tasks.
function firstUserPromptText(
	db: import("bun:sqlite").Database,
	aggregateId: string,
): string {
	const userMsg = db
		.prepare(
			`SELECT json_extract(data, '$.info.id') AS id
			 FROM event
			 WHERE aggregate_id = ? AND type = 'message.updated.1'
			   AND json_extract(data, '$.info.role') = 'user'
			 ORDER BY seq ASC LIMIT 1`,
		)
		.get(aggregateId) as { id: string | null } | null;
	if (!userMsg?.id) return "";
	const part = db
		.prepare(
			`SELECT json_extract(data, '$.part.text') AS text
			 FROM event
			 WHERE aggregate_id = ? AND type = 'message.part.updated.1'
			   AND json_extract(data, '$.part.messageID') = ?
			   AND json_extract(data, '$.part.type') = 'text'
			 ORDER BY seq ASC LIMIT 1`,
		)
		.get(aggregateId, userMsg.id) as { text: string | null } | null;
	if (typeof part?.text !== "string" || part.text === "") return "";
	return part.text.replace(/\s+/g, " ").trim();
}

const LIBRARY_TAB_ID = "library";
const AGENT_SESSIONS_TAB_ID = "agent-sessions";
const MERMAID_DEMO_TAB_ID = "mermaid-demo";
const CONCEPTS_TAB_ID = "concepts";

// ---------------------------------------------------------------------------
// CLI args / env
// ---------------------------------------------------------------------------

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

// Which permanent tab the window opens on. `principal-ai agent-sessions` spawns
// with TRAIL_VIEWER_START_TAB=agent-sessions so a bare launch lands straight on
// the Agent Sessions overview. Bare launches default to the Concepts tab.
function resolveStartTab(): string {
	const raw = process.env["TRAIL_VIEWER_START_TAB"];
	if (
		raw === AGENT_SESSIONS_TAB_ID ||
		raw === LIBRARY_TAB_ID ||
		raw === MERMAID_DEMO_TAB_ID ||
		raw === CONCEPTS_TAB_ID
	) {
		return raw;
	}
	return CONCEPTS_TAB_ID;
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
	title: "Trails";
}

interface AgentSessionsTabState {
	id: typeof AGENT_SESSIONS_TAB_ID;
	kind: "agent-sessions";
	title: "Agent Sessions";
}

interface MermaidDemoTabState {
	id: typeof MERMAID_DEMO_TAB_ID;
	kind: "mermaid-demo";
	title: "Session Concepts";
}

interface ConceptsTabState {
	id: typeof CONCEPTS_TAB_ID;
	kind: "concepts";
	title: "Concepts";
}

interface AnalysisTabState {
	id: string;
	kind: "analysis";
	title: string;
	analysisId: string;
}

type TabState =
	| LibraryTabState
	| AgentSessionsTabState
	| MermaidDemoTabState
	| ConceptsTabState
	| AnalysisTabState
	| TrailTabState;

const tabs = new Map<string, TabState>();
tabs.set(AGENT_SESSIONS_TAB_ID, {
	id: AGENT_SESSIONS_TAB_ID,
	kind: "agent-sessions",
	title: "Agent Sessions",
});
tabs.set(LIBRARY_TAB_ID, {
	id: LIBRARY_TAB_ID,
	kind: "library",
	title: "Trails",
});
tabs.set(MERMAID_DEMO_TAB_ID, {
	id: MERMAID_DEMO_TAB_ID,
	kind: "mermaid-demo",
	title: "Session Concepts",
});
tabs.set(CONCEPTS_TAB_ID, {
	id: CONCEPTS_TAB_ID,
	kind: "concepts",
	title: "Concepts",
});
let activeTabId: string = resolveStartTab();
let nextTabId = 1;

// Pre-load the payload so the renderer's first read is synchronous and any
// parse error surfaces at boot rather than after the window is up.

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

/**
 * Focus or create the tab that renders a session's concept analysis. Dedupes
 * by analysisId the way trail tabs dedupe by path — re-analyzing (or reopening
 * via the panel button) focuses the existing analysis tab instead of stacking
 * duplicates. Broadcasts so the renderer can switch the active tab.
 */
function openAnalysisTab(analysisId: string): string {
	for (const existing of tabs.values()) {
		if (existing.kind === "analysis" && existing.analysisId === analysisId) {
			activeTabId = existing.id;
			console.log(`[trail-viewer] analysis tab ${existing.id} focused (already open): ${analysisId}`);
			broadcastTabsChanged();
			return existing.id;
		}
	}
	const analysis = analyses.get(analysisId);
	const id = String(nextTabId++);
	const title = analysis?.sessionTitle
		? `Analysis — ${analysis.sessionTitle}`
		: `Analysis — ${analysisId.slice(0, 12)}`;
	tabs.set(id, { id, kind: "analysis", title, analysisId });
	activeTabId = id;
	console.log(`[trail-viewer] analysis tab ${id} added: ${analysisId}`);
	broadcastTabsChanged();
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

// The request/message schemas + all payload types (TabSummary, TabFullState,
// SessionSummary, SessionGroup, SessionEventRow, RepoInfo, LibraryEntry,
// UserIdentity, ViewerMode, PayloadKind) live in src/shared/contract.ts — the
// single cross-process contract both this host and the renderer import.
type TrailViewerRPC = {
	bun: RPCSchema<{
		requests: TrailViewerRequests;
		messages: TrailViewerMessages;
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



/**
 * Permanent, non-trail tabs (library, agent sessions, mermaid demo, concepts).
 * They carry no trail payload and don't serve files or notes; several RPC
 * handlers use this to reject calls aimed at trail-only state.
 */
function isStaticTab(
	tab: TabState,
): tab is LibraryTabState | AgentSessionsTabState | MermaidDemoTabState | ConceptsTabState {
	return (
		tab.kind === "library" ||
		tab.kind === "agent-sessions" ||
		tab.kind === "mermaid-demo" ||
		tab.kind === "concepts"
	);
}

function summarize(tab: TabState): TabSummary {
	if (tab.kind === "analysis") {
		return { id: tab.id, kind: "analysis", title: tab.title };
	}
	if (isStaticTab(tab)) {
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
	if (tab.kind === "analysis") {
		return {
			ok: true,
			id: tab.id,
			kind: "analysis",
			title: tab.title,
			analysisId: tab.analysisId,
			payload: analyses.get(tab.analysisId) ?? null,
		};
	}
	if (isStaticTab(tab)) {
		return { ok: true, id: tab.id, kind: tab.kind, title: tab.title };
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
				if (tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "mermaid-demo" || tab.kind === "concepts" || tab.kind === "analysis") {
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
					if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "mermaid-demo" || tab.kind === "concepts" || tab.kind === "analysis") return { files: [] };
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
			listSessions: async ({ days }) => {
				const dayCount = Math.max(1, Math.floor(days ?? 7));
				const cutoff = Date.now() - dayCount * 86400000;
				const dbPath = openCodeDBPath();
				let db: import("bun:sqlite").Database | null = null;
				try {
					const { Database } = await import("bun:sqlite");
					db = new Database(dbPath, { readonly: true });
					const sevenDaysAgo = cutoff;
					// One pass over every session's first event — the window split
					// happens in JS so we never scan the (large) event table twice.
					const firstEvents = db
						.prepare(
							`SELECT
								e.aggregate_id,
								e.data
							FROM event e
							WHERE e.seq = (SELECT MIN(e2.seq) FROM event e2 WHERE e2.aggregate_id = e.aggregate_id)
							ORDER BY e.seq DESC`,
						)
						.all() as Array<{
						aggregate_id: string;
						data: string;
					}>;
					const idToSummary = new Map<string, SessionSummary>();
					// Older-than-window signal: any session whose first event predates
					// the cutoff. Drives the renderer's "Load more" affordance.
					let hasOlder = false;
					for (const row of firstEvents) {
						let title = row.aggregate_id.slice(0, 12);
						let slug = "";
						let createdAtStr = "";
						const durationMs = 0;
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
							}
						} catch {
							// best-effort parse
						}
						// Sessions the old SQL cutoff would have dropped (no date, or
						// predating the window) never enter the list; predating ones
						// still count as "more exists".
						const createdMs = createdAtStr ? new Date(createdAtStr).getTime() : 0;
						if (!createdMs) continue;
						if (createdMs <= cutoff) {
							hasOlder = true;
							continue;
						}
						if (title.startsWith("New session")) {
							const promptText = firstUserPromptText(db, row.aggregate_id);
							if (promptText) title = promptText;
						}
						idToSummary.set(row.aggregate_id, {
							id: row.aggregate_id,
							title,
							slug,
							createdAt: createdAtStr,
							durationMs,
							eventCount: 0,
							isFinished: false,
							models: undefined,
						});
					}
					// opencode stamps the session model into the `info` blob; the
					// created event only carries it ~1/3 of the time but every
					// session.updated event does, so take the earliest event that
					// has it. The model is static per session, so one id suffices.
					const modelRows = db
						.prepare(
							`SELECT
								aggregate_id,
								json_extract(data, '$.info.model.id') AS model_id
							FROM event
							WHERE aggregate_id IN (
								SELECT aggregate_id
								FROM event
								WHERE json_extract(data, '$.info.time.created') > ?
							)
								AND json_extract(data, '$.info.model.id') IS NOT NULL
							GROUP BY aggregate_id`,
						)
						.all(sevenDaysAgo) as Array<{ aggregate_id: string; model_id: string | null }>;
					for (const m of modelRows) {
						const summary = idToSummary.get(m.aggregate_id);
						if (summary && m.model_id) summary.models = [m.model_id];
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
						const child = idToSummary.get(rel.child_id);
						if (!child) continue;
						if (rel.status === "completed" || rel.status === "error") {
							child.isFinished = true;
						}
						childIds.add(rel.child_id);
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
					// Append Cline CLI sessions (durable transcript, not in opencode DB)
					for (const clineSession of clineReader.listSessions()) {
						const meta = clineSession.metadata;
						const promptText = cleanClinePrompt(meta.prompt ?? "");
						const title = promptText
							? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
							: "Cline session";
						const createdAtStr = meta.started_at ?? "";
						const durationMs = meta.ended_at
							? new Date(meta.ended_at).getTime() - new Date(meta.started_at ?? meta.ended_at).getTime()
							: 0;
						const eventCount = clineReader.readMessages(clineSession.sessionId)?.messages.length ?? 0;
						standalone.push({
							id: clineSession.sessionId,
							title,
							slug: "",
							createdAt: createdAtStr,
							lastEventAt: meta.ended_at ?? meta.started_at ?? undefined,
							durationMs,
							eventCount,
							isFinished: meta.status === "completed" || meta.status === "failed",
							models: meta.model ? [meta.model] : undefined,
							agent: "cline",
						});
					}
					// Append pi CLI sessions (durable JSONL transcript, not in opencode DB)
					for (const piSession of piReader.listSessions()) {
						const promptText = piSession.firstPrompt;
						const title = promptText
							? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
							: "pi session";
						const createdAtStr = piSession.header.timestamp ?? "";
						const durationMs = Math.max(0, piSession.lastActivity - new Date(createdAtStr || 0).getTime());
						standalone.push({
							id: piSession.sessionId,
							title,
							slug: "",
							createdAt: createdAtStr,
							lastEventAt: new Date(piSession.lastActivity).toISOString(),
							durationMs,
							eventCount: piSession.messageCount,
							isFinished: false,
							agent: "pi",
						});
					}
					// Append Grok Build sessions (durable updates.jsonl under ~/.grok/sessions)
					for (const grokSession of grokReader.listSessions()) {
						const createdAtStr = grokSession.createdAt ?? "";
						const durationMs = Math.max(
							0,
							grokSession.lastActivity - new Date(createdAtStr || 0).getTime(),
						);
						standalone.push({
							id: grokSession.sessionId,
							title: grokSession.title || "Grok session",
							slug: "",
							createdAt: createdAtStr,
							lastEventAt: new Date(grokSession.lastActivity).toISOString(),
							durationMs,
							eventCount: grokSession.messageCount,
							isFinished: false,
							models: grokSession.modelId ? [grokSession.modelId] : undefined,
							agent: "grok",
						});
					}
					// Append Codex durable rollout sessions (under ~/.codex/sessions).
					for (const codexSession of codexReader.listSessions()) {
						const createdAtStr =
							typeof codexSession.meta.timestamp === "string"
								? codexSession.meta.timestamp
								: new Date(codexSession.lastActivity).toISOString();
						standalone.push({
							id: codexSession.sessionId,
							title: codexSession.firstPrompt || "Codex session",
							slug: "",
							createdAt: createdAtStr,
							lastEventAt: new Date(codexSession.lastActivity).toISOString(),
							durationMs: 0,
							eventCount: codexSession.messageCount,
							isFinished: false,
							models:
								typeof codexSession.meta.model_provider === "string"
									? [codexSession.meta.model_provider]
									: undefined,
							agent: "codex",
						});
					}
					return { groups, standalone, hasMore: hasOlder };
				} catch (err) {
					console.warn(`[trail-viewer] listSessions failed: ${(err as Error).message}`);
					// Still surface durable-transcript agents when the opencode DB is missing.
					const standalone: SessionSummary[] = [];
					try {
						for (const clineSession of clineReader.listSessions()) {
							const meta = clineSession.metadata;
							const promptText = cleanClinePrompt(meta.prompt ?? "");
							const title = promptText
								? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
								: "Cline session";
							standalone.push({
								id: clineSession.sessionId,
								title,
								slug: "",
								createdAt: meta.started_at ?? "",
								durationMs: 0,
								eventCount: clineReader.readMessages(clineSession.sessionId)?.messages.length ?? 0,
								isFinished: meta.status === "completed" || meta.status === "failed",
								agent: "cline",
							});
						}
						for (const piSession of piReader.listSessions()) {
							const promptText = piSession.firstPrompt;
							const title = promptText
								? promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText
								: "pi session";
							standalone.push({
								id: piSession.sessionId,
								title,
								slug: "",
								createdAt: piSession.header.timestamp ?? "",
								durationMs: 0,
								eventCount: piSession.messageCount,
								isFinished: false,
								agent: "pi",
							});
						}
						for (const grokSession of grokReader.listSessions()) {
							standalone.push({
								id: grokSession.sessionId,
								title: grokSession.title || "Grok session",
								slug: "",
								createdAt: grokSession.createdAt ?? "",
								durationMs: 0,
								eventCount: grokSession.messageCount,
								isFinished: false,
								agent: "grok",
							});
						}
						for (const codexSession of codexReader.listSessions()) {
							standalone.push({
								id: codexSession.sessionId,
								title: codexSession.firstPrompt || "Codex session",
								slug: "",
								createdAt:
									typeof codexSession.meta.timestamp === "string"
										? codexSession.meta.timestamp
										: "",
								durationMs: 0,
								eventCount: codexSession.messageCount,
								isFinished: false,
								agent: "codex",
							});
						}
					} catch {
						// best-effort
					}
					return { groups: [], standalone, hasMore: false };
				} finally {
					db?.close();
				}
			},
			createTrailNote: ({ tabId, draft }) => {
				const tab = getTab(tabId);
				if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "mermaid-demo" || tab.kind === "concepts" || tab.kind === "analysis") {
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
				if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "mermaid-demo" || tab.kind === "concepts" || tab.kind === "analysis") {
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
				if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "mermaid-demo" || tab.kind === "concepts" || tab.kind === "analysis") {
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
				if (!tab || tab.kind === "library" || tab.kind === "agent-sessions" || tab.kind === "mermaid-demo" || tab.kind === "concepts" || tab.kind === "analysis") {
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
				// Cline CLI sessions: read the durable transcript, not the opencode DB
				if (isClineSession(sessionId)) {
					try {
						const result = await runClinePipeline(sessionId);
						if (!result) return { ok: false, error: "Cline session not found or empty" };
						return { ok: true, events: result.events, repoRoot: result.repoRoot, repos: result.repos, session: { slug: result.sessionSlug, title: result.sessionTitle, agent: "cline" } };
					} catch (err) {
						return { ok: false, error: (err as Error).message };
					}
				}
				// pi CLI sessions: read the durable JSONL transcript, not the opencode DB
				if (isPiSession(sessionId)) {
					try {
						const result = await runPiPipeline(sessionId);
						if (!result) return { ok: false, error: "pi session not found or empty" };
						return { ok: true, events: result.events, repoRoot: result.repoRoot, repos: result.repos, session: { slug: result.sessionSlug, title: result.sessionTitle, agent: "pi" } };
					} catch (err) {
						return { ok: false, error: (err as Error).message };
					}
				}
				// Grok Build sessions: read durable updates.jsonl, not the opencode DB
				if (isGrokSession(sessionId)) {
					try {
						const result = await runGrokPipeline(sessionId);
						if (!result) return { ok: false, error: "Grok session not found or empty" };
						return {
							ok: true,
							events: result.events,
							repoRoot: result.repoRoot,
							repos: result.repos,
							session: {
								slug: result.sessionSlug,
								title: result.sessionTitle,
								agent: "grok",
							},
						};
					} catch (err) {
						return { ok: false, error: (err as Error).message };
					}
				}
				// Codex sessions are durable rollouts, never opencode SQLite rows.
				if (isCodexSession(sessionId)) {
					try {
						const result = await runCodexPipeline(sessionId);
						if (!result) return { ok: false, error: "Codex session not found or empty" };
						return {
							ok: true,
							events: result.events,
							repoRoot: result.repoRoot,
							repos: result.repos,
							session: {
								slug: result.sessionSlug,
								title: result.sessionTitle,
								agent: "codex",
							},
						};
					} catch (err) {
						return { ok: false, error: (err as Error).message };
					}
				}
				const dbPath = openCodeDBPath();
				let db: import("bun:sqlite").Database | null = null;
				try {
					const { Database } = await import("bun:sqlite");
					db = new Database(dbPath, { readonly: true });
					const rows = db
						.prepare(
							`SELECT id, aggregate_id, seq, type, data FROM event WHERE aggregate_id = ? ORDER BY seq ASC`,
						)
						.all(sessionId) as Array<{
						id: string;
						aggregate_id: string;
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
					if (sessionTitle.startsWith("New session")) {
						const promptText = firstUserPromptText(db, sessionId);
						if (promptText) sessionTitle = promptText;
					}
					const universalEvents = opencodeRowsToUniversalEvents(
						rows.map((r) => ({ id: r.id, aggregateId: r.aggregate_id, seq: r.seq, type: r.type, data: r.data })),
					);
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
					const { normalized, adapter } = await normalizeEventsWithAdapter(universalEvents, "", knownRoots);
					// Auto-register any newly discovered git roots
					for (const discovered of adapter.newlyDiscovered) {
						registerProjectInAlexandria(discovered.root, discovered.remoteUrl);
					}
					const accumulated = accumulateEvents(normalized, sessionTitle);
					const events: SessionEventRow[] = accumulated.map((entry, i) => {
						const rawEnvelope = entry.normalized.raw as { data?: unknown; type?: string; seq?: number } | undefined;
						const seq = rawEnvelope?.seq ?? i;
						return {
							seq,
							type: rawEnvelope?.type ?? entry.normalized.eventType,
							raw: INCLUDE_RAW_EVENT_PAYLOADS ? rawEnvelope?.data : undefined,
							normalized: INCLUDE_RAW_EVENT_PAYLOADS
								? (entry.normalized as unknown as Record<string, unknown>)
								: { timestamp: entry.normalized.timestamp },
							accumulated: entry.accumulated as AgentSessionEvent | null,
						};
					});
					const lastEvent = events[events.length - 1];
					if (lastEvent) {
						const lastTimestamp = (lastEvent.normalized as Record<string, unknown>)["timestamp"] as number | undefined ?? 0;
						const lastAcc = lastEvent.accumulated ?? ({} as AgentSessionEvent);
						const lastSessionName = lastAcc.sessionName ?? sessionTitle;
						const lastSessionColor = lastAcc.sessionColor ?? "";
						const lastContextTokens = lastAcc.contextTokens;
						events.push({
							seq: lastEvent.seq + 1,
							type: "finished",
							raw: null,
							normalized: { timestamp: lastTimestamp },
							accumulated: {
								id: "",
								timestamp: lastTimestamp,
								sessionId: sessionSlug,
								sessionName: lastSessionName,
								sessionColor: lastSessionColor,
								operation: "finished",
								files: [],
								dependencies: [],
								description: `${lastSessionName} finished`,
								layers: [],
								contextTokens: lastContextTokens,
							},
						});
					}
					const repoSet = new Map<string, { root: string; fileCount: number }>();
					for (const ev of normalized) {
						if (!ev.files) continue;
						for (const f of ev.files) {
							const root = f.repository?.gitRoot;
							if (root) {
								const entry = repoSet.get(root) ?? { root, fileCount: 0 };
								entry.fileCount++;
								repoSet.set(root, entry);
							}
						}
					}
					const repos: RepoInfo[] = collectRepositories(normalized)
						.map((r) => {
							const entry = repoSet.get(r.root);
							const parts = r.root.replace(/\/+$/, "").split("/");
							return { root: r.root, fileCount: entry?.fileCount ?? 0, owner: r.owner ?? null, name: r.repo ?? parts[parts.length - 1] ?? null, editing: false };
						})
						.sort((a, b) => b.fileCount - a.fileCount);
					const repoRoot = repos.length > 0 ? repos[0].root : undefined;
					return { ok: true, events, repoRoot, repos, session: { slug: sessionSlug, title: sessionTitle, agent: "opencode" } };
				} catch (err) {
					return { ok: false, error: (err as Error).message };
				} finally {
					db?.close();
				}
			},
			listAnalyses: async () => {
				return { analyses: analyses.summaries() };
			},
			analyzeSession: async ({ sessionId, title, agent }) => {
				const existing = analyses.findBySession(sessionId);
				if (existing) {
					// Idempotent: an analysis already exists for this session, so we
					// just open (or focus) its tab and report the same analysis id.
					const tabId = openAnalysisTab(existing.id);
					return { ok: true, analysisId: existing.id, tabId };
				}
				const id = newAnalysisId();
				analyses.save({
					id,
					sessionId,
					sessionTitle: title,
					agent,
					createdAt: new Date().toISOString(),
					status: "done",
					concepts: [
						stubConceptCard({
							sessionId,
							sessionTitle: title,
							agent,
						}),
					],
				});
				const tabId = openAnalysisTab(id);
				console.log(`[trail-viewer] analysis ${id} created for session ${sessionId} (stub)`);
				return { ok: true, analysisId: id, tabId };
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
	if (
		id === LIBRARY_TAB_ID ||
		id === AGENT_SESSIONS_TAB_ID ||
		id === MERMAID_DEMO_TAB_ID ||
		id === CONCEPTS_TAB_ID
	) {
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
		if (msg.kind === "ACTIVATE_TAB") {
			// Switch a running viewer to a permanent tab (e.g. the CLI's
			// `principal-ai agent-sessions` bringing the app forward).
			if (msg.tabId !== LIBRARY_TAB_ID && msg.tabId !== AGENT_SESSIONS_TAB_ID) {
				return { ok: false, error: `unknown permanent tab: ${msg.tabId}` };
			}
			activeTabId = msg.tabId;
			broadcastTabsChanged();
			try {
				browserWindow.focus();
			} catch (err) {
				console.warn(`[trail-viewer] could not focus window: ${(err as Error).message}`);
			}
			return { ok: true };
		}
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
