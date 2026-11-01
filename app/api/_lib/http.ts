import type { RelyingParty } from '@/src/application/ports/passkey-ceremonies'
import type { IssuedSession } from '@/src/application/ports/session-tokens'
import { getContainer } from '@/src/container'
import { InvalidInputError } from '@/src/domain/errors'

// Shared by the route handlers. Controllers stay thin: authorise, call a use case, map to HTTP.

const NO_STORE = { 'cache-control': 'no-store' }

export const SESSION_COOKIE = 'slk_session'

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: NO_STORE })
}

export function problem(status: number, message: string): Response {
  return json({ error: message }, status)
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new InvalidInputError('Body must be valid JSON')
  }
}

/** A field of a JSON body, or undefined. */
export function field(body: unknown, name: string): unknown {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined
}

export function readSessionToken(request: Request): string | null {
  const cookies = request.headers.get('cookie') ?? ''
  for (const part of cookies.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === SESSION_COOKIE) return value.join('=') || null
  }
  return null
}

/** Returns a 401 response unless the browser has a valid sign-in session. */
export async function requireSession(request: Request): Promise<Response | null> {
  const status = await getContainer().useCases.checkSession(readSessionToken(request))
  return status.signedIn ? null : problem(401, 'Sign in first')
}

// HttpOnly: page scripts can't read it. SameSite=Lax: other sites can't make the browser send it
// with a POST. Secure: https only (browsers make an exception for localhost).
export function withSessionCookie(response: Response, session: IssuedSession): Response {
  response.headers.append(
    'set-cookie',
    `${SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${session.expiresAt.toUTCString()}`,
  )
  return response
}

export function withoutSessionCookie(response: Response): Response {
  response.headers.append('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
  return response
}

/**
 * The site passkeys belong to: APP_ORIGIN if set, else the address this request came to. The
 * browser itself refuses to use a passkey on any other site; this is the server's matching check.
 */
export function relyingParty(request: Request): RelyingParty {
  const origin = getContainer().config.appOrigin ?? new URL(request.url).origin
  return { id: new URL(origin).hostname, origin }
}

/** The bearer token of an Authorization header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}

// Matched by name, not instanceof, in case two bundles hold different copies of the classes.
// Every domain error sets its name (src/domain/errors.ts).
const STATUS_BY_ERROR: Record<string, number> = {
  InvalidInputError: 400,
  WrongCodeError: 401,
  PasskeyRejectedError: 401,
  EventNotFoundError: 404,
  NotEnrolledError: 409,
  SignInLockedError: 429,
  NotConfiguredError: 503,
}

export function handleError(error: unknown): Response {
  const status = error instanceof Error ? STATUS_BY_ERROR[error.name] : undefined
  if (status && error instanceof Error) {
    const response = problem(status, error.message)
    const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs
    if (typeof retryAfterMs === 'number') response.headers.set('retry-after', String(Math.ceil(retryAfterMs / 1000)))
    return response
  }
  console.error('[api] unexpected error', error)
  return problem(500, 'Something went wrong')
}
