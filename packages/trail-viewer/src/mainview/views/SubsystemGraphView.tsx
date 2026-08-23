/**
 * SubsystemGraphView — renders a persisted subsystem component graph in a tab.
 *
 * Fetches the graph from the host via `getSubsystemGraph` RPC and renders it
 * using `SubsystemComponentGraph` from @principal-ai/principal-view-react.
 * "Edit in Excalidraw" fades an editable drawing over the same pane.
 */

import { useCallback, useEffect, useState } from "react";
import { PenTool, X } from "lucide-react";
import { useTheme } from "@principal-ade/industry-theme";
import { PierreFileView } from "@industry-theme/file-city-panel";
import {
	SubsystemComponentGraph,
	type SubsystemComponent,
	type SubsystemComponentEdge,
} from "@principal-ai/principal-view-react";
import { electrobun, reloadSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";
import { SubsystemExcalidrawOverlay } from "../components/SubsystemExcalidrawOverlay";
import type { ExcalidrawSelectionInfo } from "../excalidraw/excalidrawToSubsystem";
import type { StoredSubsystemGraph } from "../../shared/contract";

export function SubsystemGraphView({
	tabId,
	graphId,
}: {
	tabId: string;
	graphId: string;
}) {
	const { theme } = useTheme();
	const [graph, setGraph] = useState<StoredSubsystemGraph | null | undefined>(undefined);
	const [excalidrawOpen, setExcalidrawOpen] = useState(false);
	const [selection, setSelection] = useState<ExcalidrawSelectionInfo | null>(null);

	const loadGraph = useCallback(() => {
		void electrobun.rpc!.request
			.getSubsystemGraph({ graphId })
			.then((res) => {
				setGraph(res.ok && res.graph ? res.graph : null);
			})
			.catch(() => setGraph(null));
	}, [graphId]);

	useEffect(() => {
		loadGraph();
		reloadSubscribers.add(loadGraph);
		return () => {
			reloadSubscribers.delete(loadGraph);
		};
	}, [loadGraph]);

	if (graph === undefined) {
		return <CenteredMessage title="Loading subsystem graph..." />;
	}

	if (graph === null) {
		return <CenteredMessage title="Graph not found" detail={graphId} />;
	}

	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				background: theme.colors.background,
			}}
		>
			<SubsystemComponentGraph
				components={graph.components as SubsystemComponent[]}
				edges={graph.edges as SubsystemComponentEdge[]}
				title={graph.title}
				description={graph.description}
			renderFileViewer={(file) => (
				<PierreFileView
					filePath={file}
					fileName={file.split("/").pop() ?? file}
					readFile={(path) =>
						electrobun.rpc!.request
							.readFile({ tabId, path })
							.then((res) => {
								if (res.ok && res.content != null) return res.content;
								throw new Error(res.error ?? "Failed to read file");
							})
					}
				/>
			)}
				sidebarAfterDescription={
					excalidrawOpen ? <SelectionInspector selection={selection} /> : undefined
				}
				sidebarExtra={
					excalidrawOpen ? (
						<button
							type="button"
							onClick={() => setExcalidrawOpen(false)}
							style={{
								display: "inline-flex",
								alignItems: "center",
								gap: 6,
								padding: "6px 12px",
								borderRadius: 6,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								background: theme.colors.background,
								color: theme.colors.text,
								fontSize: theme.fontSizes[1],
								fontFamily: theme.fonts.monospace,
								cursor: "pointer",
								alignSelf: "flex-start",
							}}
						>
							<X size={14} />
							Back to graph
						</button>
					) : undefined
				}
				canvasOverlay={
					<>
						{!excalidrawOpen && (
							<button
								type="button"
								onClick={() => setExcalidrawOpen(true)}
								style={{
									position: "absolute",
									top: 12,
									right: 12,
									zIndex: 10,
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									padding: "6px 12px",
									borderRadius: 6,
									border: `1px solid ${theme.colors.border ?? "#333"}`,
									background: theme.colors.background,
									color: theme.colors.text,
									fontSize: theme.fontSizes[1],
									fontFamily: theme.fonts.monospace,
									cursor: "pointer",
									boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
								}}
							>
								<PenTool size={14} />
								Edit in Excalidraw
							</button>
						)}
						<SubsystemExcalidrawOverlay
							open={excalidrawOpen}
							title={graph.title}
							components={graph.components as SubsystemComponent[]}
							edges={graph.edges as SubsystemComponentEdge[]}
							onSelectionChange={setSelection}
						/>
					</>
				}
			/>
		</div>
	);
}

const INSPECTOR_KEYS = [
	"kind",
	"symbol",
	"file",
	"purl",
	"purpose",
	"capture",
	"layer",
	"mechanism",
	"from",
	"to",
	"refs",
	"id",
] as const;

function formatValue(value: unknown): string {
	if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
	if (value === undefined || value === null || value === "") return "";
	return String(value);
}

function SelectionInspector({ selection }: { selection: ExcalidrawSelectionInfo | null }) {
	const { theme } = useTheme();
	if (!selection) return null;

	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	const principal = selection.principal;
	const kind =
		principal?.["type"] === "subsystem-edge"
			? "edge"
			: principal?.["type"] === "subsystem-component"
				? "component"
				: selection.elementType;

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
			<span
				style={{
					fontSize: theme.fontSizes[0] * 0.8,
					fontFamily: theme.fonts.monospace,
					textTransform: "uppercase",
					color: muted,
					fontWeight: 600,
				}}
			>
				Selected
			</span>
			{selection.count > 1 ? (
				<span style={{ fontSize: theme.fontSizes[1], color: theme.colors.text }}>
					{selection.count} shapes
				</span>
			) : (
				<>
					<div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
						<span
							style={{
								fontSize: theme.fontSizes[2],
								fontWeight: 600,
								color: theme.colors.text,
								wordBreak: "break-word",
							}}
						>
							{selection.label}
						</span>
						<span
							style={{
								fontSize: theme.fontSizes[0] * 0.8,
								fontFamily: theme.fonts.monospace,
								textTransform: "uppercase",
								color: muted,
							}}
						>
							{kind}
						</span>
					</div>
					{principal ? (
						<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
							{INSPECTOR_KEYS.map((key) => {
								const raw = principal[key];
								const text = formatValue(raw);
								if (!text) return null;
								if (key === "symbol" && text === selection.label) return null;
								return (
									<div
										key={key}
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 1,
										}}
									>
										<span
											style={{
												fontSize: theme.fontSizes[0] * 0.8,
												fontFamily: theme.fonts.monospace,
												textTransform: "uppercase",
												color: muted,
											}}
										>
											{key}
										</span>
										<span
											style={{
												fontSize: theme.fontSizes[0],
												fontFamily: theme.fonts.monospace,
												color: theme.colors.text,
												wordBreak: "break-word",
											}}
										>
											{text}
										</span>
									</div>
								);
							})}
						</div>
					) : (
						<span style={{ fontSize: theme.fontSizes[0], color: muted }}>
							No hidden properties on this shape.
						</span>
					)}
				</>
			)}
		</div>
	);
}
