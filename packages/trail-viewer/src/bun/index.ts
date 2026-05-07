/**
 * Trail viewer host (bun process).
 *
 * Receives a trail file path via argv[2] (or TRAIL_FILE env), optional repo
 * root via argv[3] (or TRAIL_REPO_ROOT env, default cwd), and exposes a tiny
 * RPC surface to the mainview so it can render the trail and resolve slice
 * snippets from the user's working tree.
 *
 * Replaces the prior OTEL events manager prototype; see git history if you
 * need that back.
 */

import { BrowserView, BrowserWindow, type RPCSchema } from "electrobun/bun";
import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// CLI args / env
// ---------------------------------------------------------------------------

function resolveTrailFilePath(): string | null {
	const argPath = process.argv[2];
	const envPath = process.env["TRAIL_FILE"];
	const raw = argPath ?? envPath ?? null;
	if (!raw) return null;
	return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
}

function resolveRepoRoot(trailFilePath: string | null): string {
	const argRoot = process.argv[3];
	const envRoot = process.env["TRAIL_REPO_ROOT"];
	const raw = argRoot ?? envRoot;
	if (raw) return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
	// Sensible default: parent dir of the trail file. Lets `principal-ai trail
	// view` drop a json next to a repo and have things "just work".
	if (trailFilePath) return dirname(trailFilePath);
	return process.cwd();
}

const trailFilePath = resolveTrailFilePath();
const repoRoot = resolveRepoRoot(trailFilePath);

// Pre-load the payload so getInitialTrail returns synchronously and any parse
// error fails loudly at boot rather than after the window is up.
type LoadedTrail =
	| { ok: true; payload: unknown; path: string }
	| { ok: false; error: string };

let loaded: LoadedTrail;
if (!trailFilePath) {
	loaded = {
		ok: false,
		error:
			"No trail file. Pass a path as the first arg or set TRAIL_FILE=<path>.",
	};
} else {
	try {
		const raw = readFileSync(trailFilePath, "utf8");
		loaded = { ok: true, payload: JSON.parse(raw), path: trailFilePath };
	} catch (err) {
		loaded = {
			ok: false,
			error: `Failed to load ${trailFilePath}: ${(err as Error).message}`,
		};
	}
}

console.log(`[trail-viewer] trail file: ${trailFilePath ?? "(none)"}`);
console.log(`[trail-viewer] repo root:  ${repoRoot}`);
if (!loaded.ok) console.log(`[trail-viewer] load error: ${loaded.error}`);

// ---------------------------------------------------------------------------
// File reads — sandboxed to repoRoot
// ---------------------------------------------------------------------------

function resolveSandboxed(rawPath: string): string {
	let cleaned = rawPath;
	if (cleaned.startsWith("/")) cleaned = cleaned.slice(1);
	// Strip well-known prefixes the renderer sometimes adds.
	if (cleaned.startsWith("GitHub/")) cleaned = cleaned.slice("GitHub/".length);
	const absolute = resolve(repoRoot, cleaned);
	if (!absolute.startsWith(repoRoot)) {
		throw new Error(`Path escapes repo root: ${rawPath}`);
	}
	return absolute;
}

async function walkFiles(
	root: string,
): Promise<Array<{ path: string; size: number }>> {
	const out: Array<{ path: string; size: number }> = [];
	async function walk(dir: string, rel: string): Promise<void> {
		let entries;
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			if (entry.name.startsWith(".")) continue;
			const full = join(dir, entry.name);
			const relPath = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				await walk(full, relPath);
			} else if (entry.isFile()) {
				try {
					const stat = await fs.stat(full);
					out.push({ path: relPath, size: stat.size });
				} catch {
					// skip unreadable
				}
			}
		}
	}
	await walk(root, "");
	return out;
}

// ---------------------------------------------------------------------------
// RPC schema + handlers
// ---------------------------------------------------------------------------

interface InitialTrailResponse {
	ok: boolean;
	error?: string;
	payload?: unknown;
	repoRoot: string;
	trailFilePath: string | null;
}

type TrailViewerRPC = {
	bun: RPCSchema<{
		requests: {
			getInitialTrail: {
				params: Record<string, never>;
				response: InitialTrailResponse;
			};
			readFile: {
				params: { path: string };
				response: { ok: boolean; content?: string; error?: string };
			};
			getFileTree: {
				params: Record<string, never>;
				response: { files: Array<{ path: string; size: number }> };
			};
		};
		messages: Record<string, never>;
	}>;
	webview: RPCSchema<{
		requests: Record<string, never>;
		messages: Record<string, never>;
	}>;
};

const rpc = BrowserView.defineRPC<TrailViewerRPC>({
	maxRequestTime: 5000,
	handlers: {
		requests: {
			getInitialTrail: () =>
				loaded.ok
					? {
							ok: true,
							payload: loaded.payload,
							repoRoot,
							trailFilePath: loaded.path,
						}
					: {
							ok: false,
							error: loaded.error,
							repoRoot,
							trailFilePath,
						},
			readFile: async ({ path }) => {
				try {
					const absolute = resolveSandboxed(path);
					const content = await fs.readFile(absolute, "utf8");
					return { ok: true, content };
				} catch (err) {
					return { ok: false, error: (err as Error).message };
				}
			},
			getFileTree: async () => {
				const files = await walkFiles(repoRoot);
				return { files };
			},
		},
		messages: {},
	},
});

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

new BrowserWindow({
	title: "Trail Viewer",
	url: "views://mainview/index.html",
	rpc,
	frame: { width: 1200, height: 800, x: 100, y: 100 },
});

console.log("[trail-viewer] window opened");
