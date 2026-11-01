import { toEventDto, type AgentEventDto } from '../event-dto'
import type { EventRepository } from '../ports/event-repository'

const LIMIT = 100

export function listEvents(deps: { events: EventRepository }) {
  return async (): Promise<AgentEventDto[]> => (await deps.events.listRecent(LIMIT)).map(toEventDto)
}
