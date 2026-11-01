import type { AgentEventDto } from '../_lib/api'

const LABEL: Record<AgentEventDto['kind'], string> = {
  finished: 'Done',
  'needs-input': 'Needs you',
}

export function EventBadge({ kind }: { kind: AgentEventDto['kind'] }) {
  return <span className={`badge ${kind}`}>{LABEL[kind]}</span>
}
