import type { AgentEvent } from '../domain/agent-event'

/** An event as the API and the phone see it: dates as ISO strings. */
export interface AgentEventDto {
  id: string
  kind: AgentEvent['kind']
  sessionId: string
  sessionTitle: string
  project: string
  summary: string
  receivedAt: string
}

export function toEventDto(event: AgentEvent): AgentEventDto {
  return {
    id: event.id,
    kind: event.kind,
    sessionId: event.sessionId,
    sessionTitle: event.sessionTitle,
    project: event.project,
    summary: event.summary,
    receivedAt: event.receivedAt.toISOString(),
  }
}
