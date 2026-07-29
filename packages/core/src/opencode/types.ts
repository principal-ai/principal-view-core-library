export interface OpenCodeRawEvent {
  id: string
  aggregateId: string
  seq: number
  type: string
  data: Record<string, unknown>
}

export interface OpenCodeSessionEvents {
  sessionId: string
  events: OpenCodeRawEvent[]
  hasMore: boolean
}

export interface OpenCodeEventRetriever {
  readAggregate(
    sessionId: string,
    options?: { after?: number; limit?: number }
  ): OpenCodeSessionEvents
}

export interface OpenCodeStoreOptions {
  dbPath?: string
}

export interface SessionSummary {
  id: string
  title: string
  createdAt: string
  eventCount: number
  children: SessionSummary[]
}

export interface SessionListResult {
  groups: Array<{
    parent: SessionSummary
    children: SessionSummary[]
  }>
  standalone: SessionSummary[]
}
