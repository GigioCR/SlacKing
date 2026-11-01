import { NO_PROMPT, parseAgentEventInput, retentionCutoff, type AgentEvent } from '../../domain/agent-event'
import { parsePromptInput } from '../../domain/prompt'
import { notifyDevices, type DeliverySummary } from '../notify-devices'
import { eventMessage } from '../notification-message'
import type { Clock } from '../ports/clock'
import type { EventRepository } from '../ports/event-repository'
import type { IdGenerator } from '../ports/id-generator'
import type { Notifier } from '../ports/notifier'
import type { SubscriptionRepository } from '../ports/subscription-repository'

export interface ReceiveAgentEventDeps {
  events: EventRepository
  subscriptions: SubscriptionRepository
  notifier: Notifier
  ids: IdGenerator
  clock: Clock
}

export interface ReceiveAgentEventResult extends DeliverySummary {
  id: string
  /** Old notifications deleted while here (older than RETENTION_DAYS). */
  pruned: number
}

/**
 * The hook on the computer reported that a session finished or needs a decision: keep it, push it
 * to every phone, and drop notifications past their retention. Pruning here means no scheduled job.
 * Whatever the session was waiting on before is settled now, so its earlier prompts close.
 */
export function receiveAgentEvent(deps: ReceiveAgentEventDeps) {
  return async (body: unknown): Promise<ReceiveAgentEventResult> => {
    const input = parseAgentEventInput(body)
    const now = deps.clock.now()
    const event: AgentEvent = { ...input, ...NO_PROMPT, ...parsePromptInput(body, now), id: deps.ids.next(), receivedAt: now }
    await deps.events.closeSessionPrompts(event.sessionId, now)
    await deps.events.add(event)
    const delivery = await notifyDevices(deps, eventMessage(event))
    const pruned = await deps.events.deleteBefore(retentionCutoff(now))
    return { id: event.id, ...delivery, pruned }
  }
}
