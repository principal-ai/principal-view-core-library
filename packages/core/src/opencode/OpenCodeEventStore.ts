import Database from "better-sqlite3"
import type {
  OpenCodeRawEvent,
  OpenCodeSessionEvents,
  OpenCodeEventRetriever,
  OpenCodeStoreOptions,
  SessionSummary,
  SessionListResult,
} from "./types"

export function defaultOpenCodeDBPath(): string {
  if (process.env.OPENCODE_DATA_DIR) return `${process.env.OPENCODE_DATA_DIR}/opencode/opencode.db`
  const home = process.env.HOME || process.env.USERPROFILE || "/root"
  const xdgData = process.env.XDG_DATA_HOME || `${home}/.local/share`
  return `${xdgData}/opencode/opencode.db`
}

export class OpenCodeEventStore implements OpenCodeEventRetriever {
  private db: Database.Database

  constructor(options?: OpenCodeStoreOptions) {
    const path = options?.dbPath ?? defaultOpenCodeDBPath()
    this.db = new Database(path, { readonly: true })
  }

  readAggregate(
    sessionId: string,
    options?: { after?: number; limit?: number }
  ): OpenCodeSessionEvents {
    const after = options?.after ?? -1
    const limit = options?.limit ?? 1000

    const rows = this.db
      .prepare(
        "SELECT id, aggregate_id, seq, type, data FROM event WHERE aggregate_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?"
      )
      .all(sessionId, after, limit + 1) as Array<{
      id: string
      aggregate_id: string
      seq: number
      type: string
      data: string
    }>

    const page = rows.slice(0, limit)
    const events: OpenCodeRawEvent[] = page.map((row) => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      seq: row.seq,
      type: row.type,
      data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
    }))

    return {
      sessionId,
      events,
      hasMore: rows.length > limit,
    }
  }

  listSessionIds(limit?: number): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT aggregate_id FROM event ORDER BY aggregate_id LIMIT ?")
      .all(limit ?? 50) as Array<{ aggregate_id: string }>
    return rows.map((r) => r.aggregate_id)
  }

  listSessionsWithSummaries(limit?: number): SessionListResult {
    const effectiveLimit = limit ?? 50

    const firstEvents = this.db
      .prepare(
        `SELECT e.aggregate_id, e.data,
          (SELECT COUNT(*) FROM event WHERE aggregate_id = e.aggregate_id) AS event_count
        FROM event e
        WHERE e.seq = (SELECT MIN(e2.seq) FROM event e2 WHERE e2.aggregate_id = e.aggregate_id)
        ORDER BY e.seq DESC
        LIMIT ?`
      )
      .all(effectiveLimit) as Array<{ aggregate_id: string; data: string; event_count: number }>

    const idToSummary = new Map<string, SessionSummary>()
    for (const row of firstEvents) {
      let title = row.aggregate_id.slice(0, 12)
      let createdAt = ""
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>
        const info = parsed["info"] as Record<string, unknown> | undefined
        const rawTitle = info?.["title"]
        if (typeof rawTitle === "string") {
          title = rawTitle
        }
        const rawTime = info?.["time"] as Record<string, unknown> | undefined
        const rawCreated = rawTime?.["created"]
        if (typeof rawCreated === "number") {
          createdAt = new Date(rawCreated).toISOString()
        }
      } catch {
        // best-effort parse
      }
      idToSummary.set(row.aggregate_id, { id: row.aggregate_id, title, createdAt, eventCount: row.event_count, children: [] })
    }

    const relations = this.db
      .prepare(
        `SELECT DISTINCT
          json_extract(data, '$.part.state.metadata.parentSessionId') AS parent_id,
          json_extract(data, '$.part.state.metadata.sessionId') AS child_id
        FROM event
        WHERE json_extract(data, '$.part.type') = 'tool'
          AND json_extract(data, '$.part.tool') = 'task'
          AND json_extract(data, '$.part.state.metadata.sessionId') IS NOT NULL`
      )
      .all() as Array<{ parent_id: string; child_id: string }>

    const childIds = new Set<string>()
    for (const rel of relations) {
      if (!rel.parent_id || !rel.child_id) continue
      const parent = idToSummary.get(rel.parent_id)
      const child = idToSummary.get(rel.child_id)
      if (parent && child) {
        childIds.add(rel.child_id)
        parent.children.push(child)
      }
    }

    const groups: SessionListResult["groups"] = []
    const standalone: SessionSummary[] = []
    for (const summary of idToSummary.values()) {
      if (childIds.has(summary.id)) continue
      if (summary.children.length > 0) {
        groups.push({ parent: { ...summary, children: [] }, children: summary.children })
      } else {
        standalone.push(summary)
      }
    }

    return { groups, standalone }
  }

  close(): void {
    this.db.close()
  }
}
