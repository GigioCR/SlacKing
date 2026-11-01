import { InvalidInputError } from './errors'

// Something a Claude Code session did that the person should hear about, as sent by the hook
// on their computer (hook/notify.mjs). The hook builds the summary from the session's own log;
// this app never sees the log itself.

export type AgentEventKind = 'finished' | 'needs-input'

export const AGENT_EVENT_KINDS: readonly AgentEventKind[] = ['finished', 'needs-input']

export interface AgentEvent {
  readonly id: string
  readonly kind: AgentEventKind
  /** Claude Code's session id. Notifications for one session replace each other on the phone. */
  readonly sessionId: string
  /** The session's name as the app shows it, e.g. "Fix invoice sync". */
  readonly sessionTitle: string
  /** The folder the session works in, e.g. "hecho-syncware". Empty when unknown. */
  readonly project: string
  /** What was done (finished) or what is being asked (needs-input). */
  readonly summary: string
  readonly receivedAt: Date
}

export type AgentEventInput = Omit<AgentEvent, 'id' | 'receivedAt'>

/** Notifications are kept this long, then deleted. */
export const RETENTION_DAYS = 7

export const LIMITS = {
  sessionId: 100,
  sessionTitle: 120,
  project: 120,
  summary: 2_000,
} as const

/** Trims, collapses runs of spaces (not newlines) and cuts to `max` characters with an ellipsis. */
export function clip(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  const text = raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

export function parseAgentEventInput(raw: unknown): AgentEventInput {
  if (typeof raw !== 'object' || raw === null) throw new InvalidInputError('Body must be a JSON object')
  const body = raw as Record<string, unknown>

  const kind = body.kind
  if (typeof kind !== 'string' || !AGENT_EVENT_KINDS.includes(kind as AgentEventKind)) {
    throw new InvalidInputError(`kind must be one of: ${AGENT_EVENT_KINDS.join(', ')}`)
  }
  const sessionId = clip(body.sessionId, LIMITS.sessionId)
  if (!sessionId) throw new InvalidInputError('sessionId is required')

  const project = clip(body.project, LIMITS.project)
  return {
    kind: kind as AgentEventKind,
    sessionId,
    sessionTitle: clip(body.sessionTitle, LIMITS.sessionTitle) || project || 'Untitled session',
    project,
    summary: clip(body.summary, LIMITS.summary) || defaultSummary(kind as AgentEventKind),
  }
}

function defaultSummary(kind: AgentEventKind): string {
  return kind === 'finished' ? 'Claude finished and is waiting for you.' : 'Claude needs your decision.'
}

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60_000)
}

/**
 * A place in the newest-first list: the last event of a page. The next page starts after it.
 * Written as "<ISO time>_<id>", which is safe in a URL and needs no decoding.
 */
export interface EventCursor {
  readonly receivedAt: Date
  readonly id: string
}

export function cursorOf(event: Pick<AgentEvent, 'receivedAt' | 'id'>): string {
  return `${event.receivedAt.toISOString()}_${event.id}`
}

export function parseCursor(raw: unknown): EventCursor | null {
  if (raw === null || raw === undefined || raw === '') return null
  const text = typeof raw === 'string' ? raw : ''
  const split = text.indexOf('_')
  const receivedAt = new Date(text.slice(0, split))
  const id = text.slice(split + 1)
  if (split < 1 || Number.isNaN(receivedAt.getTime()) || !/^[0-9a-zA-Z-]{1,100}$/.test(id)) {
    throw new InvalidInputError('That page link is not valid. Go back to the first page.')
  }
  return { receivedAt, id }
}

/** "Clear all" clears what the person saw: everything up to the newest event on their screen. */
export function parseClearUpTo(raw: unknown): Date {
  const upTo = typeof raw === 'string' ? new Date(raw) : new Date(NaN)
  if (Number.isNaN(upTo.getTime())) throw new InvalidInputError('upTo must be a date and time')
  return upTo
}
