/**
 * Agent Sessions overview — one tab that loads the recent agent sessions into
 * the FileCityGuidePanel's multi-session agent mode (no per-session tabs).
 */

import { useEffect, useMemo, useState } from "react";
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

const MAX_CITY_SOURCES = 4;

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

// Grid placement for N repo cities: a square when N is a perfect square,
// otherwise a single row (row 0, left-to-right). The library centers the grid
// and derives each city's world offset from its `gridCell` plus `gridGap`
// (default ~25% of the largest footprint, floored at 40), so the repos read as
// clearly separated instead of packed edge-to-edge.
function repoGridLayout(count: number): { col: number; row: number }[] {
	const side = Math.ceil(Math.sqrt(count));
	const cols = side * side === count ? side : count;
	return Array.from({ length: count }, (_, i) => ({
		col: i % cols,
		row: Math.floor(i / cols),
	}));
}

export function AgentSessionsOverviewView() {
	const [summaries, setSummaries] = useState<SessionSummary[]>([]);
	const [sessionsById, setSessionsById] = useState<Map<string, AgentSessionView>>(new Map());
	const [eventsById, setEventsById] = useState<Map<string, AgentSessionEvent[]>>(new Map());
	const [sessionRepos, setSessionRepos] = useState<Map<string, Array<{ root: string; fileCount: number; name: string | null; owner: string | null }>>>(new Map());
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
	const [trees, setTrees] = useState<Map<string, FileTree>>(new Map());
	const [error, setError] = useState<string | null>(null);
	const [loaded, setLoaded] = useState(false);

	// One cheap call lists every top-level session — the drawer renders the full
	// list immediately; per-session events load lazily below.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const list = await electrobun.rpc!.request.listSessions({});
				// Top-level sessions only — each group's parent is the main agent
				// session; the children are subagent sessions we skip here.
				const tops: SessionSummary[] = [];
				for (const g of list.groups) {
					tops.push(g.parent);
				}
				tops.push(...list.standalone);
				tops.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
				if (cancelled) return;
				if (tops.length === 0) {
					setError("No recent sessions found");
					setLoaded(true);
					return;
				}
				setSummaries(tops);
				setSelectedSessionId(tops[0].id);
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
	}, []);

	// Lazily fetch the selected session's events + repos (one DB read per
	// session, cached per session id) so opening the tab never fans out a
	// getSessionEvents call across every session at once.
	useEffect(() => {
		if (!selectedSessionId || sessionsById.has(selectedSessionId)) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await electrobun.rpc!.request.getSessionEvents({ sessionId: selectedSessionId });
				if (cancelled) return;
				if (!res.ok || !res.events || res.events.length === 0) return;
				const summary = summaries.find((s) => s.id === selectedSessionId);
				const slice = buildAgentSessionsView({
					sessionId: selectedSessionId,
					title: summary?.title ?? res.session?.title ?? selectedSessionId,
					events: res.events,
					sessionMeta: res.session ?? null,
					dirSet: new Set(),
					repoOwner: null,
					repoName: null,
					repoRoot: res.repoRoot ?? res.repos?.[0]?.root,
					models: summary?.models,
				});
				if (cancelled || !slice) return;
				const repos = (res.repos ?? [])
					.map((r) => ({ root: r.root, fileCount: r.fileCount, name: r.name, owner: r.owner }))
					.sort((a, b) => b.fileCount - a.fileCount);
				setSessionsById((prev) => {
					const next = new Map(prev);
					next.set(selectedSessionId, slice.sessions[0]);
					return next;
				});
				setEventsById((prev) => {
					const next = new Map(prev);
					next.set(selectedSessionId, slice.events ?? []);
					return next;
				});
				if (repos.length > 0) {
					setSessionRepos((prev) => {
						const next = new Map(prev);
						next.set(selectedSessionId, repos);
						return next;
					});
				}
			} catch (err) {
				console.error("[AgentSessionsOverview] getSessionEvents failed:", selectedSessionId, err);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [selectedSessionId, sessionsById, summaries]);

	// Full drawer list — loaded sessions use their real view, the rest get a
	// summary placeholder that upgrades in place once selected/loaded.
	const sessions = useMemo<AgentSessionView[]>(() => {
		return summaries.map((s) => sessionsById.get(s.id) ?? placeholderAgentSession(s));
	}, [summaries, sessionsById]);

	// The mode payload: all sessions for the drawer + only the selected
	// session's events (replay/activity are per-selection).
	const view = useMemo<AgentSessionsView | null>(() => {
		if (sessions.length === 0) return null;
		return {
			sessions,
			selectedSessionId,
			events: selectedSessionId ? (eventsById.get(selectedSessionId) ?? []) : [],
			repository: null,
		};
	}, [sessions, selectedSessionId, eventsById]);

	// The repos shown follow the selected session (the panel reports drawer
	// clicks through `onAgentSessionSelect`). Trees for the selected session's
	// repos load lazily into a persistent cache keyed by repo root.
	const selectedRepos = useMemo(() => {
		if (!selectedSessionId) return [];
		return (sessionRepos.get(selectedSessionId) ?? []).slice(0, MAX_CITY_SOURCES);
	}, [selectedSessionId, sessionRepos]);

	useEffect(() => {
		if (selectedRepos.length === 0) return;
		let cancelled = false;
		(async () => {
			for (const r of selectedRepos) {
				if (cancelled) return;
				if (trees.has(r.root)) continue;
				try {
					const treeRes = await electrobun.rpc!.request.getFileTree({ tabId: "", path: r.root });
					if (cancelled) return;
					const tree = new GitFileTreeBuilder().build({
						files: treeRes.files,
						rootPath: "/local",
						commitSha: "local",
						branch: "local",
					});
					setTrees((prev) => {
						const next = new Map(prev);
						next.set(r.root, tree);
						return next;
					});
				} catch (err) {
					console.error("[AgentSessionsOverview] getFileTree failed:", r.root, err);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [selectedRepos, trees]);

	// One city per repo the selected session touched, arranged on the
	// library's grid layout (square when the count is a perfect square,
	// otherwise a row). Passing `citySources` flips FileCity3D into its
	// multi-city mode; FileCity3D resolves each city's world offset from its
	// `gridCell` + `gridGap` (default ~25% of the largest footprint, floored
	// at 40), so the repos stay visually separated. Each source shows the
	// repo-name label + owner avatar badge over its footprint.
	const citySources = useMemo<CitySource[] | undefined>(() => {
		if (selectedRepos.length === 0) return undefined;
		const layout = repoGridLayout(selectedRepos.length);
		const sources: CitySource[] = [];
		for (let i = 0; i < selectedRepos.length; i++) {
			const r = selectedRepos[i];
			const tree = trees.get(r.root);
			if (!tree) continue;
			const city = buildCityDataFromContext({ fileTree: tree, lineCounts: null });
			sources.push({
				cityData: city,
				// Ignored when `gridCell` is set — the library derives the
				// offset from the cell + gridGap.
				positionOffset: { x: 0, z: 0 },
				gridCell: layout[i],
				label: r.name ?? undefined,
				ownerAvatarUrl: r.owner ? `https://github.com/${r.owner}.png?size=40` : undefined,
			});
		}
		return sources.length > 0 ? sources : undefined;
	}, [selectedRepos, trees]);

	const guideContext = useMemo<PanelContextValue<FileCityGuidePanelContext>>(() => {
		const primaryTree = selectedRepos.length > 0 ? (trees.get(selectedRepos[0].root) ?? null) : null;
		const fileTreeSlice: DataSlice<FileTree> = {
			scope: "repository",
			name: "fileTree",
			data: primaryTree,
			loading: !primaryTree,
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
	}, [view, trees, selectedRepos]);

	const guideActions = useMemo<FileCityGuidePanelActions>(
		() => ({
			openFile: () => {},
			onAgentSessionSelect: (sessionId) => setSelectedSessionId(sessionId),
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
		}),
		[summaries, eventsById],
	);

	const panelEvents = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

	if (!loaded) {
		return <CenteredMessage title="Loading agent sessions…" />;
	}
	if (error) {
		return <CenteredMessage title="Could not load agent sessions" detail={error} />;
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
		</div>
	);
}
