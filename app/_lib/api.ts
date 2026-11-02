// The browser's side of the API. The session lives in an HttpOnly cookie, so nothing here
// handles a credential.

import type { ClosedReason, Prompt, PromptState, Reply } from '@/src/domain/prompt'

export const UNAUTHORIZED_EVENT = 'slk:unauthorized'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  /** Sign-in screens expect 401s and show them; elsewhere a 401 sends the person to sign in. */
  expectUnauthorized?: boolean
}

// A phone coming back to the app often has no network for a moment, so a read that can't reach
// the server tries again before saying so. Answers and other changes are not repeated.
const READ_RETRY_MS = [1_000, 2_000, 4_000]

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const send = () =>
    fetch(path, {
      method,
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
    })

  let response: Response | null = null
  for (let attempt = 0; !response; attempt++) {
    try {
      response = await send()
    } catch {
      const wait = method === 'GET' ? READ_RETRY_MS[attempt] : undefined
      if (wait === undefined) throw new ApiError(0, 'Could not reach the server. Check your connection.')
      await backOnline(wait)
    }
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && !options.expectUnauthorized) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    const message = (data as { error?: string } | null)?.error
    throw new ApiError(response.status, message ?? `Request failed (${response.status})`)
  }
  return data as T
}

/** Waits `ms`, or less when the browser says the network is back. */
function backOnline(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer)
      window.removeEventListener('online', done)
      resolve()
    }
    const timer = window.setTimeout(done, ms)
    window.addEventListener('online', done)
  })
}

export interface AuthStatus {
  linked: boolean
  signedIn: boolean
  /** How many passkeys exist; the sign-in screen offers one when there are any. */
  passkeys: number
}

export interface EventPage {
  events: AgentEventDto[]
  nextCursor: string | null
  total: number
}

export interface AgentEventDto {
  id: string
  kind: 'finished' | 'needs-input'
  sessionId: string
  sessionTitle: string
  project: string
  summary: string
  /** How full the session's context was; null from hooks that don't send it. */
  context: { usedTokens: number; windowTokens: number; percent: number } | null
  receivedAt: string
  /** What can be answered from here; see src/domain/prompt.ts. */
  prompt: Prompt | null
  promptState: PromptState
  closedReason: ClosedReason | null
  answerBy: string | null
  reply: Reply | null
  repliedAt: string | null
}

export type { ClosedReason, Prompt, PromptState, Question, Reply } from '@/src/domain/prompt'
