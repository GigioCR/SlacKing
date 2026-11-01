import { clip, type AgentEvent } from '../domain/agent-event'

// What a phone is told. `tag` is per session, so a newer notification from the same session
// replaces the older one instead of stacking beside it.
export interface NotificationMessage {
  kind: AgentEvent['kind'] | 'test'
  title: string
  body: string
  tag: string
  /** Where tapping the notification goes: the full summary. */
  url: string
}

// Android shows about this much of a notification's text when expanded; the rest is on the screen.
const BODY_MAX = 300

const HEADLINE: Record<AgentEvent['kind'], string> = {
  finished: 'Done',
  'needs-input': 'Needs you',
}

export function eventMessage(event: AgentEvent): NotificationMessage {
  const where = event.project && event.project !== event.sessionTitle ? ` · ${event.project}` : ''
  return {
    kind: event.kind,
    title: `${HEADLINE[event.kind]}: ${event.sessionTitle}${where}`,
    body: clip(event.summary, BODY_MAX),
    tag: `session:${event.sessionId}`,
    url: `/events/${event.id}`,
  }
}

export function testMessage(deviceLabel: string): NotificationMessage {
  return {
    kind: 'test',
    title: 'Test notification',
    body: `Notifications work on ${deviceLabel}.`,
    tag: 'test',
    url: '/',
  }
}
