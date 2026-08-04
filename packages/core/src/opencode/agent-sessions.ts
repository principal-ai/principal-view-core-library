import {
  ClineSessionReader,
  type UniversalAgentSessionEvent,
} from "@principal-ai/agent-monitoring";
import { OpenCodeEventStore } from "./OpenCodeEventStore";
import {
  NodePathNormalizationAdapter,
  accumulateEvents,
  collectRepositories,
  normalizeEvents,
  normalizeEventsWithAdapter,
  opencodeRowsToUniversalEvents,
} from "./pipeline";

export {
  NodePathNormalizationAdapter,
  normalizeEvents,
  normalizeEventsWithAdapter,
  accumulateEvents,
  collectRepositories,
};

/**
 * Shared, agent-agnostic session access: list + fetch across Cline and opencode,
 * normalizing raw events into repo-aware universal events.
 *
 * This is the single source of truth for CLI and trail-viewer session pulling.
 * opencode listing delegates to `OpenCodeEventStore.listSessionsWithSummaries()`,
 * which already builds parent/child groups and excludes subagent (child) sessions
 * from the standalone list.
 */

export interface AgentSessionSummary {
  agent: "cline" | "opencode" | "unknown";
  sessionId: string;
  title: string;
  createdAt: string;
  eventCount: number;
  isFinished: boolean;
  parentID?: string;
}

const clineReader = new ClineSessionReader();

function isClineSession(sessionId: string): boolean {
  return clineReader.readSession(sessionId) !== null;
}

/** List Cline CLI sessions from the durable on-disk transcript. */
function listClineSessions(): AgentSessionSummary[] {
  return clineReader.listSessions().map((record) => {
    const meta = record.metadata;
    const promptText = (meta.prompt ?? "").trim();
    const title =
      promptText.length > 0
        ? promptText.length > 80
          ? `${promptText.slice(0, 80)}…`
          : promptText
        : "Cline session";
    return {
      agent: "cline",
      sessionId: record.sessionId,
      title,
      createdAt: meta.started_at ?? "",
      eventCount: clineReader.readMessages(record.sessionId)?.messages.length ?? 0,
      isFinished: meta.status === "completed" || meta.status === "failed",
    };
  });
}

/**
 * List opencode sessions, top-level only by default. Delegates to the store's
 * grouped `listSessionsWithSummaries()` which excludes subagent (child) sessions.
 */
function listOpencodeSessions(dbPath?: string): AgentSessionSummary[] {
  const store = new OpenCodeEventStore({ dbPath });
  try {
    const result = store.listSessionsWithSummaries(50);
    const toSummary = (s: {
      id: string;
      title: string;
      createdAt: string;
      eventCount: number;
      isFinished: boolean;
    }): AgentSessionSummary => ({
      agent: "opencode",
      sessionId: s.id,
      title: s.title,
      createdAt: s.createdAt,
      eventCount: s.eventCount,
      isFinished: s.isFinished,
    });
    const standalone: AgentSessionSummary[] = [
      ...result.standalone.map(toSummary),
      ...result.groups.map((g) => toSummary(g.parent)),
    ];
    // Sort newest-first by createdAt
    return standalone.sort((a, b) =>
      b.createdAt < a.createdAt ? -1 : b.createdAt > a.createdAt ? 1 : 0,
    );
  } finally {
    store.close();
  }
}

/** List sessions from all supported agents. Top-level only by default. */
export function listAgentSessions(
  options: { dbPath?: string } = {},
): AgentSessionSummary[] {
  const all: AgentSessionSummary[] = [];
  let opencodeError: Error | null = null;
  try {
    all.push(...listOpencodeSessions(options.dbPath));
  } catch (err) {
    opencodeError = err as Error;
  }
  try {
    all.push(...enrichClineSummaries());
  } catch (err) {
    if (!opencodeError) opencodeError = err as Error;
  }
  if (all.length === 0 && opencodeError) {
    throw opencodeError;
  }
  return all;
}

/** Detect which agent a session id belongs to. */
export function detectAgent(sessionId: string): "cline" | "opencode" {
  return isClineSession(sessionId) ? "cline" : "opencode";
}

/**
 * Fetch a session's raw universal events from the appropriate source.
 */
export function fetchRawEvents(
  sessionId: string,
  options: { agent?: "cline" | "opencode"; dbPath?: string } = {},
): { agent: "cline" | "opencode"; events: UniversalAgentSessionEvent[] } {
  const agent = options.agent ?? detectAgent(sessionId);
  if (agent === "cline") {
    return { agent, events: clineReader.toUniversalEvents(sessionId) };
  }
  const store = new OpenCodeEventStore({ dbPath: options.dbPath });
  try {
    const { events } = store.readAggregate(sessionId, { limit: 10000 });
    return { agent, events: opencodeRowsToUniversalEvents(events) };
  } finally {
    store.close();
  }
}

function enrichClineSummaries(): AgentSessionSummary[] {
  // Cline reads come from the durable transcript with no subagent marker today.
  return listClineSessions();
}
