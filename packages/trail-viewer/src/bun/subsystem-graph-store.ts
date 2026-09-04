/**
 * Persistent storage for subsystem component graphs.
 *
 * Layout: `~/.principal/subsystem-graphs/<id>.json` + `_index.json`
 * mirrors the trail/topic conventions. Each file is a
 * `StoredSubsystemGraph` record; the index is a lightweight cache for
 * listing without full-file parsing.
 */

import { promises as fs, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	SubsystemComponent,
	SubsystemComponentEdge,
	SubsystemGraphDocument,
	TrailViewerMessages,
} from "../shared/contract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { SubsystemComponent, SubsystemComponentEdge, SubsystemGraphDocument };

const ROOT = join(homedir(), ".principal", "subsystem-graphs");
const INDEX_PATH = join(ROOT, "_index.json");

/** Payload pushed to the renderer when a stored graph changes. */
export type SubsystemGraphChange = TrailViewerMessages["subsystemGraphChanged"];

type SubsystemGraphChangeListener = (change: SubsystemGraphChange) => void;

let changeListener: SubsystemGraphChangeListener | null = null;

/** Host registers once to bridge store/watch events onto Electrobun RPC. */
export function setSubsystemGraphChangeListener(
	listener: SubsystemGraphChangeListener | null,
): void {
	changeListener = listener;
}

/** Ignore fs.watch echoes of our own writes for this long. */
const SELF_WRITE_SUPPRESS_MS = 800;
const recentSelfWrites = new Map<string, number>();

function noteSelfWrite(graphId: string): void {
	recentSelfWrites.set(graphId, Date.now());
}

function wasRecentSelfWrite(graphId: string): boolean {
	const at = recentSelfWrites.get(graphId);
	if (at == null) return false;
	if (Date.now() - at < SELF_WRITE_SUPPRESS_MS) return true;
	recentSelfWrites.delete(graphId);
	return false;
}

function emitSubsystemGraphChange(change: SubsystemGraphChange): void {
	try {
		changeListener?.(change);
	} catch (err) {
		console.warn(
			`[subsystem-graph-store] change listener failed: ${(err as Error).message}`,
		);
	}
}

/** Map a watch filename to a graph id, or null for index / junk. */
export function graphIdFromWatchFilename(name: string | null | undefined): string | null {
	if (!name || !name.endsWith(".json")) return null;
	if (name === "_index.json") return null;
	return name.slice(0, -".json".length);
}

let dirWatcher: FSWatcher | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;
const pendingWatchIds = new Set<string>();

/**
 * Watch `~/.principal/subsystem-graphs` for external creates/edits/deletes
 * (agents or humans bypassing the HTTP/RPC write path). Returns a stop fn.
 * Idempotent — calling again while running is a no-op that still returns stop.
 */
export async function startSubsystemGraphDirWatcher(): Promise<() => void> {
	if (dirWatcher) {
		return stopSubsystemGraphDirWatcher;
	}
	await ensureDir();
	try {
		dirWatcher = watch(ROOT, { persistent: false }, (_event, filename) => {
			const id = graphIdFromWatchFilename(
				typeof filename === "string" ? filename : undefined,
			);
			if (!id) return;
			if (wasRecentSelfWrite(id)) return;
			pendingWatchIds.add(id);
			if (watchDebounce) clearTimeout(watchDebounce);
			watchDebounce = setTimeout(() => {
				const ids = [...pendingWatchIds];
				pendingWatchIds.clear();
				watchDebounce = null;
				for (const graphId of ids) {
					emitSubsystemGraphChange({ graphId, reason: "external" });
				}
			}, 120);
		});
		dirWatcher.on("error", (err) => {
			console.warn(
				`[subsystem-graph-store] dir watch error: ${(err as Error).message}`,
			);
		});
	} catch (err) {
		console.warn(
			`[subsystem-graph-store] could not watch ${ROOT}: ${(err as Error).message}`,
		);
		dirWatcher = null;
	}
	return stopSubsystemGraphDirWatcher;
}

export function stopSubsystemGraphDirWatcher(): void {
	if (watchDebounce) {
		clearTimeout(watchDebounce);
		watchDebounce = null;
	}
	pendingWatchIds.clear();
	if (dirWatcher) {
		dirWatcher.close();
		dirWatcher = null;
	}
}

/** On-disk record for a subsystem graph. */
export interface StoredSubsystemGraph extends SubsystemGraphDocument {
	id: string;
	title: string;
	description?: string;
	createdAt: string;
	updatedAt: string;
	/** Where this graph came from (agent session, manual creation, etc.). */
	source?: string;
	/** Repository this graph is about. */
	repo?: { owner: string; name: string };
	/**
	 * Local filesystem root component `file` paths resolve against. Opt-in:
	 * only set it for graphs whose components reference a repo on this
	 * machine. File reads are sandboxed to this root.
	 *
	 * Single-repo graphs: the default root for every component.
	 */
	repoRoot?: string;
	/**
	 * Per-repo local roots for multi-repo graphs, keyed by purl repo key
	 * (`pkg:github/owner/name`, fragment stripped). A component's `file`
	 * resolves against `repoRoots[purlRepo] ?? repoRoot`.
	 */
	repoRoots?: Record<string, string>;
	/**
	 * Result of the last file-existence verification pass (run on create and
	 * on component/root updates). Repos without a known local root are
	 * `unresolved`, not missing — absence of a machine is not an error.
	 */
	verification?: SubsystemGraphVerification;
}

/**
 * Result of verifying each component against its repo's local root (run on
 * create and on component/root updates). File existence is the base check; a
 * component that also declares `symbol` gets a declaration check — the symbol
 * must appear as a function/class/const/interface/type/enum declaration in
 * its file. Repos without a known local root are `unresolved`, not missing —
 * absence of a machine is not an error.
 */
export interface SubsystemGraphVerification {
	checkedAt: string;
	/** Components whose file was found on disk. */
	verifiedCount: number;
	/** Components with a known local root but no such file. */
	missingCount: number;
	/** Components whose purl has no entry in `repoRoots`/`repoRoot` — skipped. */
	unresolvedCount: number;
	/** The misses, for surfacing in UI/API responses. */
	missing: Array<{ componentId: string; file: string }>;
	/** Components whose `symbol` declaration was found in their file. */
	symbolsVerified: number;
	/** Components with a `symbol` not declared in their file (file may exist). */
	symbolsMissing: Array<{ componentId: string; symbol: string; file: string }>;
	/** Components carrying tool-extracted (`verified`) drill-down details. */
	detailsVerified: number;
	/** Components carrying hand-authored drill-down details. */
	detailsAuthored: number;
}

/** Lightweight index entry for listing. */
export interface SubsystemGraphIndexEntry {
	id: string;
	title: string;
	description?: string;
	componentCount: number;
	edgeCount: number;
	createdAt: string;
	updatedAt: string;
	fileName: string;
	source?: string;
	repo?: { owner: string; name: string };
}

interface IndexFile {
	version: number;
	entries: SubsystemGraphIndexEntry[];
}

// ---------------------------------------------------------------------------
// Edge-mechanism validation
// ---------------------------------------------------------------------------

/**
 * Allowed edge labels — mirrors `SubsystemEdgeMechanism` from
 * `@principal-ai/principal-view-react` (`packages/react/src/subsystem/model.ts`,
 * which also drives the per-mechanism color/style maps the renderer uses).
 * The union is compile-time only and this host module deliberately doesn't
 * bundle the React package, so wire-facing validation carries its own runtime
 * copy. The store test pins every name to catch drift on dependency bumps.
 */
export const SUBSYSTEM_EDGE_MECHANISMS = [
	"imports",
	"imports_from",
	"re_exports",
	"defines",
	"calls",
	"extends",
	"inherits",
	"implements",
	"mixes_in",
	"uses",
	"method",
	"references",
	"contains",
	"feeds",
	"produces",
	"registers-into",
] as const;

export type EdgeMechanism = (typeof SUBSYSTEM_EDGE_MECHANISMS)[number];

/**
 * Human-readable problems with edge mechanism labels (empty = valid).
 * Unknown labels would render unstyled in the graph view (color/style lookups
 * miss), so the API rejects them rather than persisting silently-broken edges.
 */
export function findEdgeMechanismProblems(edges: unknown): string[] {
	if (!Array.isArray(edges)) return [];
	const problems: string[] = [];
	for (const edge of edges) {
		const e = edge as Partial<SubsystemComponentEdge> | null;
		if (typeof e?.mechanism === "string" && (SUBSYSTEM_EDGE_MECHANISMS as readonly string[]).includes(e.mechanism)) {
			continue;
		}
		problems.push(
			`edge ${JSON.stringify(e?.id ?? "<no id>")}: unknown mechanism ${JSON.stringify(e?.mechanism)} — allowed: ${SUBSYSTEM_EDGE_MECHANISMS.join(", ")}`,
		);
	}
	return problems;
}

// ---------------------------------------------------------------------------
// Component-kind validation
// ---------------------------------------------------------------------------

/**
 * Authored component constructs — the published `SubsystemComponentConstruct` union
 * minus `module`. A module is its own subsystem: it gets its own graph and is
 * referenced, not inlined as a flat node that carries no information. Authors
 * must anchor to the concrete export (`symbol` + `file`) instead; semantic
 * roles ("entry", "service") are a separate field.
 */
export const SUBSYSTEM_COMPONENT_CONSTRUCTS = [
	"class",
	"function",
	"method",
	"type",
	"external",
] as const;

export type ComponentConstruct = (typeof SUBSYSTEM_COMPONENT_CONSTRUCTS)[number];

/** Human-readable problems with component kinds (empty = valid). */
export function findComponentConstructProblems(components: unknown): string[] {
	if (!Array.isArray(components)) return [];
	const problems: string[] = [];
	for (const component of components) {
		const c = component as Partial<SubsystemComponent> | null;
		if (
			typeof c?.kind === "string" &&
			(SUBSYSTEM_COMPONENT_CONSTRUCTS as readonly string[]).includes(c.construct)
		) {
			continue;
		}
		problems.push(
			`component ${JSON.stringify(c?.id ?? "<no id>")}: invalid construct ${JSON.stringify(c?.construct)} — allowed: ${SUBSYSTEM_COMPONENT_CONSTRUCTS.join(", ")}. A module is its own subsystem: anchor to a concrete export (symbol + file), or publish it as a separate graph and reference it.`,
		);
	}
	return problems;
}

// ---------------------------------------------------------------------------
// Detail-provenance validation
// ---------------------------------------------------------------------------

/**
 * Allowed provenance values for a component's drill-down `detail`.
 * `verified` is reserved for tool-extracted data (graphify AST, signature
 * extraction); anything an authoring agent wrote by hand must be `authored`
 * — which is also the default when `detail` is present without provenance.
 */
export const SUBSYSTEM_DETAIL_PROVENANCES = ["verified", "authored"] as const;

export type DetailProvenance = (typeof SUBSYSTEM_DETAIL_PROVENANCES)[number];

/**
 * Human-readable problems with explicit detail-provenance claims (empty =
 * valid). Only fires when `detail` carries a provenance value outside the
 * set — a hand-written detail claiming something unverifiable like
 * `"graphify"` would otherwise masquerade as tool-extracted.
 */
export function findDetailProvenanceProblems(components: unknown): string[] {
	if (!Array.isArray(components)) return [];
	const problems: string[] = [];
	for (const component of components) {
		const c = component as Record<string, unknown> | null;
		if (!c || typeof c !== "object" || !c["detail"]) continue;
		const p = c["detailProvenance"];
		if (p === undefined) continue;
		if (typeof p === "string" && (SUBSYSTEM_DETAIL_PROVENANCES as readonly string[]).includes(p)) continue;
		problems.push(
			`component ${JSON.stringify(String(c["id"] ?? "<no id>"))}: invalid detailProvenance ${JSON.stringify(p)} — allowed: ${SUBSYSTEM_DETAIL_PROVENANCES.join(", ")}. Hand-authored details must be "authored"; "verified" is reserved for tool-extracted data.`,
		);
	}
	return problems;
}

/**
 * Fill in safe defaults in place, so stored details always satisfy the
 * published renderer's expectations:
 * - `detail` without provenance becomes `authored`; orphan claims are dropped.
 * - Per-kind arrays the published `Graphify*Detail` types require are
 *   backfilled as empty (`callers`/`callees` on functions, etc.) — the
   * published ComponentDeclaration reads `.length` directly, and a missing
 *   array crashed the panel (undefined is not an object).
 *
 * Mutates the passed array — callers own the payload (fresh-parsed request
 * bodies or records about to be persisted).
 */
export function normalizeDetailProvenance(components: unknown): void {
	if (!Array.isArray(components)) return;
	for (const component of components) {
		const c = component as Record<string, unknown> | null;
		if (!c || typeof c !== "object") continue;
		const detail = c["detail"] as Record<string, unknown> | undefined;
		if (!detail || typeof detail !== "object") {
			delete c["detailProvenance"];
			continue;
		}
		const p = c["detailProvenance"];
		if (p !== "verified" && p !== "authored") c["detailProvenance"] = "authored";
		const kind = detail["kind"];
		const arrays: Record<string, string[]> = {
			function: ["parameters", "callers", "callees"],
			method: ["parameters"],
			class: ["methods", "properties", "extends", "implements", "instantiations", "references"],
			type: ["properties", "usedBy", "implementors"],
			module: ["imports", "exports", "symbols"],
		};
		for (const key of arrays[String(kind)] ?? []) {
			if (!Array.isArray(detail[key])) detail[key] = [];
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalize a purl to its repo key (fragment stripped) — mirrors the react package. */
export function purlRepoKey(purl: string | undefined): string | undefined {
	if (!purl) return undefined;
	const base = purl.split("#")[0]?.trim();
	return base || undefined;
}

/**
 * Pick the local root for a component's file.
 *
 * Multi-repo graphs (`repoRoots` present) require an explicit per-repo entry —
 * falling back to a default root would read one repo's files from another's
 * tree. Only single-repo graphs (no `repoRoots`) apply `repoRoot` to everyone.
 */
export function resolveRepoRootForComponent(
	graph: Pick<StoredSubsystemGraph, "repoRoot" | "repoRoots">,
	purl: string | undefined,
): string | undefined {
	if (graph.repoRoots) {
		const key = purlRepoKey(purl);
		return key ? graph.repoRoots[key] : undefined;
	}
	return graph.repoRoot;
}

/**
 * True when the file content declares the symbol as a
 * function/class/const/let/var/interface/type/enum. Qualified symbols
 * (`owner.method`) match on their last segment. Deliberately loose about
 * modifiers (`export`, `async`, `abstract`, `declare`) so module-private
 * declarations verify too; a bare name mention (comment, import, call) does
 * NOT count.
 */
export function fileDeclaresSymbol(content: string, symbol: string): boolean {
	const name = symbol.split(".").pop()?.trim() ?? "";
	if (!name) return false;
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const decl = new RegExp(
		`\\b(?:function|class|const|let|var|interface|type|enum)\\s+${escaped}\\b`,
	);
	return decl.test(content);
}

/**
 * Check every component's `file` against its repo's local root, and each
 * declared `symbol` against its file's contents. Purely informational — never
 * blocks create/update — but gives agents a self-correction signal and the UI
 * an honesty marker.
 */
export async function verifyGraphFiles(
	doc: SubsystemGraphDocument & { repoRoot?: string; repoRoots?: Record<string, string> },
): Promise<SubsystemGraphVerification> {
	const missing: Array<{ componentId: string; file: string }> = [];
	const symbolsMissing: Array<{ componentId: string; symbol: string; file: string }> = [];
	let verifiedCount = 0;
	let unresolvedCount = 0;
	let symbolsVerified = 0;
	let detailsVerified = 0;
	let detailsAuthored = 0;
	for (const c of doc.components) {
		// Detail-provenance counts are payload-level stats — independent of
		// whether this machine has the repo checked out.
		const raw = c as unknown as Record<string, unknown>;
		if (raw["detail"]) {
			if (raw["detailProvenance"] === "verified") detailsVerified++;
			else detailsAuthored++;
		}
		if (!c.file) continue;
		const root = resolveRepoRootForComponent(doc, c.purl);
		if (!root) {
			unresolvedCount++;
			continue;
		}
		const abs = join(root, c.file);
		try {
			await fs.access(abs);
			verifiedCount++;
		} catch {
			missing.push({ componentId: c.id, file: c.file });
			continue;
		}
		if (typeof c.symbol === "string" && c.symbol.trim()) {
			try {
				const content = await fs.readFile(abs, "utf8");
				if (fileDeclaresSymbol(content, c.symbol)) symbolsVerified++;
				else symbolsMissing.push({ componentId: c.id, symbol: c.symbol, file: c.file });
			} catch {
				symbolsMissing.push({ componentId: c.id, symbol: c.symbol, file: c.file });
			}
		}
	}
	return {
		checkedAt: new Date().toISOString(),
		verifiedCount,
		missingCount: missing.length,
		unresolvedCount,
		missing,
		symbolsVerified,
		symbolsMissing,
		detailsVerified,
		detailsAuthored,
	};
}

function graphId(): string {
	const ts = Date.now();
	const rand = Math.random().toString(36).slice(2, 11);
	return `sg-${ts}-${rand}`;
}

function graphPath(id: string): string {
	return join(ROOT, `${id}.json`);
}

/** Absolute on-disk path for a stored subsystem graph JSON file. */
export function subsystemGraphFilePath(id: string): string {
	return graphPath(id);
}

async function ensureDir(): Promise<void> {
	await fs.mkdir(ROOT, { recursive: true });
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

async function readIndex(): Promise<SubsystemGraphIndexEntry[]> {
	try {
		const raw = await fs.readFile(INDEX_PATH, "utf8");
		const idx = JSON.parse(raw) as IndexFile;
		if (idx.version === 1) return idx.entries;
	} catch {
		// missing / corrupt → rebuild
	}
	return rebuildIndex();
}

async function rebuildIndex(): Promise<SubsystemGraphIndexEntry[]> {
	await ensureDir();
	const entries: SubsystemGraphIndexEntry[] = [];
	let files;
	try {
		files = await fs.readdir(ROOT, { withFileTypes: true });
	} catch {
		return entries;
	}
	for (const f of files) {
		if (!f.isFile() || !f.name.endsWith(".json") || f.name === "_index.json") continue;
		try {
			const raw = await fs.readFile(join(ROOT, f.name), "utf8");
			const graph = JSON.parse(raw) as StoredSubsystemGraph;
			entries.push({
				id: graph.id,
				title: graph.title,
				description: graph.description,
				componentCount: graph.components.length,
				edgeCount: graph.edges.length,
				createdAt: graph.createdAt,
				updatedAt: graph.updatedAt,
				fileName: f.name,
				source: graph.source,
				repo: graph.repo,
			});
		} catch {
			// skip corrupt files
		}
	}
	entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
	await writeIndex(entries);
	return entries;
}

async function writeIndex(entries: SubsystemGraphIndexEntry[]): Promise<void> {
	await ensureDir();
	const idx: IndexFile = { version: 1, entries };
	await fs.writeFile(INDEX_PATH, JSON.stringify(idx, null, 2), "utf8");
}

async function upsertIndexEntry(entry: SubsystemGraphIndexEntry): Promise<void> {
	const entries = await readIndex();
	const idx = entries.findIndex((e) => e.id === entry.id);
	if (idx >= 0) entries[idx] = entry;
	else entries.push(entry);
	await writeIndex(entries);
}

async function removeIndexEntry(id: string): Promise<void> {
	const entries = await readIndex();
	const filtered = entries.filter((e) => e.id !== id);
	if (filtered.length !== entries.length) await writeIndex(filtered);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** List all stored subsystem graphs. */
export async function listSubsystemGraphs(): Promise<SubsystemGraphIndexEntry[]> {
	return readIndex();
}

/** Get a single subsystem graph by id. */
export async function getSubsystemGraph(id: string): Promise<StoredSubsystemGraph | null> {
	try {
		const raw = await fs.readFile(graphPath(id), "utf8");
		return JSON.parse(raw) as StoredSubsystemGraph;
	} catch {
		return null;
	}
}

/** Create a new subsystem graph. Returns the stored record with generated id + timestamps. */
export async function createSubsystemGraph(
	doc: SubsystemGraphDocument & {
		title: string;
		description?: string;
		source?: string;
		repo?: { owner: string; name: string };
		repoRoot?: string;
		repoRoots?: Record<string, string>;
	},
): Promise<StoredSubsystemGraph> {
	await ensureDir();
	const now = new Date().toISOString();
	const record: StoredSubsystemGraph = {
		...doc,
		id: graphId(),
		createdAt: now,
		updatedAt: now,
	};
	record.verification = await verifyGraphFiles(record);
	noteSelfWrite(record.id);
	await fs.writeFile(graphPath(record.id), JSON.stringify(record, null, 2), "utf8");
	await upsertIndexEntry({
		id: record.id,
		title: record.title,
		description: record.description,
		componentCount: record.components.length,
		edgeCount: record.edges.length,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		fileName: `${record.id}.json`,
		source: record.source,
		repo: record.repo,
	});
	emitSubsystemGraphChange({ graphId: record.id, reason: "created" });
	return record;
}

/** Update an existing subsystem graph. Returns the updated record, or null if not found. */
export async function updateSubsystemGraph(
	id: string,
	patch: Partial<
		Pick<
			StoredSubsystemGraph,
			| "title"
			| "description"
			| "components"
			| "edges"
			| "source"
			| "repo"
			| "repoRoot"
			| "repoRoots"
		>
	>,
): Promise<StoredSubsystemGraph | null> {
	const existing = await getSubsystemGraph(id);
	if (!existing) return null;
	const updated: StoredSubsystemGraph = {
		...existing,
		...patch,
		updatedAt: new Date().toISOString(),
	};
	updated.verification = await verifyGraphFiles(updated);
	noteSelfWrite(id);
	await fs.writeFile(graphPath(id), JSON.stringify(updated, null, 2), "utf8");
	await upsertIndexEntry({
		id: updated.id,
		title: updated.title,
		description: updated.description,
		componentCount: updated.components.length,
		edgeCount: updated.edges.length,
		createdAt: updated.createdAt,
		updatedAt: updated.updatedAt,
		fileName: `${id}.json`,
		source: updated.source,
		repo: updated.repo,
	});
	emitSubsystemGraphChange({ graphId: id, reason: "updated" });
	return updated;
}

/** Delete a subsystem graph. Returns true if deleted. */
export async function deleteSubsystemGraph(id: string): Promise<boolean> {
	try {
		noteSelfWrite(id);
		await fs.unlink(graphPath(id));
		await removeIndexEntry(id);
		emitSubsystemGraphChange({ graphId: id, reason: "deleted" });
		return true;
	} catch {
		return false;
	}
}
