import type { AgentEventDto, ClosedReason } from '../_lib/api'
import { AskIcon, CheckIcon, PlanIcon, ShieldIcon, TerminalIcon } from './Icons'

type Look = 'done' | 'ask' | 'quiet'

export const CLOSED_LABEL: Record<ClosedReason, string> = {
  'moved-on': 'Handled at the computer',
  'timed-out': 'Expired',
  'session-gone': 'Session closed',
}

/** What a notification is now, not only what it was: a request answered elsewhere no longer needs you. */
export function eventStatus(event: AgentEventDto): { label: string; look: Look } {
  if (event.kind === 'finished') return { label: 'Done', look: 'done' }
  if (event.promptState === 'answered') return { label: 'Answered', look: 'done' }
  if (event.promptState === 'closed') return { label: CLOSED_LABEL[event.closedReason ?? 'moved-on'], look: 'quiet' }
  return { label: 'Needs you', look: 'ask' }
}

/** What Claude asked for, at a glance: a command, another permission, a plan, or a question. */
function Glyph({ event }: { event: AgentEventDto }) {
  if (event.kind === 'finished') return <CheckIcon size={18} />
  const prompt = event.prompt
  if (prompt?.type === 'permission') return /^(Bash|PowerShell)$/.test(prompt.tool) ? <TerminalIcon size={18} /> : <ShieldIcon size={18} />
  if (prompt?.type === 'plan') return <PlanIcon size={18} />
  return <AskIcon size={18} />
}

/** The round marker in front of a notification. */
export function KindIcon({ event }: { event: AgentEventDto }) {
  const status = eventStatus(event)
  return (
    <span className={`kind-icon ${status.look}`} role="img" aria-label={status.label}>
      <Glyph event={event} />
    </span>
  )
}

export function EventBadge({ event }: { event: AgentEventDto }) {
  const status = eventStatus(event)
  return <span className={`badge ${status.look}`}>{status.label}</span>
}
