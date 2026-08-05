/**
 * App — top-level shell for the trail-viewer mainview. Owns the tab list +
 * active tab, the ErrorBoundary that wraps the tree, and ActiveTab (the
 * loading/error/ready dispatch that renders the current tab's view).
 */

import { Component, useCallback, useEffect, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { GitFileTreeBuilder } from "@principal-ai/repository-abstraction";
import type { IntroductionTour } from "@principal-ai/file-city-builder";
import type { TrailPayload } from "@industry-theme/file-city-panel";
import type { TabSummary } from "../shared/contract";
import { electrobun, reloadSubscribers } from "./rpc";
import type { TabState } from "./types";
import { CenteredMessage } from "./ui";
import { AppHeader } from "./components/AppHeader";
import { TabStrip } from "./components/TabStrip";
import { AgentSessionsOverviewView } from "./views/AgentSessions";
import { LibraryView } from "./views/LibraryView";
import { TrailViewer } from "./views/TrailViewer";
import { TourViewer } from "./views/TourViewer";

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

	if (state.kind === "loading") {
		// The agent-sessions tab mounts its own "Pulling Agent Sessions" loader,
		// so a "Loading trail…" flash here would double up and read wrong.
		if (tabId === "agent-sessions") return null;
		return <CenteredMessage title="Loading trail…" />;
	}
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

export function App() {
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

export { ErrorBoundary };
