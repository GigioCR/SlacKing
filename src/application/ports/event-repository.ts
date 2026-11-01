import type { AgentEvent, EventCursor } from '../../domain/agent-event'

export interface EventRepository {
  add(event: AgentEvent): Promise<void>
  get(id: string): Promise<AgentEvent | null>
  /**
   * Newest first: up to `limit` events that come after `after` in that order (all of them from the
   * start when it is null). Ties on time are broken by id, so paging never skips or repeats one.
   */
  listPage(after: EventCursor | null, limit: number): Promise<AgentEvent[]>
  count(): Promise<number>
  /** Deletes one event; false if it was already gone. */
  delete(id: string): Promise<boolean>
  /** Deletes every event received at or before `upTo`; returns how many. */
  deleteUpTo(upTo: Date): Promise<number>
  /** Deletes events received before `cutoff`; returns how many. */
  deleteBefore(cutoff: Date): Promise<number>
}
