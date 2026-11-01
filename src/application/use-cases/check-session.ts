import { isLinked } from '../../domain/authenticator'
import { shouldRenew } from '../../domain/session'
import type { AuthenticatorRepository } from '../ports/authenticator-repository'
import type { Clock } from '../ports/clock'
import type { PasskeyRepository } from '../ports/passkey-repository'
import type { IssuedSession, SessionTokens } from '../ports/session-tokens'

export interface CheckSessionDeps {
  authenticators: AuthenticatorRepository
  sessions: SessionTokens
  clock: Clock
}

export interface SessionCheck {
  /** An authenticator app has been linked. */
  linked: boolean
  signedIn: boolean
  generation: number | null
  expiresAt: Date | null
}

/** A session counts only while the authenticator it was made with is still the linked one. */
export function checkSession(deps: CheckSessionDeps) {
  return async (token: string | null | undefined): Promise<SessionCheck> => {
    const auth = await deps.authenticators.get()
    const linked = isLinked(auth)
    const session = deps.sessions.read(token, deps.clock.now())
    const signedIn = Boolean(linked && session && auth && session.generation === auth.generation)
    return {
      linked,
      signedIn,
      generation: signedIn && session ? session.generation : null,
      expiresAt: signedIn && session ? session.expiresAt : null,
    }
  }
}

export interface AuthStatus {
  linked: boolean
  signedIn: boolean
  /** How many passkeys can sign in, so the sign-in screen knows whether to offer one. */
  passkeys: number
}

/**
 * What the app asks on every screen load. It also keeps the session going: after a day of use,
 * a fresh 30-day session is issued, so it only runs out after 30 days of not opening the app.
 */
export function getAuthStatus(deps: CheckSessionDeps & { passkeys: PasskeyRepository }) {
  const check = checkSession(deps)
  return async (token: string | null | undefined): Promise<{ status: AuthStatus; renewed: IssuedSession | null }> => {
    const [session, passkeys] = await Promise.all([check(token), deps.passkeys.list()])
    const now = deps.clock.now()
    const renewed =
      session.signedIn && session.generation !== null && session.expiresAt && shouldRenew(session.expiresAt, now)
        ? deps.sessions.issue(session.generation, now)
        : null
    return { status: { linked: session.linked, signedIn: session.signedIn, passkeys: passkeys.length }, renewed }
  }
}
