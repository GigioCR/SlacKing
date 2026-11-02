import type { EventRepository } from '../ports/event-repository'

/** What This phone shows about the computer: when it was last heard from, and if it waits for answers. */
export interface HookActivityDto {
  lastEventAt: string | null
  lastCheckInAt: string | null
  /** How long the hook last offered to wait for an answer, in minutes; null when it never has. */
  waitMinutes: number | null
}

export function getHookActivity(deps: { events: EventRepository }) {
  return async (): Promise<HookActivityDto> => {
    const activity = await deps.events.hookActivity()
    return {
      lastEventAt: activity.lastEventAt?.toISOString() ?? null,
      lastCheckInAt: activity.lastCheckInAt?.toISOString() ?? null,
      waitMinutes: activity.lastWaitSeconds === null ? null : Math.round(activity.lastWaitSeconds / 60),
    }
  }
}
