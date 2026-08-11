/**
 * Real concept extraction — turns a session's accumulated event layer into a
 * transcript, hands it to the `concept-extractor` opencode agent, and parses
 * the JSON concept cards back out.
 *
 * This is the Phase-2 replacement for `stubConceptCard`: the host saves a
 * `pending` analysis, runs this in the background (the opencode run outlives
 * the 5s RPC window), then persists the parsed cards or the error.
 *
 * The transcript deliberately carries the *accumulated* semantic layer (the
 * `description` lines the pipeline already distilled), never raw event
 * payloads. If the agent needs more signal, we enrich that layer — the agent
 * can also read the session's repos directly (it is not sandboxed).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	ConceptCardData,
	ConceptChangeType,
	ExtractionPromptInfo,
	RepoInfo,
	SessionEventRow,
} from "../shared/contract";

/** Fixed extractor model — the opencode-go provider's fast flash model. */
export const EXTRACTOR_MODEL = "opencode-go/deepseek-v4-flash";

/** The opencode agent the run invokes (defined globally under
 *  `~/.config/opencode/agents/` so it applies regardless of `--dir`). */
export const CONCEPT_EXTRACTOR_AGENT = "concept-extractor";

const OPENCODE_BIN =
	process.env["OPENCODE_BIN"] ?? "/Users/griever/.opencode/bin/opencode";

/** Where the system prompt lives on disk — the source of truth surfaced by the
 *  prompt tab. Overridable via `TRAIL_EXTRACTOR_AGENT_PATH`. */
export const EXTRACTOR_AGENT_PATH =
	process.env["TRAIL_EXTRACTOR_AGENT_PATH"] ??
	join(homedir(), ".config", "opencode", "agents", `${CONCEPT_EXTRACTOR_AGENT}.md`);

const TRANSCRIPT_DIR = join(homedir(), ".principal", "transcripts");

// ---------------------------------------------------------------------------
// Transcript building
// ---------------------------------------------------------------------------

export interface TranscriptSource {
	sessionId: string;
	sessionTitle: string;
	sessionSlug?: string;
	agent?: string;
	repos: RepoInfo[];
	events: SessionEventRow[];
}

/** Render the accumulated event layer as plain numbered prose, with a header
 *  naming the session, agent, and every repo the session touched. */
export function buildTranscript(src: TranscriptSource): string {
	const lines: string[] = [];
	lines.push("# Session Analysis Transcript");
	lines.push("");
	lines.push(`- **Session**: ${src.sessionTitle}`);
	lines.push(`- **Agent**: ${src.agent ?? "opencode"}`);
	if (src.sessionSlug) lines.push(`- **Slug**: ${src.sessionSlug}`);
	const repoLines = src.repos.map((r) => {
		const identity =
			r.owner && r.name ? `${r.owner}/${r.name}` : r.name ?? r.root;
		return `- ${r.root}${identity === r.root ? "" : ` (${identity})`}`;
	});
	if (repoLines.length > 0) {
		lines.push("- **Repos**:");
		lines.push(...repoLines);
	}
	lines.push("");
	lines.push("## What happened (accumulated event timeline)");
	lines.push("");
	let n = 0;
	for (const ev of src.events) {
		const acc = ev.accumulated;
		const text = acc?.description?.trim() || (acc?.operation?.trim() || "").trim();
		if (!text) continue;
		n++;
		lines.push(`${n}. ${text}`);
	}
	if (n === 0) lines.push("(no accumulated events)");
	lines.push("");
	return lines.join("\n");
}

/** Write the transcript to `~/.principal/transcripts/<id>.md` and return its
 *  path (the file the opencode run attaches with `-f`). */
export function writeTranscript(src: TranscriptSource): string {
	mkdirSync(TRANSCRIPT_DIR, { recursive: true });
	const safeId = src.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
	const path = join(TRANSCRIPT_DIR, `${safeId}.md`);
	writeFileSync(path, buildTranscript(src), "utf8");
	return path;
}

// ---------------------------------------------------------------------------
// Prompt surfaces
// ---------------------------------------------------------------------------

/** The task message template — one interpolation (the session title). */
export function extractTaskTemplate(sessionTitle: string): string {
	return `Extract concept cards from the session "${sessionTitle}". Respond with ONLY a JSON object: {"concepts": [...]}.`;
}

/** Read the extractor agent's system prompt from its config file. Falls back to
 *  a placeholder line so the prompt tab degrades gracefully if the file moves. */
export function readExtractorSystemPrompt(): string {
	try {
		return readFileSync(EXTRACTOR_AGENT_PATH, "utf8");
	} catch (err) {
		return `(system prompt unavailable — ${(err as Error).message})`;
	}
}

/** What the prompt tab renders: the fixed agent identity + the verbatim prompt
 *  and the task template (with its interpolation point marked). */
export function getExtractionPromptInfo(): ExtractionPromptInfo {
	return {
		agent: CONCEPT_EXTRACTOR_AGENT,
		model: EXTRACTOR_MODEL,
		systemPrompt: readExtractorSystemPrompt(),
		taskTemplate: extractTaskTemplate("<session title>"),
		agentPath: EXTRACTOR_AGENT_PATH,
	};
}

// ---------------------------------------------------------------------------
// opencode run + parsing
// ---------------------------------------------------------------------------

export interface ExtractionResult {
	ok: boolean;
	error?: string;
	concepts?: ConceptCardData[];
	/** Model the run reported via `-m` (deterministic, but kept on the record). */
	model?: string;
}

/**
 * Spawn `opencode run` with the concept-extractor agent and the transcript
 * attached, then parse the JSONL event stream for the agent's JSON response.
 *
 * NOTE: the message positional MUST precede `-f` — the file flag is
 * array-typed and greedily consumes any positional that follows it.
 */
export async function runOpenCodeExtraction(opts: {
	transcriptPath: string;
	primaryRepoRoot?: string;
	task: string;
}): Promise<ExtractionResult> {
	const args = [
		"run",
		"--agent",
		CONCEPT_EXTRACTOR_AGENT,
		"--format",
		"json",
		"-m",
		EXTRACTOR_MODEL,
	];
	if (opts.primaryRepoRoot) args.push("--dir", opts.primaryRepoRoot);
	args.push(opts.task);
	args.push("-f", opts.transcriptPath);

	const proc = Bun.spawn({
		cmd: [OPENCODE_BIN, ...args],
		stdio: ["ignore", "pipe", "pipe"],
	});

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const detail = stderr.trim().split("\n").pop() ?? "";
		return {
			ok: false,
			error: detail || `opencode run exited ${exitCode}`,
			model: EXTRACTOR_MODEL,
		};
	}

	const { text, error } = parseRunOutput(stdout);
	if (error) return { ok: false, error, model: EXTRACTOR_MODEL };

	const concepts = parseConceptsJson(text);
	if (concepts.length === 0) {
		return {
			ok: false,
			error: "Extractor returned no parseable concept cards",
			model: EXTRACTOR_MODEL,
		};
	}
	return { ok: true, concepts, model: EXTRACTOR_MODEL };
}

/** Walk the NDJSON `opencode run --format json` stream. The agent's answer is
 *  the concatenation of `text` parts; errors surface as `error` events. */
function parseRunOutput(
	stdout: string,
): { text: string; error?: string } {
	let text = "";
	let error: string | undefined;
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let ev: { type?: string; part?: { text?: unknown }; message?: unknown };
		try {
			ev = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (!ev || typeof ev !== "object") continue;
		if (ev.type === "text" && typeof ev.part?.text === "string") {
			text += ev.part.text;
		} else if (ev.type === "error") {
			error = typeof ev.message === "string" ? ev.message : "opencode run failed";
		}
	}
	return { text, error };
}

/** Extract a `{ "concepts": [...] }` (or bare `[...]`) JSON value from the
 *  agent's reply, tolerating a bit of prose and markdown fences. */
function parseConceptsJson(raw: string): ConceptCardData[] {
	const text = raw.trim();
	if (!text) return [];

	let parsed: unknown = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		// fall through to fence/balanced extraction
	}
	if (parsed === null) {
		try {
			const fenced = text
				.replace(/^```(?:json)?\s*/i, "")
				.replace(/```\s*$/i, "")
				.trim();
			parsed = JSON.parse(fenced);
		} catch {
			// fall through to balanced extraction
		}
	}
	if (parsed === null) {
		const extracted = extractBalancedJson(text);
		if (extracted !== null) {
			try {
				parsed = JSON.parse(extracted);
			} catch {
				parsed = null;
			}
		}
	}
	if (parsed === null) return [];

	const arr = Array.isArray(parsed)
		? parsed
		: (parsed as { concepts?: unknown }).concepts;
	if (!Array.isArray(arr)) return [];

	const out: ConceptCardData[] = [];
	for (const item of arr) {
		const card = validateCard(item, out.length);
		if (card) out.push(card);
	}
	return out;
}

/** Pull the outermost balanced JSON value (object or array) out of a string. */
function extractBalancedJson(text: string): string | null {
	const start = text.search(/[{[]/);
	if (start < 0) return null;
	const open = text[start];
	const close = open === "{" ? "}" : "]";
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') {
			inString = true;
		} else if (ch === open) {
			depth++;
		} else if (ch === close) {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

const VALID_CHANGE_TYPES: ConceptChangeType[] = [
	"execution",
	"derive",
	"integration",
	"ui",
];

function validateCard(
	raw: unknown,
	idx: number,
): ConceptCardData | null {
	if (typeof raw !== "object" || raw === null) return null;
	const r = raw as Record<string, unknown>;
	const title =
		typeof r["title"] === "string" && (r["title"] as string).trim()
			? (r["title"] as string).trim()
			: "";
	const description =
		typeof r["description"] === "string" && (r["description"] as string).trim()
			? (r["description"] as string).trim()
			: "";
	if (!title || !description) return null;

	const changeType = VALID_CHANGE_TYPES.includes(
		r["changeType"] as ConceptChangeType,
	)
		? (r["changeType"] as ConceptChangeType)
		: "execution";
	const points = Array.isArray(r["points"])
		? (r["points"] as unknown[]).filter((p): p is string => typeof p === "string")
		: [];
	const sessionIds = Array.isArray(r["sessionIds"])
		? (r["sessionIds"] as unknown[]).filter(
				(s): s is string => typeof s === "string",
			)
		: [];
	// Card repos are owner/name pairs — entries without an owner (local repos)
	// are dropped rather than carried as nulls.
	const repos = Array.isArray(r["repos"])
		? (r["repos"] as unknown[])
				.filter(
					(re): re is { owner?: unknown; name?: unknown } =>
						typeof re === "object" && re !== null,
				)
				.map((re) => ({
					owner: typeof re.owner === "string" ? re.owner : "",
					name: typeof re.name === "string" ? re.name : "",
				}))
				.filter((re) => re.owner !== "" && re.name !== "")
		: [];
	return {
		id:
			typeof r["id"] === "string" && (r["id"] as string).trim()
				? (r["id"] as string).trim()
				: `concept-${idx}`,
		title,
		changeType,
		status: "draft",
		sessionIds,
		repos,
		description,
		points: points.length > 0 ? points : [title],
		mermaid:
			typeof r["mermaid"] === "string" && (r["mermaid"] as string).trim()
				? (r["mermaid"] as string).trim()
				: "",
	};
}
