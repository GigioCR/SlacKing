import type { EventRepository } from '../../../application/ports/event-repository'
import type { AgentEvent, EventCursor } from '../../../domain/agent-event'
import type { Prompt, Reply } from '../../../domain/prompt'
import type { Pool } from './pool'

// Table defined in migrations/001_initial.sql; the prompt columns in 003_prompts.sql.

interface EventRow {
  id: string
  kind: AgentEvent['kind']
  session_id: string
  session_title: string
  project: string
  summary: string
  received_at: Date
  prompt: Prompt | null
  answer_by: Date | null
  reply: Reply | null
  replied_at: Date | null
  closed_at: Date | null
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
    prompt: row.prompt,
    answerBy: row.answer_by,
    reply: row.reply,
    repliedAt: row.replied_at,
    closedAt: row.closed_at,
  }
}

// Open: has a prompt, no answer, not closed, deadline ahead. Kept in step with promptState().
const OPEN = 'prompt is not null and reply is null and closed_at is null and answer_by > $2'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly pool: Pool) {}

  async add(event: AgentEvent): Promise<void> {
    await this.pool.query(
      `insert into agent_events (id, kind, session_id, session_title, project, summary, received_at, prompt, answer_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.id,
        event.kind,
        event.sessionId,
        event.sessionTitle,
        event.project,
        event.summary,
        event.receivedAt,
        event.prompt ? JSON.stringify(event.prompt) : null,
        event.answerBy,
      ],
    )
  }

  async saveReply(id: string, reply: Reply, at: Date): Promise<boolean> {
    if (!UUID.test(id)) return false
    const result = await this.pool.query(
      `update agent_events set reply = $3, replied_at = $2 where id = $1 and ${OPEN}`,
      [id, at, JSON.stringify(reply)],
    )
    return (result.rowCount ?? 0) > 0
  }

  async closePrompt(id: string, at: Date): Promise<void> {
    if (!UUID.test(id)) return
    await this.pool.query(`update agent_events set closed_at = $2 where id = $1 and ${OPEN}`, [id, at])
  }

  async closeSessionPrompts(sessionId: string, at: Date): Promise<void> {
    await this.pool.query(`update agent_events set closed_at = $2 where session_id = $1 and ${OPEN}`, [sessionId, at])
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
