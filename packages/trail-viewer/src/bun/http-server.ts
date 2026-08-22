/**
 * HTTP server for agent ↔ trail-viewer communication.
 *
 * Runs alongside the Unix socket IPC server on a configurable port
 * (default 3045, override via `TRAIL_VIEWER_HTTP_PORT`). Provides a
 * REST API for subsystem graphs so agents can POST diagrams, list
 * stored graphs, and request them to be opened in tabs.
 *
 * Uses Bun.serve — zero new dependencies.
 */

import {
	createSubsystemGraph,
	getSubsystemGraph,
	listSubsystemGraphs,
	updateSubsystemGraph,
	type SubsystemGraphDocument,
} from "./subsystem-graph-store";

const PORT = Number(process.env["TRAIL_VIEWER_HTTP_PORT"] ?? 3045);

/** Callback invoked when an agent requests a graph be opened in a tab. */
export type OpenGraphTabHandler = (id: string) => Promise<{ ok: boolean; error?: string; tabId?: string }>;

/** Callback invoked when an agent deletes a graph (bridged so the host can
 *  close tabs rendering it before the record disappears). */
export type DeleteGraphHandler = (id: string) => Promise<{ ok: boolean; error?: string }>;

let server: ReturnType<typeof Bun.serve> | null = null;

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
	});
}

function error(message: string, status = 400): Response {
	return json({ ok: false, error: message }, status);
}

async function parseBody(req: Request): Promise<unknown> {
	try {
		return await req.json();
	} catch {
		return null;
	}
}

/**
 * Route handler for subsystem graph API requests.
 *
 * Handles CRUD operations on subsystem graphs and opens graphs in tabs.
 * Called by the HTTP server's fetch callback.
 */
export async function handleSubsystemGraphRequest(
	req: Request,
	onOpenTab: OpenGraphTabHandler,
	onDeleteGraph: DeleteGraphHandler,
): Promise<Response> {
	const url = new URL(req.url);
	const path = url.pathname;
	const method = req.method;

	// CORS preflight
	if (method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type",
			},
		});
	}

	// Health check
	if (path === "/health" && method === "GET") {
		return json({ status: "ok" });
	}

	// --- Subsystem graphs ---

	// List all graphs
	if (path === "/api/subsystem-graph" && method === "GET") {
		const graphs = await listSubsystemGraphs();
		return json({ ok: true, graphs });
	}

	// Create a new graph
	if (path === "/api/subsystem-graph" && method === "POST") {
		const body = (await parseBody(req)) as Record<string, unknown> | null;
		if (!body) return error("Invalid JSON body");
		if (!body["title"] || typeof body["title"] !== "string") return error("title is required");
		if (!Array.isArray(body["components"])) return error("components array is required");
		if (!Array.isArray(body["edges"])) return error("edges array is required");

		const record = await createSubsystemGraph({
			title: body["title"] as string,
			description: typeof body["description"] === "string" ? body["description"] : undefined,
			components: body["components"] as SubsystemGraphDocument["components"],
			edges: body["edges"] as SubsystemGraphDocument["edges"],
			source: typeof body["source"] === "string" ? body["source"] : undefined,
			repo: body["repo"] as { owner: string; name: string } | undefined,
		});
		return json({ ok: true, graph: record }, 201);
	}

	// Get / Open / Update / Delete by id
	const graphMatch = path.match(/^\/api\/subsystem-graph\/([^/]+)$/);
	if (graphMatch) {
		const id = graphMatch[1];

		if (method === "GET") {
			const graph = await getSubsystemGraph(id);
			if (!graph) return error("Graph not found", 404);
			return json({ ok: true, graph });
		}

		if (method === "PUT") {
			const body = (await parseBody(req)) as Record<string, unknown> | null;
			if (!body) return error("Invalid JSON body");
			const updated = await updateSubsystemGraph(id, body as Parameters<typeof updateSubsystemGraph>[1]);
			if (!updated) return error("Graph not found", 404);
			return json({ ok: true, graph: updated });
		}

		if (method === "DELETE") {
			const deleted = await onDeleteGraph(id);
			if (!deleted) return error("Graph not found", 404);
			return json({ ok: true });
		}
	}

	// Open a graph in a tab
	if (path === "/api/subsystem-graph/open" && method === "POST") {
		const body = (await parseBody(req)) as { id?: string } | null;
		if (!body?.id) return error("id is required");
		const result = await onOpenTab(body.id);
		return json(result);
	}

	return error("Not found", 404);
}

/**
 * Start the HTTP server. `onOpenTab` is called when an agent wants to open
 * a graph in the viewer (the host bridges it to the renderer via RPC).
 */
export function startHttpServer(onOpenTab: OpenGraphTabHandler, onDeleteGraph: DeleteGraphHandler): void {
	server = Bun.serve({
		port: PORT,
		hostname: "127.0.0.1",
		async fetch(req) {
			return handleSubsystemGraphRequest(req, onOpenTab, onDeleteGraph);
		},
	});

	console.log(`[trail-viewer] HTTP server listening at http://127.0.0.1:${PORT}`);
}

/** Stop the HTTP server (called on SIGINT/SIGTERM). */
export function stopHttpServer(): void {
	server?.stop();
	server = null;
}
