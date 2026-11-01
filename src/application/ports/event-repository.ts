import type { AgentEvent } from '../../domain/agent-event'

export interface EventRepository {
  add(event: AgentEvent): Promise<void>
  get(id: string): Promise<AgentEvent | null>
  /** Newest first. */
  listRecent(limit: number): Promise<AgentEvent[]>
  /** Deletes events received before `cutoff`; returns how many. */
  deleteBefore(cutoff: Date): Promise<number>
}
