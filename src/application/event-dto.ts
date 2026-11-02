import type { AgentEvent } from '../domain/agent-event'
import { closedReason, promptState, type ClosedReason, type Prompt, type PromptState, type Reply } from '../domain/prompt'

/** An event as the API and the phone see it: dates as ISO strings. */
export interface AgentEventDto {
  id: string
  kind: AgentEvent['kind']
  sessionId: string
  sessionTitle: string
  project: string
  summary: string
  receivedAt: string
  /** What can be answered from the phone; null when nothing. */
  prompt: Prompt | null
  promptState: PromptState
  /** Why it closed, when promptState is 'closed'. */
  closedReason: ClosedReason | null
  answerBy: string | null
  reply: Reply | null
  repliedAt: string | null
}

export function toEventDto(event: AgentEvent, now: Date): AgentEventDto {
  return {
    id: event.id,
    kind: event.kind,
    sessionId: event.sessionId,
    sessionTitle: event.sessionTitle,
    project: event.project,
    summary: event.summary,
    receivedAt: event.receivedAt.toISOString(),
    prompt: event.prompt,
    promptState: promptState(event, now),
    closedReason: closedReason(event, now),
    answerBy: event.answerBy?.toISOString() ?? null,
    reply: event.reply,
    repliedAt: event.repliedAt?.toISOString() ?? null,
  }
}
