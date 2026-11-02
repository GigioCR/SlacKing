import type { AgentEventDto } from './api'

// The inbox's last copy of each notification, so tapping one shows it at once instead of the
// loading sloth; the screen then refreshes it from the server. Memory only: gone on reload.
const events = new Map<string, AgentEventDto>()

export const eventCache = {
  remember(list: readonly AgentEventDto[]) {
    for (const event of list) events.set(event.id, event)
  },
  get(id: string): AgentEventDto | null {
    return events.get(id) ?? null
  },
}
