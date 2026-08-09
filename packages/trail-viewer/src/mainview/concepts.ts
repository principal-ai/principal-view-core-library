/**
 * Curated concept registry for the Concepts tab.
 *
 * A "concept" is an architectural idea teased out of agent sessions — the
 * durable, refinable unit Principal AI wants to grow. Each concept carries:
 *   - `changeType` — the kind of software change the concept is about (execution,
 *     derive, integration, ui). Concepts share a
 *     generic visual per change type so a viewer is grounded in the category
 *     before the details.
 *   - `mermaid` — the concept's specific diagram (revealed on demand).
 *   - `description` + `points` — the prose that makes the idea legible.
 *   - `sessionIds` — the sessions that have surfaced or refined this concept.
 *     Concepts are *grouped* across sessions: as new sessions touch the same
 *     idea, their ids get appended here rather than spawning a new card.
 *   - `repos` — the repositories those sessions worked in.
 *
 * This registry is hand-curated today. A future refinement flow can promote,
 * merge, or split concepts from here.
 */

export type ChangeType =
	| "execution" // timing: when X happens relative to Y (reveal, defer, refresh)
	| "derive" // single source of truth / canonical identity
	| "integration" // how an embedded component integrates with its host
	| "ui"; // building a UI surface / view

export interface ConceptCard {
	id: string;
	title: string;
	/** The kind of software change this concept is about. */
	changeType: ChangeType;
	/** Optional phase the concept is in. Lets us sort/filter as the set grows. */
	status?: "draft" | "refining" | "stable";
	/** Sessions that surfaced or refined this concept (grouped here). */
	sessionIds: string[];
	/** Repositories the concept's sessions worked in (owner/name pairs). */
	repos: Array<{ owner: string; name: string }>;
	/** One-to-two sentence description for the card's left pane. */
	description: string;
	/** Short bullet points that state the key idea. */
	points: string[];
	/** Mermaid source for the right (diagram) side of the card. */
	mermaid: string;
}

/** Generic visual shown for every concept of a change type, before the
 *  concept-specific diagram is revealed. Grounds the viewer in the category.
 *  Replaced by the hand-drawn `ChangeTypeVisual` component. */
export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
	execution: "Execution",
	derive: "Data Flow",
	integration: "Integration",
	ui: "UI",
};

const THEMED_MARKDOWN_SESSION = "ses_0283bdb3affenlOnasoXM3ShuG";
const PRESENTATION_SESSION = "ses_0285e8c46ffeVSASZIKr9VIEKf";
const GUIDE_SESSION = "ses_02c98bdc4ffekjpQfN8zTlJtDi";
const KEEP_MOUNTED_SESSION = "ses_022ec242affepTdep2TyBQQnDp";

const THEMED_MARKDOWN_REPO = { owner: "principal-ade", name: "industry-themed-markdown" } as const;
const TRAIL_VIEWER_REPO = { owner: "principal-ai", name: "principal-view-core-library" } as const;
const GUIDE_REPO = { owner: "principal-ade", name: "industry-themed-file-city-panels" } as const;
const ALEXANDRIA_REPO = { owner: "principal-ai", name: "alexandria-core-library" } as const;
const FILE_CITY_REPO = { owner: "principal-ai", name: "file-city" } as const;

export const CONCEPT_CARDS: ConceptCard[] = [
	{
		id: "concept-theming-contract",
		title: "Diagram legibility is a theming contract — line color comes from the design system, not the charting library",
		changeType: "derive",
		status: "refining",
		sessionIds: [THEMED_MARKDOWN_SESSION],
		repos: [THEMED_MARKDOWN_REPO],
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
		description:
			"A diagram's line color comes from the design system, not the charting library — map mermaid's themeVariables to the theme at initialize() time.",
		points: [
			"`lineColor` / `edgeColor` / `arrowheadColor` → flowchart edges",
			"`transitionColor` → state-machine arrows",
			"`signalColor` / `signalTextColor` / `loopTextColor` → sequence messaging",
			"One mapping point keeps every diagram type legible on every theme (commit `aa684d4`)",
		],
	},
	{
		id: "concept-auto-fit-escape-hatch",
		title: "Auto-fit trades readability for fit — zoom-to-fit shrinks diagrams, so keep a natural-size escape hatch",
		changeType: "ui",
		status: "draft",
		sessionIds: [THEMED_MARKDOWN_SESSION],
		repos: [THEMED_MARKDOWN_REPO],
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
		description:
			"Zoom-to-fit scales a diagram to its panel — and can shrink it below readable scale. The escape hatch is a `disableFit` opt-in that renders at natural size.",
		points: [
			"`contain` (default) fits both axes; `width` / `height` fit one",
			"Sequence diagrams paint large, then visibly shrink to fit",
			"`disableFit` skips the measure→scale step entirely",
			"Natural-size default for sequences shipped then reverted in `17e7857`",
		],
	},
	{
		id: "concept-reveal-on-ready",
		title: "Reveal-on-ready hides the fit flash — cover diagrams until the fit lands, then fade in",
		changeType: "execution",
		status: "refining",
		sessionIds: [THEMED_MARKDOWN_SESSION],
		repos: [THEMED_MARKDOWN_REPO],
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
		description:
			"A diagram paints at scale 1, then jumps to its fitted scale — a flash. Cover it with an overlay until the fit is applied, then fade in.",
		points: [
			"Overlay covers the diagram before it ever paints",
			"Fit transform applied behind the overlay (`centerView`, synchronous)",
			"Minimum hold (default 300ms), then fade in (200ms ease)",
			"Same trick as image skeletons: never show the intermediate frame",
		],
	},
	{
		id: "concept-compose-presentation",
		title: "Presentations compose from primitives + slots — new surfaces reuse existing components and wire their unused hooks",
		changeType: "ui",
		status: "refining",
		sessionIds: [PRESENTATION_SESSION],
		repos: [THEMED_MARKDOWN_REPO, TRAIL_VIEWER_REPO],
		mermaid: `graph LR
    subgraph BUILD["MermaidMarkdownPresentation"]
        NAV["SlideNavigationHeader<br/>prev/next/TOC"]
        SLOT["additionalButtons slot<br/>(copy-slide)"]
        ZOOM["IndustryZoomableMermaidDiagram"]
        SLIDE["IndustryMarkdownSlide"]
    end
    NAV --> ZOOM
    SLOT --> NAV
    ZOOM --> SLIDE`,
		description:
			"New presentation surfaces are composed from existing primitives, and new controls ride the slots those primitives already expose — no bespoke chrome.",
		points: [
			"Reuses `SlideNavigationHeader` for prev/next + TOC",
			"Copy-slide fills the previously-unwired `additionalButtons` slot",
			"Reuses `IndustryZoomableMermaidDiagram` + `IndustryMarkdownSlide`",
			"New behavior shipped by wiring an existing hook, not a new component",
		],
	},
	{
		id: "concept-host-registers-singleton",
		title: "The host registers the mermaid singleton — themed-markdown renders through window.mermaid, not its own import",
		changeType: "integration",
		status: "refining",
		sessionIds: [PRESENTATION_SESSION],
		repos: [THEMED_MARKDOWN_REPO, TRAIL_VIEWER_REPO],
		mermaid: `flowchart TB
    HOST["host app"] -->|registers once| SING["window.mermaid"]
    SING --> LIB["themed-markdown<br/>IndustryMermaidDiagram"]
    LIB --> RENDER["renders svg"]
    MISSING["no registration"] --> STUCK["'Optimizing view…' forever"]`,
		description:
			"themed-markdown renders diagrams through `window.mermaid` — the host must register the singleton, or diagrams never leave 'Optimizing view…'.",
		points: [
			"Library renders via the `window.mermaid` singleton, not its own import",
			"Without registration the diagram sits at 'Optimizing view…' forever",
			"Trail-viewer registers it once at bootstrap (`index.tsx`)",
			"Same registration pattern the library's Storybook preview uses",
		],
	},
	{
		id: "concept-panel-owns-sources",
		title: "The panel owns its city sources — the host hands data, the panel decides what to render",
		changeType: "integration",
		status: "refining",
		sessionIds: [GUIDE_SESSION],
		repos: [GUIDE_REPO, TRAIL_VIEWER_REPO],
		mermaid: `flowchart TD
    EVENTS["all session events"] --> PANEL["panel"]
    PANEL -->|build once, stable| SOURCES["city sources<br/>full repo superset"]
    SOURCES --> CITY["render File City"]
    SELECT["user selects a session"] --> HIGHLIGHT["highlight only, don't rebuild"]
    OLD["old: host mutated sources on selection"] -.-> SOURCES`,
		description:
			"City sources are the panel's problem, not the host's — the panel builds the full repo superset once and selection only highlights, never rebuilds.",
		points: [
			"Q: 'are the city sources controlled by the host?' → the panel should own them",
			"Panel produces every repo needed for all events, up front",
			"Selection highlights the session's repos instead of swapping sources",
			"Stable sources stop the repo reorder/re-render churn on selection",
		],
	},
	{
		id: "concept-loading-as-compute-window",
		title: "The loading screen is the compute window — process everything before the city is ever shown",
		changeType: "execution",
		status: "refining",
		sessionIds: [GUIDE_SESSION],
		repos: [GUIDE_REPO, TRAIL_VIEWER_REPO],
		mermaid: `flowchart LR
    MOUNT["view mounts"] --> LOAD["Pulling Agent Sessions<br/>agent logos animate in order"]
    LOAD --> PROCESS["process all days' events<br/>behind the screen"]
    PROCESS -->|agent loaded| LOGO["that agent's logo stops"]
    PROCESS --> READY["Enter → city"]`,
		description:
			"While the loading screen shows, the panel processes the whole window of sessions — so by the time the user enters, everything is already there.",
		points: [
			"Process all 7 days of events during the loading screen, not on select",
			"Agent logos animate one at a time and stop as each agent's data lands",
			"An explicit Enter button gates entry — no auto-dismiss race",
			"Loading is a designed moment, not a spinner over a dead panel",
		],
	},
	{
		id: "concept-view-as-configurable-projection",
		title: "Views are configurable projections of one source — a day view is the week view with a narrower lens",
		changeType: "ui",
		status: "draft",
		sessionIds: [GUIDE_SESSION],
		repos: [GUIDE_REPO, TRAIL_VIEWER_REPO, FILE_CITY_REPO],
		mermaid: `flowchart LR
    DATA["session events"] --> WEEK["week view<br/>all repos"]
    DATA --> DAY["day view<br/>that day's repos"]
    WEEK -->|toggle| DAY
    DAY --> SRC["day-scoped city sources"]
    DAY --> DIM["per-session dim"]
    DAY --> GRID["dynamic grid by repo count"]`,
		description:
			"A day view is the weekly view recomposed: same events, but city sources scoped to the day, per-session dimming, and a grid sized to that day's repos.",
		points: [
			"Week view becomes the default; a new day view is added beside it",
			"Day view sources only that day's repos into the city",
			"Per-session dim highlights which repos a session touched",
			"Grid layout reflows to the number of repos on that day",
		],
	},
	{
		id: "concept-canonical-repo-identity",
		title: "Repo identity must be canonical — duplicates come from per-agent normalization, not real projects",
		changeType: "derive",
		status: "stable",
		sessionIds: [GUIDE_SESSION],
		repos: [ALEXANDRIA_REPO, TRAIL_VIEWER_REPO],
		mermaid: `flowchart LR
    AGENTS["opencode · cline · pi · grok"] --> ADAPTERS["normalization adapters"]
    ADAPTERS --> REG["project registry"]
    REG -->|case-insensitive dedupe| UNIQUE["one entry per repo"]
    REG -. "own adapter → dupes" .-> DUP["duplicate registration"]`,
		description:
			"Duplicate projects in the city traced to per-agent normalization adapters and case-variant paths — the registry must dedupe to one canonical entry.",
		points: [
			"Saw duplicate `industry-themed-file-city-panels` and file-city projects",
			"Opencode's own `NodePathNormalizationAdapter` produced the duplicates",
			"Fix: case-insensitive dedupe in the Alexandria `ProjectRegistryStore`",
			"Then unlink the local library and consume the published npm version",
		],
	},
	{
		id: "concept-selective-polling",
		title: "Poll today, diff the new events, append — don't reload the city",
		changeType: "execution",
		status: "draft",
		sessionIds: [GUIDE_SESSION],
		repos: [TRAIL_VIEWER_REPO, GUIDE_REPO],
		mermaid: `flowchart LR
    VIEWER["trail-viewer"] -->|poll today / 48h| PANEL["panel"]
    PANEL -->|diff new events| APPEND["append only"]
    APPEND --> CITY["File City"]`,
		description:
			"Live refresh polls a narrow window (today, then 48h), diffs what's new, and appends only those events — so an active session never forces a full reload.",
		points: [
			"Poll only 'today' to start, widened to 48h for safety",
			"Panel receives only new events and processes them selectively",
			"Diff-appended events avoid the re-render/reorder churn",
			"Went from 'does the viewer poll?' to a deliberate narrow-window poll",
		],
	},
	{
		id: "concept-keep-static-tabs-mounted",
		title: "Keep heavy views mounted — hide inactive tabs instead of reloading them",
		changeType: "ui",
		status: "refining",
		sessionIds: [KEEP_MOUNTED_SESSION],
		repos: [TRAIL_VIEWER_REPO],
		mermaid: `flowchart LR
    SWITCH["switch to tab"] --> MOUNTED{"already mounted?"}
    MOUNTED -->|yes| SHOW["show the live view"]
    MOUNTED -->|no| LOAD["load once"]
    LOAD --> KEEP["keep mounted, hide when inactive"]
    SHOW -. "old: remount every switch" .-> LOAD`,
		description:
			"Static tabs stay mounted once visited — they're hidden, not unmounted, when you switch away — so heavy views like Agent Sessions don't reload on every tab switch.",
		points: [
			"Q: 'why does the agent sessions tab reload every time we switch to it?'",
			"ActiveTab was keyed by tabId, forcing a full remount per switch",
			"Fix: a keep-mounted stack of static views, hidden while inactive",
			"Trail tabs still mount on demand — each holds a full 3D city",
		],
	},
];
