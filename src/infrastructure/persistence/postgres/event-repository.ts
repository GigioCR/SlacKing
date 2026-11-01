import type { EventRepository } from '../../../application/ports/event-repository'
import type { AgentEvent, EventCursor } from '../../../domain/agent-event'
import type { Pool } from './pool'

// Table defined in migrations/001_initial.sql.

interface EventRow {
  id: string
  kind: AgentEvent['kind']
  session_id: string
  session_title: string
  project: string
  summary: string
  received_at: Date
}

function toEvent(row: EventRow): AgentEvent {
  return {
    id: row.id,
    kind: row.kind,
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    project: row.project,
    summary: row.summary,
    receivedAt: row.received_at,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly pool: Pool) {}

  async add(event: AgentEvent): Promise<void> {
    await this.pool.query(
      `insert into agent_events (id, kind, session_id, session_title, project, summary, received_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [event.id, event.kind, event.sessionId, event.sessionTitle, event.project, event.summary, event.receivedAt],
    )
  }

  async get(id: string): Promise<AgentEvent | null> {
    // Anything but a uuid is not in the table, and Postgres would reject comparing it.
    if (!UUID.test(id)) return null
    const { rows } = await this.pool.query<EventRow>('select * from agent_events where id = $1', [id])
    return rows[0] ? toEvent(rows[0]) : null
  }

  async listPage(after: EventCursor | null, limit: number): Promise<AgentEvent[]> {
    if (!after) {
      const { rows } = await this.pool.query<EventRow>(
        'select * from agent_events order by received_at desc, id desc limit $1',
        [limit],
      )
      return rows.map(toEvent)
    }
    // A cursor this table can't have produced points nowhere.
    if (!UUID.test(after.id)) return []
    // Row comparison: strictly older, or the same time with a smaller id.
    const { rows } = await this.pool.query<EventRow>(
      `select * from agent_events
       where (received_at, id) < ($1, $2::uuid)
       order by received_at desc, id desc
       limit $3`,
      [after.receivedAt, after.id, limit],
    )
    return rows.map(toEvent)
  }

  async count(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>('select count(*) as n from agent_events')
    return Number(rows[0]?.n ?? 0)
  }

  async delete(id: string): Promise<boolean> {
    if (!UUID.test(id)) return false
    const result = await this.pool.query('delete from agent_events where id = $1', [id])
    return (result.rowCount ?? 0) > 0
  }

  async deleteUpTo(upTo: Date): Promise<number> {
    const result = await this.pool.query('delete from agent_events where received_at <= $1', [upTo])
    return result.rowCount ?? 0
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    const result = await this.pool.query('delete from agent_events where received_at < $1', [cutoff])
    return result.rowCount ?? 0
  }
}
