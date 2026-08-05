/**
 * Trail viewer mainview.
 */

// electrobun's views:// scheme serves .css with a non-text/css MIME, so neither
// the <link> in index.html nor a bundled CSS-import sibling .css ever loads —
// both paths are silently dropped by WebKit. A plain `import "...style.css"`
// would just emit one of those dead siblings. So we import both stylesheets as
// *text* (the `{ type: "text" }` loader inlines the CSS into this JS bundle as a
// string) and inject them imperatively in `injectStyles()` below, which is the
// only mechanism that reliably lands. Without this the UA `body { margin: 8px }`
// leaks back in (16px overflow + top/left gap) and React Flow — which the
// FileCityTrailExplorerPanel's sequence view renders — ships completely
// unstyled.
import xyflowStyles from "@xyflow/react/dist/style.css" with { type: "text" };
import resetStyles from "./index.css" with { type: "text" };

import { Component, useCallback, useEffect, useMemo, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
	ThemeProvider,
	slateNeonTheme,
	useTheme,
} from "@principal-ade/industry-theme";
import {
	PanelEventBus,
	type DataSlice,
	type PanelContextValue,
	type PanelEventEmitter,
} from "@principal-ade/panel-framework-core";
import { createLocalRepoPurl } from "@principal-ai/alexandria-core-library";
import {
	GitFileTreeBuilder,
	type FileTree,
} from "@principal-ai/repository-abstraction";
import {
	FileCityGuidePanel,
	FileCityTrailExplorerPanel,
	type FileCityGuidePanelActions,
	type FileCityGuidePanelContext,
	type FileCityGuideRepository,
	type FileCityTrailExplorerPanelActions,
	type FileCityTrailExplorerPanelContext,
	type FileCityTrailExplorerRepository,
	type HighlightLayer,
	type TrailNote,
	type TrailPayload,
} from "@industry-theme/file-city-panel";
import type { IntroductionTour } from "@principal-ai/file-city-builder";
import type {
	LibraryEntry,
	TabSummary,
} from "../shared/contract";
import {
	callReadFile,
	electrobun,
	libraryRefreshers,
	reloadSubscribers,
} from "./rpc";
import { nullSlice, type TabState } from "./types";
import { CenteredMessage } from "./ui";
import { AppHeader } from "./components/AppHeader";
import { GithubMark, TrailHeader } from "./components/TrailHeader";
import { AgentSessionsOverviewView } from "./views/AgentSessions";

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

interface BoundaryState {
	error: Error | null;
	info: string;
}

class ErrorBoundary extends Component<
	{ children: ReactNode },
	BoundaryState
> {
	state: BoundaryState = { error: null, info: "" };
	static getDerivedStateFromError(error: Error): BoundaryState {
		return { error, info: "" };
	}
	componentDidCatch(error: Error, info: ErrorInfo): void {
		this.setState({ error, info: info.componentStack ?? "" });
		console.error("[trail-viewer] render error:", error, info);
	}
	render(): ReactNode {
		if (this.state.error) {
			return (
				<pre
					style={{
						width: "100vw",
						height: "100vh",
						background: "#1a0e0e",
						color: "#ffaaaa",
						padding: 24,
						margin: 0,
						overflow: "auto",
						fontSize: 12,
						fontFamily: "ui-monospace, monospace",
						whiteSpace: "pre-wrap",
					}}
				>
					{`Render error:\n\n${this.state.error.name}: ${this.state.error.message}\n\nStack:\n${this.state.error.stack ?? "(none)"}\n\nComponent stack:\n${this.state.info}`}
				</pre>
			);
		}
		return this.props.children;
	}
}

// ---------------------------------------------------------------------------
// Tab strip
// ---------------------------------------------------------------------------

function TabStrip({
	tabs,
	activeTabId,
	onSelect,
	onClose,
}: {
	tabs: TabSummary[];
	activeTabId: string | null;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
}) {
	const { theme } = useTheme();
	if (tabs.length === 0) return null;
	return (
		<div
			style={{
				display: "flex",
				gap: 2,
				padding: "4px 6px 0",
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
				borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
				overflowX: "auto",
				// Pin overflowY: a lone `overflow-x: auto` computes overflow-y to
				// `auto` too, and the tabs' `marginBottom: -1` (overlapping the
				// bottom border) spills 1px vertically → a stray scrollbar here.
				overflowY: "hidden",
				flexShrink: 0,
			}}
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTabId;
				const isPermanent = tab.kind === "library" || tab.kind === "agent-sessions";
				const dotColor = tab.kind === "agent-sessions"
					? theme.colors.accent ?? "#4ec9b0"
					: isPermanent
						? theme.colors.text
						: tab.mode === "remote"
							? theme.colors.accent ?? "#4ec9b0"
							: theme.colors.textMuted ?? "#888";
				return (
					<div
						key={tab.id}
						onClick={() => onSelect(tab.id)}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							padding: "6px 10px",
							borderRadius: "6px 6px 0 0",
							background: isActive
								? theme.colors.background
								: theme.colors.backgroundSecondary ?? "transparent",
							color: isActive ? theme.colors.text : theme.colors.textSecondary,
							borderTop: `1px solid ${isActive ? theme.colors.border ?? "#444" : "transparent"}`,
							borderLeft: `1px solid ${isActive ? theme.colors.border ?? "#444" : "transparent"}`,
							borderRight: `1px solid ${isActive ? theme.colors.border ?? "#444" : "transparent"}`,
							cursor: "pointer",
							fontSize: theme.fontSizes[1],
							fontFamily: theme.fonts.body,
							maxWidth: 240,
							minWidth: 0,
							userSelect: "none",
							marginBottom: -1,
						}}
						title={tab.title}
					>
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: tab.kind === "library" ? 1 : "50%",
								background: dotColor,
								flexShrink: 0,
							}}
						/>
						<span
							style={{
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
								flex: 1,
								minWidth: 0,
							}}
						>
							{tab.title}
						</span>
						{!isPermanent && (
							<span
								onClick={(e) => {
									e.stopPropagation();
									onClose(tab.id);
								}}
								style={{
									width: 16,
									height: 16,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									borderRadius: 3,
									color: theme.colors.textMuted ?? "#888",
									fontSize: theme.fontSizes[1],
									lineHeight: 1,
									cursor: "pointer",
								}}
								title="Close tab"
							>
								×
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// TrailViewer (active tab content)
// ---------------------------------------------------------------------------

function TrailViewer({
	tabId,
	payload,
	fileTree,
	repoRoot,
	hostOwner,
	hostRepo,
}: {
	tabId: string;
	payload: TrailPayload;
	fileTree: FileTree;
	repoRoot: string;
	/** Repo identity the bun host resolved (git origin / explicit remote).
	 *  Preferred over the payload so the header matches the library rows. */
	hostOwner?: string;
	hostRepo?: string;
}) {
	const { theme } = useTheme();

	const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

	const repository = useMemo<FileCityTrailExplorerRepository>(() => {
		const repoEntry = payload.repos?.[0];
		const owner = repoEntry?.remote?.owner ?? "local";
		const name = repoEntry?.remote?.name ?? repoEntry?.name ?? "repo";
		const id = repoEntry?.id ?? createLocalRepoPurl(repoRoot);
		return { id, owner, name };
	}, [payload, repoRoot]);

	const context = useMemo<
		PanelContextValue<FileCityTrailExplorerPanelContext>
	>(() => {
		const fileTreeSlice: DataSlice<FileTree> = {
			scope: "repository",
			name: "fileTree",
			data: fileTree,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		const trailSlice: DataSlice<TrailPayload | null> = {
			scope: "repository",
			name: "trail",
			data: payload,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		return {
			currentScope: { type: "repository" },
			refresh: async () => {},
			fileTree: fileTreeSlice,
			lineCounts: nullSlice("lineCounts"),
			trail: trailSlice,
			highlightLayers: nullSlice<HighlightLayer[]>("highlightLayers"),
			repository,
		};
	}, [fileTree, payload, repository]);

	const readFile = useCallback((path: string) => callReadFile(tabId, path), [tabId]);

	const actions = useMemo<FileCityTrailExplorerPanelActions>(
		() => ({
			openFile: () => {},
			readFile,
			createTrailNote: async (_payloadId, draft) => {
				const res = await electrobun.rpc!.request.createTrailNote({
					tabId,
					draft,
				});
				if (!res.ok) {
					console.warn("[trail-viewer] createTrailNote failed:", res.error);
					return null;
				}
				return (res.note ?? null) as TrailNote | null;
			},
			updateTrailNote: async (_payloadId, noteId, body) => {
				const res = await electrobun.rpc!.request.updateTrailNote({
					tabId,
					noteId,
					body,
				});
				if (!res.ok) {
					console.warn("[trail-viewer] updateTrailNote failed:", res.error);
					return null;
				}
				return (res.note ?? null) as TrailNote | null;
			},
			deleteTrailNote: async (_payloadId, noteId) => {
				const res = await electrobun.rpc!.request.deleteTrailNote({
					tabId,
					noteId,
				});
				if (!res.ok) {
					console.warn("[trail-viewer] deleteTrailNote failed:", res.error);
				}
			},
			createTrailSignOff: async () => null,
			deleteTrailSignOff: async () => {},
		}),
		[readFile, tabId],
	);

	const header = useMemo(() => {
		const repoEntry = payload.repos?.[0];
		// Prefer the identity the bun host resolved — it mirrors the library rows
		// by recovering `owner/name` from the working tree's git origin, which
		// the payload almost never carries for local trails. The host returns the
		// `"local"` sentinel when there's no GitHub origin, so only treat a
		// non-"local" owner as a real remote. Fall back to the payload's own
		// remote (older trails / web-ade) before the local label.
		const githubOwner =
			hostOwner && hostOwner !== "local" ? hostOwner : repoEntry?.remote?.owner;
		const githubName =
			hostOwner && hostOwner !== "local" ? hostRepo : repoEntry?.remote?.name;
		// For trails with a remote, mirror web-ade's `<owner>/<repo>` crumbs and
		// link to the matching GitHub URL. For local-only trails (no GitHub
		// origin), fall back to `local / <repo-folder>` and hide the GitHub
		// button — there's no URL to point at.
		if (githubOwner && githubName) {
			return {
				owner: githubOwner,
				repo: githubName,
				githubUrl: `https://github.com/${githubOwner}/${githubName}`,
			};
		}
		const basename = repoRoot.split("/").filter(Boolean).pop() ?? "repo";
		return {
			owner: "local",
			// `hostRepo` is the working-tree folder name when there's no origin —
			// nicer than the dash-encoded path some payloads carry.
			repo: hostRepo ?? repoEntry?.name ?? basename,
			githubUrl: undefined,
		};
	}, [payload, repoRoot, hostOwner, hostRepo]);

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				color: theme.colors.text,
			}}
		>
			<TrailHeader
				tabId={tabId}
				owner={header.owner}
				repo={header.repo}
				share={payload.share}
				githubUrl={header.githubUrl}
			/>
			<div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
				<FileCityTrailExplorerPanel
					context={context}
					actions={actions}
					events={events}
					briefSide="leading"
				/>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// TourHeader — slim chrome for tour tabs. Tours aren't published or annotated
// (the tour panel exposes no notes / sign-offs), so this drops the Trail
// header's Publish / Share / notes affordances and keeps just the owner/repo
// crumbs plus a GitHub link when the repo has a remote.
// ---------------------------------------------------------------------------

function TourHeader({
	owner,
	repo,
	githubUrl,
}: {
	owner: string;
	repo: string;
	githubUrl?: string;
}) {
	const { theme } = useTheme();
	const onOpenGithub = useCallback(() => {
		if (!githubUrl) return;
		void electrobun.rpc!.request.openExternal({ url: githubUrl });
	}, [githubUrl]);

	return (
		<header
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "8px 16px",
				background: theme.colors.surface,
				borderBottom: `1px solid ${theme.colors.border}`,
				flexShrink: 0,
				fontFamily: theme.fonts.body,
			}}
		>
			<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
				<span
					style={{
						flexShrink: 0,
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						letterSpacing: 0.3,
						textTransform: "uppercase",
						padding: "2px 7px",
						borderRadius: 999,
						background: theme.colors.accent ?? theme.colors.primary,
						color: theme.colors.background,
					}}
				>
					Tour
				</span>
				<span
					style={{
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						color: theme.colors.text,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{owner}
				</span>
				<span style={{ color: theme.colors.textMuted }} aria-hidden>
					/
				</span>
				<span
					style={{
						fontSize: theme.fontSizes[1],
						fontWeight: 600,
						color: theme.colors.text,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap",
					}}
				>
					{repo}
				</span>
			</div>
			{githubUrl && (
				<button
					type="button"
					onClick={onOpenGithub}
					title={`Open ${owner}/${repo} on GitHub`}
					aria-label={`Open ${owner}/${repo} on GitHub`}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 32,
						height: 32,
						borderRadius: 6,
						background: "transparent",
						border: "none",
						color: theme.colors.text,
						cursor: "pointer",
						flexShrink: 0,
					}}
				>
					<GithubMark size={20} />
				</button>
			)}
		</header>
	);
}

// ---------------------------------------------------------------------------
// TourViewer (active tab content) — renders a File City introduction tour via
// the panel library's FileCityGuidePanel, the sibling of the trail
// explorer. Tour steps drive the city's focusDirectory + highlight layers; the
// panel derives its own layers per step, so the host highlightLayers slice is
// left null. Audio is disabled (no fetchAudioUrls action) for the standalone
// viewer.
// ---------------------------------------------------------------------------

function TourViewer({
	tour,
	fileTree,
	repoRoot,
	hostOwner,
	hostRepo,
}: {
	tabId: string;
	tour: IntroductionTour;
	fileTree: FileTree;
	repoRoot: string;
	hostOwner?: string;
	hostRepo?: string;
}) {
	const { theme } = useTheme();

	const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

	const header = useMemo(() => {
		const basename = repoRoot.split("/").filter(Boolean).pop() ?? "repo";
		if (hostOwner && hostOwner !== "local" && hostRepo) {
			return {
				owner: hostOwner,
				repo: hostRepo,
				githubUrl: `https://github.com/${hostOwner}/${hostRepo}`,
			};
		}
		return { owner: "local", repo: hostRepo ?? basename, githubUrl: undefined };
	}, [repoRoot, hostOwner, hostRepo]);

	const repository = useMemo<FileCityGuideRepository>(
		() => ({
			id: createLocalRepoPurl(repoRoot),
			path: repoRoot,
			owner: header.owner === "local" ? null : header.owner,
			name: header.repo,
		}),
		[repoRoot, header],
	);

	const context = useMemo<
		PanelContextValue<FileCityGuidePanelContext>
	>(() => {
		const fileTreeSlice: DataSlice<FileTree> = {
			scope: "repository",
			name: "fileTree",
			data: fileTree,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		const tourSlice: DataSlice<IntroductionTour | null> = {
			scope: "repository",
			name: "tour",
			data: tour,
			loading: false,
			error: null,
			refresh: async () => {},
		};
		return {
			currentScope: { type: "repository" },
			refresh: async () => {},
			fileTree: fileTreeSlice,
			lineCounts: nullSlice("lineCounts"),
			tour: tourSlice,
			highlightLayers: nullSlice<HighlightLayer[]>("highlightLayers"),
			repository,
		};
	}, [fileTree, tour, repository]);

	const actions = useMemo<FileCityGuidePanelActions>(
		// No editor to open into in the standalone viewer, and audio is disabled
		// (omitting fetchAudioUrls hides the panel's Play / Auto-play controls).
		() => ({ openFile: () => {} }),
		[],
	);

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
				color: theme.colors.text,
			}}
		>
			<TourHeader owner={header.owner} repo={header.repo} githubUrl={header.githubUrl} />
			<div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
				<FileCityGuidePanel
					context={context}
					actions={actions}
					events={events}
				/>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Library tab content
// ---------------------------------------------------------------------------

function relativeTime(ms: number): string {
	const delta = Date.now() - ms;
	if (delta < 60_000) return "just now";
	if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
	if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
	return `${Math.floor(delta / 86_400_000)}d ago`;
}

function LibraryView() {
	const { theme } = useTheme();
	const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const result = await electrobun.rpc!.request.listTrails({});
			setEntries(result.entries);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
		// Expose this refresh to the top-level AppHeader's refresh button.
		libraryRefreshers.add(refresh);
		return () => {
			libraryRefreshers.delete(refresh);
		};
	}, [refresh]);

	const onOpen = useCallback(async (entry: LibraryEntry) => {
		// Tours can only render against a local working tree (they reference whole
		// directories, not a marker-derived remote file set), so always open them
		// in local mode. We don't pass a repoRoot — the host resolves the tour's
		// repo from the Alexandria registry, and surfaces a clear message if it
		// can't find a local checkout.
		const localOpen =
			entry.kind === "tour" || entry.localRepoRoot
				? {
						mode: "local" as const,
						...(entry.localRepoRoot ? { repoRoot: entry.localRepoRoot } : {}),
					}
				: {};
		await electrobun.rpc!.request.openTrailFromCache({
			trailFile: entry.trailFile,
			...localOpen,
		});
	}, []);

	if (error) {
		return <CenteredMessage title="Could not load library" detail={error} />;
	}
	if (entries === null) {
		return <CenteredMessage title="Loading library…" />;
	}
	if (entries.length === 0) {
		return (
			<CenteredMessage
				title="Nothing in your cache yet"
				detail="Run `principal-ai trail view <id>` or `tour view <id>` to fetch one, or `--file <path>` to open a local JSON."
			/>
		);
	}

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				overflowY: "auto",
				padding: "16px 24px",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{entries.map((entry) => (
					<div
						key={entry.trailFile}
						onClick={() => onOpen(entry)}
						style={{
							display: "flex",
							alignItems: "baseline",
							gap: 12,
							padding: "8px 12px",
							borderRadius: 4,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							background: theme.colors.backgroundSecondary ?? "transparent",
							cursor: "pointer",
							fontSize: theme.fontSizes[2],
						}}
					>
						<span
							style={{
								flexShrink: 0,
								boxSizing: "border-box",
								minWidth: 76,
								textAlign: "center",
								fontSize: theme.fontSizes[0],
								fontWeight: 600,
								letterSpacing: 0.3,
								textTransform: "uppercase",
								padding: "2px 7px",
								borderRadius: 999,
								...(entry.kind === "tour"
									? {
											background: theme.colors.primary,
											color: theme.colors.background,
										}
									: entry.published
										? {
												background: theme.colors.accent ?? theme.colors.primary,
												color: theme.colors.background,
											}
										: {
												background: "transparent",
												color: theme.colors.textMuted ?? theme.colors.textSecondary,
												border: `1px solid ${theme.colors.border ?? "#333"}`,
											}),
							}}
						>
							{entry.kind === "tour"
								? "Tour"
								: entry.published
									? "Published"
									: "Draft"}
						</span>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}
						>
							{entry.title}
						</div>
						<div
							style={{
								fontSize: theme.fontSizes[0],
								color: theme.colors.textSecondary,
								fontFamily: theme.fonts.monospace,
								flexShrink: 0,
							}}
						>
							{entry.owner && entry.repo
								? `${entry.owner}/${entry.repo}`
								: entry.anchor}
						</div>
						<div
							style={{
								fontSize: theme.fontSizes[0],
								color: theme.colors.textMuted ?? theme.colors.textSecondary,
								flexShrink: 0,
								minWidth: 60,
								textAlign: "right",
							}}
						>
							{relativeTime(entry.mtimeMs)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Active tab content (loading/error/ready)
// ---------------------------------------------------------------------------

function ActiveTab({ tabId }: { tabId: string }) {
	const [state, setState] = useState<TabState>({ kind: "loading" });

	useEffect(() => {
		let cancelled = false;
		setState({ kind: "loading" });
		(async () => {
			try {
				const tab = await electrobun.rpc!.request.getTab({ id: tabId });
				if (cancelled) return;
				if (tab.kind === "library") {
					setState({ kind: "library" });
					return;
				}
				if (tab.kind === "agent-sessions") {
					setState({ kind: "agent-sessions" });
					return;
				}
				if (!tab.ok || !tab.payload) {
					setState({
						kind: "error",
						message: tab.error ?? "Could not load tab",
					});
					return;
				}
				const tree = await electrobun.rpc!.request.getFileTree({ tabId });
				if (cancelled) return;
				const fileTree = new GitFileTreeBuilder().build({
					files: tree.files,
					rootPath: "/local",
					commitSha: "local",
					branch: "local",
				});
				if (tab.payloadKind === "tour") {
					setState({
						kind: "ready-tour",
						id: tab.id,
						tour: tab.payload as IntroductionTour,
						fileTree,
						repoRoot: tab.repoRoot ?? "",
						owner: tab.owner,
						repo: tab.repo,
					});
					return;
				}
				setState({
					kind: "ready",
					id: tab.id,
					payload: tab.payload as TrailPayload,
					fileTree,
					repoRoot: tab.repoRoot ?? "",
					owner: tab.owner,
					repo: tab.repo,
				});
			} catch (err) {
				if (cancelled) return;
				setState({
					kind: "error",
					message: err instanceof Error ? err.message : String(err),
				});
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [tabId]);

	if (state.kind === "loading") return <CenteredMessage title="Loading trail…" />;
	if (state.kind === "library") return <LibraryView />;
	if (state.kind === "agent-sessions") return <AgentSessionsOverviewView />;
	if (state.kind === "error")
		return <CenteredMessage title="Could not load trail" detail={state.message} />;
	if (state.kind === "ready-tour") {
		return (
			<TourViewer
				tabId={state.id}
				tour={state.tour}
				fileTree={state.fileTree}
				repoRoot={state.repoRoot}
				hostOwner={state.owner}
				hostRepo={state.repo}
			/>
		);
	}
	return (
		<TrailViewer
			tabId={state.id}
			payload={state.payload}
			fileTree={state.fileTree}
			repoRoot={state.repoRoot}
			hostOwner={state.owner}
			hostRepo={state.repo}
		/>
	);
}

// ---------------------------------------------------------------------------
// App — manages tab list + active tab
// ---------------------------------------------------------------------------

function App() {
	const { theme } = useTheme();
	const [tabs, setTabs] = useState<TabSummary[]>([]);
	const [activeTabId, setActiveTabId] = useState<string>("agent-sessions");

	useEffect(() => {
		const refresh = async () => {
			try {
				const result = await electrobun.rpc!.request.listTabs({});
				setTabs(result.tabs);
				setActiveTabId(result.activeTabId);
			} catch (err) {
				console.error("[trail-viewer] listTabs failed:", err);
			}
		};
		void refresh();
		reloadSubscribers.add(refresh);
		return () => {
			reloadSubscribers.delete(refresh);
		};
	}, []);

	const onSelect = useCallback((id: string) => {
		void electrobun.rpc!.request.setActiveTab({ id });
	}, []);

	const onClose = useCallback((id: string) => {
		void electrobun.rpc!.request.closeTab({ id });
	}, []);

	const libraryActive =
		tabs.find((t) => t.id === activeTabId)?.kind === "library" ||
		(tabs.length === 0 && activeTabId === "library");

	return (
		<div
			style={{
				width: "100%",
				height: "100vh",
				background: theme.colors.background,
				color: theme.colors.text,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			<AppHeader libraryActive={libraryActive} />
			<TabStrip
				tabs={tabs}
				activeTabId={activeTabId}
				onSelect={onSelect}
				onClose={onClose}
			/>
			<ActiveTab key={activeTabId} tabId={activeTabId} />
		</div>
	);
}

// electrobun drops bundled/linked .css (wrong MIME on the views:// scheme), so
// neither our reset (index.css) nor React Flow's stylesheet reaches WebKit
// through the normal paths. Both are imported above as text (inlined into this
// bundle); inject them with <style> tags here — a JS-built <style> always
// applies. The reset goes in first so React Flow's rules win any overlap.
// Without index.css the UA `body { margin: 8px }` survives and the 100vh app
// overflows by 16px; without the React Flow CSS the sequence-view panes, edges,
// and controls render unstyled.
function injectStyles(): void {
	for (const [marker, css] of [
		["data-trail-viewer-reset", resetStyles],
		["data-xyflow-react", xyflowStyles],
	] as const) {
		const style = document.createElement("style");
		style.setAttribute(marker, "");
		style.textContent = css;
		document.head.appendChild(style);
	}
}
injectStyles();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");
createRoot(rootEl).render(
	<ThemeProvider theme={slateNeonTheme}>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</ThemeProvider>,
);
