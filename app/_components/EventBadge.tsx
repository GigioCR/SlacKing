import type { AgentEventDto } from '../_lib/api'
import { AskIcon, CheckIcon } from './Icons'

export const KIND_LABEL: Record<AgentEventDto['kind'], string> = {
  finished: 'Done',
  'needs-input': 'Needs you',
}

/** The round marker in front of a notification: a check when done, a question mark when it needs you. */
export function KindIcon({ kind }: { kind: AgentEventDto['kind'] }) {
  return (
    <span className={`kind-icon ${kind}`} role="img" aria-label={KIND_LABEL[kind]}>
      {kind === 'finished' ? <CheckIcon size={18} /> : <AskIcon size={18} />}
    </span>
  )
}

export function EventBadge({ kind }: { kind: AgentEventDto['kind'] }) {
  return <span className={`badge ${kind}`}>{KIND_LABEL[kind]}</span>
}
