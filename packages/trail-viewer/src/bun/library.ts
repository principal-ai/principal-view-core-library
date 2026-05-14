/**
 * Walks the trail JSON cache (`~/.principal/trails/...`) to power the library
 * tab. Reads enough of each cached file to extract title and repo identity;
 * skips full payload parsing for files we'll only show metadata for.
 *
 * Layout matches `packages/cli/src/lib/trail-cache.ts`:
 *   - `~/.principal/trails/by-id/<id>.json` — fallback for trails we can't
 *     anchor to a Purl.
 *   - `~/.principal/trails/<purl-namespace>/<purl-name>/<id>.json` — primary.
 */

import { existsSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface LibraryEntry {
	trailFile: string;
	id: string;
	title: string;
	anchor: string; // "<ns>/<name>" or "by-id"
	owner?: string;
	repo?: string;
	/**
	 * For local-purl trails (`pkg:generic/local/<slug>`) whose decoded slug
	 * resolves to an existing directory on disk. When set, clicking the entry
	 * in the library tab opens the trail in `local` mode anchored here, so
	 * slice resolution reads from the working tree instead of trying to fetch
	 * from GitHub (which would fail — local trails carry no `repos[].remote`).
	 */
	localRepoRoot?: string;
	mtimeMs: number;
}

const ROOT = join(homedir(), ".principal", "trails");

export async function walkLibrary(): Promise<LibraryEntry[]> {
	const entries: LibraryEntry[] = [];
	let topLevel;
	try {
		topLevel = await fs.readdir(ROOT, { withFileTypes: true });
	} catch {
		return entries;
	}

	for (const ns of topLevel) {
		if (!ns.isDirectory()) continue;
		const nsDir = join(ROOT, ns.name);
		if (ns.name === "by-id") {
			await collectFlat(nsDir, "by-id", entries);
			continue;
		}
		// hierarchical: `<ns>/<name>/<id>.json`
		let names;
		try {
			names = await fs.readdir(nsDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const name of names) {
			if (!name.isDirectory()) continue;
			await collectFlat(
				join(nsDir, name.name),
				`${ns.name}/${name.name}`,
				entries,
			);
		}
	}

	entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return entries;
}

async function collectFlat(
	dir: string,
	anchor: string,
	out: LibraryEntry[],
): Promise<void> {
	let files;
	try {
		files = await fs.readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const f of files) {
		if (!f.isFile() || !f.name.endsWith(".json")) continue;
		const trailFile = join(dir, f.name);
		const id = f.name.replace(/\.json$/, "");
		try {
			const stat = await fs.stat(trailFile);
			const meta = await readMetadata(trailFile);
			out.push({
				trailFile,
				id,
				title: meta.title ?? id,
				anchor,
				owner: meta.owner,
				repo: meta.repo,
				localRepoRoot: localRepoRootFromAnchor(anchor),
				mtimeMs: stat.mtimeMs,
			});
		} catch {
			// best-effort: a malformed file shouldn't break the whole listing
		}
	}
}

interface CachedMetadata {
	title?: string;
	owner?: string;
	repo?: string;
}

async function readMetadata(path: string): Promise<CachedMetadata> {
	const raw = await fs.readFile(path, "utf8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (typeof parsed !== "object" || parsed === null) return {};
	const obj = parsed as Record<string, unknown>;

	// web-ade wrapper: { entry, owner, repo, payload }.
	const wrapperOwner = typeof obj["owner"] === "string" ? (obj["owner"] as string) : undefined;
	const wrapperRepo = typeof obj["repo"] === "string" ? (obj["repo"] as string) : undefined;
	const inner =
		typeof obj["payload"] === "object" && obj["payload"] !== null
			? (obj["payload"] as Record<string, unknown>)
			: obj;

	const title =
		(typeof inner["title"] === "string" ? (inner["title"] as string) : undefined) ??
		(typeof (obj["entry"] as { title?: unknown } | undefined)?.title === "string"
			? ((obj["entry"] as { title: string }).title)
			: undefined);

	let owner = wrapperOwner;
	let repo = wrapperRepo;
	if (!owner || !repo) {
		const repos = inner["repos"];
		if (Array.isArray(repos) && repos.length > 0) {
			const remote = (repos[0] as { remote?: { owner?: unknown; name?: unknown } }).remote;
			if (typeof remote?.owner === "string") owner = remote.owner;
			if (typeof remote?.name === "string") repo = remote.name;
		}
	}

	return { title, owner, repo };
}

/**
 * Decode a `local/<slug>` cache anchor back to a working-tree path on disk.
 *
 * The cache writes local trails under `~/.principal/trails/local/<slug>/<id>.json`,
 * where `<slug>` is the abs repo path with `/` replaced by `-` (per
 * `encodePathForPurl` from `@principal-ai/alexandria-core-library`). That
 * encoding is lossy because real path segments can also contain `-`
 * (`web-ade`, `industry-themed-file-city-panels`), so we recover the original
 * by walking the filesystem: at each dash boundary, try the next slash
 * position only if the resulting prefix is an actual directory. Branches that
 * don't exist prune immediately, so this is cheap in practice.
 *
 * Anchor-driven rather than payload-driven on purpose — older trails (pre-
 * `repos[]` schema) carry only `authoredAt.sha` and no repo identity in the
 * payload, but they still land in `local/<slug>/` because the host that
 * authored them used the per-repo cache layout. The directory is the
 * authoritative signal that "this trail belongs to a working tree on disk."
 *
 * Returns `undefined` for non-local anchors and for slugs that don't resolve
 * to any directory. Callers should treat `undefined` as "fall back to remote
 * mode."
 */
function localRepoRootFromAnchor(anchor: string): string | undefined {
	const prefix = "local/";
	if (!anchor.startsWith(prefix)) return undefined;
	const slug = anchor.slice(prefix.length);
	if (!slug) return undefined;
	const parts = slug.split("-");
	return walkExistingPrefix("/", parts);
}

function walkExistingPrefix(prefix: string, parts: string[]): string | undefined {
	if (parts.length === 0) {
		return isExistingDirectory(prefix) ? prefix : undefined;
	}
	for (let i = 1; i <= parts.length; i++) {
		const segment = parts.slice(0, i).join("-");
		const next = prefix === "/" ? `/${segment}` : `${prefix}/${segment}`;
		if (!isExistingDirectory(next)) continue;
		const result = walkExistingPrefix(next, parts.slice(i));
		if (result) return result;
	}
	return undefined;
}

function isExistingDirectory(path: string): boolean {
	try {
		return existsSync(path) && statSync(path).isDirectory();
	} catch {
		return false;
	}
}
