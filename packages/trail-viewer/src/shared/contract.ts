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
}

export type AnalysisStatus = "pending" | "done" | "error";

/** Full record for one analyzed session, stored host-side on disk. */
export interface ConceptAnalysis {
	id: string;
	sessionId: string;
	sessionTitle?: string;
	sessionSlug?: string;
	agent?: string;
	createdAt: string;
	status: AnalysisStatus;
	/** Present when `status === "error"`. */
	error?: string;
	/** Concept cards teased out of the session. Empty until `status === "done"`. */
	concepts: ConceptCardData[];
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
	kind: "library" | "trail" | "agent-sessions" | "mermaid-demo" | "concepts" | "analysis";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
}

export interface TabFullState {
	ok: boolean;
	error?: string;
	id: string;
	kind: "library" | "trail" | "agent-sessions" | "mermaid-demo" | "concepts" | "analysis";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
	repoRoot?: string;
	trailFilePath?: string;
	sessionId?: string;
	/** For `analysis` tabs — the analysis id the tab renders. */
	analysisId?: string;
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

/** The renderer → host request surface. Keyed by RPC name. Defined as a `type`
 *  (not `interface`) so it satisfies electrobun's index-signature schema
 *  constraint (`{ [key: string]: { params; response } }`) on both sides. */
export type TrailViewerRequests = {
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
		params: { sessionId: string };
		response: {
			ok: boolean;
			error?: string;
			events?: SessionEventRow[];
			repoRoot?: string;
			repos?: RepoInfo[];
			session?: { slug: string; title: string; agent?: string };
		};
	};
	listAnalyses: {
		params: Record<string, never>;
		response: { analyses: AnalysisSummary[] };
	};
	analyzeSession: {
		params: { sessionId: string; title?: string; agent?: string };
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
}

/** Host → renderer notifications. Keyed by message name. */
export type TrailViewerMessages = {
	/** Fired when the tab list or active tab changes (LOAD_TRAIL, close,
	 *  switch). Renderer re-runs listTabs to refresh the strip. */
	tabsChanged: null;
}

/** The bun side of the RPC, wrapper-agnostic — host wraps it in
 *  `RPCSchema<…>`, the renderer passes it straight to `defineRPC<…>`. */
export interface TrailViewerSchema {
	requests: TrailViewerRequests;
	messages: TrailViewerMessages;
}
