import { clip } from './agent-event'
import { InvalidInputError } from './errors'

// What Claude is waiting on, as the hook describes it, and the answer the phone sends back. The
// hook on the computer waits for that answer and hands it to Claude (hook/notify.mjs).

export interface QuestionOption {
  readonly label: string
  readonly description: string
}

export interface Question {
  readonly question: string
  /** A short tag Claude gives the question, e.g. "Framework". */
  readonly header: string
  readonly options: readonly QuestionOption[]
  readonly multiSelect: boolean
}

export type Prompt =
  /** Claude wants to use a tool: allow it, or deny it with an optional message. */
  | { readonly type: 'permission'; readonly tool: string }
  /** Claude has a plan: approve it, or send feedback to keep planning. */
  | { readonly type: 'plan' }
  /** Claude asks one or more questions with options; any answer can also be typed. */
  | { readonly type: 'question'; readonly questions: readonly Question[] }
  /** A turn finished: anything typed is sent as the next message. `suggestions` are quick replies. */
  | { readonly type: 'reply'; readonly suggestions: readonly string[] }

export type Reply =
  | { readonly type: 'allow' }
  | { readonly type: 'deny'; readonly message: string }
  | { readonly type: 'answers'; readonly answers: Readonly<Record<string, string>> }
  | { readonly type: 'message'; readonly message: string }

/** none: nothing to answer. open: Claude is waiting. answered: the phone answered. closed: too late. */
export type PromptState = 'none' | 'open' | 'answered' | 'closed'

export const PROMPT_LIMITS = {
  questions: 4,
  options: 6,
  question: 300,
  header: 40,
  label: 80,
  description: 200,
  suggestions: 3,
  suggestion: 60,
  tool: 60,
  answer: 500,
  message: 2_000,
} as const

/** How long the hook may wait for an answer: at least 10 seconds, at most an hour. */
export const WAIT_SECONDS = { min: 10, max: 3_600 } as const

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
}

function parseQuestion(raw: unknown): Question | null {
  const body = record(raw)
  const question = clip(body?.question, PROMPT_LIMITS.question)
  if (!body || !question) return null
  const options = (Array.isArray(body.options) ? body.options : [])
    .slice(0, PROMPT_LIMITS.options)
    .map((o) => ({ label: clip(record(o)?.label, PROMPT_LIMITS.label), description: clip(record(o)?.description, PROMPT_LIMITS.description) }))
    .filter((o) => o.label)
  return { question, header: clip(body.header, PROMPT_LIMITS.header), options, multiSelect: body.multiSelect === true }
}

/** The prompt the hook sent, or null when it sent none or one this app can't offer. */
export function parsePrompt(raw: unknown): Prompt | null {
  const body = record(raw)
  switch (body?.type) {
    case 'permission':
      return { type: 'permission', tool: clip(body.tool, PROMPT_LIMITS.tool) || 'a tool' }
    case 'plan':
      return { type: 'plan' }
    case 'question': {
      const questions = (Array.isArray(body.questions) ? body.questions : [])
        .slice(0, PROMPT_LIMITS.questions)
        .map(parseQuestion)
        .filter((q): q is Question => q !== null)
      // Two questions with the same text could not be told apart in the answer.
      const unique = new Set(questions.map((q) => q.question)).size === questions.length
      return questions.length && unique ? { type: 'question', questions } : null
    }
    case 'reply': {
      const suggestions = (Array.isArray(body.suggestions) ? body.suggestions : [])
        .map((s) => clip(s, PROMPT_LIMITS.suggestion))
        .filter(Boolean)
        .slice(0, PROMPT_LIMITS.suggestions)
      return { type: 'reply', suggestions }
    }
    default:
      return null
  }
}

/**
 * The prompt part of what the hook sent: `{ prompt, waitSeconds }`. Both or neither: a prompt is
 * only offered while the hook says it is waiting for the answer.
 */
export function parsePromptInput(body: unknown, receivedAt: Date): Pick<PromptStatus, 'prompt' | 'answerBy'> {
  const fields = record(body)
  const prompt = parsePrompt(fields?.prompt)
  const seconds = Number(fields?.waitSeconds)
  if (!prompt || !Number.isFinite(seconds) || seconds <= 0) return { prompt: null, answerBy: null }
  const clamped = Math.min(WAIT_SECONDS.max, Math.max(WAIT_SECONDS.min, Math.round(seconds)))
  return { prompt, answerBy: new Date(receivedAt.getTime() + clamped * 1000) }
}

function requiredText(raw: unknown, max: number, what: string): string {
  const text = clip(raw, max)
  if (!text) throw new InvalidInputError(`${what} is required`)
  return text
}

/** Checks an answer from the phone against what was asked. */
export function parseReply(prompt: Prompt, raw: unknown): Reply {
  const body = record(raw)
  if (!body) throw new InvalidInputError('Body must be a JSON object')

  switch (prompt.type) {
    case 'permission':
    case 'plan':
      if (body.type === 'allow') return { type: 'allow' }
      if (body.type === 'deny') return { type: 'deny', message: clip(body.message, PROMPT_LIMITS.message) }
      throw new InvalidInputError('type must be allow or deny')
    case 'question': {
      if (body.type !== 'answers') throw new InvalidInputError('type must be answers')
      const given = record(body.answers) ?? {}
      const answers: Record<string, string> = {}
      for (const q of prompt.questions) {
        answers[q.question] = requiredText(given[q.question], PROMPT_LIMITS.answer, `An answer to "${q.question}"`)
      }
      return { type: 'answers', answers }
    }
    case 'reply':
      if (body.type !== 'message') throw new InvalidInputError('type must be message')
      return { type: 'message', message: requiredText(body.message, PROMPT_LIMITS.message, 'A message') }
  }
}

export interface PromptStatus {
  readonly prompt: Prompt | null
  readonly answerBy: Date | null
  readonly reply: Reply | null
  readonly closedAt: Date | null
}

export function promptState(event: PromptStatus, now: Date): PromptState {
  if (!event.prompt || !event.answerBy) return 'none'
  if (event.reply) return 'answered'
  if (event.closedAt || event.answerBy <= now) return 'closed'
  return 'open'
}
