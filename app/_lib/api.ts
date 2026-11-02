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

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection.')
  }

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && !options.expectUnauthorized) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    const message = (data as { error?: string } | null)?.error
    throw new ApiError(response.status, message ?? `Request failed (${response.status})`)
  }
  return data as T
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
