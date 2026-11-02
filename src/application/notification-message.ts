import { clip, type AgentEvent } from '../domain/agent-event'
import { markdownToPlainText } from '../domain/plain-text'
import type { Reply } from '../domain/prompt'

/**
 * A button on the notification. With `reply`, tapping it sends that answer straight from the
 * notification (public/sw.js); without, it opens the notification's screen to answer there.
 */
export interface NotificationAction {
  id: string
  title: string
  reply?: Reply
}

// What a phone is told. `tag` is per session, so a newer notification from the same session
// replaces the older one instead of stacking beside it.
export interface NotificationMessage {
  kind: AgentEvent['kind'] | 'test'
  title: string
  body: string
  tag: string
  /** Where tapping the notification goes: the full summary. */
  url: string
  /** Android shows at most two; iPhone shows none, so every answer can also be given on the screen. */
  actions: NotificationAction[]
  /** Where a button's answer is sent. */
  replyUrl: string | null
}

// Android shows about this much of a notification's text when expanded; the rest is on the screen.
const BODY_MAX = 300
// Chrome on Android shows two buttons.
const MAX_ACTIONS = 2

const HEADLINE: Record<AgentEvent['kind'], string> = {
  finished: 'Done',
  'needs-input': 'Needs you',
}

/**
 * Buttons only where one tap is a safe answer. Deny can't do harm, so it works from the lock
 * screen; Allow and Approve open the screen first, to read exactly what is being allowed.
 */
function actionsFor(event: AgentEvent): NotificationAction[] {
  const prompt = event.prompt
  if (!prompt || !event.answerBy) return []
  switch (prompt.type) {
    case 'permission':
      return [
        { id: 'review', title: 'Allow…' },
        { id: 'deny', title: 'Deny', reply: { type: 'deny', message: '' } },
      ]
    case 'plan':
      return [{ id: 'review', title: 'Review plan' }]
    case 'question': {
      const [only] = prompt.questions
      if (prompt.questions.length !== 1 || only.multiSelect || only.options.length > MAX_ACTIONS) return []
      return only.options.map((option, i) => ({
        id: `option-${i}`,
        title: option.label,
        reply: { type: 'answers', answers: { [only.question]: option.label } },
      }))
    }
    case 'reply':
      return prompt.suggestions
        .slice(0, MAX_ACTIONS)
        .map((suggestion, i) => ({ id: `suggestion-${i}`, title: suggestion, reply: { type: 'message', message: suggestion } }))
  }
}

export function eventMessage(event: AgentEvent): NotificationMessage {
  const where = event.project && event.project !== event.sessionTitle ? ` · ${event.project}` : ''
  const actions = actionsFor(event)
  return {
    kind: event.kind,
    title: `${HEADLINE[event.kind]}: ${event.sessionTitle}${where}`,
    body: clip(markdownToPlainText(event.summary), BODY_MAX),
    tag: `session:${event.sessionId}`,
    url: `/events/${event.id}`,
    actions,
    replyUrl: actions.length ? `/api/events/${event.id}/reply` : null,
  }
}

export function testMessage(deviceLabel: string): NotificationMessage {
  return {
    kind: 'test',
    title: 'Test notification',
    body: `Notifications work on ${deviceLabel}.`,
    tag: 'test',
    url: '/',
    actions: [],
    replyUrl: null,
  }
}
