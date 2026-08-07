/**
 * MermaidDemoView — a permanent tab that renders a concept analysis of a real
 * opencode session through the `MermaidMarkdownPresentation` component.
 *
 * The tab fetches the session's events via the same `getSessionEvents` RPC the
 * CLI's `principal-ai agent-session fetch` surfaces, computes real session
 * stats (duration, event count, operations, files touched), and pairs an
 * authored concept deck with a live overview slide. Each concept slide states
 * an architectural concept the session surfaced — as a mermaid diagram plus
 * a short explainer — the way Principal AI wants to make sessions legible.
 *
 * The session this deck analyzes: `opencode:ses_0283bdb3affenlOnasoXM3ShuG`
 * — a ~4h pass on `principal-ade/industry-themed-markdown` that landed three
 * commits around mermaid diagram rendering: theme line colors, a reveal
 * overlay for the fit flash, and a reverted auto-fit experiment.
 */

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { MermaidMarkdownPresentation } from "themed-markdown";
import type { MermaidMarkdownSlide } from "themed-markdown";
import { electrobun } from "../rpc";
import { CenteredMessage } from "../ui";
import type { SessionEventRow } from "../../shared/contract";

const SESSION_ID = "opencode:ses_0283bdb3affenlOnasoXM3ShuG";

/** Strip the `opencode:` agent qualifier — the RPC keys the opencode DB by the
 *  bare aggregate id, exactly like `agent-session fetch ses_…`. */
function bareSessionId(raw: string): string {
	return raw.replace(/^[a-z]+:/i, "");
}

interface SessionStats {
	sessionId: string;
	title: string;
	slug: string;
	agent: string;
	repoOwner: string | null;
	repoName: string | null;
	repoRoot: string | undefined;
	eventCount: number;
	durationMs: number;
	operations: Record<string, number>;
	editedFiles: string[];
}

function computeStats(
	sessionId: string,
	res: {
		session?: { slug?: string; title?: string; agent?: string };
		repoRoot?: string;
		repos?: Array<{ owner?: string | null; name?: string | null }>;
		events?: SessionEventRow[];
	},
): SessionStats {
	const events = res.events ?? [];
	const operations: Record<string, number> = {};
	const editedSet = new Set<string>();
	let first = Infinity;
	let last = 0;
	for (const row of events) {
		const acc = row.accumulated;
		if (!acc) continue;
		if (typeof acc.timestamp === "number") {
			if (acc.timestamp < first) first = acc.timestamp;
			if (acc.timestamp > last) last = acc.timestamp;
		}
		if (acc.operation) {
			operations[acc.operation] = (operations[acc.operation] ?? 0) + 1;
		}
		if (acc.operation === "editing") {
			for (const f of acc.files ?? []) {
				if (f.displayPath) editedSet.add(f.displayPath);
			}
		}
	}
	// opencode fills `title` with the first real user prompt — great in a list,
	// but too long for a slide header. The slug is a compact, readable label.
	const title = res.session?.slug || res.session?.title || sessionId.slice(0, 12);
	return {
		sessionId,
		title,
		slug: res.session?.slug ?? "",
		agent: res.session?.agent ?? "opencode",
		repoOwner: res.repos?.[0]?.owner ?? null,
		repoName: res.repos?.[0]?.name ?? null,
		repoRoot: res.repoRoot,
		eventCount: events.length,
		durationMs: last >= first ? last - first : 0,
		operations,
		editedFiles: [...editedSet].sort(),
	};
}

function formatDuration(ms: number): string {
	const totalMin = Math.max(1, Math.round(ms / 60000));
	const h = Math.floor(totalMin / 60);
	const m = totalMin % 60;
	return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Authored concept deck — the "teased out" analysis that makes the session
 *  legible. Slide 0 (session overview) is built live from the fetched stats;
 *  the concept slides are stable authored content. */
function buildSlides(stats: SessionStats | null): MermaidMarkdownSlide[] {
	const conceptSlides: MermaidMarkdownSlide[] = [
		{
			title: "Concept: Legibility is a theming contract",
			mermaid: `flowchart LR
    THEME["industry theme<br/>colors.text"] -->|themeVariables| MAP["mermaid.initialize()"]
    MAP --> L1["lineColor"]
    MAP --> L2["edgeColor"]
    MAP --> L3["arrowheadColor"]
    MAP --> L4["transitionColor"]
    MAP --> L5["signalColor / signalTextColor"]
    MAP --> L6["loopTextColor"]
    L1 --> FLOW["flowchart edges"]
    L2 --> FLOW
    L3 --> SEQ["sequence signals"]
    L5 --> SEQ
    L6 --> LOOP["loop labels"]
    L4 --> STATE["state transitions"]`,
			markdown: `# Concept: diagram legibility is a theming contract

The session's opening question — *"what determines the color of those lines?"* — turned out not to be about the diagram at all.

## The mechanism

Mermaid ships a **default palette** that decides line, edge, arrowhead, and label colors. On a dark theme those defaults are invisible. The fix in **\`aa684d4\`** maps mermaid's \`themeVariables\` to the industry theme's \`colors.text\` at \`initialize()\` time:

- \`lineColor\` · \`edgeColor\` · \`arrowheadColor\` → flowchart edges
- \`transitionColor\` → state-machine arrows
- \`signalColor\` · \`signalTextColor\` → sequence messages
- \`loopTextColor\` → loop framing

> The general lesson: a diagram's chroma should come from the design system, not the charting library's defaults. One mapping point keeps every diagram type legible on every theme.`,
		},
		{
			title: "Concept: Auto-fit trades readability for fit",
			mermaid: `flowchart TD
    RENDER["render mermaid svg"] --> MEASURE["measure svg bounds"]
    MEASURE --> DECIDE{"fit strategy?"}
    DECIDE -->|contain| FIT["scale to panel both axes"]
    DECIDE -->|width| W["scale to panel width"]
    DECIDE -->|height| H["scale to panel height"]
    DECIDE -->|disableFit| NAT["natural size (1x)"]
    FIT --> APPLY["centerView(scale)"]
    W --> APPLY
    H --> APPLY
    NAT --> APPLY
    APPLY --> DONE["fitted diagram"]
    NAT -. "sequence diagrams pre-0.1.121" .-> READABLE["readable, may overflow"]`,
			markdown: `# Concept: auto-fit trades readability for fit

The session's second puzzle: *"the sequence one starts correct, then shrinks a bit."*

## Why it shrinks

The default fit strategy is **\`contain\`**: after the SVG is measured, the diagram is scaled to fit the panel's smaller dimension. For a wide or tall sequence diagram that means scaling **down** — so it paints large, then visibly shrinks to fit.

## The escape hatch

A \`disableFit\` prop skips the whole measure→scale step and renders at **natural size**. \`0.1.120\` even made sequence diagrams do this automatically — until \`0.1.121\` reverted that default (see the last slide) while keeping the prop.

> Zoom-to-fit is a nice default, but it silently destroys legibility. The fix is to keep the default, add an opt-out, and let the author choose readability over fit.`,
		},
		{
			title: "Concept: Reveal-on-ready hides the fit flash",
			mermaid: `sequenceDiagram
    participant R as React
    participant M as Mermaid
    participant Z as Zoom wrapper
    participant U as User
    R->>M: render(code)
    M-->>R: svg (scale 1)
    R->>Z: measure + calculate fit
    Z-->>R: centerView(scale)
    Note over R,U: overlay covers diagram until fit lands
    R->>U: reveal: fade in 200ms ease`,
			markdown: `# Concept: reveal-on-ready hides the fit flash

The session's longest thread: *"how do we prevent the flash when the other ones are fit?"*

## Two-phase render needs a mask

The diagram paints at **scale 1**, then jumps to its fitted scale — a visible flash on every slide change. The fix in \`ad928d2\` is a **reveal overlay**:

1. An overlay covers the diagram before it ever paints.
2. The fit transform is applied behind the overlay (\`centerView\`, synchronous).
3. After a minimum hold (default **300ms**) the overlay lifts and the diagram fades in (**200ms** ease).

> Same trick as image skeletons and font-display: never show the intermediate frame. Show only the settled one — the "Optimizing view…" that the host app's mermaid singleton would otherwise leave on screen.`,
		},
		{
			title: "Concept: Revert the default, keep the escape hatch",
			mermaid: `graph LR
    V0["0.1.119"] --> K1["aa684d4<br/>theme line colors"]
    K1 --> K2["ad928d2<br/>natural-size + overlay"]
    K2 --> V2["0.1.120"]
    V2 --> K3["17e7857<br/>re-enable auto-fit"]
    K3 --> V3["0.1.121"]
    K2 -. "experiment reverted" .-> K3`,
			markdown: `# Concept: revert the default, keep the escape hatch

Three commits tell the whole story:

| Commit | Change | Fate |
|--------|--------|------|
| \`aa684d4\` | map themeVariables to the theme | **kept** |
| \`ad928d2\` | sequence diagrams at natural size + reveal overlay | overlay **kept**, natural-size default **reverted** |
| \`17e7857\` | re-enable auto-fit for sequence diagrams | default comes back |

## What stuck

The **reveal overlay** and the **\`disableFit\` prop** stayed; the **behavioral default** went back to auto-fit to match pre-\`0.1.120\`.

> Shipping an experiment and reverting the default is not failure — it's how you find the line between "nice in a story" and "right for everyone." Keep the plumbing (overlay, opt-in prop), revert the behavior, and the option stays available for authors who need it.`,
		},
	];

	if (!stats) return conceptSlides;

	const opsSummary = Object.entries(stats.operations)
		.sort((a, b) => b[1] - a[1])
		.map(([op, n]) => `${op} ${n}`)
		.join(" · ");

	const overview: MermaidMarkdownSlide = {
		title: "Session Overview",
		mermaid: `graph TB
    subgraph SESSION["opencode session"]
        REPO["${stats.repoName ?? "industry-themed-markdown"}"]
        MODEL["deepseek-v4-flash"]
        DUR["~${formatDuration(stats.durationMs)} · ${stats.eventCount.toLocaleString()} events"]
    end
    subgraph WORK["work streams"]
        W1["line colors on dark theme"]
        W2["sequence diagram fit"]
        W3["fit flash / reveal"]
    end
    subgraph OUTCOME["commits"]
        K1["aa684d4 theming"]
        K2["ad928d2 overlay"]
        K3["17e7857 revert fit"]
    end
    SESSION --> WORK
    W1 --> K1
    W2 --> K2
    W3 --> K2
    K2 --> K3`,
		markdown: `# Session: ${stats.title}

Analyzed from \`opencode:${stats.sessionId}\` — a ${formatDuration(stats.durationMs)} opencode session by the **\`${stats.agent}\`** agent.

## At a glance

| Metric | Value |
|--------|-------|
| Repo | ${stats.repoOwner ? `${stats.repoOwner}/${stats.repoName ?? ""}` : stats.repoRoot ?? "—"} |
| Duration | ${formatDuration(stats.durationMs)} |
| Events | ${stats.eventCount.toLocaleString()} |
| Operations | ${opsSummary} |
| Files edited | ${stats.editedFiles.length > 0 ? stats.editedFiles.length : "—"} |

## The thread

This session is a focused polish pass on how mermaid diagrams render in the markdown presentation. It walks the whole rendering concern end-to-end — **theme → fit → reveal** — and leaves a pair of opt-in props behind. The next slides tease out the concepts.`,
	};

	return [overview, ...conceptSlides];
}

export function MermaidDemoView() {
	const { theme } = useTheme();
	const [stats, setStats] = useState<SessionStats | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const sessionId = bareSessionId(SESSION_ID);
		(async () => {
			try {
				const res = await electrobun.rpc!.request.getSessionEvents({
					sessionId,
				});
				if (cancelled) return;
				if (!res.ok) {
					setError(res.error ?? "Session not found");
					return;
				}
				setStats(computeStats(sessionId, res));
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const slides = useMemo(() => buildSlides(stats), [stats]);

	if (error) {
		return (
			<CenteredMessage
				title="Could not analyze session"
				detail={`${SESSION_ID}\n\n${error}`}
			/>
		);
	}

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}
		>
			{stats ? (
				<MermaidMarkdownPresentation slides={slides} theme={theme} />
			) : (
				<CenteredMessage title="Analyzing session…" />
			)}
		</div>
	);
}
