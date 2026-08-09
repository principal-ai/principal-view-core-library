/**
 * Agent Sessions overview — one tab that loads recent agent sessions into the
 * FileCityGuidePanel's multi-session agent mode (no per-session tabs).
 *
 * Loading is paged by calendar day: each day's sessions are fetched and their
 * event timelines processed in order (newest day first). A loading screen shows
 * a card per repo as it is discovered; once the first day finishes the panel
 * mounts (no session pre-selected → the multi-agent overlay), and remaining
 * days page in the background and append. `citySources` is a static superset of
 * every discovered repo — selection only refocuses the panel, never rebuilds it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import {
	PanelEventBus,
	type DataSlice,
	type PanelContextValue,
	type PanelEventEmitter,
} from "@principal-ade/panel-framework-core";
import {
	GitFileTreeBuilder,
	type FileTree,
} from "@principal-ai/repository-abstraction";
import {
	FileCityGuidePanel,
	buildCityDataFromContext,
	type AgentSessionEvent,
	type AgentSessionEventOperation,
	type AgentSessionsView,
	type AgentSessionState,
	type AgentSessionView,
	type CommitFileChange,
	type FileCityGuidePanelActions,
	type FileCityGuidePanelContext,
} from "@industry-theme/file-city-panel";
import type { CitySource } from "@principal-ai/file-city-react";
import type { NormalizedPathInfo } from "@principal-ai/agent-monitoring";
import type { SessionEventRow, SessionSummary } from "../../shared/contract";
import { electrobun } from "../rpc";
import { CenteredMessage } from "../ui";
import { AgentSessionLoader, type DiscoveredRepo } from "./AgentSessionLoader";

export function buildAgentSessionsView(opts: {
	sessionId: string;
	title: string;
	events: SessionEventRow[] | null;
	sessionMeta: { slug: string; title: string; agent?: string } | null;
	dirSet: Set<string>;
	repoOwner: string | null;
	repoName: string | null;
	repoRoot?: string;
	models?: string[];
}): AgentSessionsView | null {
	const { sessionId, title, sessionMeta, dirSet, repoOwner, repoName } = opts;
	if (!opts.events || opts.events.length === 0) return null;

	const sessionName = sessionMeta?.slug || sessionMeta?.title?.slice(0, 30) || sessionId.slice(0, 12);
	// Explicit agent (cline/opencode/pi/grok) wins; fall back to the slug heuristic
	// (Cline/pi/grok durable transcripts carry no slug, opencode sessions do).
	const agentLabel = sessionMeta?.agent ?? (!sessionMeta?.slug ? "cline" : "opencode");
	const sessionColor = "#a855f7";
	const editedFileSet = new Set<string>();
	const readingFileSet = new Set<string>();
	const greppingFileSet = new Set<string>();
	const agentSessionEvents: AgentSessionEvent[] = [];

	let firstTimestamp = 0;
	let lastTimestamp = 0;

	for (const ev of opts.events) {
		if (!ev.accumulated) continue;
		const acc = ev.accumulated;
		const timestamp = ((ev.normalized as Record<string, unknown>)["timestamp"] as number) || 0;
		if (firstTimestamp === 0 || timestamp < firstTimestamp) firstTimestamp = timestamp;
		if (timestamp > lastTimestamp) lastTimestamp = timestamp;

		const normFiles = ev.accumulated?.files as unknown as NormalizedPathInfo[] | undefined;
		if (normFiles) {
			for (const f of normFiles) {
				if (acc.operation === "reading") readingFileSet.add(f.displayPath);
				else if (acc.operation === "grepping") greppingFileSet.add(f.displayPath);
				else if (acc.operation === "editing") editedFileSet.add(f.displayPath);
			}
		}

		// Promote paths that match a known directory to type: "directory"
		const layers = acc.layers.map(layer => ({
			...layer,
			items: layer.items.map(item => ({
				...item,
				type: dirSet.has(item.path) ? "directory" : item.type,
			})),
		}));

		agentSessionEvents.push({
			id: `${sessionId}-${ev.seq}`,
			timestamp,
			sessionId,
			sessionName,
			sessionColor,
			operation: acc.operation as AgentSessionEventOperation,
			files: normFiles ?? [],
			dependencies: (ev.accumulated?.dependencies as unknown as NormalizedPathInfo[] | undefined) ?? [],
			description: acc.description,
			contextTokens: acc.contextTokens,
			subagentType: acc.subagentType,
			childSessionId: acc.childSessionId,
			layers,
		});
	}

	let state: AgentSessionState = "working";
	if (agentSessionEvents.length > 0) {
		const lastOp = agentSessionEvents[agentSessionEvents.length - 1].operation;
		if (lastOp === "finished") state = "done";
		else if (lastOp === "errored") state = "errored";
	}

	const commitFiles: CommitFileChange[] = Array.from(editedFileSet).map(p => ({
		path: p,
		status: "modified" as const,
	}));

	const stats = {
		filesChanged: editedFileSet.size,
		additions: 0,
		deletions: 0,
	};

	const task = sessionMeta?.title || title;

	const agentSession: AgentSessionView = {
		id: sessionId,
		name: sessionName,
		agent: agentLabel,
		owner: { name: agentLabel, login: agentLabel },
		state,
		task,
		message: task,
		color: sessionColor,
		files: commitFiles,
		readingFiles: Array.from(readingFileSet),
		greppingFiles: Array.from(greppingFileSet),
		activeFiles: [],
		startedAt: firstTimestamp ? new Date(firstTimestamp).toISOString() : undefined,
		lastEventAt: lastTimestamp ? new Date(lastTimestamp).toISOString() : undefined,
		models: opts.models,
		workingDirectory: opts.repoRoot,
		stats,
	};

	return {
		sessions: [agentSession],
		selectedSessionId: sessionId,
		events: agentSessionEvents,
		repository: repoOwner && repoName ? { owner: repoOwner, name: repoName } : null,
	};
}

// Minimal view for a session whose events haven't loaded yet — the drawer row
// renders it (title + state) and upgrades in place once the session loads.
function placeholderAgentSession(s: SessionSummary): AgentSessionView {
	const agentLabel = s.agent ?? "opencode";
	return {
		id: s.id,
		name: agentLabel,
		agent: agentLabel,
		owner: { name: agentLabel, login: agentLabel },
		state: s.isFinished ? "done" : "working",
		task: s.title,
		message: s.title,
		color: "#a855f7",
		files: [],
		readingFiles: [],
		greppingFiles: [],
		activeFiles: [],
		startedAt: s.createdAt || undefined,
		lastEventAt: s.lastEventAt || undefined,
		models: s.models,
		workingDirectory: s.repoRoot,
		stats: { filesChanged: 0, additions: 0, deletions: 0 },
	};
}

// Grid placement for N repo cities: a roughly-square grid (cols = ceil(sqrt N)),
// filled row-major so cities read left-to-right then down. The library centers
// the grid and derives each city's world offset from its `gridCell` plus
// `gridGap` (default ~25% of the largest footprint, floored at 40), so the repos
// read as clearly separated instead of packed edge-to-edge.
function repoGridLayout(count: number): { col: number; row: number }[] {
	const cols = Math.ceil(Math.sqrt(count));
	return Array.from({ length: count }, (_, i) => ({
		col: i % cols,
		row: Math.floor(i / cols),
	}));
}

/** Local calendar-day key for an ISO timestamp — used for day paging. */
function dayKeyOf(iso: string): string {
	const d = new Date(iso);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Label for a day divider — "Today", "Yesterday", else a short date. */
function dayLabelOf(key: string): string {
	const [y, m, d] = key.split("-").map(Number);
	const date = new Date(y, m, d);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const yesterday = new Date(today.getTime() - 86400000);
	if (date.getTime() === today.getTime()) return "Today";
	if (date.getTime() === yesterday.getTime()) return "Yesterday";
	return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Days to auto-page on load; "Load more" extends this window. */
const INITIAL_DAY_WINDOW = 7;
const LOAD_MORE_STEP = 7;

export function AgentSessionsOverviewView() {
	const { theme } = useTheme();
	const [summaries, setSummaries] = useState<SessionSummary[]>([]);
	const [sessionsById, setSessionsById] = useState<Map<string, AgentSessionView>>(new Map());
	const [eventsById, setEventsById] = useState<Map<string, AgentSessionEvent[]>>(new Map());
	const [discoveredRepos, setDiscoveredRepos] = useState<Map<string, DiscoveredRepo>>(new Map());
	const [seenAgents, setSeenAgents] = useState<Set<string>>(new Set());
	const [trees, setTrees] = useState<Map<string, FileTree>>(new Map());
	const [daysWindow, setDaysWindow] = useState(INITIAL_DAY_WINDOW);
	const [dayIndex, setDayIndex] = useState(0);
	const [ready, setReady] = useState(false);
	const [allDaysLoaded, setAllDaysLoaded] = useState(false);
	const [hostHasMore, setHostHasMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);
	// Session ids that already have a concept analysis — drives the panel row's
	// Analyze button state (accent + "Open concept analysis" vs "Analyze…").
	const [analyzedSessionIds, setAnalyzedSessionIds] = useState<Set<string>>(
		new Set(),
	);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await electrobun.rpc!.request.listAnalyses({});
				if (cancelled) return;
				setAnalyzedSessionIds(
					new Set(res.analyses.map((a) => a.sessionId)),
				);
			} catch {
				// Enrichment only — rows still show the analyze affordance.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// The day-paging loop reads loaded-session state without re-triggering on
	// every session commit (which would restart the day mid-way).
	const sessionsByIdRef = useRef<Map<string, AgentSessionView>>(sessionsById);
	sessionsByIdRef.current = sessionsById;
	const eventsByIdRef = useRef<Map<string, AgentSessionEvent[]>>(eventsById);
	eventsByIdRef.current = eventsById;

	const windowStart = useMemo(() => Date.now() - daysWindow * 86400000, [daysWindow]);

	// --- Day grouping (newest day first), window-filtered --------------------
	const dayGroups = useMemo(() => {
		const buckets = new Map<string, SessionSummary[]>();
		const noDate: SessionSummary[] = [];
		for (const s of summaries) {
			const t = s.createdAt ? new Date(s.createdAt).getTime() : 0;
			if (!s.createdAt || !Number.isFinite(t) || t === 0) {
				noDate.push(s);
				continue;
			}
			if (t < windowStart) continue;
			const key = dayKeyOf(s.createdAt);
			const arr = buckets.get(key) ?? [];
			arr.push(s);
			buckets.set(key, arr);
		}
		const groups: { key: string; label: string; sessions: SessionSummary[] }[] = [];
		for (const key of [...buckets.keys()].sort().reverse()) {
			groups.push({ key, label: dayLabelOf(key), sessions: buckets.get(key)! });
		}
		if (noDate.length > 0) {
			noDate.sort((a, b) => (a.id < b.id ? -1 : 1));
			groups.push({ key: "__undated__", label: "No date", sessions: noDate });
		}
		return groups;
	}, [summaries, windowStart]);

	// --- listSessions (window-aware) -----------------------------------------
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const list = await electrobun.rpc!.request.listSessions({ days: daysWindow });
				const tops: SessionSummary[] = [];
				for (const g of list.groups) {
					tops.push(g.parent);
				}
				tops.push(...list.standalone);
				tops.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
				if (cancelled) return;
				setSummaries((prev) => {
					const merged = new Map(prev.map((s) => [s.id, s]));
					for (const s of tops) merged.set(s.id, s);
					return [...merged.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
				});
				setHostHasMore(list.hasMore ?? false);
				setLoaded(true);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
				setLoaded(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [daysWindow]);

	// --- Per-session load: fetch events, build the view, discover repos ------
	const loadSession = useCallback(async (s: SessionSummary): Promise<void> => {
		const res = await electrobun.rpc!.request.getSessionEvents({ sessionId: s.id });
		if (!res.ok || !res.events || res.events.length === 0) return;
		const slice = buildAgentSessionsView({
			sessionId: s.id,
			title: s.title,
			events: res.events,
			sessionMeta: res.session ?? null,
			dirSet: new Set(),
			repoOwner: null,
			repoName: null,
			repoRoot: res.repoRoot ?? res.repos?.[0]?.root,
			models: s.models,
		});
		if (!slice) return;
		const session = slice.sessions[0];
		const agentLabel = session.agent ?? s.agent ?? "opencode";
		setSeenAgents((prev) => {
			if (prev.has(agentLabel)) return prev;
			const next = new Set(prev);
			next.add(agentLabel);
			return next;
		});
		const nextSessions = new Map(sessionsByIdRef.current);
		nextSessions.set(s.id, session);
		sessionsByIdRef.current = nextSessions;
		setSessionsById(nextSessions);
		setEventsById((prev) => {
			const next = new Map(prev);
			next.set(s.id, slice.events ?? []);
			return next;
		});
		const repos = res.repos ?? [];
		if (repos.length > 0) {
			setDiscoveredRepos((prev) => {
				const next = new Map(prev);
				for (const r of repos) {
					const parts = r.root.replace(/\/+$/, "").split("/");
					const existing = next.get(r.root);
					const agents = existing
						? Array.from(new Set([...existing.agents, agentLabel]))
						: [agentLabel];
					next.set(r.root, {
						root: r.root,
						name: r.name ?? parts[parts.length - 1] ?? "",
						owner: r.owner ?? null,
						fileCount: Math.max(existing?.fileCount ?? 0, r.fileCount),
						sessionCount: (existing?.sessionCount ?? 0) + 1,
						agents,
					});
				}
				return next;
			});
		}
	}, []);

	// --- Live refresh: re-fetch an active session and append only the events
	// that are new since the last load. Returns true if anything changed, so the
	// poll can leave state untouched (no re-render) when nothing moved. ---
	const loadSessionLive = useCallback(async (s: SessionSummary): Promise<boolean> => {
		const res = await electrobun.rpc!.request.getSessionEvents({ sessionId: s.id });
		if (!res.ok || !res.events || res.events.length === 0) return false;
		const slice = buildAgentSessionsView({
			sessionId: s.id,
			title: s.title,
			events: res.events,
			sessionMeta: res.session ?? null,
			dirSet: new Set(),
			repoOwner: null,
			repoName: null,
			repoRoot: res.repoRoot ?? res.repos?.[0]?.root,
			models: s.models,
		});
		if (!slice) return false;
		const existing = eventsByIdRef.current.get(s.id) ?? [];
		const existingIds = new Set(existing.map((e) => e.id));
		const newEvents = (slice.events ?? []).filter((e) => !existingIds.has(e.id));
		if (newEvents.length === 0) return false;

		const nextEvents = [...existing, ...newEvents];
		eventsByIdRef.current = new Map(eventsByIdRef.current).set(s.id, nextEvents);
		setEventsById(eventsByIdRef.current);
		const nextSessions = new Map(sessionsByIdRef.current);
		nextSessions.set(s.id, slice.sessions[0]);
		sessionsByIdRef.current = nextSessions;
		setSessionsById(nextSessions);
		const repos = res.repos ?? [];
		if (repos.length > 0) {
			const agentLabel = slice.sessions[0].agent ?? s.agent ?? "opencode";
			setDiscoveredRepos((prev) => {
				const next = new Map(prev);
				for (const r of repos) {
					const parts = r.root.replace(/\/+$/, "").split("/");
					const existingRepo = next.get(r.root);
					const agents = existingRepo
						? Array.from(new Set([...existingRepo.agents, agentLabel]))
						: [agentLabel];
					next.set(r.root, {
						root: r.root,
						name: r.name ?? parts[parts.length - 1] ?? "",
						owner: r.owner ?? null,
						fileCount: Math.max(existingRepo?.fileCount ?? 0, r.fileCount),
						sessionCount: (existingRepo?.sessionCount ?? 0) + 1,
						agents,
					});
				}
				return next;
			});
		}
		return true;
	}, []);

	// --- Live poll: every 30s, list today's sessions, merge new summaries,
	// kick the newest day if a brand-new session appeared, and diff-append new
	// events for any session that's still actively working. State is only
	// committed when something actually changed. ---
	const refreshLive = useCallback(async () => {
		try {
			const list = await electrobun.rpc!.request.listSessions({ days: 2 });
			const tops: SessionSummary[] = [];
			for (const g of list.groups) tops.push(g.parent);
			tops.push(...list.standalone);

			// Merge summaries — only commit when the id-set or a title/finished
			// flag actually changed, so a quiet poll never re-renders the view.
			setSummaries((prev) => {
				const merged = new Map(prev.map((s) => [s.id, s]));
				let changed = false;
				for (const s of tops) {
					const existing = merged.get(s.id);
					if (!existing) {
						merged.set(s.id, s);
						changed = true;
					} else if (existing.title !== s.title || existing.isFinished !== s.isFinished) {
						merged.set(s.id, s);
						changed = true;
					}
				}
				if (!changed) return prev;
				return [...merged.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
			});

			// Only sessions within the current window matter for day processing
			// (listSessions returns all cline/pi/grok regardless of `days`).
			const known = sessionsByIdRef.current;
			const relevant = tops.filter((s) => {
				const t = s.createdAt ? new Date(s.createdAt).getTime() : 0;
				return !t || t >= windowStart;
			});
			const hasNewSession = relevant.some((s) => !known.has(s.id));
			if (hasNewSession) {
				// Re-open the newest day so the day-paging loop picks up the
				// newcomer (already-loaded sessions are skipped).
				setAllDaysLoaded(false);
				setDayIndex(0);
			}

			const working = relevant.filter((s) => known.get(s.id)?.state === "working");
			for (const s of working) {
				try {
					await loadSessionLive(s);
				} catch (err) {
					console.error("[AgentSessionsOverview] live event refresh failed:", s.id, err);
				}
			}
		} catch (err) {
			console.error("[AgentSessionsOverview] live refresh failed:", err);
		}
	}, [windowStart, loadSessionLive]);

	// Poll loop — starts once the initial load has listed sessions; cleared on
	// unmount. No overlap guard needed: each tick awaits its own work.
	useEffect(() => {
		if (!loaded) return;
		const t = setInterval(() => {
			void refreshLive();
		}, 30_000);
		return () => clearInterval(t);
	}, [loaded, refreshLive]);

	// --- Day paging: process one calendar day at a time -----------------------
	// Completing a day advances `dayIndex`, which re-runs this effect for the
	// next day. The loader stays up until the whole window (all 7 days) has been
	// processed — only then does `ready` flip and the panel mount; days 2..7 are
	// no longer "background" because the window is fully loaded before handoff.
	useEffect(() => {
		if (!loaded) return;
		if (dayGroups.length === 0) return;
		if (dayIndex >= dayGroups.length) {
			setAllDaysLoaded(true);
			return;
		}
		const current = dayGroups[dayIndex];
		let cancelled = false;
		setAllDaysLoaded(false);
		(async () => {
			for (const s of current.sessions) {
				if (cancelled) return;
				if (sessionsByIdRef.current.has(s.id)) continue;
				try {
					await loadSession(s);
				} catch (err) {
					console.error("[AgentSessionsOverview] getSessionEvents failed:", s.id, err);
				}
				if (cancelled) return;
			}
			if (cancelled) return;
			setDayIndex((i) => i + 1);
		})();
		return () => {
			cancelled = true;
		};
	}, [loaded, dayGroups, dayIndex, loadSession]);

	// --- Trees for every discovered repo (sequential, one per cycle) ---------
	useEffect(() => {
		if (discoveredRepos.size === 0) return;
		let cancelled = false;
		(async () => {
			const missing = Array.from(discoveredRepos.keys()).find((root) => !trees.has(root));
			if (!missing) return;
			try {
				const treeRes = await electrobun.rpc!.request.getFileTree({ tabId: "", path: missing });
				if (cancelled) return;
				const tree = new GitFileTreeBuilder().build({
					files: treeRes.files,
					rootPath: "/local",
					commitSha: "local",
					branch: "local",
				});
				setTrees((prev) => {
					const next = new Map(prev);
					next.set(missing, tree);
					return next;
				});
			} catch (err) {
				console.error("[AgentSessionsOverview] getFileTree failed:", missing, err);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [discoveredRepos, trees]);

	// --- Load more ------------------------------------------------------------
	// opencode reports `hasMore` (older-than-window sessions exist); cline/pi/grok
	// return their full lists so the renderer sees any older summary directly.
	const hasOlderKnown = useMemo(() => {
		return summaries.some((s) => {
			const t = s.createdAt ? new Date(s.createdAt).getTime() : 0;
			return t > 0 && t < windowStart;
		});
	}, [summaries, windowStart]);
	const moreAvailable = hostHasMore || hasOlderKnown;

	const loadMore = useCallback(() => {
		setDaysWindow((w) => w + LOAD_MORE_STEP);
	}, []);

	// --- Panel inputs ---------------------------------------------------------
	// Full drawer list — loaded sessions use their real view, the rest get a
	// summary placeholder that upgrades in place as days finish processing.
	const sessions = useMemo<AgentSessionView[]>(() => {
		return dayGroups.flatMap((d) =>
			d.sessions.map((s) => {
				const session = sessionsById.get(s.id) ?? placeholderAgentSession(s);
				return analyzedSessionIds.has(s.id)
					? { ...session, hasAnalysis: true }
					: session;
			}),
		);
	}, [dayGroups, sessionsById, analyzedSessionIds]);

	// Full event timeline across every processed session — the panel filters it
	// per selected session and drives the multi-agent overlay from it.
	const allEvents = useMemo<AgentSessionEvent[]>(() => {
		const list: AgentSessionEvent[] = [];
		for (const evts of eventsById.values()) list.push(...evts);
		return list;
	}, [eventsById]);

	const view = useMemo<AgentSessionsView | null>(() => {
		if (sessions.length === 0) return null;
		return {
			sessions,
			// Nothing pre-selected → the panel opens in multi-agent overlay mode
			// and manages its own selection + repo focus internally.
			selectedSessionId: null,
			events: allEvents,
			repository: null,
			// Lock in the day view + last-event sort: hide the drawer's filter
			// bar so the defaults aren't toggleable.
			hideFilterBar: true,
		};
	}, [sessions, allEvents]);

	// Static superset of city sources — one per discovered repo, in discovery
	// order (append-only, so sources never reshuffle as later sessions bump
	// file counts). Never rebuilt on selection; the panel's agent-sessions mode
	// focuses (dims) sources internally instead.
	const citySources = useMemo<CitySource[] | undefined>(() => {
		const repos = Array.from(discoveredRepos.values());
		const withTrees = repos.filter((r) => trees.has(r.root));
		if (withTrees.length === 0) return undefined;
		const layout = repoGridLayout(withTrees.length);
		const sources: CitySource[] = [];
		for (let i = 0; i < withTrees.length; i++) {
			const r = withTrees[i];
			const tree = trees.get(r.root);
			if (!tree) continue;
			const city = buildCityDataFromContext({ fileTree: tree, lineCounts: null });
			sources.push({
				cityData: city,
				positionOffset: { x: 0, z: 0 },
				gridCell: layout[i],
				label: r.name || undefined,
				ownerAvatarUrl: r.owner ? `https://github.com/${r.owner}.png?size=40` : undefined,
			});
		}
		return sources.length > 0 ? sources : undefined;
	}, [discoveredRepos, trees]);

	const primaryRepo = useMemo(() => {
		for (const r of discoveredRepos.values()) {
			const t = trees.get(r.root);
			if (t) return t;
		}
		return null;
	}, [discoveredRepos, trees]);

	const guideContext = useMemo<PanelContextValue<FileCityGuidePanelContext>>(() => {
		const fileTreeSlice: DataSlice<FileTree> = {
			scope: "repository",
			name: "fileTree",
			data: primaryRepo,
			loading: !primaryRepo,
			error: null,
			refresh: async () => {},
		};
		const nullSliceInst: DataSlice<null> = { scope: "repository", name: "null", data: null, loading: false, error: null, refresh: async () => {} };
		return {
			currentScope: { type: "repository" },
			refresh: async () => {},
			fileTree: fileTreeSlice,
			lineCounts: nullSliceInst,
			tour: nullSliceInst,
			highlightLayers: nullSliceInst,
			agentSessions: {
				scope: "repository",
				name: "agentSessions",
				data: view,
				loading: !view,
				error: null,
				refresh: async () => {},
			},
			repository: null,
		};
	}, [view, primaryRepo]);

	const guideActions = useMemo<FileCityGuidePanelActions>(
		() => ({
			openFile: () => {},
			fetchSessionEvents: async (sessionId) => {
				const cached = eventsById.get(sessionId);
				if (cached && cached.length > 0) {
					return {
						events: cached,
						title: summaries.find((s) => s.id === sessionId)?.title ?? sessionId,
					};
				}
				const res = await electrobun.rpc!.request.getSessionEvents({ sessionId });
				if (!res.ok || !res.events || res.events.length === 0) {
					return { events: [], title: sessionId };
				}
				const slice = buildAgentSessionsView({
					sessionId,
					title: res.session?.title ?? summaries.find((s) => s.id === sessionId)?.title ?? sessionId,
					events: res.events,
					sessionMeta: res.session ?? null,
					dirSet: new Set(),
					repoOwner: null,
					repoName: null,
					repoRoot: res.repoRoot ?? res.repos?.[0]?.root,
				});
				if (!slice) return { events: [], title: sessionId };
				setSessionsById((prev) => {
					const next = new Map(prev);
					next.set(sessionId, slice.sessions[0]);
					return next;
				});
				setEventsById((prev) => {
					const next = new Map(prev);
					next.set(sessionId, slice.events ?? []);
					return next;
				});
				return {
					events: slice.events ?? [],
					title: slice.sessions[0]?.task ?? sessionId,
				};
			},
			analyzeSession: async (session) => {
				await electrobun.rpc!.request.analyzeSession({
					sessionId: session.id,
					title: session.task,
					agent: session.agent,
				});
				// The host opens (or focuses) the analysis tab and broadcasts
				// tabsChanged; mark the row analyzed here so switching back
				// shows the already-analyzed state without a re-fetch.
				setAnalyzedSessionIds((prev) => new Set(prev).add(session.id));
			},
		}),
		[summaries, eventsById],
	);

	const panelEvents = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

	// --- Render ---------------------------------------------------------------
	if (error) {
		return <CenteredMessage title="Could not load agent sessions" detail={error} />;
	}
	// Empty only once we've actually listed sessions (otherwise the loader below
	// would read as "nothing found" during the initial fetch).
	if (loaded && dayGroups.length === 0) {
		return (
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: theme.colors.background,
					color: theme.colors.text,
					fontFamily: theme.fonts.body,
					flexDirection: "column",
					gap: 10,
				}}
			>
				<div style={{ textAlign: "center", maxWidth: 640, padding: 24 }}>
					<div style={{ fontSize: theme.fontSizes[3], marginBottom: 8 }}>
						No recent sessions found
					</div>
					{moreAvailable ? (
						<div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>
							Older sessions exist — widen the search window to reach them.
						</div>
					) : null}
				</div>
				{moreAvailable ? (
					<button
						type="button"
						onClick={loadMore}
						style={{
							padding: "6px 14px",
							border: `1px solid ${theme.colors.border}`,
							borderRadius: 4,
							background: theme.colors.backgroundSecondary,
							color: theme.colors.text,
							fontFamily: theme.fonts.body,
							fontSize: theme.fontSizes[1],
							cursor: "pointer",
						}}
					>
						Load older sessions
					</button>
				) : null}
			</div>
		);
	}

	// Loader until the full window (all 7 days) has been processed — the first
	// thing the user sees. Covers the initial `listSessions` fetch as well as the
	// day-by-day processing, so the repo cards are the loading UI from the
	// moment the view mounts through the whole week.
	if (!ready) {
		return (
			<AgentSessionLoader
				repos={Array.from(discoveredRepos.values())}
				agents={Array.from(seenAgents)}
				allDaysLoaded={allDaysLoaded}
				onEnter={() => setReady(true)}
			/>
		);
	}

	return (
		<div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
			<div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
				{view ? (
					<div style={{ flex: 1, minHeight: 0 }}>
						<FileCityGuidePanel context={guideContext} actions={guideActions} events={panelEvents} citySources={citySources} />
					</div>
				) : (
					<CenteredMessage title="Loading city…" />
				)}
			</div>
			{/* Paging footer — shows once the window is fully processed */}
			{allDaysLoaded ? (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "6px 14px",
						borderTop: `1px solid ${theme.colors.border}`,
						fontFamily: theme.fonts.body,
						fontSize: theme.fontSizes[0],
						color: theme.colors.textMuted,
						flexShrink: 0,
					}}
				>
					<span>
						{dayGroups.length} day{dayGroups.length === 1 ? "" : "s"} · {sessions.length} session{sessions.length === 1 ? "" : "s"} · {discoveredRepos.size} repo{discoveredRepos.size === 1 ? "" : "s"}
					</span>
					<span style={{ flex: 1 }} />
					{moreAvailable ? (
						<button
							type="button"
							onClick={loadMore}
							style={{
								padding: "3px 10px",
								border: `1px solid ${theme.colors.border}`,
								borderRadius: 4,
								background: theme.colors.backgroundSecondary,
								color: theme.colors.text,
								fontFamily: theme.fonts.body,
								fontSize: theme.fontSizes[0],
								cursor: "pointer",
							}}
						>
							Load more days
						</button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
