/**
 * PURL + HEAD (+ dirty fingerprint) cache for graphify `graph.json`.
 *
 * Layout:
 *   ~/.principal/graphify-graphs/
 *     _index.json
 *     <sanitized-purl-key>/
 *       <headSha>/                    # clean working tree
 *         graph.json
 *         meta.json
 *       <headSha>+<dirtyHash>/        # dirty working tree
 *         graph.json
 *         meta.json
 *
 * Cache key: purlRepoKey @ headSha[+dirtyHash]. Dirty hash fingerprints
 * `git status` + `git diff HEAD` + untracked file contents so local edits
 * invalidate without waiting for a commit.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parsePurl } from "@principal-ai/alexandria-core-library";
import { loadAlexandriaRepos, resolveRepoRootFromAlexandria } from "./alexandria";
import {
	edgeCount,
	loadGraphifyGraph,
	promoteGraphJson,
	runGraphifyExtract,
	type GraphifyGraphSmoke,
} from "./graphify-runner";
import { purlRepoKey } from "./subsystem-graph-store";

const ROOT = join(homedir(), ".principal", "graphify-graphs");

/** Cap per untracked file when folding bytes into the dirty fingerprint. */
const UNTRACKED_HASH_MAX_BYTES = 1_048_576;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphifyGraphMeta {
	purl: string;
	/** Repo-key form (fragment stripped). */
	purlKey: string;
	headSha: string;
	/** Null when the working tree matched HEAD at build time. */
	dirtyHash: string | null;
	/** Directory name under the purl folder (`headSha` or `headSha+dirtyHash`). */
	slotKey: string;
	repoRoot: string;
	builtAt: string;
	nodeCount: number;
	edgeCount: number;
	builtAtCommit?: string;
}

export interface GraphifyGraphIndexEntry {
	purl: string;
	purlKey: string;
	/** Filesystem directory name under ROOT. */
	dirName: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	repoRoot: string;
	builtAt: string;
	nodeCount: number;
	edgeCount: number;
	/** Absolute path to graph.json. */
	graphJsonPath: string;
}

interface IndexFile {
	version: number;
	entries: GraphifyGraphIndexEntry[];
}

export type EnsureGraphifyStatus = "hit" | "built" | "building";

export interface EnsureGraphifyGraphOk {
	ok: true;
	status: EnsureGraphifyStatus;
	purl: string;
	purlKey: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	repoRoot: string;
	graphJsonPath: string;
	meta: GraphifyGraphMeta;
	nodeCount: number;
	edgeCount: number;
	durationMs: number;
}

export interface EnsureGraphifyGraphFail {
	ok: false;
	error: string;
	purl?: string;
	durationMs: number;
}

export type EnsureGraphifyGraphResult = EnsureGraphifyGraphOk | EnsureGraphifyGraphFail;

export interface EnsureGraphifyGraphOptions {
	/** Package URL identifying the repo (`pkg:github/owner/name` or with #fragment). */
	purl: string;
	/** Skip Alexandria and use this local root. */
	repoRoot?: string;
	/** Rebuild even when a cache slot exists. */
	force?: boolean;
	/** Explicit graphify binary (smoke / tests). */
	bin?: string;
	/** Override store root (tests). */
	storeRoot?: string;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Filesystem-safe directory name for a purl repo key. */
export function sanitizePurlDirName(purlKey: string): string {
	const stripped = purlKey.replace(/^pkg:/i, "");
	const cleaned = stripped
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
	return cleaned || "unknown";
}

/** Slot folder: clean `headSha`, or `headSha+dirtyHash` when dirty. */
export function cacheSlotKey(headSha: string, dirtyHash: string | null): string {
	return dirtyHash ? `${headSha}+${dirtyHash}` : headSha;
}

export function graphifyStoreRoot(override?: string): string {
	return override ?? ROOT;
}

export function cacheSlotDir(
	purlKey: string,
	headSha: string,
	dirtyHash: string | null = null,
	storeRoot?: string,
): string {
	return join(
		graphifyStoreRoot(storeRoot),
		sanitizePurlDirName(purlKey),
		cacheSlotKey(headSha, dirtyHash),
	);
}

export function cachedGraphJsonPath(
	purlKey: string,
	headSha: string,
	dirtyHash: string | null = null,
	storeRoot?: string,
): string {
	return join(cacheSlotDir(purlKey, headSha, dirtyHash, storeRoot), "graph.json");
}

export function cachedMetaPath(
	purlKey: string,
	headSha: string,
	dirtyHash: string | null = null,
	storeRoot?: string,
): string {
	return join(cacheSlotDir(purlKey, headSha, dirtyHash, storeRoot), "meta.json");
}

// ---------------------------------------------------------------------------
// Git / dirty fingerprint / purl resolve
// ---------------------------------------------------------------------------

function gitStdout(repoRoot: string, args: string[], maxBuffer = 32 * 1024 * 1024): string | null {
	const result = spawnSync("git", ["-C", repoRoot, ...args], {
		encoding: "buffer",
		stdio: ["ignore", "pipe", "ignore"],
		timeout: 30_000,
		maxBuffer,
	});
	if (result.status !== 0) return null;
	return result.stdout?.toString("utf8") ?? "";
}

export function gitHeadSha(repoRoot: string): string | null {
	const out = gitStdout(repoRoot, ["rev-parse", "HEAD"]);
	const sha = out?.trim();
	return sha || null;
}

/**
 * Fingerprint of local dirt vs HEAD. Returns null when the tree is clean.
 *
 * Hash input: porcelain status + `git diff HEAD` (staged+unstaged) + untracked
 * file paths/contents (content capped per file). Prefer this over mtimes alone.
 */
export function dirtyFingerprint(repoRoot: string): string | null {
	const status = gitStdout(repoRoot, ["status", "--porcelain=v1"]);
	if (status === null) return null;
	if (!status.trim()) return null;

	const diff = gitStdout(repoRoot, ["diff", "HEAD", "--binary"]) ?? "";
	const hasher = createHash("sha256");
	hasher.update("status\0");
	hasher.update(status);
	hasher.update("\0diff\0");
	hasher.update(diff);

	const untrackedRaw = gitStdout(repoRoot, [
		"ls-files",
		"-z",
		"--others",
		"--exclude-standard",
	]);
	hasher.update("\0untracked\0");
	if (untrackedRaw) {
		const paths = untrackedRaw.split("\0").filter(Boolean);
		paths.sort();
		for (const rel of paths) {
			hasher.update(rel);
			hasher.update("\0");
			const abs = join(repoRoot, rel);
			try {
				const st = statSync(abs);
				if (!st.isFile()) {
					hasher.update(`dir:${st.size}\0`);
					continue;
				}
				hasher.update(`size:${st.size}\0`);
				if (st.size <= UNTRACKED_HASH_MAX_BYTES) {
					hasher.update(readFileSync(abs));
				} else {
					hasher.update(`mtime:${Math.floor(st.mtimeMs)}\0`);
				}
			} catch {
				hasher.update("missing\0");
			}
			hasher.update("\0");
		}
	}

	return hasher.digest("hex").slice(0, 16);
}

/**
 * Resolve a purl to a local checkout via Alexandria (`pkg:github/owner/name`).
 * Returns null when the type isn't github or no registered clone exists.
 */
export function resolveRepoRootForPurl(purl: string): string | null {
	const key = purlRepoKey(purl);
	if (!key) return null;
	const parsed = parsePurl(key);
	if (!parsed) return null;
	const type = (parsed.type ?? "").toLowerCase();
	if (type !== "github") return null;
	const owner = parsed.namespace;
	const name = parsed.name;
	if (!owner || !name) return null;
	return resolveRepoRootFromAlexandria(owner, name);
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

async function readIndex(storeRoot: string): Promise<IndexFile> {
	try {
		const raw = await fs.readFile(join(storeRoot, "_index.json"), "utf8");
		const data = JSON.parse(raw) as IndexFile;
		if (!data || !Array.isArray(data.entries)) return { version: 1, entries: [] };
		return { version: data.version ?? 1, entries: data.entries };
	} catch {
		return { version: 1, entries: [] };
	}
}

async function writeIndex(storeRoot: string, index: IndexFile): Promise<void> {
	await fs.mkdir(storeRoot, { recursive: true });
	const tmp = join(storeRoot, `._index.${process.pid}.tmp`);
	await fs.writeFile(tmp, JSON.stringify(index, null, 2), "utf8");
	await fs.rename(tmp, join(storeRoot, "_index.json"));
}

function indexEntryKey(entry: Pick<GraphifyGraphIndexEntry, "dirName" | "slotKey">): string {
	return `${entry.dirName}@${entry.slotKey}`;
}

async function upsertIndexEntry(
	storeRoot: string,
	entry: GraphifyGraphIndexEntry,
): Promise<void> {
	const index = await readIndex(storeRoot);
	const key = indexEntryKey(entry);
	index.entries = index.entries.filter((e) => indexEntryKey(e) !== key);
	index.entries.unshift(entry);
	await writeIndex(storeRoot, index);
}

/** Drop sibling dirty slots for the same HEAD; keep the clean slot and `keepSlotKey`. */
async function pruneOldDirtySlots(
	storeRoot: string,
	purlKey: string,
	headSha: string,
	keepSlotKey: string,
): Promise<void> {
	const purlDir = join(storeRoot, sanitizePurlDirName(purlKey));
	let names: string[];
	try {
		names = await fs.readdir(purlDir);
	} catch {
		return;
	}
	const prefix = `${headSha}+`;
	const index = await readIndex(storeRoot);
	const dirName = sanitizePurlDirName(purlKey);
	let indexChanged = false;
	for (const name of names) {
		if (!name.startsWith(prefix) || name === keepSlotKey) continue;
		try {
			await fs.rm(join(purlDir, name), { recursive: true, force: true });
		} catch {
			/* ignore */
		}
		const before = index.entries.length;
		index.entries = index.entries.filter(
			(e) => !(e.dirName === dirName && e.slotKey === name),
		);
		if (index.entries.length !== before) indexChanged = true;
	}
	if (indexChanged) await writeIndex(storeRoot, index);
}

// ---------------------------------------------------------------------------
// In-flight locks (one extract per purl@slot)
// ---------------------------------------------------------------------------

const inflight = new Map<string, Promise<EnsureGraphifyGraphResult>>();

function inflightKey(
	storeRoot: string,
	purlKey: string,
	slotKey: string,
): string {
	return `${storeRoot}::${sanitizePurlDirName(purlKey)}@${slotKey}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listGraphifyGraphs(
	storeRoot?: string,
): Promise<GraphifyGraphIndexEntry[]> {
	const root = graphifyStoreRoot(storeRoot);
	const index = await readIndex(root);
	return index.entries;
}

export async function getCachedGraphifyGraph(
	purl: string,
	opts?: {
		headSha?: string;
		dirtyHash?: string | null;
		repoRoot?: string;
		storeRoot?: string;
	},
): Promise<{ path: string; meta: GraphifyGraphMeta } | null> {
	const key = purlRepoKey(purl);
	if (!key) return null;
	const root = graphifyStoreRoot(opts?.storeRoot);
	const repoRoot = opts?.repoRoot ?? resolveRepoRootForPurl(purl);
	let headSha = opts?.headSha;
	if (!headSha) {
		if (!repoRoot) return null;
		headSha = gitHeadSha(repoRoot) ?? undefined;
	}
	if (!headSha) return null;

	let dirtyHash: string | null;
	if (opts && "dirtyHash" in opts) {
		dirtyHash = opts.dirtyHash ?? null;
	} else if (repoRoot) {
		dirtyHash = dirtyFingerprint(repoRoot);
	} else {
		dirtyHash = null;
	}

	const path = cachedGraphJsonPath(key, headSha, dirtyHash, root);
	const metaPath = cachedMetaPath(key, headSha, dirtyHash, root);
	if (!existsSync(path) || !existsSync(metaPath)) return null;
	try {
		const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as GraphifyGraphMeta;
		return { path, meta };
	} catch {
		return null;
	}
}

/**
 * Ensure a graphify `graph.json` exists for this purl at the current HEAD
 * (and dirty fingerprint when the working tree differs from HEAD).
 * Cache hit returns immediately; miss runs `--code-only` extract and promotes
 * only `graph.json` into the store slot.
 */
export async function ensureGraphifyGraph(
	opts: EnsureGraphifyGraphOptions,
): Promise<EnsureGraphifyGraphResult> {
	const started = performance.now();
	const purl = opts.purl.trim();
	const key = purlRepoKey(purl);
	if (!key) {
		return { ok: false, error: "invalid or empty purl", durationMs: performance.now() - started };
	}

	const storeRoot = graphifyStoreRoot(opts.storeRoot);
	const repoRoot = opts.repoRoot?.trim() || resolveRepoRootForPurl(purl);
	if (!repoRoot) {
		return {
			ok: false,
			error: `no local checkout for ${key} — register the repo in Alexandria or pass repoRoot`,
			purl: key,
			durationMs: performance.now() - started,
		};
	}
	if (!existsSync(repoRoot)) {
		return {
			ok: false,
			error: `repo root not found: ${repoRoot}`,
			purl: key,
			durationMs: performance.now() - started,
		};
	}

	const headSha = gitHeadSha(repoRoot);
	if (!headSha) {
		return {
			ok: false,
			error: `could not read git HEAD in ${repoRoot}`,
			purl: key,
			durationMs: performance.now() - started,
		};
	}

	const dirtyHash = dirtyFingerprint(repoRoot);
	const slotKey = cacheSlotKey(headSha, dirtyHash);

	const lockKey = inflightKey(storeRoot, key, slotKey);
	const existing = inflight.get(lockKey);
	if (existing) {
		return existing;
	}

	const work = doEnsure({
		...opts,
		purl: key,
		purlKey: key,
		repoRoot,
		headSha,
		dirtyHash,
		slotKey,
		storeRoot,
		started,
	});
	inflight.set(lockKey, work);
	try {
		return await work;
	} finally {
		inflight.delete(lockKey);
	}
}

async function doEnsure(ctx: {
	purl: string;
	purlKey: string;
	repoRoot: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	storeRoot: string;
	force?: boolean;
	bin?: string;
	started: number;
}): Promise<EnsureGraphifyGraphResult> {
	const graphPath = cachedGraphJsonPath(
		ctx.purlKey,
		ctx.headSha,
		ctx.dirtyHash,
		ctx.storeRoot,
	);
	const metaPath = cachedMetaPath(
		ctx.purlKey,
		ctx.headSha,
		ctx.dirtyHash,
		ctx.storeRoot,
	);

	if (!ctx.force && existsSync(graphPath) && existsSync(metaPath)) {
		try {
			const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as GraphifyGraphMeta;
			loadGraphifyGraph(graphPath);
			return {
				ok: true,
				status: "hit",
				purl: ctx.purl,
				purlKey: ctx.purlKey,
				headSha: ctx.headSha,
				dirtyHash: ctx.dirtyHash,
				slotKey: ctx.slotKey,
				repoRoot: ctx.repoRoot,
				graphJsonPath: graphPath,
				meta,
				nodeCount: meta.nodeCount,
				edgeCount: meta.edgeCount,
				durationMs: performance.now() - ctx.started,
			};
		} catch {
			// fall through and rebuild
		}
	}

	const extract = await runGraphifyExtract({
		repoRoot: ctx.repoRoot,
		bin: ctx.bin,
		codeOnly: true,
		cleanupTempOnFailure: true,
	});
	if (!extract.ok) {
		return {
			ok: false,
			error: extract.error,
			purl: ctx.purl,
			durationMs: performance.now() - ctx.started,
		};
	}

	try {
		await fs.mkdir(
			cacheSlotDir(ctx.purlKey, ctx.headSha, ctx.dirtyHash, ctx.storeRoot),
			{ recursive: true },
		);
		promoteGraphJson(extract.outDir, graphPath);
		if (extract.usedTempOut) {
			try {
				rmSync(extract.outDir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}

		const graph = loadGraphifyGraph(graphPath);
		const meta: GraphifyGraphMeta = {
			purl: ctx.purl,
			purlKey: ctx.purlKey,
			headSha: ctx.headSha,
			dirtyHash: ctx.dirtyHash,
			slotKey: ctx.slotKey,
			repoRoot: ctx.repoRoot,
			builtAt: new Date().toISOString(),
			nodeCount: graph.nodes.length,
			edgeCount: edgeCount(graph),
			builtAtCommit:
				typeof graph.built_at_commit === "string" ? graph.built_at_commit : ctx.headSha,
		};
		await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");

		const dirName = sanitizePurlDirName(ctx.purlKey);
		await upsertIndexEntry(ctx.storeRoot, {
			purl: ctx.purl,
			purlKey: ctx.purlKey,
			dirName,
			headSha: ctx.headSha,
			dirtyHash: ctx.dirtyHash,
			slotKey: ctx.slotKey,
			repoRoot: ctx.repoRoot,
			builtAt: meta.builtAt,
			nodeCount: meta.nodeCount,
			edgeCount: meta.edgeCount,
			graphJsonPath: graphPath,
		});

		if (ctx.dirtyHash) {
			await pruneOldDirtySlots(
				ctx.storeRoot,
				ctx.purlKey,
				ctx.headSha,
				ctx.slotKey,
			);
		}

		return {
			ok: true,
			status: "built",
			purl: ctx.purl,
			purlKey: ctx.purlKey,
			headSha: ctx.headSha,
			dirtyHash: ctx.dirtyHash,
			slotKey: ctx.slotKey,
			repoRoot: ctx.repoRoot,
			graphJsonPath: graphPath,
			meta,
			nodeCount: meta.nodeCount,
			edgeCount: meta.edgeCount,
			durationMs: performance.now() - ctx.started,
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
			purl: ctx.purl,
			durationMs: performance.now() - ctx.started,
		};
	}
}

/** Load the cached graph document (nodes/links) for a successful ensure result. */
export function readEnsuredGraph(path: string): GraphifyGraphSmoke {
	return loadGraphifyGraph(path);
}

export type GraphifyRepoRunStatus = "ready" | "missing" | "building";

export interface GraphifyRepoEntry {
	path: string;
	owner: string;
	name: string;
	/** Always a GitHub purl (`pkg:github/owner/name`). */
	purl: string;
	headSha: string;
	dirtyHash: string | null;
	slotKey: string;
	/** ready = cache matches current HEAD(+dirty); building = ensure in flight; missing = needs a run. */
	status: GraphifyRepoRunStatus;
	cached: {
		slotKey: string;
		nodeCount: number;
		edgeCount: number;
		builtAt: string;
		graphJsonPath: string;
		matchesCurrent: boolean;
	} | null;
}

function repoEntryScore(entry: GraphifyRepoEntry): number {
	let score = 0;
	if (entry.status === "ready") score += 100;
	else if (entry.status === "building") score += 75;
	else if (entry.status === "missing") score += 50;
	if (entry.cached?.matchesCurrent) score += 20;
	else if (entry.cached) score += 10;
	// Prefer the checkout that still exists and is a usable git root.
	if (existsSync(entry.path)) score += 5;
	// Prefer shorter paths when Alexandria registered both a root and a nested clone.
	score -= Math.min(entry.path.length, 500) / 1000;
	return score;
}

/**
 * Alexandria GitHub repos crossed with the graphify cache for the current
 * working tree. Only `pkg:github/…` identities; one row per purl (best checkout
 * wins when Alexandria has duplicates).
 */
export async function listGraphifyRepos(
	storeRoot?: string,
	buildingPurls?: ReadonlySet<string>,
): Promise<GraphifyRepoEntry[]> {
	const root = graphifyStoreRoot(storeRoot);
	const index = await readIndex(root);
	const cacheByPurl = new Map<string, GraphifyGraphIndexEntry[]>();
	for (const entry of index.entries) {
		const list = cacheByPurl.get(entry.purlKey) ?? [];
		list.push(entry);
		cacheByPurl.set(entry.purlKey, list);
	}

	const bestByPurl = new Map<string, GraphifyRepoEntry>();

	for (const [, info] of loadAlexandriaRepos()) {
		const owner = info.owner?.trim();
		const name = info.repo?.trim();
		if (!owner || !name) continue;
		if (!existsSync(info.root)) continue;

		const purlKey = purlRepoKey(`pkg:github/${owner}/${name}`);
		if (!purlKey) continue;

		const headSha = gitHeadSha(info.root);
		if (!headSha) continue; // not a usable git checkout

		const dirtyHash = dirtyFingerprint(info.root);
		const slotKey = cacheSlotKey(headSha, dirtyHash);

		const want = purlKey.toLowerCase();
		const candidates =
			cacheByPurl.get(purlKey) ??
			[...cacheByPurl.entries()].find(([k]) => k.toLowerCase() === want)?.[1] ??
			[];

		const currentPath = cachedGraphJsonPath(purlKey, headSha, dirtyHash, root);
		const currentMetaPath = cachedMetaPath(purlKey, headSha, dirtyHash, root);
		let cached: GraphifyRepoEntry["cached"] = null;
		if (existsSync(currentPath) && existsSync(currentMetaPath)) {
			try {
				const meta = JSON.parse(
					await fs.readFile(currentMetaPath, "utf8"),
				) as GraphifyGraphMeta;
				cached = {
					slotKey,
					nodeCount: meta.nodeCount,
					edgeCount: meta.edgeCount,
					builtAt: meta.builtAt,
					graphJsonPath: currentPath,
					matchesCurrent: true,
				};
			} catch {
				/* treat as missing */
			}
		} else if (candidates.length > 0) {
			const latest = candidates[0]!;
			cached = {
				slotKey: latest.slotKey,
				nodeCount: latest.nodeCount,
				edgeCount: latest.edgeCount,
				builtAt: latest.builtAt,
				graphJsonPath: latest.graphJsonPath,
				matchesCurrent: false,
			};
		}

		const entry: GraphifyRepoEntry = {
			path: info.root,
			owner,
			name,
			purl: purlKey,
			headSha,
			dirtyHash,
			slotKey,
			status: buildingPurls?.has(purlKey)
				? "building"
				: cached?.matchesCurrent
					? "ready"
					: "missing",
			cached,
		};

		const prev = bestByPurl.get(want);
		if (!prev || repoEntryScore(entry) > repoEntryScore(prev)) {
			bestByPurl.set(want, entry);
		}
	}

	return [...bestByPurl.values()].sort((a, b) => {
		const an = `${a.owner}/${a.name}`.toLowerCase();
		const bn = `${b.owner}/${b.name}`.toLowerCase();
		return an.localeCompare(bn);
	});
}
