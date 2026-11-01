import type { AgentEvent, EventCursor } from '../../domain/agent-event'
import type { Reply } from '../../domain/prompt'

export interface EventRepository {
  add(event: AgentEvent): Promise<void>
  get(id: string): Promise<AgentEvent | null>
  /**
   * Stores the phone's answer, only while the prompt is still open at `at` (no answer yet, not
   * closed, before its deadline) and in one step, so two answers can't both win. False otherwise.
   */
  saveReply(id: string, reply: Reply, at: Date): Promise<boolean>
  /** Marks open prompts closed: one event's, or every one of a session's. Answered ones stay answered. */
  closePrompt(id: string, at: Date): Promise<void>
  closeSessionPrompts(sessionId: string, at: Date): Promise<void>
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
