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

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import Electrobun, { Electroview } from "electrobun/view";
import { Check, Download, ExternalLink, GitBranch, Info, Link, Loader2, RefreshCw, Share2, Terminal, User } from "lucide-react";
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
import { FileCityLogo } from "@principal-ai/logo-component";
import {
	GitFileTreeBuilder,
	type FileTree,
} from "@principal-ai/repository-abstraction";
import {
	FileCityGuidePanel,
	FileCityTrailExplorerPanel,
	type AgentSessionEvent,
	type AgentSessionEventOperation,
	type AgentSessionsView,
	type AgentSessionState,
	type AgentSessionView,
	type CommitFileChange,
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

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

type ViewerMode = "local" | "remote";
type PayloadKind = "trail" | "tour";

interface SessionSummary {
	id: string;
	title: string;
	slug: string;
	createdAt: string;
	durationMs: number;
	eventCount: number;
}

interface SessionGroup {
	parent: SessionSummary;
	children: SessionSummary[];
}

interface AccRecord {
	operation: string;
	description: string;
	files: string[];
	dependencies: string[];
}

interface SessionEventRow {
	seq: number;
	type: string;
	raw: unknown;
	normalized: Record<string, unknown>;
	accumulated: AccRecord | null;
}

interface TabSummary {
	id: string;
	kind: "library" | "trail" | "sessions" | "session-events";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
}

interface TabFullState {
	ok: boolean;
	error?: string;
	id: string;
	kind: "library" | "trail" | "sessions" | "session-events";
	title: string;
	mode?: ViewerMode;
	payloadKind?: PayloadKind;
	repoRoot?: string;
	trailFilePath?: string;
	sessionId?: string;
	payload?: unknown;
	/** Repo identity resolved by the bun host (git origin / explicit remote).
	 *  `owner === "local"` means no GitHub origin; any other owner is a GitHub
	 *  identity the header can link to. Mirrors the library rows. */
	owner?: string;
	repo?: string;
}

interface LibraryEntry {
	/** "trail" or a File City introduction "tour". Drives the row badge and how
	 *  the row opens (tours are always local-mode). Mirrors `LibraryEntry.kind`
	 *  in bun/library.ts. */
	kind: "trail" | "tour";
	trailFile: string;
	id: string;
	title: string;
	anchor: string;
	owner?: string;
	repo?: string;
	localRepoRoot?: string;
	/** True once the trail has been published to web-ade (carries a `share.id`).
	 *  Always false for tours, which badge as "Tour" instead of Draft/Published. */
	published: boolean;
	mtimeMs: number;
}

/** Identity of the person using the viewer, resolved host-side from
 *  gh CLI → TRAIL_GH_TOKEN → git config. Mirrors `UserIdentity` in bun/library.ts. */
interface GitConfigIdentity {
	name?: string;
	email?: string;
}

interface UserIdentity {
	login?: string;
	name?: string;
	avatarUrl?: string;
	htmlUrl?: string;
	source: "gh" | "token" | "git" | "none";
	/** Local git config, always read even when signed in to GitHub. */
	git?: GitConfigIdentity;
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
			listSessions: {
				params: Record<string, never>;
				response: { groups: SessionGroup[]; standalone: SessionSummary[] };
			};
			openTrailFromCache: {
				params: { trailFile: string; mode?: ViewerMode; repoRoot?: string };
				response: { ok: boolean; error?: string; tabId?: string };
			};
			createTrailNote: {
				params: { tabId: string; draft: unknown };
				response: { ok: boolean; error?: string; note?: unknown };
			};
			updateTrailNote: {
				params: { tabId: string; noteId: string; body: string };
				response: { ok: boolean; error?: string; note?: unknown };
			};
			deleteTrailNote: {
				params: { tabId: string; noteId: string };
				response: { ok: boolean; error?: string };
			};
			openExternal: {
				params: { url: string };
				response: { ok: boolean };
			};
			shareTrail: {
				params: { tabId: string };
				response: {
					ok: boolean;
					error?: string;
					shareId?: string;
					shareUrl?: string;
				};
			};
			getUserIdentity: {
				params: Record<string, never>;
				response: UserIdentity;
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

// The mounted LibraryView registers its refresh here so the top-level AppHeader
// can trigger a re-fetch of the trail list without prop-drilling through
// ActiveTab. Only the library tab's view registers, so this is effectively a
// single-entry set.
const libraryRefreshers = new Set<() => void>();
function refreshLibrary(): void {
	for (const fn of libraryRefreshers) fn();
}

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
	| { kind: "sessions" }
	| { kind: "error"; message: string }
	| {
			kind: "ready";
			id: string;
			payload: TrailPayload;
			fileTree: FileTree;
			repoRoot: string;
			owner?: string;
			repo?: string;
		}
	| {
			kind: "ready-tour";
			id: string;
			tour: IntroductionTour;
			fileTree: FileTree;
			repoRoot: string;
			owner?: string;
			repo?: string;
		}
	| {
			kind: "session-events";
			id: string;
			sessionId: string;
			title: string;
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
				<div style={{ fontSize: theme.fontSizes[3], marginBottom: 8 }}>{title}</div>
				{detail && (
					<div
						style={{
							fontSize: theme.fontSizes[0],
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
// AppHeader — persistent app chrome above the tab strip. Carries the Principal
// AI brand (moved up out of the per-trail TrailHeader so it shows on every tab,
// including the library) and the Download app CTA.
// ---------------------------------------------------------------------------

const DOWNLOAD_APP_URL = "https://principal-ade.com/download";

function AppHeader({ libraryActive }: { libraryActive: boolean }) {
	const { theme } = useTheme();

	// Who's using the viewer — resolved host-side (gh CLI → token → git config).
	// Fetched once on mount; `source: "none"` (or null while pending) hides it.
	const [user, setUser] = useState<UserIdentity | null>(null);
	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request
			.getUserIdentity({})
			.then((u) => {
				if (alive) setUser(u);
			})
			.catch(() => {
				/* best-effort: leave the header user-less */
			});
		return () => {
			alive = false;
		};
	}, []);

	// Clicking the identity chip explains where the name/avatar came from rather
	// than jumping straight to GitHub — the profile link lives inside the modal.
	const [showIdentityModal, setShowIdentityModal] = useState(false);

	const onDownload = useCallback(() => {
		void electrobun.rpc!.request.openExternal({ url: DOWNLOAD_APP_URL });
	}, []);

	const onOpenProfile = useCallback(() => {
		if (user?.htmlUrl) {
			void electrobun.rpc!.request.openExternal({ url: user.htmlUrl });
		}
	}, [user]);

	return (
		<>{/* fragment so the provenance modal can portal as a header sibling */}
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
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					flex: 1,
					minWidth: 0,
				}}
			>
				<FileCityLogo
					width={26}
					height={26}
					mark="P"
					primary="#ff6b35"
					accent="#0893d2"
					color="#d0e5ea"
					background="transparent"
				/>
				<span style={{ fontSize: theme.fontSizes[4], fontWeight: 700 }}>
					<span style={{ color: theme.colors.text }}>Trail</span>{" "}
					<span style={{ color: theme.colors.primary }}>Viewer</span>
				</span>
			</div>
			{libraryActive && (
				<button
					type="button"
					onClick={refreshLibrary}
					title="Refresh trail library"
					aria-label="Refresh trail library"
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
					<RefreshCw size={16} />
				</button>
			)}
			{user && user.source !== "none" && (
				<button
					type="button"
					onClick={() => setShowIdentityModal(true)}
					title="Where does this identity come from?"
					aria-label={
						user.login ? `GitHub user ${user.login}` : "Git user"
					}
					aria-haspopup="dialog"
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						padding: user.avatarUrl ? "2px 8px 2px 2px" : "0 10px",
						height: 32,
						borderRadius: 16,
						background: theme.colors.background,
						border: `1px solid ${theme.colors.border}`,
						color: theme.colors.text,
						fontSize: theme.fontSizes[1],
						fontFamily: theme.fonts.body,
						cursor: "pointer",
						flexShrink: 0,
						maxWidth: 180,
					}}
				>
					{user.avatarUrl && (
						<img
							src={user.avatarUrl}
							alt=""
							width={26}
							height={26}
							style={{ borderRadius: "50%", flexShrink: 0 }}
							onError={(e) => {
								// CSP / offline: drop the broken-image box, keep the login text.
								(e.currentTarget as HTMLImageElement).style.display = "none";
							}}
						/>
					)}
					<span
						style={{
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{user.login ? `@${user.login}` : user.name}
					</span>
				</button>
			)}
			<button
				type="button"
				onClick={onDownload}
				title="Download the Principal ADE desktop app"
				aria-label="Download app"
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "0 12px",
					height: 32,
					borderRadius: 6,
					fontSize: theme.fontSizes[1],
					fontWeight: 500,
					fontFamily: theme.fonts.body,
					background: theme.colors.primary,
					color: theme.colors.background,
					border: `1px solid ${theme.colors.primary}`,
					cursor: "pointer",
					flexShrink: 0,
				}}
			>
				<Download size={16} />
				<span>Download app</span>
			</button>
		</header>
		{showIdentityModal && user && createPortal(
			<IdentityModal user={user} onClose={() => setShowIdentityModal(false)} onOpenProfile={onOpenProfile} />,
			document.body,
		)}
		</>
	);
}

// ---------------------------------------------------------------------------
// IdentityModal — explains where the header's user identity came from. Opened by
// clicking the identity chip. Each source (gh CLI / TRAIL_GH_TOKEN / git config)
// gets a one-line provenance so people understand we read it locally and didn't
// phone home for it.
// ---------------------------------------------------------------------------

const GITHUB_SOURCE_COPY: Record<
	"gh" | "token",
	{ label: string; command: string; detail: string }
> = {
	gh: {
		label: "GitHub CLI",
		command: "gh api user",
		detail:
			"You're signed in to the GitHub CLI, so we asked it who you are. The login and avatar come straight from your GitHub account.",
	},
	token: {
		label: "GitHub token",
		command: "GET api.github.com/user",
		detail:
			"A GitHub token was provided to the viewer (TRAIL_GH_TOKEN). We used it to look up your account on GitHub for the login and avatar.",
	},
};

// One provenance card: an icon, a "Source: <label>" line with the exact command
// we ran, and a free-form detail/body below it.
function ProvenanceRow({
	icon: Icon,
	label,
	command,
	children,
}: {
	icon: typeof Terminal;
	label: string;
	command?: string;
	children: ReactNode;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "flex-start",
				gap: 10,
				padding: "12px 14px",
				borderRadius: 8,
				background: theme.colors.background,
				border: `1px solid ${theme.colors.border}`,
				marginBottom: 12,
			}}
		>
			<span style={{ color: theme.colors.primary, flexShrink: 0, marginTop: 2 }}>
				<Icon size={18} />
			</span>
			<div style={{ minWidth: 0, flex: 1 }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						marginBottom: 4,
						flexWrap: "wrap",
					}}
				>
					<span style={{ fontSize: theme.fontSizes[1], fontWeight: 600 }}>
						Source: {label}
					</span>
					{command && (
						<code
							style={{
								fontFamily: theme.fonts.monospace,
								fontSize: theme.fontSizes[0],
								color: muted,
								background: theme.colors.surface,
								border: `1px solid ${theme.colors.border}`,
								borderRadius: 4,
								padding: "1px 6px",
							}}
						>
							{command}
						</code>
					)}
				</div>
				<div style={{ fontSize: theme.fontSizes[0], color: muted, lineHeight: 1.5 }}>
					{children}
				</div>
			</div>
		</div>
	);
}

function IdentityModal({
	user,
	onClose,
	onOpenProfile,
}: {
	user: UserIdentity;
	onClose: () => void;
	onOpenProfile: () => void;
}) {
	const { theme } = useTheme();
	const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
	// GitHub provenance shows when signed in (gh CLI / token). The local git
	// config row shows whenever it resolved — including alongside GitHub.
	const githubCopy =
		user.source === "gh" || user.source === "token"
			? GITHUB_SOURCE_COPY[user.source]
			: null;
	const githubIcon = user.source === "token" ? User : Terminal;

	return (
		<div
			role="dialog"
			aria-modal
			aria-label="About this identity"
			onClick={onClose}
			style={{
				position: "fixed",
				inset: 0,
				zIndex: 2147483000,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: "rgba(0,0,0,0.55)",
				fontFamily: theme.fonts.body,
			}}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: "min(480px, calc(100vw - 48px))",
					background: theme.colors.surface,
					border: `1px solid ${theme.colors.border}`,
					borderRadius: 12,
					padding: 24,
					boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
					color: theme.colors.text,
				}}
			>
				{/* Identity header: avatar (or fallback glyph) + name/login. */}
				<div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
					{user.avatarUrl ? (
						<img
							src={user.avatarUrl}
							alt=""
							width={44}
							height={44}
							style={{ borderRadius: "50%", flexShrink: 0 }}
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = "none";
							}}
						/>
					) : (
						<span
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 44,
								height: 44,
								borderRadius: "50%",
								background: theme.colors.background,
								border: `1px solid ${theme.colors.border}`,
								color: muted,
								flexShrink: 0,
							}}
						>
							<User size={22} />
						</span>
					)}
					<div style={{ minWidth: 0 }}>
						{user.name && (
							<div style={{ fontSize: theme.fontSizes[3], fontWeight: 700, lineHeight: 1.2 }}>
								{user.name}
							</div>
						)}
						{user.login && (
							<div style={{ fontSize: theme.fontSizes[1], color: muted }}>
								@{user.login}
							</div>
						)}
					</div>
				</div>

				{/* GitHub provenance — only when signed in. */}
				{githubCopy && (
					<ProvenanceRow
						icon={githubIcon}
						label={githubCopy.label}
						command={githubCopy.command}
					>
						{githubCopy.detail}
					</ProvenanceRow>
				)}

				{/* Local git config — shown whenever it resolved, even when GitHub
				    drove the chip, so people can see their commit identity too. */}
				{user.git && (
					<ProvenanceRow
						icon={GitBranch}
						label="Local git config"
						command="git config user.name / user.email"
					>
						<div style={{ marginBottom: user.git.name || user.git.email ? 6 : 0 }}>
							{githubCopy
								? "Your local commit identity for this repo. We read it even though you're signed in to GitHub, so you can see what your commits will be attributed to."
								: "No GitHub sign-in was found, so this is your commit identity from the repo's git config. Nothing left your machine."}
						</div>
						{(user.git.name || user.git.email) && (
							<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
								{user.git.name && (
									<div>
										<span style={{ opacity: 0.7 }}>name </span>
										<span style={{ color: theme.colors.text }}>{user.git.name}</span>
									</div>
								)}
								{user.git.email && (
									<div>
										<span style={{ opacity: 0.7 }}>email </span>
										<span style={{ color: theme.colors.text }}>{user.git.email}</span>
									</div>
								)}
							</div>
						)}
					</ProvenanceRow>
				)}

				{/* Reassurance + how the fallback chain works. */}
				<div
					style={{
						display: "flex",
						alignItems: "flex-start",
						gap: 8,
						fontSize: theme.fontSizes[0],
						color: muted,
						lineHeight: 1.5,
						marginBottom: 20,
					}}
				>
					<span style={{ flexShrink: 0, marginTop: 1 }}>
						<Info size={14} />
					</span>
					<span>
						The header chip is labelled by the first available of: GitHub CLI →
						GitHub token → git config. Your local git identity is always read and
						shown here too. All of this is resolved on your machine — it isn't sent
						anywhere.
					</span>
				</div>

				<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
					{user.htmlUrl && (
						<button
							type="button"
							onClick={onOpenProfile}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "0 14px",
								height: 36,
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontWeight: 500,
								fontFamily: theme.fonts.body,
								background: "transparent",
								color: theme.colors.text,
								border: `1px solid ${theme.colors.border}`,
								cursor: "pointer",
							}}
						>
							<ExternalLink size={15} />
							<span>GitHub profile</span>
						</button>
					)}
					<button
						type="button"
						onClick={onClose}
						style={{
							padding: "0 14px",
							height: 36,
							borderRadius: 6,
							fontSize: theme.fontSizes[1],
							fontWeight: 500,
							fontFamily: theme.fonts.body,
							background: theme.colors.primary,
							color: theme.colors.background,
							border: `1px solid ${theme.colors.primary}`,
							cursor: "pointer",
						}}
					>
						Done
					</button>
				</div>
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
				// Pin overflowY: a lone `overflow-x: auto` computes overflow-y to
				// `auto` too, and the tabs' `marginBottom: -1` (overlapping the
				// bottom border) spills 1px vertically → a stray scrollbar here.
				overflowY: "hidden",
				flexShrink: 0,
			}}
		>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTabId;
				const isPermanent = tab.kind === "library" || tab.kind === "sessions";
				const dotColor = tab.kind === "sessions"
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
// TrailHeader — mirrors web-ade's `src/components/trail/TrailHeader.tsx`
// chrome (Principal AI brand + owner/repo crumbs + Share With Agent + GitHub)
// adapted for the standalone viewer: no router, no sign-in slot, no centered
// status, and the GitHub link only renders when the trail carries a remote
// (local-only trails would have nothing to point at).
// ---------------------------------------------------------------------------

// lucide-react v1 dropped its brand icons (including `Github`), so we carry the
// GitHub mark inline. Single-path octocat glyph, currentColor-tinted like the
// lucide icons it sits beside.
function GithubMark({ size = 20 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden
		>
			<path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.21.7.82.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
		</svg>
	);
}

const COPY_FEEDBACK_MS = 1500;
const WEB_ADE_BASE = "https://app.principal-ade.com";
const buildAgentCommand = (shareId: string) =>
	`npx -y @principal-ai/principal-view-cli@latest trail ${shareId}`;

function TrailHeader({
	tabId,
	owner,
	repo,
	share,
	githubUrl,
}: {
	tabId: string;
	owner: string;
	repo: string;
	/** When set, the trail has been published and the header swaps to share-mode
	 *  chrome (agent-copy + external links). When absent, the header shows a
	 *  Share button that publishes via the bun-side `shareTrail` RPC. */
	share?: { id: string };
	githubUrl?: string;
}) {
	const { theme } = useTheme();
	// Local override so a successful publish flips the chrome immediately without
	// waiting for the parent to refetch the payload. The bun side has already
	// persisted `share: { id }` to disk, so the next tab open mirrors this.
	const [optimisticShare, setOptimisticShare] = useState<{ id: string } | null>(null);
	const [shareError, setShareError] = useState<string | null>(null);
	const [sharing, setSharing] = useState(false);
	const [copied, setCopied] = useState(false);
	const [linkCopied, setLinkCopied] = useState(false);
	// Opens once on a successful publish to confirm + offer the share link.
	const [showPublishedModal, setShowPublishedModal] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const linkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const effectiveShare = optimisticShare ?? share;

	useEffect(
		() => () => {
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			if (linkTimeoutRef.current) clearTimeout(linkTimeoutRef.current);
			if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
		},
		[],
	);

	const onShare = useCallback(async () => {
		if (sharing) return;
		setSharing(true);
		setShareError(null);
		try {
			const res = await electrobun.rpc!.request.shareTrail({ tabId });
			if (!res.ok || !res.shareId) {
				const msg = res.error ?? "Publish failed";
				setShareError(msg);
				if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
				errorTimeoutRef.current = setTimeout(() => setShareError(null), 6000);
				return;
			}
			setOptimisticShare({ id: res.shareId });
			setShowPublishedModal(true);
			// Flip the library tab's Draft badge to Published without a manual refresh.
			refreshLibrary();
		} catch (err) {
			setShareError(err instanceof Error ? err.message : String(err));
		} finally {
			setSharing(false);
		}
	}, [tabId, sharing]);

	const onCopyAgent = useCallback(async () => {
		if (!effectiveShare) return;
		try {
			await navigator.clipboard.writeText(buildAgentCommand(effectiveShare.id));
			setCopied(true);
			if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
			copyTimeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
		} catch {
			// clipboard may be denied — fail quietly
		}
	}, [effectiveShare]);

	const onOpenGithub = useCallback(() => {
		if (!githubUrl) return;
		void electrobun.rpc!.request.openExternal({ url: githubUrl });
	}, [githubUrl]);

	const onCopyLink = useCallback(async () => {
		if (!effectiveShare) return;
		try {
			await navigator.clipboard.writeText(
				`${WEB_ADE_BASE}/trail/${effectiveShare.id}`,
			);
			setLinkCopied(true);
			if (linkTimeoutRef.current) clearTimeout(linkTimeoutRef.current);
			linkTimeoutRef.current = setTimeout(() => setLinkCopied(false), COPY_FEEDBACK_MS);
		} catch {
			// clipboard may be denied — fail quietly
		}
	}, [effectiveShare]);

	const shareUrl = effectiveShare
		? `${WEB_ADE_BASE}/trail/${effectiveShare.id}`
		: "";

	return (
		<>
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
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					minWidth: 0,
					flex: 1,
				}}
			>
				<span
					style={{
						flexShrink: 0,
						fontSize: theme.fontSizes[0],
						fontWeight: 600,
						letterSpacing: 0.3,
						textTransform: "uppercase",
						padding: "2px 7px",
						borderRadius: 999,
						...(effectiveShare
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
					{effectiveShare ? "Published" : "Draft"}
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
				{shareError && (
					<span
						style={{
							marginLeft: 12,
							fontSize: theme.fontSizes[0],
							color: theme.colors.error ?? "#ff6b6b",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							maxWidth: 480,
						}}
						title={shareError}
					>
						{shareError}
					</span>
				)}
			</div>

			<div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
				{!effectiveShare ? (
					<button
						type="button"
						onClick={onShare}
						disabled={sharing}
						title="Publish this trail to web-ade so it can be shared as a link"
						aria-label="Publish trail"
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							padding: "0 12px",
							height: 32,
							borderRadius: 6,
							fontSize: theme.fontSizes[1],
							fontWeight: 500,
							fontFamily: theme.fonts.body,
							background: theme.colors.primary,
							color: theme.colors.background,
							border: `1px solid ${theme.colors.primary}`,
							cursor: sharing ? "wait" : "pointer",
							opacity: sharing ? 0.7 : 1,
						}}
					>
						{sharing ? (
							<Loader2 size={16} className="trail-viewer-spin" />
						) : (
							<Share2 size={16} />
						)}
						<span>{sharing ? "Publishing…" : "Publish"}</span>
					</button>
				) : (
					<>
						<button
							type="button"
							onClick={onCopyAgent}
							title={`Copies: ${buildAgentCommand(effectiveShare.id)}`}
							aria-label="Copy CLI command for agents"
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "0 12px",
								height: 32,
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontWeight: 500,
								fontFamily: theme.fonts.body,
								background: copied ? theme.colors.primary : "transparent",
								color: copied ? theme.colors.background : theme.colors.text,
								border: `1px solid ${copied ? theme.colors.primary : theme.colors.border}`,
								cursor: "pointer",
							}}
						>
							{copied ? <Check size={16} /> : <Terminal size={16} />}
							<span>{copied ? "Copied" : "Share With Agent"}</span>
						</button>
						<button
							type="button"
							onClick={onCopyLink}
							title="Copy the web-ade share link to the clipboard"
							aria-label="Copy share link"
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "0 12px",
								height: 32,
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontWeight: 500,
								fontFamily: theme.fonts.body,
								background: linkCopied ? theme.colors.primary : "transparent",
								color: linkCopied ? theme.colors.background : theme.colors.text,
								border: `1px solid ${linkCopied ? theme.colors.primary : theme.colors.border}`,
								cursor: "pointer",
							}}
						>
							{linkCopied ? <Check size={16} /> : <Link size={16} />}
							<span>{linkCopied ? "Copied" : "Copy link"}</span>
						</button>
					</>
				)}
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
						}}
					>
						<GithubMark size={20} />
					</button>
				)}
			</div>
		</header>
		{showPublishedModal && effectiveShare && createPortal(
			<div
				role="dialog"
				aria-modal
				aria-label="Trail published"
				onClick={() => setShowPublishedModal(false)}
				style={{
					position: "fixed",
					inset: 0,
					zIndex: 2147483000,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "rgba(0,0,0,0.55)",
					fontFamily: theme.fonts.body,
				}}
			>
				<div
					onClick={(e) => e.stopPropagation()}
					style={{
						width: "min(520px, calc(100vw - 48px))",
						background: theme.colors.surface,
						border: `1px solid ${theme.colors.border}`,
						borderRadius: 12,
						padding: 24,
						boxShadow: "0 12px 48px rgba(0,0,0,0.4)",
						color: theme.colors.text,
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
						<span
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: 28,
								height: 28,
								borderRadius: "50%",
								background: theme.colors.primary,
								color: theme.colors.background,
								flexShrink: 0,
							}}
						>
							<Check size={18} />
						</span>
						<span style={{ fontSize: theme.fontSizes[3], fontWeight: 700 }}>Trail published</span>
					</div>
					<div
						style={{
							fontSize: theme.fontSizes[1],
							color: theme.colors.textMuted ?? theme.colors.textSecondary,
							marginBottom: 16,
						}}
					>
						Your trail is live on web-ade. Share this link so anyone can open it.
					</div>
					<div
						style={{
							fontSize: theme.fontSizes[0],
							fontFamily: theme.fonts.monospace,
							color: theme.colors.text,
							background: theme.colors.background,
							border: `1px solid ${theme.colors.border}`,
							borderRadius: 6,
							padding: "10px 12px",
							marginBottom: 16,
							overflowX: "auto",
							whiteSpace: "nowrap",
							userSelect: "all",
						}}
					>
						{shareUrl}
					</div>
					<div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
						<button
							type="button"
							onClick={() => setShowPublishedModal(false)}
							style={{
								padding: "0 14px",
								height: 36,
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontWeight: 500,
								fontFamily: theme.fonts.body,
								background: "transparent",
								color: theme.colors.text,
								border: `1px solid ${theme.colors.border}`,
								cursor: "pointer",
							}}
						>
							Done
						</button>
						<button
							type="button"
							onClick={onCopyLink}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "0 14px",
								height: 36,
								borderRadius: 6,
								fontSize: theme.fontSizes[1],
								fontWeight: 600,
								fontFamily: theme.fonts.body,
								background: theme.colors.primary,
								color: theme.colors.background,
								border: `1px solid ${theme.colors.primary}`,
								cursor: "pointer",
							}}
						>
							{linkCopied ? <Check size={16} /> : <Link size={16} />}
							<span>{linkCopied ? "Copied" : "Copy link"}</span>
						</button>
					</div>
				</div>
			</div>,
			document.body,
		)}
		</>
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
// Sessions Library tab content
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
	if (ms <= 0) return "";
	const totalSec = Math.floor(ms / 1000);
	if (totalSec < 60) return `${totalSec}s`;
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
	const hrs = Math.floor(min / 60);
	const remainMin = min % 60;
	return remainMin > 0 ? `${hrs}h ${remainMin}m` : `${hrs}h`;
}

function formatTime(iso: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SessionRow({ session, depth, theme }: {
	session: SessionSummary;
	depth: number;
	theme: ReturnType<typeof useTheme>["theme"];
}) {
	const hours = Math.floor(session.durationMs / 3600000);
	const msHour = 3600000;
	const remainingMin = Math.floor((session.durationMs % 3600000) / 60000);
	const secs = Math.floor((session.durationMs % 60000) / 1000);
	const showShapes = session.durationMs >= 60000;
	const startDate = new Date(session.createdAt);
	const startDay = localDateKey(startDate);
	const sessionEndMs = startDate.getTime() + session.durationMs;

	const durLabel = session.durationMs < 10000 ? `${secs}s`
		: showShapes ? [hours > 0 && `${hours}h`, remainingMin > 0 && `${remainingMin}m`].filter(Boolean).join(" ")
		: formatDuration(session.durationMs);

	// Build day rows with active hour slot ranges
	const dayRows: { dayKey: string; startSlot: number; endSlot: number; isOtherDay: boolean }[] = [];
	let cursor = startDate.getTime();
	while (cursor < sessionEndMs) {
		const d = new Date(cursor);
		const dayKey = localDateKey(d);
		const dayStart = new Date(d);
		dayStart.setHours(0, 0, 0, 0);
		const nextMidnight = new Date(dayStart);
		nextMidnight.setDate(nextMidnight.getDate() + 1);
		const blockEnd = Math.min(sessionEndMs, nextMidnight.getTime());
		const startSlot = d.getHours();
		const endSlot = Math.min(24, startSlot + Math.ceil((blockEnd - cursor) / msHour));
		dayRows.push({ dayKey, startSlot, endSlot, isOtherDay: dayKey !== startDay });
		cursor = nextMidnight.getTime();
	}

	const handleClick = useCallback(() => {
		void electrobun.rpc!.request.openSessionTab({ sessionId: session.id, title: session.title });
	}, [session.id, session.title]);

	return (
		<div
			onClick={handleClick}
			style={{
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "6px 12px",
				paddingLeft: 12 + depth * 20,
				borderRadius: 4,
				cursor: "pointer",
				border: depth === 0 ? `1px solid ${theme.colors.border ?? "#333"}` : "1px solid transparent",
				background: depth === 0 ? (theme.colors.backgroundSecondary ?? "transparent") : "transparent",
				fontSize: depth === 0 ? theme.fontSizes[2] : theme.fontSizes[1],
				minHeight: 32,
			}}
		>
			{depth > 0 && (
				<div style={{ color: theme.colors.textTertiary, flexShrink: 0, fontSize: theme.fontSizes[0] }}>
					└─
				</div>
			)}
			<div
				style={{
					flex: 1,
					minWidth: 0,
					whiteSpace: "nowrap",
					overflow: "hidden",
					textOverflow: "ellipsis",
				}}
			>
				{depth === 0 ? (
					<>
						<span style={{ fontWeight: 500 }}>{session.slug || session.title}</span>
						<span style={{ color: theme.colors.textTertiary, marginLeft: 8 }}>
							{formatTime(session.createdAt)} · {session.eventCount}e
						</span>
					</>
				) : (
					<span style={{ color: theme.colors.textTertiary }}>{session.title}</span>
				)}
			</div>
			{depth === 0 && (
				<div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
					{showShapes && (
						<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
							{dayRows.slice().reverse().map((row) => {
								const todayKey = localDateKey(new Date());
								const currentHour = new Date().getHours();
								const isToday = row.dayKey === todayKey;
								return (
									<div key={row.dayKey} style={{ display: "flex", alignItems: "center", gap: 1 }}>
										{Array.from({ length: 24 }, (_, slot) => {
											const isActive = slot >= row.startSlot && slot < row.endSlot;
											const isFuture = isToday && slot > currentHour;
											if (isFuture) return <span key={slot} style={{ display: "inline-block", width: 7, height: 7, flexShrink: 0 }} />;
											const isCurrent = isToday && slot === currentHour && isActive;
											const bg = isActive
												? (row.isOtherDay ? theme.colors.accent ?? "#00ff00" : theme.colors.primary ?? "#6366f1")
												: (theme.colors.textTertiary ?? "#888");
											return (
												<span key={slot} style={{ marginLeft: slot % 6 === 0 && slot > 0 ? 3 : 0 }}>
													<span
														className={isCurrent ? "trail-blip" : undefined}
														style={{
															display: "inline-block",
															width: 7,
															height: 7,
															borderRadius: "50%",
															background: bg,
															opacity: isActive ? 1 : 0.1,
															flexShrink: 0,
														}}
													/>
												</span>
											);
										})}
									</div>
								);
							})}
						</div>
					)}
					<div
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.textTertiary,
							fontFamily: theme.fonts.monospace,
						}}
					>
						{durLabel}
					</div>
				</div>
			)}
		</div>
	);
}

interface DaySection {
	date: string;
	label: string;
	groups: SessionGroup[];
	standalone: SessionSummary[];
}

function formatDayLabel(isoDate: string): string {
	const d = new Date(isoDate);
	const now = new Date();
	const todayKey = localDateKey(now);
	const dateKey = localDateKey(d);
	if (dateKey === todayKey) return "Today";
	const yesterdayDate = new Date(now);
	yesterdayDate.setDate(yesterdayDate.getDate() - 1);
	if (localDateKey(yesterdayDate) === dateKey) return "Yesterday";
	const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function localDateKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SessionsLibraryView() {
	const { theme } = useTheme();
	const [data, setData] = useState<{ groups: SessionGroup[]; standalone: SessionSummary[] } | null>(null);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const result = await electrobun.rpc!.request.listSessions({});
			setData({ groups: result.groups, standalone: result.standalone });
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (error) {
		return <CenteredMessage title="Could not load sessions" detail={error} />;
	}
	if (data === null) {
		return <CenteredMessage title="Loading sessions…" />;
	}
	const totalSessions = data.groups.reduce((s, g) => s + 1 + g.children.length, 0) + data.standalone.length;
	if (totalSessions === 0) {
		return (
			<CenteredMessage
				title="No opencode sessions found"
				detail="Start an opencode session, or check that opencode.db exists and is readable."
			/>
		);
	}

	const dayMap = new Map<string, DaySection>();
	const dateKey = (iso: string) => localDateKey(new Date(iso));
	for (const group of data.groups) {
		const key = dateKey(group.parent.createdAt);
		let section = dayMap.get(key);
		if (!section) {
			section = { date: key, label: formatDayLabel(group.parent.createdAt), groups: [], standalone: [] };
			dayMap.set(key, section);
		}
		section.groups.push(group);
	}
	for (const session of data.standalone) {
		const key = dateKey(session.createdAt);
		let section = dayMap.get(key);
		if (!section) {
			section = { date: key, label: formatDayLabel(session.createdAt), groups: [], standalone: [] };
			dayMap.set(key, section);
		}
		section.standalone.push(session);
	}

	const sections = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

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
			{sections.map((section) => (
				<div key={section.date} style={{ marginBottom: 20 }}>
					<div
						style={{
							fontSize: theme.fontSizes[1],
							fontWeight: 600,
							color: theme.colors.textSecondary,
							marginBottom: 8,
							paddingLeft: 4,
						}}
					>
						{section.label}
					</div>
					<div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{section.groups.map((group) => (
							<div key={group.parent.id}>
								<SessionRow session={group.parent} depth={0} theme={theme} />
								{group.children.map((child) => (
									<SessionRow key={child.id} session={child} depth={1} theme={theme} />
								))}
							</div>
						))}
						{section.standalone.map((session) => (
							<SessionRow key={session.id} session={session} depth={0} theme={theme} />
						))}
					</div>
				</div>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Session events detail (raw + normalized split view)
// ---------------------------------------------------------------------------

function EventJSON({ data }: { data: unknown }) {
	const text = JSON.stringify(data, null, 2);
	return (
		<pre
			style={{
				margin: 0,
				whiteSpace: "pre",
				overflow: "auto",
				fontSize: 11,
				lineHeight: "1.4",
				fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
			}}
		>{text}</pre>
	);
}

function SessionEventsView({ tabId, sessionId, title }: {
	tabId: string;
	sessionId: string;
	title: string;
}) {
	const { theme } = useTheme();
	const [events, setEvents] = useState<SessionEventRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
	const [repoRoot, setRepoRoot] = useState<string | null>(null);
	const [fileTree, setFileTree] = useState<FileTree | null>(null);
	const [sessionMeta, setSessionMeta] = useState<{ slug: string; title: string } | null>(null);

	// Load events
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await electrobun.rpc!.request.getSessionEvents({ sessionId });
				if (cancelled) return;
				if (!res.ok) {
					setError(res.error ?? "failed to load events");
					return;
				}
				setEvents(res.events ?? []);
				if (res.repoRoot) setRepoRoot(res.repoRoot);
				if (res.session) setSessionMeta(res.session);
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => { cancelled = true; };
	}, [sessionId]);

	// Load file tree once repoRoot is known
	useEffect(() => {
		if (!repoRoot) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await electrobun.rpc!.request.getFileTree({ tabId, path: repoRoot });
				if (cancelled) return;
				const tree = new GitFileTreeBuilder().build({
					files: res.files,
					rootPath: "/local",
					commitSha: "local",
					branch: "local",
				});
				console.log("[SessionEventsView] fileTree loaded", tree.allFiles.length, "files, root", repoRoot);
				setFileTree(tree);
			} catch (err) {
				console.error("[SessionEventsView] getFileTree failed:", err);
			}
		})();
		return () => { cancelled = true; };
	}, [repoRoot, tabId]);

	const selected = selectedIdx !== null && events ? events[selectedIdx] : null;
	const showDetail = selected !== null;

	const panelEvents = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);
	const repository = useMemo<FileCityGuideRepository>(() => ({
		id: repoRoot ? createLocalRepoPurl(repoRoot) : "local",
		path: repoRoot ?? "",
		owner: null,
		name: repoRoot ? repoRoot.split("/").filter(Boolean).pop() ?? "repo" : "repo",
	}), [repoRoot]);

	function toRepoRelative(fp: string): string {
		if (!repoRoot) return fp;
		const prefix = repoRoot.endsWith("/") ? repoRoot : repoRoot + "/";
		if (fp.startsWith(prefix)) return fp.slice(prefix.length);
		return fp;
	}

	// Build AgentSessionsView from accumulated events for the FileCityGuidePanel's agent session mode
	const agentSessionsView = useMemo<AgentSessionsView | null>(() => {
		if (!events || events.length === 0) return null;

		const sessionName = sessionMeta?.slug || "opencode";
		const sessionColor = "#a855f7";
		const editedFileSet = new Set<string>();
		const readingFileSet = new Set<string>();
		const greppingFileSet = new Set<string>();
		const agentSessionEvents: AgentSessionEvent[] = [];

		let firstTimestamp = 0;

		for (const ev of events) {
			if (!ev.accumulated) continue;
			const acc = ev.accumulated;
			const timestamp = (ev.normalized as Record<string, unknown>).timestamp as number || 0;
			if (firstTimestamp === 0 || timestamp < firstTimestamp) firstTimestamp = timestamp;

			for (const fp of acc.files) {
				const relPath = toRepoRelative(fp);
				if (acc.operation === "reading") readingFileSet.add(relPath);
				else if (acc.operation === "grepping") greppingFileSet.add(relPath);
				else editedFileSet.add(relPath);
			}

			agentSessionEvents.push({
				id: `${sessionId}-${ev.seq}`,
				timestamp,
				sessionId,
				sessionName,
				sessionColor,
				operation: acc.operation as AgentSessionEventOperation,
				files: acc.files.map(toRepoRelative),
				dependencies: acc.dependencies,
				description: acc.description,
				layers: [],
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
			agent: "opencode",
			owner: { name: "opencode", login: "opencode" },
			state,
			task,
			message: task,
			color: sessionColor,
			files: commitFiles,
			readingFiles: Array.from(readingFileSet),
			greppingFiles: Array.from(greppingFileSet),
			activeFiles: [],
			startedAt: firstTimestamp ? new Date(firstTimestamp).toISOString() : undefined,
			stats,
		};

		const repoOwner = repoRoot?.includes("principal") ? "principal-ai" : null;
		const repoName = repoRoot ? repoRoot.split("/").filter(Boolean).pop() ?? null : null;

		return {
			sessions: [agentSession],
			selectedSessionId: sessionId,
			events: agentSessionEvents,
			repository: repoOwner && repoName ? { owner: repoOwner, name: repoName } : null,
		};
	}, [events, sessionId, sessionMeta, title, repoRoot]);

	const guideContext = useMemo<PanelContextValue<FileCityGuidePanelContext>>(() => {
		const fileTreeSlice: DataSlice<FileTree> = {
			scope: "repository",
			name: "fileTree",
			data: fileTree,
			loading: !fileTree,
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
				data: agentSessionsView,
				loading: false,
				error: null,
				refresh: async () => {},
			},
			repository,
		};
	}, [fileTree, agentSessionsView, repository]);

	const guideActions = useMemo<FileCityGuidePanelActions>(
		() => ({ openFile: () => {} }),
		[],
	);

	if (error) {
		return <CenteredMessage title="Could not load session events" detail={error} />;
	}
	if (!events) {
		return <CenteredMessage title="Loading events…" />;
	}

	return (
		<div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}>
			<div style={{ padding: "8px 16px", borderBottom: "1px solid #333", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
				{title}
				<span style={{ color: "#888", fontWeight: 400, fontSize: 11 }}>{events.length} events</span>
				{repoRoot && <span style={{ color: "#555", fontSize: 10, marginLeft: "auto" }}>{repoRoot}</span>}
			</div>

			<div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
				{/* Event list (left) */}
				<div style={{ width: 240, minWidth: 180, overflow: "auto", borderRight: "1px solid #333" }}>
					{events.map((ev, i) => {
						const accDotColor = ev.accumulated
							? ({ reading: "#a855f7", grepping: "#e879f9", editing: "#22c55e", errored: "#ef4444", starting: "#3b82f6", finished: "#888" } as Record<string, string>)[ev.accumulated.operation] ?? "#888"
							: "#333";
						return (
							<div
								key={ev.seq}
								onClick={() => setSelectedIdx(i)}
								style={{
									display: "flex", alignItems: "flex-start", gap: 8,
									padding: "5px 10px", borderBottom: "1px solid #222",
									cursor: "pointer", fontSize: 12,
									background: selectedIdx === i ? "#1a3a5c" : "transparent",
								}}
							>
								<div style={{ width: 8, height: 8, borderRadius: "50%", background: accDotColor, flexShrink: 0, marginTop: 3 }} />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ color: "#888", fontSize: 10 }}>#{ev.seq}</div>
									<div style={{ color: "#4fc3f7", fontWeight: 600, fontSize: 11 }}>{ev.type}</div>
									<div style={{ color: "#aaa", fontSize: 10, marginTop: 1 }}>{ev.normalized.eventType as string}</div>
								</div>
							</div>
						);
					})}
				</div>
				{/* FileCity guide panel with agent session mode (main) */}
				<div style={{ flex: 1, minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
					{fileTree ? (
						<div style={{ flex: 1, minHeight: 0 }}>
							<FileCityGuidePanel context={guideContext} actions={guideActions} events={panelEvents} />
						</div>
					) : repoRoot ? (
						<CenteredMessage title="Loading city…" />
					) : (
						<CenteredMessage title="No repo root" detail="No working directory found in session data" />
					)}
					{/* Detail panel (bottom) */}
					{showDetail && (
						<div style={{ height: 200, borderTop: "1px solid #333", display: "flex", overflow: "hidden" }}>
							<div style={{ flex: 1, overflow: "auto", borderRight: "1px solid #333", padding: 6 }}>
								<div style={{ fontSize: 9, color: "#888", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>RAW</div>
								<EventJSON data={selected!.raw} />
							</div>
							<div style={{ flex: 1, overflow: "auto", borderRight: "1px solid #333", padding: 6 }}>
								<div style={{ fontSize: 9, color: "#888", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>NORMALIZED</div>
								<EventJSON data={selected!.normalized} />
							</div>
							<div style={{ flex: 1, overflow: "auto", padding: 6 }}>
								<div style={{ fontSize: 9, color: "#888", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>ACCUMULATED</div>
								{selected!.accumulated ? (
									<div>
										<div style={{ fontSize: 10, color: "#4fc3f7", fontWeight: 600 }}>{selected!.accumulated.operation}</div>
										<div style={{ fontSize: 10, color: "#ccc" }}>{selected!.accumulated.description}</div>
									</div>
								) : (
									<div style={{ fontSize: 10, color: "#555", fontStyle: "italic" }}>no accumulated output</div>
								)}
							</div>
						</div>
					)}
				</div>
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
				if (tab.kind === "sessions") {
					setState({ kind: "sessions" });
					return;
				}
				if (tab.kind === "session-events") {
					setState({ kind: "session-events", id: tab.id, sessionId: tab.sessionId ?? "", title: tab.title });
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
	if (state.kind === "sessions") return <SessionsLibraryView />;
	if (state.kind === "session-events")
		return <SessionEventsView tabId={state.id} sessionId={state.sessionId} title={state.title} />;
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
	const [activeTabId, setActiveTabId] = useState<string>("sessions");

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
