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

type TrailViewerRPC = {
	bun: {
		requests: {
			getInitialTrail: {
				params: Record<string, never>;
				response: {
					ok: boolean;
					error?: string;
					payload?: unknown;
					repoRoot: string;
					trailFilePath: string | null;
				};
			};
			readFile: {
				params: { path: string };
				response: { ok: boolean; content?: string; error?: string };
			};
			getFileTree: {
				params: Record<string, never>;
				response: { files: Array<{ path: string; size: number }> };
			};
		};
		messages: Record<string, never>;
	};
	webview: {
		requests: Record<string, never>;
		messages: Record<string, never>;
	};
};

const rpc = Electroview.defineRPC<TrailViewerRPC>({
	maxRequestTime: 5000,
	handlers: { requests: {}, messages: {} },
});
const electrobun = new Electrobun.Electroview({ rpc });

function callReadFile(path: string): Promise<string> {
	return electrobun.rpc!.request.readFile({ path }).then((res) => {
		if (!res.ok) throw new Error(res.error ?? "readFile failed");
		return res.content ?? "";
	});
}

// ---------------------------------------------------------------------------
// Error boundary — surface unminified errors from anywhere below.
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

type LoadedState =
	| { kind: "loading" }
	| { kind: "error"; message: string }
	| {
			kind: "ready";
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
				width: "100vw",
				height: "100vh",
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

function TrailViewer({
	payload,
	fileTree,
}: {
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
		const id = repoEntry?.id ?? `${owner}/${name}`;
		return { id, owner, name };
	}, [payload]);

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

	const readFile = useCallback((path: string) => callReadFile(path), []);

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
				width: "100vw",
				height: "100vh",
				background: theme.colors.background,
				color: theme.colors.text,
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div style={{ flex: 1, minHeight: 0 }}>
				<FileCityTrailExplorerPanel
					context={context}
					actions={actions}
					events={events}
				/>
			</div>
		</div>
	);
}

function App() {
	const [state, setState] = useState<LoadedState>({ kind: "loading" });

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const initial = await electrobun.rpc!.request.getInitialTrail({});
				if (cancelled) return;
				if (!initial.ok || !initial.payload) {
					setState({
						kind: "error",
						message: initial.error ?? "Could not load trail",
					});
					return;
				}
				const tree = await electrobun.rpc!.request.getFileTree({});
				if (cancelled) return;
				const fileTree = new GitFileTreeBuilder().build({
					files: tree.files,
					rootPath: "/local",
					commitSha: "local",
					branch: "local",
				});
				setState({
					kind: "ready",
					payload: initial.payload as TrailPayload,
					fileTree,
					repoRoot: initial.repoRoot,
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
	}, []);

	if (state.kind === "loading") {
		return <CenteredMessage title="Loading trail…" />;
	}
	if (state.kind === "error") {
		return <CenteredMessage title="Could not load trail" detail={state.message} />;
	}
	return (
		<TrailViewer
			payload={state.payload}
			fileTree={state.fileTree}
			repoRoot={state.repoRoot}
		/>
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
