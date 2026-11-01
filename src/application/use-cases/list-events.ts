import { cursorOf, parseCursor } from '../../domain/agent-event'
import { InvalidInputError } from '../../domain/errors'
import { toEventDto, type AgentEventDto } from '../event-dto'
import type { EventRepository } from '../ports/event-repository'

/** A phone screen's worth: enough to scan, short enough not to scroll far. */
export const PAGE_SIZE = 15
const MAX_PAGE_SIZE = 50

export interface EventPage {
  events: AgentEventDto[]
  /** Pass back as `cursor` for the next (older) page; null on the last page. */
  nextCursor: string | null
  /** All notifications kept, for "16–30 of 47". */
  total: number
}

export interface ListEventsInput {
  cursor?: unknown
  limit?: unknown
}

function pageSize(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return PAGE_SIZE
  const size = Number(raw)
  if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    throw new InvalidInputError(`limit must be a whole number from 1 to ${MAX_PAGE_SIZE}`)
  }
  return size
}

export function listEvents(deps: { events: EventRepository }) {
  return async (input: ListEventsInput = {}): Promise<EventPage> => {
    const after = parseCursor(input.cursor)
    const limit = pageSize(input.limit)
    // One extra tells whether an older page exists, without a second query.
    const [rows, total] = await Promise.all([deps.events.listPage(after, limit + 1), deps.events.count()])
    const events = rows.slice(0, limit)
    const last = events.at(-1)
    return {
      events: events.map(toEventDto),
      nextCursor: rows.length > limit && last ? cursorOf(last) : null,
      total,
    }
  }
}
