/**
 * SubsystemGraphsView — the "Subsystems" tab: a list of stored subsystem
 * graphs (~/.principal/subsystem-graphs). Clicking a row opens the graph in a
 * subsystem-graph tab via the host.
 */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import type { SubsystemGraphSummary } from "../../shared/contract";
import { electrobun } from "../rpc";
import { CenteredMessage, relativeTime } from "../ui";

export function SubsystemGraphsView() {
	const { theme } = useTheme();
	const [graphs, setGraphs] = useState<SubsystemGraphSummary[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const result = await electrobun.rpc!.request.listSubsystemGraphs({});
			setGraphs(result.graphs);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const onOpen = useCallback(async (graph: SubsystemGraphSummary) => {
		await electrobun.rpc!.request.openSubsystemGraph({ graphId: graph.id });
	}, []);

	const onDelete = useCallback(
		async (e: React.MouseEvent, graph: SubsystemGraphSummary) => {
			// Keep the row click from also opening the graph.
			e.stopPropagation();
			// Two-click confirm — window.confirm is unavailable in the webview.
			if (confirmId !== graph.id) {
				setConfirmId(graph.id);
				return;
			}
			setConfirmId(null);
			try {
				await electrobun.rpc!.request.deleteSubsystemGraph({ graphId: graph.id });
				setGraphs((prev) => prev?.filter((g) => g.id !== graph.id) ?? null);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
		},
		[confirmId],
	);

	if (error) {
		return <CenteredMessage title="Could not load subsystem graphs" detail={error} />;
	}
	if (graphs === null) {
		return <CenteredMessage title="Loading subsystem graphs…" />;
	}
	if (graphs.length === 0) {
		return (
			<CenteredMessage
				title="No subsystem graphs yet"
				detail='POST one to http://127.0.0.1:3045/api/subsystem-graph to create it.'
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
				{graphs.map((graph) => (
					<div
						key={graph.id}
						onClick={() => onOpen(graph)}
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
								background: theme.colors.primary,
								color: theme.colors.background,
							}}
						>
							Graph
						</span>
						<div style={{ flex: 1, minWidth: 0 }}>
							<div
								style={{
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{graph.title}
							</div>
							{graph.description && (
								<div
									style={{
										fontSize: theme.fontSizes[1],
										color: theme.colors.textMuted ?? theme.colors.textSecondary,
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis",
									}}
								>
									{graph.description.replace(/[#*`\n]/g, " ").trim()}
								</div>
							)}
						</div>
						<div
							style={{
								fontSize: theme.fontSizes[0],
								color: theme.colors.textSecondary,
								fontFamily: theme.fonts.monospace,
								flexShrink: 0,
							}}
						>
							{graph.repo ? `${graph.repo.owner}/${graph.repo.name}` : graph.componentCount === 1 ? "1 component" : `${graph.componentCount} components`}
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
							{relativeTime(new Date(graph.updatedAt).getTime())}
						</div>
						<button
							type="button"
							onClick={(e) => onDelete(e, graph)}
							title={confirmId === graph.id ? "Click again to delete" : `Delete ${graph.title}`}
							aria-label={confirmId === graph.id ? `Confirm delete ${graph.title}` : `Delete ${graph.title}`}
							style={{
								flexShrink: 0,
								border: "none",
								background: "transparent",
								color:
									confirmId === graph.id
										? "#e5534b"
										: theme.colors.textMuted ?? theme.colors.textSecondary,
								fontWeight: confirmId === graph.id ? 600 : 400,
								cursor: "pointer",
								fontSize: theme.fontSizes[1],
								lineHeight: 1,
								padding: "2px 6px",
								borderRadius: 4,
							}}
						>
							{confirmId === graph.id ? "delete?" : "✕"}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
