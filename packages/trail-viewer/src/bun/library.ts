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
