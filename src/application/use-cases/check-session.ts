import { isLinked } from '../../domain/authenticator'
import type { AuthenticatorRepository } from '../ports/authenticator-repository'
import type { Clock } from '../ports/clock'
import type { SessionTokens } from '../ports/session-tokens'

export interface CheckSessionDeps {
  authenticators: AuthenticatorRepository
  sessions: SessionTokens
  clock: Clock
}

export interface AuthStatus {
  /** An authenticator app has been linked. */
  linked: boolean
  signedIn: boolean
}

/** A session counts only while the authenticator it was made with is still the linked one. */
export function checkSession(deps: CheckSessionDeps) {
  return async (token: string | null | undefined): Promise<AuthStatus> => {
    const auth = await deps.authenticators.get()
    const linked = isLinked(auth)
    const session = deps.sessions.read(token, deps.clock.now())
    return { linked, signedIn: Boolean(linked && session && auth && session.generation === auth.generation) }
  }
}
