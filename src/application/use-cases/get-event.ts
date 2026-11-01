import { EventNotFoundError } from '../../domain/errors'
import { toEventDto, type AgentEventDto } from '../event-dto'
import type { EventRepository } from '../ports/event-repository'

export function getEvent(deps: { events: EventRepository }) {
  return async (id: string): Promise<AgentEventDto> => {
    const event = await deps.events.get(id)
    if (!event) throw new EventNotFoundError(id)
    return toEventDto(event)
  }
}
