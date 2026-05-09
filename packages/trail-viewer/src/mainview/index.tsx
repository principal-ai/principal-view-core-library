/**
 * Trail viewer mainview.
 */

import "@xyflow/react/dist/style.css";

import { Component, useCallback, useEffect, useMemo, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Electrobun, { Electroview } from "electrobun/view";
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
	FileCityTrailExplorerPanel,
	type FileCityTrailExplorerPanelActions,
	type FileCityTrailExplorerPanelContext,
	type FileCityTrailExplorerRepository,
	type TrailPayload,
} from "@industry-theme/file-city-panel";

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

type ViewerMode = "local" | "remote";

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

interface LibraryEntry {
	trailFile: string;
	id: string;
	title: string;
	anchor: string;
	owner?: string;
	repo?: string;
	mtimeMs: number;
}

type TrailViewerRPC = {
	bun: {
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
			tabsChanged: null;
		};
	};
	webview: {
		requests: Record<string, never>;
		messages: Record<string, never>;
	};
};

// Subscribers wired up in App: each becomes a callback that re-runs listTabs.
// The bun host fires `tabsChanged` after LOAD_TRAIL, setActiveTab, closeTab.
const reloadSubscribers = new Set<() => void>();

const rpc = Electroview.defineRPC<TrailViewerRPC>({
	maxRequestTime: 5000,
	handlers: {
		requests: {},
		messages: {
			tabsChanged: () => {
				for (const fn of reloadSubscribers) fn();
			},
		},
	},
});
const electrobun = new Electrobun.Electroview({ rpc });

function callReadFile(tabId: string, path: string): Promise<string> {
	return electrobun.rpc!.request.readFile({ tabId, path }).then((res) => {
		if (!res.ok) throw new Error(res.error ?? "readFile failed");
		return res.content ?? "";
	});
}

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
// View states
// ---------------------------------------------------------------------------

type TabState =
	| { kind: "loading" }
	| { kind: "library" }
	| { kind: "error"; message: string }
	| {
			kind: "ready";
			id: string;
			payload: TrailPayload;
			fileTree: FileTree;
			repoRoot: string;
		};

function nullSlice<T>(name: string): DataSlice<T | null> {
	return {
		scope: "repository",
		name,
		data: null,
		loading: false,
		error: null,
		refresh: async () => {},
	};
}

function CenteredMessage({
	title,
	detail,
}: {
	title: string;
	detail?: string;
}) {
	const { theme } = useTheme();
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
			}}
		>
			<div style={{ textAlign: "center", maxWidth: 640, padding: 24 }}>
				<div style={{ fontSize: 18, marginBottom: 8 }}>{title}</div>
				{detail && (
					<div
						style={{
							fontSize: 12,
							color: theme.colors.textMuted ?? theme.colors.textSecondary,
							fontFamily: theme.fonts.monospace,
							whiteSpace: "pre-wrap",
						}}
					>
						{detail}
					</div>
				)}
			</div>
		</div>
	);
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
				flexShrink: 0,
			}}
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTabId;
				const isLibrary = tab.kind === "library";
				const dotColor = isLibrary
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
							fontSize: 12,
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
								borderRadius: isLibrary ? 1 : "50%",
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
						{!isLibrary && (
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
									fontSize: 14,
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
}: {
	tabId: string;
	payload: TrailPayload;
	fileTree: FileTree;
	repoRoot: string;
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
			repository,
		};
	}, [fileTree, payload, repository]);

	const readFile = useCallback((path: string) => callReadFile(tabId, path), [tabId]);

	const actions = useMemo<FileCityTrailExplorerPanelActions>(
		() => ({
			openFile: () => {},
			readFile,
			createTrailNote: async () => null,
			updateTrailNote: async () => null,
			deleteTrailNote: async () => {},
		}),
		[readFile],
	);

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				background: theme.colors.background,
				color: theme.colors.text,
			}}
		>
			<FileCityTrailExplorerPanel
				context={context}
				actions={actions}
				events={events}
			/>
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
	}, [refresh]);

	const onOpen = useCallback(async (entry: LibraryEntry) => {
		await electrobun.rpc!.request.openTrailFromCache({
			trailFile: entry.trailFile,
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
				title="No trails in your cache yet"
				detail="Run `principal-ai trail view <id>` to fetch one, or `--file <path>` to open a local JSON."
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
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					marginBottom: 16,
				}}
			>
				<div style={{ fontSize: 18, fontWeight: 500 }}>Trail library</div>
				<div
					onClick={refresh}
					style={{
						fontSize: 11,
						color: theme.colors.textSecondary,
						cursor: "pointer",
						userSelect: "none",
					}}
					title="Refresh"
				>
					↻ refresh
				</div>
			</div>
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
							fontSize: 13,
						}}
					>
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
								fontSize: 11,
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
								fontSize: 11,
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
				setState({
					kind: "ready",
					id: tab.id,
					payload: tab.payload as TrailPayload,
					fileTree,
					repoRoot: tab.repoRoot ?? "",
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
	if (state.kind === "error")
		return <CenteredMessage title="Could not load trail" detail={state.message} />;
	return (
		<TrailViewer
			tabId={state.id}
			payload={state.payload}
			fileTree={state.fileTree}
			repoRoot={state.repoRoot}
		/>
	);
}

// ---------------------------------------------------------------------------
// App — manages tab list + active tab
// ---------------------------------------------------------------------------

function App() {
	const { theme } = useTheme();
	const [tabs, setTabs] = useState<TabSummary[]>([]);
	const [activeTabId, setActiveTabId] = useState<string>("library");

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

	return (
		<div
			style={{
				width: "100vw",
				height: "100vh",
				background: theme.colors.background,
				color: theme.colors.text,
				display: "flex",
				flexDirection: "column",
			}}
		>
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

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");
createRoot(rootEl).render(
	<ThemeProvider theme={slateNeonTheme}>
		<ErrorBoundary>
			<App />
		</ErrorBoundary>
	</ThemeProvider>,
);
