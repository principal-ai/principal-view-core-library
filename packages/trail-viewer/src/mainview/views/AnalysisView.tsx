/**
 * AnalysisView — renders one session's concept analysis (a `kind: "analysis"`
 * tab) as a feed of concept cards.
 *
 * The cards reuse the same `FeedCard` / `DiagramModal` from ConceptCardsView,
 * so analyzed sessions and the curated Concepts feed look and behave the same.
 * The view reads its analysis from the host via `getTab` (the tab payload is
 * the `ConceptAnalysis` record).
 */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { electrobun, reloadSubscribers } from "../rpc";
import { CenteredMessage } from "../ui";
import { FeedCard, DiagramModal } from "./ConceptCardsView";
import type { ConceptAnalysis, SessionSummary } from "../../shared/contract";

export function AnalysisView({
	tabId,
	analysisId,
}: {
	tabId: string;
	analysisId: string;
}) {
	const { theme } = useTheme();
	const [analysis, setAnalysis] = useState<ConceptAnalysis | null | undefined>(
		undefined,
	);
	const [sessions, setSessions] = useState<Map<string, SessionSummary>>(
		new Map(),
	);
	const [openId, setOpenId] = useState<string | null>(null);
	const [retrying, setRetrying] = useState(false);

	const loadAnalysis = useCallback(() => {
		void electrobun.rpc!.request
			.getTab({ id: tabId })
			.then((tab) => {
				setAnalysis(
					tab.ok && tab.payload ? (tab.payload as ConceptAnalysis) : null,
				);
			})
			.catch(() => setAnalysis(null));
	}, [tabId]);

	useEffect(() => {
		loadAnalysis();
		// Re-fetch when the host broadcasts tabsChanged — the analysis transitions
		// pending → done/error in the background while this tab stays open.
		reloadSubscribers.add(loadAnalysis);
		return () => {
			reloadSubscribers.delete(loadAnalysis);
		};
	}, [loadAnalysis]);

	// Redo a failed extraction in place: the host resets the record to `pending`
	// and restarts the opencode run under the same analysis id, then broadcasts
	// tabsChanged — the reloadSubscribers hook below re-fetches and shows the
	// pending state while it runs.
	const retry = useCallback(async () => {
		if (!analysis || analysis.status !== "error" || retrying) return;
		setRetrying(true);
		try {
			const res = await electrobun.rpc!.request.analyzeSession({
				sessionId: analysis.sessionId,
				title: analysis.sessionTitle,
				agent: analysis.agent,
				force: true,
			});
			if (res.ok) loadAnalysis();
		} catch {
			// The tabsChanged broadcast may already have reset the view; a failed
			// RPC leaves the error state up so the button stays clickable.
		} finally {
			setRetrying(false);
		}
	}, [analysis, retrying, loadAnalysis]);

	// Enrich session ids on cards with names — enrichment only; cards render
	// bare ids when it's unavailable.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await electrobun.rpc!.request.listSessions({
					days: 90,
				});
				if (cancelled) return;
				const map = new Map<string, SessionSummary>();
				for (const g of res.groups ?? []) {
					map.set(g.parent.id, g.parent);
					for (const c of g.children) map.set(c.id, c);
				}
				for (const s of res.standalone ?? []) map.set(s.id, s);
				setSessions(map);
			} catch {
				// enrichment only
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (analysis === undefined) {
		return <CenteredMessage title="Loading analysis…" />;
	}
	if (analysis === null) {
		return (
			<CenteredMessage
				title="Analysis unavailable"
				detail={`Could not load analysis ${analysisId} from the host.`}
			/>
		);
	}
	if (analysis.status === "error") {
		return (
			<CenteredMessage
				title="Analysis failed"
				detail={analysis.error ?? "Unknown error"}
			>
				<button
					type="button"
					disabled={retrying}
					onClick={retry}
					style={{
						marginTop: 16,
						padding: "8px 18px",
						border: `1px solid ${theme.colors.border}`,
						borderRadius: 4,
						background: theme.colors.backgroundSecondary,
						color: theme.colors.text,
						fontFamily: theme.fonts.body,
						fontSize: theme.fontSizes[1],
						cursor: retrying ? "default" : "pointer",
						opacity: retrying ? 0.6 : 1,
					}}
				>
					{retrying ? "Restarting extraction…" : "Retry analysis"}
				</button>
			</CenteredMessage>
		);
	}

	const openConcept =
		analysis.concepts.find((c) => c.id === openId) ?? null;

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				background: theme.colors.background,
			}}
		>
			<div
				style={{
					padding: "14px 24px",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 16,
					flexShrink: 0,
				}}
			>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 2,
						minWidth: 0,
					}}
				>
					<span
						style={{
							fontSize: theme.fontSizes[3],
							fontFamily: theme.fonts.heading ?? theme.fonts.body,
							color: theme.colors.text,
							lineHeight: 1.3,
						}}
					>
						{analysis.sessionTitle ?? analysis.sessionId}
					</span>
					<span
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.textSecondary,
							fontFamily: theme.fonts.monospace,
						}}
					>
						{analysis.agent ?? "opencode"} · {formatDate(analysis.createdAt)}
						{analysis.model ? ` · ${analysis.model}` : ""} ·{" "}
						{analysis.concepts.length} concept
						{analysis.concepts.length === 1 ? "" : "s"}
					</span>
				</div>
				<span
					style={{
						fontSize: theme.fontSizes[0],
						fontFamily: theme.fonts.monospace,
						textTransform: "uppercase",
						letterSpacing: 1,
						color:
							analysis.status === "done"
								? theme.colors.primary
								: theme.colors.textSecondary,
					}}
				>
					{analysis.status}
				</span>
			</div>

			<div
				style={{
					flex: 1,
					minHeight: 0,
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 16,
					padding: "20px 24px 40px",
				}}
			>
				{analysis.status === "pending" ? (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: 10,
							color: theme.colors.textMuted,
							fontSize: theme.fontSizes[2],
							paddingTop: 40,
						}}
					>
						<span>Extracting concept cards…</span>
						<span
							style={{
								fontSize: theme.fontSizes[0],
								fontFamily: theme.fonts.monospace,
								color: theme.colors.textSecondary,
							}}
						>
							opencode run → concept-extractor · opencode-go/deepseek-v4-flash
						</span>
						<span
							style={{
								fontSize: theme.fontSizes[0],
								color: theme.colors.textSecondary,
							}}
						>
							This can take a minute — the tab refreshes when it finishes.
						</span>
					</div>
				) : analysis.concepts.length === 0 ? (
					<div
						style={{
							color: theme.colors.textMuted,
							fontSize: theme.fontSizes[2],
							paddingTop: 40,
						}}
					>
						No concept cards yet.
					</div>
				) : (
					analysis.concepts.map((concept) => (
						<FeedCard
							key={concept.id}
							concept={concept}
							sessions={sessions}
							theme={theme}
							onOpen={() => setOpenId(concept.id)}
						/>
					))
				)}
			</div>

			{openConcept && (
				<DiagramModal
					concept={openConcept}
					theme={theme}
					onClose={() => setOpenId(null)}
				/>
			)}
		</div>
	);
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
