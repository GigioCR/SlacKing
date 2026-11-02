import type { AgentEventDto } from '../_lib/api'

// Past these, it is time to think about compacting or a new session.
const WARN_PERCENT = 70
const FULL_PERCENT = 90

/** 152k, 1M. */
function tokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  return `${Math.round(n / 1_000)}k`
}

/** How full the session's context was, coloured once it is getting full; `full` adds the token counts. */
export function ContextNote({ context, full = false }: { context: NonNullable<AgentEventDto['context']>; full?: boolean }) {
  const tone = context.percent >= FULL_PERCENT ? 'danger' : context.percent >= WARN_PERCENT ? 'warn' : ''
  const counts = `${tokens(context.usedTokens)} of ${tokens(context.windowTokens)} tokens`
  return (
    <span className={`meta-context ${tone}`} title={counts}>
      {full ? `${context.percent}% of the context used (${counts})` : `${context.percent}% context`}
    </span>
  )
}
