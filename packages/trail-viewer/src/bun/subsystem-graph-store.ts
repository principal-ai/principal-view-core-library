/**
 * Persistent storage for subsystem component graphs.
 *
 * Layout: `~/.principal/subsystem-graphs/<id>.json` + `_index.json`
 * mirrors the trail/topic conventions. Each file is a
 * `StoredSubsystemGraph` record; the index is a lightweight cache for
 * listing without full-file parsing.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".principal", "subsystem-graphs");
const INDEX_PATH = join(ROOT, "_index.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A component node — the named unit, kind-tagged; `file` is its location. */
export interface SubsystemComponent {
	id: string;
	name: string;
	kind: string;
	file: string;
	purl: string;
	purpose?: string;
	symbol?: string;
	layer?: number;
	capture?: "edited" | "analyzed" | "referenced";
}

/** A cross-component edge in the subsystem graph. */
export interface SubsystemComponentEdge {
	id: string;
	from: string;
	to: string;
	mechanism: string;
	refs?: string[];
}

/** The full graph document — components + edges. */
export interface SubsystemGraphDocument {
	components: SubsystemComponent[];
	edges: SubsystemComponentEdge[];
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
// Helpers
// ---------------------------------------------------------------------------

function graphId(): string {
	const ts = Date.now();
	const rand = Math.random().toString(36).slice(2, 11);
	return `sg-${ts}-${rand}`;
}

function graphPath(id: string): string {
	return join(ROOT, `${id}.json`);
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
	doc: SubsystemGraphDocument & { title: string; description?: string; source?: string; repo?: { owner: string; name: string } },
): Promise<StoredSubsystemGraph> {
	await ensureDir();
	const now = new Date().toISOString();
	const record: StoredSubsystemGraph = {
		...doc,
		id: graphId(),
		createdAt: now,
		updatedAt: now,
	};
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
	return record;
}

/** Update an existing subsystem graph. Returns the updated record, or null if not found. */
export async function updateSubsystemGraph(
	id: string,
	patch: Partial<Pick<StoredSubsystemGraph, "title" | "description" | "components" | "edges" | "source" | "repo">>,
): Promise<StoredSubsystemGraph | null> {
	const existing = await getSubsystemGraph(id);
	if (!existing) return null;
	const updated: StoredSubsystemGraph = {
		...existing,
		...patch,
		updatedAt: new Date().toISOString(),
	};
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
	return updated;
}

/** Delete a subsystem graph. Returns true if deleted. */
export async function deleteSubsystemGraph(id: string): Promise<boolean> {
	try {
		await fs.unlink(graphPath(id));
		await removeIndexEntry(id);
		return true;
	} catch {
		return false;
	}
}
