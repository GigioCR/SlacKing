import { isLinked, isReplay, lockedFor, normalizeCode, withFailure, withSuccess } from '../../domain/authenticator'
import { NotEnrolledError, SignInLockedError, WrongCodeError } from '../../domain/errors'
import type { IssuedSession } from '../ports/session-tokens'
import { requireSecretBox, type AuthDeps } from './auth-deps'

/**
 * Signs in with the current code from the linked authenticator app. A code is accepted once only,
 * and five wrong codes in a row pause sign-in for 15 minutes (src/domain/authenticator.ts).
 */
export function signIn(deps: AuthDeps) {
  return async (rawCode: unknown): Promise<IssuedSession> => {
    const code = normalizeCode(rawCode)
    const box = requireSecretBox(deps.secrets)
    const now = deps.clock.now()
    const auth = await deps.authenticators.get()
    if (!auth || !isLinked(auth) || !auth.sealedSecret) throw new NotEnrolledError()

    const wait = lockedFor(auth, now)
    if (wait > 0) throw new SignInLockedError(wait)

    const step = deps.codes.matchStep(box.open(auth.sealedSecret), code, now)
    if (step === null || isReplay(auth, step)) {
      await deps.authenticators.save(withFailure(auth, now))
      throw step === null ? new WrongCodeError() : new WrongCodeError('That code was already used. Wait for the next one.')
    }
    await deps.authenticators.save(withSuccess(auth, step))
    return deps.sessions.issue(auth.generation, now)
  }
}
