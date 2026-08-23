/**
 * The cross-process RPC contract for the trail-viewer.
 *
 * Single source of truth for the electrobun RPC schema and every payload type
 * that crosses the bun-host / webview boundary. Both `src/bun/index.ts` (host,
 * wrapped in `RPCSchema<…>` from electrobun/bun) and `src/mainview/…`
 * (renderer, passed to `Electroview.defineRPC`) import from here instead of
 * re-declaring the same interfaces — everything here is a compile-time type, so
 * the two processes share it with zero runtime coupling.
 *
 * Only the wire-facing types live here. Host-internal state (tab lifecycle,
 * caches) and renderer-only state machines (`TabState`) stay on their side.
 */

import type { AgentSessionEvent } from "@principal-ai/agent-monitoring";

export type ViewerMode = "local" | "remote";
export type PayloadKind = "trail" | "tour";

export interface RepoInfo {
	root: string;
	fileCount: number;
	owner: string | null;
	name: string | null;
	editing: boolean;
}

export interface SessionSummary {
	id: string;
	title: string;
	slug: string;
	createdAt: string;
	lastEventAt?: string;
	durationMs: number;
	eventCount: number;
	isFinished: boolean;
	repoRoot?: string;
	repos?: RepoInfo[];
	agent?: string;
	/** Distinct model ids the session used, in first-use order. */
	models?: string[];
}

export interface SessionGroup {
	parent: SessionSummary;
	children: SessionSummary[];
}

export interface SessionEventRow {
	seq: number;
	type: string;
	raw: unknown;
	normalized: Record<string, unknown>;
	accumulated: AgentSessionEvent | null;
}

// ---------------------------------------------------------------------------
// Concept analyses — the shared shape for "a session analyzed into concept
// cards". The renderer's curated registry (`src/mainview/concepts.ts`) aliases
// these types so hand-curated cards and agent-extracted cards are the same
// shape on the wire and on the feed.
// ---------------------------------------------------------------------------

export type ConceptChangeType =
	| "execution" // timing: when X happens relative to Y (reveal, defer, refresh)
	| "derive" // single source of truth / canonical identity
	| "integration" // how an embedded component integrates with its host
	| "ui"; // building a UI surface / view

/** One concept card, either hand-curated or extracted by an agent. */
export interface ConceptCardData {
	id: string;
	title: string;
	changeType: ConceptChangeType;
	/** Optional phase — lets us sort/filter as the set grows. */
	status?: "draft" | "refining" | "stable";
	/** Sessions that surfaced or refined this concept (grouped here). */
	sessionIds: string[];
	/** Repositories the concept's sessions worked in (owner/name pairs). */
	repos: Array<{ owner: string; name: string }>;
	/** One-to-two sentence description for the card's left pane. */
	description: string;
	/** Short bullet points that state the key idea. */
	points: string[];
	/** Mermaid source for the right (diagram) side of the card. */
	mermaid: string;
	/** Optional rich markdown prose (paragraphs, lists, tables, blockquotes)
	 *  for slide presentation. When absent, renderers derive a slide from
	 *  `description` + `points`. */
	markdown?: string;
	/** Purl file-refs (`pkg:<type>/<owner>/<name>#<repo-root-relative-path>`)
	 *  the concept is about — click-to-open sources. Resolved by the host via
	 *  `openFile`. Optional; extracted cards may carry 1–3 of these. */
	files?: string[];
	/** Arc-analysis shape: `arc` = a main thread of the session, `detour` = a
	 *  self-contained deviation (problem → fix → back). Absent on curated
	 *  cross-session cards. */
	arcKind?: "arc" | "detour";
	/** 1-based beat indices this arc/detour spans (the session's beats, as
	 *  numbered by the host beat analyzer). Present on arc-extracted cards. */
	keyBeats?: number[];
}

/**
 * Subsystem snapshots — the durable, verifiable record of a concept being
 * worked on or analyzed (see the "Subsystem artifact: facets" topic). A session
 * may touch several subsystems, so an analysis can carry multiple snapshots.
 *
 * Facets: entry points (the verifiable currency), integration edges (the
 * composable currency), files (membership), tests (how it's tested, separate
 * from how it exists), and the per-capture sequence + component graphs.
 */

export type SubsystemEntryPointKind =
	| "class"
	| "function"
	| "interface"
	| "type"
	| "const"
	| "method";

/** A verifiable symbol the subsystem exposes. `signature` is the verbatim
 *  source line, captured so a verifier can re-check the artifact against the
 *  codebase without session context. */
export interface SubsystemEntryPoint {
	symbol: string;
	kind: SubsystemEntryPointKind;
	/** Purl file-ref (`pkg:<type>/<owner>/<name>#<path>`) where it lives. */
	file: string;
	line?: number;
	signature?: string;
}

export interface SubsystemFileRef {
	/** Purl file-ref. */
	purl: string;
	role: "core" | "supporting";
	/** One-line purpose so graphs/tables read without knowing every file. */
	purpose?: string;
}

export type SubsystemIntegrationMechanism =
	| "imports"
	| "calls"
	| "extends"
	| "registers-into";

export interface SubsystemIntegration {
	/** Target component/subsystem/purl the edge points at. */
	to: string;
	mechanism: SubsystemIntegrationMechanism;
	/** Concrete file/symbol refs backing the edge (the seam). */
	refs: string[];
}

export interface SubsystemTestSuite {
	/** Purl of the test file. */
	file: string;
	/** Entry-point symbols this suite exercises. */
	exercises: string[];
	/** What the suite pins, in words. */
	verifies?: string;
}

export interface SubsystemSnapshot {
	id: string;
	/** Stable name of the concept being worked on. */
	name: string;
	description?: string;
	repo?: { owner: string; name: string };
	files: SubsystemFileRef[];
	entryPoints: SubsystemEntryPoint[];
	integrations: SubsystemIntegration[];
	/** Purl file-refs of fixtures the subsystem is built against. */
	fixtures: string[];
	testSuites: SubsystemTestSuite[];
	/** Per-capture execution story — the volatile, central layer. */
	sequenceMermaid?: string;
	/** Component graph (kind-tagged components) — the stable substrate. */
	graphMermaid?: string;
	/** Sessions that refined this snapshot (appended on recurrence). */
	sessionIds: string[];
}

/** A component node in a subsystem graph. */
export interface SubsystemGraphComponent {
	id: string;
	name: string;
	kind: string;
	file: string;
	purl: string;
	purpose?: string;
	symbol?: string;
	layer?: number;
	capture?: "edited" | "analyzed" | "referenced";
}

/** A cross-component edge in a subsystem graph. */
export interface SubsystemGraphEdge {
	id: string;
	from: string;
	to: string;
	mechanism: string;
	refs?: string[];
}

/** On-disk record for a persisted subsystem graph. */
export interface StoredSubsystemGraph {
	id: string;
	title: string;
	description?: string;
	components: SubsystemGraphComponent[];
	edges: SubsystemGraphEdge[];
	createdAt: string;
	updatedAt: string;
	source?: string;
	repo?: { owner: string; name: string };
	/** Local root component `file` paths resolve against (sandboxed reads). */
	repoRoot?: string;
}

/** Lightweight listing row for the Subsystems tab (no components/edges). */
export interface SubsystemGraphSummary {
	id: string;
	title: string;
	description?: string;
	componentCount: number;
	edgeCount: number;
	createdAt: string;
	updatedAt: string;
	source?: string;
	repo?: { owner: string; name: string };
}

/** A concept card deliberately saved out of an analysis. Carries the full card
 *  (a copy — safe from later re-extraction) plus provenance. What the Concepts
 *  tab renders. */
export interface SavedConcept extends ConceptCardData {
	/** Stable store key — `saved-<analysisId>-<cardId>`. */
	savedConceptId: string;
	/** Where the card came from. `analysis` today; reserved for future curated
	 *  imports. */
	source: "curated" | "analysis";
	/** The analysis this card was saved out of, when `source === "analysis"`. */
	sourceAnalysisId?: string;
	/** The session that analysis covers, when `source === "analysis"`. */
	sourceSessionId?: string;
	savedAt: string;
}

export type AnalysisStatus = "pending" | "done" | "error";

/** The extractor prompt surfaces: what the agent is asked, verbatim. Served as
 *  the payload of a `kind: "prompt"` tab. */
export interface ExtractionPromptInfo {
	/** opencode agent name the run invokes. */
	agent: string;
	/** Model passed via `-m` on the run. */
	model: string;
	/** The agent's system prompt, read from its config file on disk. */
	systemPrompt: string;
	/** The task message template — `<session title>` is the interpolation point. */
	taskTemplate: string;
	/** Absolute path of the agent file the system prompt was read from. */
	agentPath: string;
}

/** Full record for one analyzed session, stored host-side on disk. */
export interface ConceptAnalysis {
	id: string;
	sessionId: string;
	sessionTitle?: string;
	sessionSlug?: string;
	agent?: string;
	createdAt: string;
	status: AnalysisStatus;
	/** Model that produced the extraction (the opencode run's model). */
	model?: string;
	/** Present when `status === "error"`. */
	error?: string;
	/** Concept cards teased out of the session. Empty until `status === "done"`. */
	concepts: ConceptCardData[];
	/** Subsystem snapshots teased out of the session — one per subsystem the
	 *  session worked on or analyzed. Empty until `status === "done"`. */
	subsystems?: SubsystemSnapshot[];
}

/** Row in the analyses index — enough to surface state + count without the cards. */
export interface AnalysisSummary {
	id: string;
	sessionId: string;
	sessionTitle?: string;
	status: AnalysisStatus;
	createdAt: string;
	conceptCount: number;
}

export interface TabSummary {
	id: string;
	kind: "library" | "trail" | "agent-sessions" | "analysis" | "session-events" | "prompt" | "subsystem-graph" | "subsystems";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
}

export interface TabFullState {
	ok: boolean;
	error?: string;
	id: string;
	kind: "library" | "trail" | "agent-sessions" | "analysis" | "session-events" | "prompt" | "subsystem-graph" | "subsystems";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
	repoRoot?: string;
	trailFilePath?: string;
	sessionId?: string;
	/** For `analysis` tabs — the analysis id the tab renders. */
	analysisId?: string;
	/** For `subsystem-graph` tabs — the graph id the tab renders. */
	graphId?: string;
	payload?: unknown;
	/** Repo identity resolved host-side (git origin / explicit remote).
	 *  `owner === "local"` means no GitHub origin was found; any other owner is a
	 *  GitHub identity the header can link to. Mirrors the library rows. */
	owner?: string;
	repo?: string;
}

export interface LibraryEntry {
	/** "trail" or a File City introduction "tour". Drives the row badge and how
	 *  the row opens (tours are always local-mode). */
	kind: "trail" | "tour";
	trailFile: string;
	id: string;
	title: string;
	anchor: string; // "<ns>/<name>" or "by-id"
	owner?: string;
	repo?: string;
	/**
	 * For local-purl trails (`pkg:generic/local/<slug>`) whose decoded slug
	 * resolves to an existing directory on disk. When set, clicking the entry
	 * opens the trail in `local` mode anchored here, so slice resolution reads
	 * from the working tree instead of trying to fetch from GitHub.
	 */
	localRepoRoot?: string;
	/**
	 * True when the trail file carries a `share.id` — i.e. it has been published
	 * to web-ade. Drives the Draft/Published badge in the library list. Read-only
	 * derivation of the existing share field; no new on-disk state.
	 */
	published: boolean;
	mtimeMs: number;
}

/** Local `git config user.name` / `user.email`. */
export interface GitConfigIdentity {
	name?: string;
	email?: string;
}

/** Identity of the person using the viewer, resolved host-side from
 *  gh CLI → TRAIL_GH_TOKEN → git config. */
export interface UserIdentity {
	login?: string;
	name?: string;
	avatarUrl?: string;
	htmlUrl?: string;
	source: "gh" | "token" | "git" | "none";
	/** Local git config, always read even when signed in to GitHub. */
	git?: GitConfigIdentity;
}

/** Status of the opencode v2 server, probed host-side the same way opencode's
 *  own daemon does it: read the registration (`server.json` in the opencode
 *  state dir) for the URL, read the `password` file for Basic auth, then GET
 *  `/api/health`. `running: false` also covers "no registration on disk" (the
 *  server was never started / has exited). */
export interface OpencodeServerStatus {
	running: boolean;
	/** The server's URL when running, e.g. `http://127.0.0.1:4096`. */
	url?: string;
	/** opencode version from the registration file, when running. */
	version?: string;
}

/** One session in the header's server-session list — active now, or active
 *  within the recent window. `lastEvent` is the most recent event the host's
 *  `/api/event` subscription has seen for the session (type + wall-clock time);
 *  it keeps moving while the session works, even between list polls. */
export interface ServerSessionRow {
	sessionId: string;
	/** Session title from the server's list response. */
	title?: string;
	/** Live state from `/api/session/status` or `session.status` events.
	 *  Absent means idle (the server's status map deletes idle entries). */
	status?: "busy" | "retry" | "idle";
	/** The provider error on a `retry` status, when reported. */
	retryMessage?: string;
	/** Epoch ms of the session's last update (from the list response or an
	 *  observed event). */
	updatedAt?: number;
	lastEvent?: { type: string; at: number };
}

/** The renderer → host request surface. Keyed by RPC name. Defined as a `type`
 *  (not `interface`) so it satisfies electrobun's index-signature schema
 *  constraint (`{ [key: string]: { params; response } }`) on both sides. */
export type TrailViewerRequests = {
	listTabs: {
		params: Record<string, never>;
		response: {
			tabs: TabSummary[];
			/** Which tab the host suggests showing: the boot start tab, a trail
			 *  seeded by LOAD_TRAIL, or the last tab the renderer reported via
			 *  setActiveTab. The renderer owns the active tab; it applies this
			 *  only as its initial/resume value (until the user clicks). */
			suggestedActiveTabId: string;
		};
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
		/** How many days back to list (opencode applies it as the SQL cutoff;
		 *  cline/pi/grok return their full lists and the renderer window-filters).
		 *  Defaults to 7 when omitted. */
		params: { days?: number };
		response: {
			groups: SessionGroup[];
			standalone: SessionSummary[];
			/** True when opencode has at least one session older than the requested
			 *  window — the signal for the renderer's "Load more" affordance. */
			hasMore?: boolean;
		};
	};
	getSessionEvents: {
		params: {
			sessionId: string;
			/** Include the full raw event payloads. Off by default because raw
			 *  payloads reach hundreds of MB per session; the session-events tab
			 *  (the raw → normalized → accumulated feed) requests them. */
			includeRaw?: boolean;
			/** Page window over the built event set (by seq). The session-events
			 *  tab pages so each RPC message stays bounded instead of shipping
			 *  the whole session's raw payloads at once. */
			offset?: number;
			limit?: number;
			/** Serve the processed timeline from the on-disk session cache.
			 *  Defaults to true. Live refreshes (the 30s poll of working
			 *  sessions) pass false so a growing session is always re-processed
			 *  from raw rather than served stale. */
			useCache?: boolean;
		};
		response: {
			ok: boolean;
			error?: string;
			events?: SessionEventRow[];
			/** Total rows in the built set, for pagination. */
			total?: number;
			/** True when more rows exist beyond this page. */
			hasMore?: boolean;
			repoRoot?: string;
			repos?: RepoInfo[];
			session?: { slug: string; title: string; agent?: string };
		};
	};
	getAgentSessionsOverview: {
		/** How many days back the overview covers (defaults to 7). */
		params: { days?: number };
		response: {
			ok: boolean;
			error?: string;
			groups: SessionGroup[];
			standalone: SessionSummary[];
			/** True when opencode has at least one session older than the
			 *  requested window — the signal for the renderer's "Load more"
			 *  affordance. */
			hasMore?: boolean;
			/** Every processed session in the window, with its full (trimmed)
			 *  event timeline, so the renderer can assemble the Agent Sessions
			 *  view from a single call instead of N getSessionEvents
			 *  round-trips. Served from the host's resident store / disk cache. */
			processed: Array<{
				id: string;
				agent: string;
				session: { slug: string; title: string; agent?: string };
				repoRoot?: string;
				repos: RepoInfo[];
				events: SessionEventRow[];
			}>;
		};
	};
	openSessionEventsTab: {
		params: { sessionId: string; title?: string; agent?: string };
		response: { ok: boolean; error?: string; tabId?: string };
	};
	openAnalysisTab: {
		params: { analysisId: string };
		response: { ok: boolean; error?: string; tabId?: string };
	};
	listAnalyses: {
		params: Record<string, never>;
		response: { analyses: AnalysisSummary[] };
	};
	/** Full analysis records (concept/arc cards included) — the renderer maps
	 *  each session's cards onto `AgentSessionView.arcs` so the panel can expand
	 *  arcs inline instead of only opening an analysis tab. */
	listAnalysesFull: {
		params: Record<string, never>;
		response: { analyses: ConceptAnalysis[] };
	};
	listSavedConcepts: {
		params: Record<string, never>;
		response: { concepts: SavedConcept[] };
	};
	saveConcept: {
		params: { analysisId: string; conceptId: string };
		response: {
			ok: boolean;
			error?: string;
			/** The saved record — an existing one when the card was already
			 *  saved (the action is idempotent). */
			savedConcept?: SavedConcept;
		};
	};
	unsaveConcept: {
		params: { savedConceptId: string };
		response: { ok: boolean; error?: string };
	};
	deleteAnalysis: {
		params: { analysisId: string };
		response: { ok: boolean; error?: string };
	};
	getSubsystemGraph: {
		params: { graphId: string };
		response: { ok: boolean; error?: string; graph?: StoredSubsystemGraph };
	};
	listSubsystemGraphs: {
		params: Record<string, never>;
		response: { graphs: SubsystemGraphSummary[] };
	};
	openSubsystemGraph: {
		params: { graphId: string };
		response: { ok: boolean; error?: string; tabId?: string };
	};
	deleteSubsystemGraph: {
		params: { graphId: string };
		response: { ok: boolean; error?: string };
	};
	openPromptTab: {
		params: Record<string, never>;
		response: { ok: boolean; error?: string; tabId?: string };
	};
	analyzeSession: {
		params: {
			sessionId: string;
			title?: string;
			agent?: string;
			/** Re-run an existing analysis: the record is reset to `pending` and
			 *  extraction restarts in place (same analysis id, so open tabs stay
			 *  wired to it). Defaults to false — without it an existing record
			 *  (even one in `error`) just re-opens its tab. */
			force?: boolean;
		};
		response: {
			ok: boolean;
			error?: string;
			/** The analysis id — an existing analysis for this session when one
			 *  already exists (the action is idempotent). */
			analysisId?: string;
			/** Tab id the analysis opened in, when a tab was created/activated. */
			tabId?: string;
		};
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
	openFile: {
		params: { purl: string };
		response: { ok: boolean; error?: string };
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
	getOpencodeServerStatus: {
		params: Record<string, never>;
		response: OpencodeServerStatus;
	};
	getServerSessions: {
		params: Record<string, never>;
		response: {
			ok: boolean;
			/** False when no opencode server registration is on disk. */
			running: boolean;
			error?: string;
			sessions: ServerSessionRow[];
		};
	};
	/** Start/stop the host's live `/api/event` subscription. While active, the
	 *  host broadcasts `serverEventsChanged` with each session's latest event
	 *  so the header's session list stays live without polling. */
	setServerEventWatch: {
		params: { active: boolean };
		response: { ok: boolean };
	};
}

/** Host → renderer notifications. Keyed by message name. */
export type TrailViewerMessages = {
	/** Fired when the tab list changes (LOAD_TRAIL, close, host-initiated
	 *  opens). The renderer refreshes its registry from listTabs. `focusTabId`
	 *  is present when the host wants a specific tab on screen (a tab it just
	 *  created, or an external activation) — the renderer applies it to its own
	 *  active-tab state; when absent the renderer keeps its current selection. */
	tabsChanged: {
		focusTabId?: string;
	};
	/** The warm-up worker re-processed these sessions (a live-refresh request)
	 *  and their disk cache is now fresh. The renderer should re-fetch them. */
	sessionsUpdated: {
		sessionIds: string[];
	};
	/** Live "last event" updates for the sessions the host is watching via its
	 *  single `/api/event` subscription. Each row carries at least `sessionId`
	 *  plus `lastEvent` (and `status` when the last event was a status change).
	 *  The renderer merges these by `sessionId` into its list snapshot. */
	serverEventsChanged: {
		sessions: ServerSessionRow[];
	};
}

/** The bun side of the RPC, wrapper-agnostic — host wraps it in
 *  `RPCSchema<…>`, the renderer passes it straight to `defineRPC<…>`. */
export interface TrailViewerSchema {
	requests: TrailViewerRequests;
	messages: TrailViewerMessages;
}
