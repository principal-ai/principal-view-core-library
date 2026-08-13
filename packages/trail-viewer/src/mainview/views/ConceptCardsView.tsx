/**
 * ConceptCardsView — a feed of saved concept cards.
 *
 * The Concepts tab is reserved for *saved* concepts: it renders whatever the
 * user has deliberately kept out of session analyses (the on-disk saved
 * store, surfaced via the host's `listSavedConcepts`). Nothing auto-extracted
 * appears here until it's saved.
 *
 * Each card is a compact post: the concept's title, its generic change-type
 * visual (execution / derive / integration / ui), and a footer of repos +
 * sessions. Clicking a card opens the concept's specific mermaid diagram in a
 * full-view modal — keeping the feed scannable while the detail lives behind a
 * click. Cards in the feed carry a Save/Unsave toggle so they can be dropped
 * back out.
 *
 * The diagram renders through `IndustryLazyMermaidDiagram` from themed-markdown
 * (the non-interactive renderer).
 */

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { IndustryLazyMermaidDiagram } from "themed-markdown";
import { electrobun, reloadSubscribers } from "../rpc";
import { AgentLogo } from "./AgentSessionLoader";
import { ChangeTypeVisual } from "../components/ChangeTypeVisual";
import { CHANGE_TYPE_LABELS } from "../concepts";
import type { ConceptCard } from "../concepts";
import type { SavedConcept, SessionSummary } from "../../shared/contract";

export function ConceptCardsView() {
	const { theme } = useTheme();
	const [concepts, setConcepts] = useState<SavedConcept[]>([]);
	const [sessions, setSessions] = useState<Map<string, SessionSummary>>(
		new Map(),
	);
	const [openId, setOpenId] = useState<string | null>(null);

	const loadConcepts = useCallback(() => {
		void electrobun.rpc!.request
			.listSavedConcepts({})
			.then((res) => setConcepts(res.concepts))
			.catch(() => setConcepts([]));
	}, []);

	useEffect(() => {
		loadConcepts();
		// The host broadcasts tabsChanged after save/unsave — refresh the feed.
		reloadSubscribers.add(loadConcepts);
		return () => {
			reloadSubscribers.delete(loadConcepts);
		};
	}, [loadConcepts]);

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
				// Enrichment only — cards still render with bare session ids.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const openConcept =
		concepts.find((c) => c.savedConceptId === openId) ?? null;

	const toggleSave = useCallback((concept: SavedConcept) => {
		void electrobun.rpc!.request
			.unsaveConcept({ savedConceptId: concept.savedConceptId })
			.then(() =>
				setConcepts((prev) =>
					prev.filter((c) => c.savedConceptId !== concept.savedConceptId),
				),
			)
			.catch(() => {});
	}, []);

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
				{concepts.length === 0 ? (
					<div
						style={{
							color: theme.colors.textMuted,
							fontSize: theme.fontSizes[2],
							paddingTop: 40,
							textAlign: "center",
						}}
					>
						No saved concepts yet.
						<div style={{ fontSize: theme.fontSizes[1], marginTop: 6 }}>
							Open a session analysis and hit "Save" on a card to keep it here.
						</div>
					</div>
				) : (
					concepts.map((concept) => (
						<FeedCard
							key={concept.savedConceptId}
							concept={concept}
							sessions={sessions}
							theme={theme}
							saved
							onToggleSave={() => toggleSave(concept)}
							onOpen={() => setOpenId(concept.savedConceptId)}
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

export function FeedCard({
	concept,
	sessions,
	theme,
	saved,
	onToggleSave,
	onOpen,
}: {
	concept: ConceptCard & { savedConceptId?: string };
	sessions: Map<string, SessionSummary>;
	theme: ReturnType<typeof useTheme>["theme"];
	saved?: boolean;
	onToggleSave?: () => void;
	onOpen: () => void;
}) {
	const [showAllRepos, setShowAllRepos] = useState(false);
	const [badgeOpen, setBadgeOpen] = useState(false);
	const visibleRepos = showAllRepos
		? concept.repos
		: concept.repos.slice(0, 1);
	const hiddenCount = concept.repos.length - visibleRepos.length;

	return (
		<button
			onClick={onOpen}
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "stretch",
				width: "100%",
				maxWidth: 640,
				flexShrink: 0,
				border: `1px solid ${theme.colors.border ?? "#333"}`,
				borderRadius: theme.radii?.[2] ?? 12,
				overflow: "hidden",
				background: theme.colors.backgroundSecondary ?? theme.colors.background,
				color: theme.colors.text,
				textAlign: "left",
				cursor: "pointer",
				padding: 0,
				fontFamily: theme.fonts.body,
				transition: "border-color 0.15s ease",
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.borderColor = theme.colors.textMuted ?? "#555";
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.borderColor = theme.colors.border ?? "#333";
			}}
		>
			{/* Header: change type (left) + save toggle (right), then the title */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100%",
					boxSizing: "border-box",
					padding: "12px 20px",
					borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
					background: theme.colors.background,
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 12,
						marginBottom: 8,
					}}
				>
					<span
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.primary,
							fontFamily: theme.fonts.monospace,
							textTransform: "uppercase",
							letterSpacing: 1,
						}}
					>
						{CHANGE_TYPE_LABELS[concept.changeType]}
					</span>
					{onToggleSave && (
						<span
							role="button"
							tabIndex={0}
							onClick={(e) => {
								e.stopPropagation();
								onToggleSave();
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
									onToggleSave();
								}
							}}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 4,
								padding: "2px 8px",
								borderRadius: 999,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								background: theme.colors.background,
								color: saved
									? theme.colors.primary
									: theme.colors.textSecondary,
								fontFamily: theme.fonts.monospace,
								fontSize: theme.fontSizes[0],
								textTransform: "uppercase",
								letterSpacing: 0.5,
								cursor: "pointer",
								flexShrink: 0,
							}}
							title={
								saved
									? "Remove from saved concepts"
									: "Save this concept"
							}
						>
							{saved ? "Saved" : "Save"}
						</span>
					)}
				</div>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 16,
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 16,
							minWidth: 0,
							flex: 1,
							flexWrap: "wrap",
						}}
					>
					{visibleRepos.map((repo) => (
						<span
							key={`${repo.owner}/${repo.name}`}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 10,
								fontSize: theme.fontSizes[3],
								color: theme.colors.textSecondary,
								fontFamily: theme.fonts.monospace,
							}}
						>
							<img
								src={`https://github.com/${encodeURIComponent(repo.owner)}.png?size=32`}
								alt={`${repo.owner} avatar`}
								width={30}
								height={30}
								style={{ borderRadius: "30%", flexShrink: 0 }}
								onError={(e) => {
									(e.currentTarget as HTMLImageElement).style.display = "none";
								}}
							/>
							{repo.name}
						</span>
					))}
					{hiddenCount > 0 && (
						<span
							role="button"
							tabIndex={0}
							onClick={(e) => {
								e.stopPropagation();
								setShowAllRepos(true);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
									setShowAllRepos(true);
								}
							}}
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 30,
								height: 30,
								borderRadius: "30%",
								background: theme.colors.background,
								color: theme.colors.textSecondary,
								border: `1px solid ${theme.colors.border ?? "#333"}`,
								fontFamily: theme.fonts.monospace,
								fontSize: theme.fontSizes[1],
								cursor: "pointer",
								flexShrink: 0,
							}}
							title={`Show ${hiddenCount} more repo${hiddenCount === 1 ? "" : "s"}`}
						>
							+{hiddenCount}
						</span>
					)}
				</div>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-end",
						gap: 3,
						fontFamily: theme.fonts.monospace,
						fontSize: theme.fontSizes[2],
						color: theme.colors.textSecondary,
					}}
				>
					{concept.sessionIds.map((sid) => {
						const s = sessions.get(sid);
						const agent = s?.agent ?? "opencode";
						return (
							<span
								key={sid}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									whiteSpace: "nowrap",
								}}
							>
								<AgentLogo agent={agent} size={18} />
								{s ? formatDate(s.createdAt) : sid.slice(0, 12)}
							</span>
						);
					})}
				</div>
			</div>

				<span
					style={{
						fontSize: theme.fontSizes[3],
						fontFamily: theme.fonts.heading ?? theme.fonts.body,
						color: theme.colors.text,
						lineHeight: 1.3,
						marginTop: 10,
					}}
				>
					{concept.title}
				</span>
				{concept.files && concept.files.length > 0 && (
					<div
						style={{
							display: "flex",
							flexWrap: "wrap",
							gap: 6,
							marginTop: 10,
						}}
					>
						{concept.files.map((purl) => (
							<span
								key={purl}
								role="button"
								tabIndex={0}
								onClick={(e) => {
									e.stopPropagation();
									void electrobun.rpc!.request
										.openFile({ purl })
										.catch(() => {});
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										e.stopPropagation();
										void electrobun.rpc!.request
											.openFile({ purl })
											.catch(() => {});
									}
								}}
								style={{
									display: "inline-flex",
									alignItems: "center",
									padding: "2px 8px",
									borderRadius: 4,
									border: `1px solid ${theme.colors.border ?? "#333"}`,
									background: theme.colors.background,
									color: theme.colors.textSecondary,
									fontFamily: theme.fonts.monospace,
									fontSize: theme.fontSizes[0],
									cursor: "pointer",
								}}
								title={purl}
							>
								{purl.split("#")[1] ?? purl}
							</span>
						))}
					</div>
				)}
			</div>

			{/* Main visual: the mermaid diagram stays mounted, with the change-type
			    blueprint overlaid bottom-left. Clicking the badge scales it up to
			    fill the area over the diagram. A min-height keeps the area from
			    collapsing for short diagrams. */}
			<div
				style={{
					position: "relative",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					minHeight: 380,
					padding: "12px 20px",
				}}
			>
				<IndustryLazyMermaidDiagram
					code={concept.mermaid}
					id={`concept-${concept.savedConceptId ?? concept.id}-diagram`}
					theme={theme}
					maxHeight="calc(100vh - 420px)"
					showChrome={false}
				/>
				<div
					role="button"
					tabIndex={0}
					onClick={(e) => {
						e.stopPropagation();
						setBadgeOpen((v) => !v);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							e.stopPropagation();
							setBadgeOpen((v) => !v);
						}
					}}
					style={{
						position: "absolute",
						bottom: 16,
						left: 20,
						transformOrigin: "bottom left",
						transform: badgeOpen ? "scale(1)" : "scale(0.19)",
						opacity: badgeOpen ? 1 : 0.9,
						border: `1px solid ${theme.colors.border ?? "#333"}`,
						overflow: "hidden",
						background: theme.colors.background,
						boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
						lineHeight: 0,
						cursor: badgeOpen ? "zoom-out" : "zoom-in",
						transition: "transform 220ms ease-out, opacity 160ms ease-out",
					}}
					title={badgeOpen ? "Click to collapse" : "Click to expand the change-type diagram"}
				>
					<ChangeTypeVisual changeType={concept.changeType} theme={theme} height={380} />
				</div>
			</div>
		</button>
	);
}

export function DiagramModal({
	concept,
	theme,
	onClose,
}: {
	concept: ConceptCard & { savedConceptId?: string };
	theme: ReturnType<typeof useTheme>["theme"];
	onClose: () => void;
}) {
	return (
		<div
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 1000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0, 0, 0, 0.7)",
				backdropFilter: "blur(2px)",
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: "min(900px, 90vw)",
					height: "min(760px, 86vh)",
					display: "flex",
					flexDirection: "column",
					background: theme.colors.backgroundSecondary ?? theme.colors.background,
					border: `1px solid ${theme.colors.border ?? "#333"}`,
					borderRadius: theme.radii?.[2] ?? 12,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 16,
						padding: "14px 20px",
						borderBottom: `1px solid ${theme.colors.border ?? "#333"}`,
						background: theme.colors.background,
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
						{concept.title}
					</span>
					<button
						onClick={onClose}
						style={{
							width: 28,
							height: 28,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 6,
							border: `1px solid ${theme.colors.border ?? "#333"}`,
							background: theme.colors.background,
							color: theme.colors.textSecondary,
							fontSize: theme.fontSizes[2],
							cursor: "pointer",
							lineHeight: 1,
						}}
						title="Close"
					>
						×
					</button>
				</div>
				<div
					style={{
						flex: 1,
						minHeight: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 24,
						overflow: "auto",
					}}
				>
					<IndustryLazyMermaidDiagram
						code={concept.mermaid}
						id={`concept-${concept.savedConceptId ?? concept.id}-diagram`}
						theme={theme}
						maxHeight="calc(86vh - 120px)"
						showChrome={false}
					/>
				</div>
			</div>
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
