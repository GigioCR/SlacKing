import { lockedFor, normalizeCode, withConfirmedLink, withFailure } from '../../domain/authenticator'
import { InvalidInputError, SignInLockedError, WrongCodeError } from '../../domain/errors'
import type { IssuedSession } from '../ports/session-tokens'
import { requireSecretBox, type AuthDeps } from './auth-deps'

/**
 * A code from the newly scanned app proves the QR code was scanned. The new secret replaces the old
 * one, every earlier session is signed out, and this browser is signed in.
 */
export function confirmLinking(deps: AuthDeps) {
  return async (rawCode: unknown): Promise<IssuedSession> => {
    const code = normalizeCode(rawCode)
    const box = requireSecretBox(deps.secrets)
    const now = deps.clock.now()
    const auth = await deps.authenticators.get()
    if (!auth?.pendingSealedSecret) throw new InvalidInputError('Start linking again: no QR code is waiting')

    const wait = lockedFor(auth, now)
    if (wait > 0) throw new SignInLockedError(wait)

    const step = deps.codes.matchStep(box.open(auth.pendingSealedSecret), code, now)
    if (step === null) {
      await deps.authenticators.save(withFailure(auth, now))
      throw new WrongCodeError()
    }
    const linked = withConfirmedLink(auth, step, now)
    await deps.authenticators.save(linked)
    return deps.sessions.issue(linked.generation, now)
  }
}
