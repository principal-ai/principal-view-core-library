/**
 * Loading screen shown while the agent-sessions view pages through days of
 * sessions, processing every session's event timeline one day at a time.
 *
 * Repos appear as cards the moment a session's processing discovers them, so
 * the loading screen reads as a live "what am I mapping" surface rather than a
 * bare spinner. Day 1 completing is the host's cue to hand over to the
 * FileCityGuidePanel; later days keep paging in the background.
 */

import { useTheme } from "@principal-ade/industry-theme";

export interface DiscoveredRepo {
	root: string;
	name: string;
	owner: string | null;
	fileCount: number;
	sessionCount: number;
	agents: string[];
}

const AGENT_LOGOS: Record<string, string> = {
	claude: "/agent-logos/claude.svg",
	opencode: "/agent-logos/opencode.svg",
	cline: "/agent-logos/cline.svg",
	cursor: "/agent-logos/cursor.svg",
	copilot: "/agent-logos/copilot.svg",
	codex: "/agent-logos/codex.svg",
	pi: "/agent-logos/pi.svg",
	grok: "/agent-logos/grok.svg",
};

const REPO_CARD_IN = "agent-loader-repo-in";
const LOADER_KEYFRAMES = `
@keyframes ${REPO_CARD_IN} {
	0% { opacity: 0; transform: translateY(8px) scale(0.97); }
	100% { opacity: 1; transform: translateY(0) scale(1); }
}`;

function AgentLogo({ agent, size = 14 }: { agent: string; size?: number }) {
	const { theme } = useTheme();
	const key = agent.toLowerCase();
	const url = AGENT_LOGOS[key];
	if (url) {
		return (
			<img
				src={url}
				alt={key}
				title={key}
				style={{ width: size, height: size, borderRadius: 3, flexShrink: 0 }}
			/>
		);
	}
	return (
		<span
			title={key}
			style={{
				width: size,
				height: size,
				borderRadius: 3,
				background: theme.colors.backgroundSecondary,
				color: theme.colors.textMuted,
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				fontFamily: theme.fonts.heading,
				fontSize: size * 0.62,
				fontWeight: 700,
				flexShrink: 0,
			}}
		>
			{(key[0] ?? "?").toUpperCase()}
		</span>
	);
}

export function AgentSessionLoader({
	dayLabel,
	dayNumber,
	dayCount,
	processed,
	total,
	repos,
	agents,
}: {
	dayLabel: string | null;
	dayNumber: number;
	dayCount: number;
	processed: number;
	total: number;
	repos: DiscoveredRepo[];
	agents: string[];
}) {
	const { theme } = useTheme();
	const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
	const presentAgents = new Set(agents.map((a) => a.toLowerCase()));
	const knownAgentKeys = Object.keys(AGENT_LOGOS);
	const extraAgents = agents.filter((a) => !knownAgentKeys.includes(a.toLowerCase()));
	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
				overflowY: "auto",
				display: "flex",
				justifyContent: "center",
				padding: 48,
				boxSizing: "border-box",
			}}
		>
			<style>{LOADER_KEYFRAMES}</style>
			<div style={{ maxWidth: 880, width: "100%" }}>
				<div
					style={{
						fontFamily: theme.fonts.heading,
						fontSize: theme.fontSizes[3],
						fontWeight: 600,
					}}
				>
					Processing agent sessions
				</div>
				<div
					style={{
						fontSize: theme.fontSizes[1],
						color: theme.colors.textMuted,
						marginTop: 4,
					}}
				>
					{dayCount === 0
						? "Scanning recent sessions…"
						: dayLabel
							? `Day ${dayNumber} of ${dayCount} — ${dayLabel}`
							: `Scanning up to ${dayCount} day${dayCount === 1 ? "" : "s"} of sessions`}
					{total > 0 ? ` · ${processed} of ${total} session${total === 1 ? "" : "s"}` : ""}
				</div>

				{/* Day progress bar */}
				<div
					style={{
						height: 4,
						borderRadius: 2,
						background: theme.colors.backgroundSecondary,
						overflow: "hidden",
						marginTop: 12,
					}}
				>
					<div
						style={{
							height: "100%",
							width: `${progress}%`,
							background: theme.colors.accent,
							transition: "width 300ms ease-out",
						}}
					/>
				</div>

				{/* Agent logos across the top — dimmed until a session for that
				    agent loads, so the screen reads as "who's been working this
				    week" as the days page in. */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						marginTop: 22,
						flexWrap: "wrap",
					}}
				>
					{knownAgentKeys.map((key) => {
						const present = presentAgents.has(key);
						return (
							<div
								key={key}
								title={present ? key : `${key} — no sessions yet`}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									opacity: present ? 1 : 0.22,
									filter: present ? "none" : "grayscale(1)",
									transition: "opacity 250ms ease-out",
								}}
							>
								<AgentLogo agent={key} size={22} />
								<span
									style={{
										fontSize: theme.fontSizes[0],
										color: present ? theme.colors.textSecondary : theme.colors.textTertiary,
									}}
								>
									{key}
								</span>
							</div>
						);
					})}
					{extraAgents.map((a) => (
						<div
							key={a}
							title={a}
							style={{ display: "flex", alignItems: "center", gap: 6 }}
						>
							<AgentLogo agent={a} size={22} />
							<span
								style={{
									fontSize: theme.fontSizes[0],
									color: theme.colors.textSecondary,
								}}
							>
								{a}
							</span>
						</div>
					))}
				</div>

				{/* Repo cards — appear as each repo is discovered */}
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						marginTop: 28,
						marginBottom: 10,
					}}
				>
					<span
						style={{
							fontFamily: theme.fonts.heading,
							fontSize: theme.fontSizes[0],
							fontWeight: 600,
							letterSpacing: 0.4,
							textTransform: "uppercase",
							color: theme.colors.textMuted,
						}}
					>
						Repos discovered
					</span>
					<span
						style={{
							fontFamily: theme.fonts.monospace,
							fontSize: theme.fontSizes[0],
							color: theme.colors.textSecondary,
						}}
					>
						{repos.length}
					</span>
				</div>

				{repos.length > 0 ? (
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
							gap: 12,
						}}
					>
						{repos.map((r, i) => {
							const displayName = r.name || r.root.split("/").filter(Boolean).pop() || r.root;
							return (
								<div
									key={r.root}
									title={r.root}
									style={{
										display: "flex",
										flexDirection: "column",
										gap: 8,
										padding: 12,
										background: theme.colors.surface,
										border: `1px solid ${theme.colors.border}`,
										borderRadius: theme.radii[2],
										animation: `${REPO_CARD_IN} 350ms ease-out both`,
										animationDelay: `${Math.min(i, 8) * 40}ms`,
									}}
								>
									<div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
										{r.owner ? (
											<img
												src={`https://github.com/${r.owner}.png?size=32`}
												alt={r.owner}
												title={r.owner}
												width={26}
												height={26}
												style={{ borderRadius: "50%", flexShrink: 0, display: "block" }}
											/>
										) : (
											<span
												style={{
													width: 26,
													height: 26,
													borderRadius: "50%",
													flexShrink: 0,
													background: theme.colors.backgroundSecondary,
												}}
											/>
										)}
										<span
											style={{
												fontFamily: theme.fonts.heading,
												fontSize: theme.fontSizes[1],
												fontWeight: 600,
												color: theme.colors.text,
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
												minWidth: 0,
											}}
										>
											{displayName}
										</span>
									</div>
									<div
										style={{
											fontFamily: theme.fonts.monospace,
											fontSize: theme.fontSizes[0],
											color: theme.colors.textMuted,
										}}
									>
										{r.fileCount.toLocaleString()} file{r.fileCount === 1 ? "" : "s"}
									</div>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 4,
											overflow: "hidden",
										}}
									>
										{r.agents.slice(0, 5).map((a) => (
											<AgentLogo key={a} agent={a} />
										))}
										<span
											style={{
												marginLeft: 2,
												fontSize: theme.fontSizes[0],
												color: theme.colors.textTertiary,
												whiteSpace: "nowrap",
											}}
										>
											{r.sessionCount} session{r.sessionCount === 1 ? "" : "s"}
										</span>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div
						style={{
							padding: 24,
							border: `1px dashed ${theme.colors.border}`,
							borderRadius: theme.radii[2],
							color: theme.colors.textMuted,
							fontSize: theme.fontSizes[1],
							textAlign: "center",
						}}
					>
						Reading session timelines to find repos…
					</div>
				)}
			</div>
		</div>
	);
}
