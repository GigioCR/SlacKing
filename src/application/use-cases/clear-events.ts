import { parseClearUpTo } from '../../domain/agent-event'
import { InvalidInputError } from '../../domain/errors'
import type { EventRepository } from '../ports/event-repository'

/** Clears one notification. Clearing one that is already gone is not an error. */
export function clearEvent(deps: { events: EventRepository }) {
  return async (id: unknown): Promise<{ cleared: number }> => {
    if (typeof id !== 'string' || !id) throw new InvalidInputError('id is required')
    return { cleared: (await deps.events.delete(id)) ? 1 : 0 }
  }
}

/**
 * Clears every notification up to `upTo`, the newest one the person had on screen. One that
 * arrives while they decide is newer, so it stays: nothing is cleared without being seen.
 */
export function clearEvents(deps: { events: EventRepository }) {
  return async (upTo: unknown): Promise<{ cleared: number }> => ({
    cleared: await deps.events.deleteUpTo(parseClearUpTo(upTo)),
  })
}
