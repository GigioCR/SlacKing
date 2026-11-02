import { EventNotFoundError, PromptClosedError } from '../../domain/errors'
import { parseReply, promptState, type PromptState, type Reply } from '../../domain/prompt'
import { toEventDto, type AgentEventDto } from '../event-dto'
import type { Clock } from '../ports/clock'
import type { EventRepository } from '../ports/event-repository'

interface Deps {
  events: EventRepository
  clock: Clock
}

/** The phone answers what Claude is waiting on. Only the first answer counts, and only in time. */
export function answerPrompt(deps: Deps) {
  return async (id: string, body: unknown): Promise<AgentEventDto> => {
    const event = await deps.events.get(id)
    if (!event) throw new EventNotFoundError(id)
    const now = deps.clock.now()
    const state = promptState(event, now)
    if (state === 'answered') throw new PromptClosedError('This was already answered.')
    if (state !== 'open' || !event.prompt) throw new PromptClosedError()

    const reply = parseReply(event.prompt, body)
    if (!(await deps.events.saveReply(id, reply, now))) throw new PromptClosedError()
    return toEventDto({ ...event, reply, repliedAt: now }, now)
  }
}

export interface PromptAnswer {
  state: PromptState
  reply: Reply | null
}

/**
 * What the waiting hook polls. Each poll also shows the hook is still there to hand an answer
 * over; when the polls stop, the prompt closes (HOOK_SILENCE_MS). A cleared notification reads as
 * closed: nobody can answer it now, so the hook stops waiting and Claude asks at the computer.
 */
export function readPromptAnswer(deps: Deps) {
  return async (id: string): Promise<PromptAnswer> => {
    const now = deps.clock.now()
    await deps.events.markHookSeen(id, now)
    const event = await deps.events.get(id)
    if (!event) return { state: 'closed', reply: null }
    return { state: promptState(event, now), reply: event.reply }
  }
}

/** The hook stopped waiting (answered at the computer, or gave up), so the phone stops offering. */
export function closePrompt(deps: Deps) {
  return async (id: string): Promise<void> => {
    await deps.events.closePrompt(id, deps.clock.now())
  }
}
