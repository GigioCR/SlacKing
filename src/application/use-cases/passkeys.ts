import { isLinked } from '../../domain/authenticator'
import { NotEnrolledError, PasskeyRejectedError } from '../../domain/errors'
import {
  CHALLENGE_TTL_MS,
  counterLooksCloned,
  normalizePasskeyLabel,
  type CeremonyPurpose,
  type Passkey,
} from '../../domain/passkey'
import type { AuthenticatorRepository } from '../ports/authenticator-repository'
import type { Clock } from '../ports/clock'
import type { PasskeyCeremonies, RelyingParty } from '../ports/passkey-ceremonies'
import type { ChallengeStore, PasskeyRepository } from '../ports/passkey-repository'
import type { IssuedSession, SessionTokens } from '../ports/session-tokens'

export interface PasskeyDeps {
  passkeys: PasskeyRepository
  challenges: ChallengeStore
  ceremonies: PasskeyCeremonies
  authenticators: AuthenticatorRepository
  sessions: SessionTokens
  clock: Clock
}

export interface PasskeyDto {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

function toDto(passkey: Passkey): PasskeyDto {
  return {
    id: passkey.id,
    label: passkey.label,
    createdAt: passkey.createdAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
  }
}

async function remember(deps: PasskeyDeps, challenge: string, purpose: CeremonyPurpose) {
  await deps.challenges.save(challenge, purpose, new Date(deps.clock.now().getTime() + CHALLENGE_TTL_MS))
}

function takeChallenge(deps: PasskeyDeps, purpose: CeremonyPurpose) {
  return (challenge: string) => deps.challenges.take(challenge, purpose, deps.clock.now())
}

/** Step 1 of adding a passkey (signed-in only): what the browser needs to create one. */
export function startPasskeyRegistration(deps: PasskeyDeps) {
  return async (rp: RelyingParty): Promise<unknown> => {
    const ceremony = await deps.ceremonies.registrationOptions(rp, await deps.passkeys.list())
    await remember(deps, ceremony.challenge, 'register')
    return ceremony.options
  }
}

/** Step 2: the phone made the passkey; check it and keep its public key. */
export function finishPasskeyRegistration(deps: PasskeyDeps) {
  return async (rp: RelyingParty, input: { response: unknown; label: unknown }): Promise<PasskeyDto> => {
    const created = await deps.ceremonies.verifyRegistration(rp, input.response, takeChallenge(deps, 'register'))
    if (!created) throw new PasskeyRejectedError("That passkey couldn't be added. Try again.")
    const passkey: Passkey = {
      ...created,
      label: normalizePasskeyLabel(input.label),
      createdAt: deps.clock.now(),
      lastUsedAt: null,
    }
    await deps.passkeys.add(passkey)
    return toDto(passkey)
  }
}

/** Step 1 of signing in with a passkey: what the browser needs to ask the phone. */
export function startPasskeySignIn(deps: PasskeyDeps) {
  return async (rp: RelyingParty): Promise<unknown> => {
    const passkeys = await deps.passkeys.list()
    if (passkeys.length === 0) throw new PasskeyRejectedError('No passkey has been added yet. Sign in with a code first.')
    const ceremony = await deps.ceremonies.signInOptions(rp, passkeys)
    await remember(deps, ceremony.challenge, 'sign-in')
    return ceremony.options
  }
}

/**
 * Step 2: check the phone's answer and sign this browser in. The session carries the linked
 * authenticator's generation, so linking a new authenticator still signs passkey sessions out.
 */
export function finishPasskeySignIn(deps: PasskeyDeps) {
  return async (rp: RelyingParty, response: unknown): Promise<IssuedSession> => {
    const auth = await deps.authenticators.get()
    if (!auth || !isLinked(auth)) throw new NotEnrolledError()

    const id = deps.ceremonies.credentialIdOf(response)
    const passkey = id ? await deps.passkeys.find(id) : null
    if (!passkey) throw new PasskeyRejectedError()

    const result = await deps.ceremonies.verifySignIn(rp, response, passkey, takeChallenge(deps, 'sign-in'))
    if (!result || counterLooksCloned(passkey.counter, result.counter)) throw new PasskeyRejectedError()

    const now = deps.clock.now()
    await deps.passkeys.recordUse(passkey.id, result.counter, now)
    return deps.sessions.issue(auth.generation, now)
  }
}

export function listPasskeys(deps: Pick<PasskeyDeps, 'passkeys'>) {
  return async (): Promise<PasskeyDto[]> => (await deps.passkeys.list()).map(toDto)
}

export function removePasskey(deps: Pick<PasskeyDeps, 'passkeys'>) {
  return async (id: unknown): Promise<{ removed: boolean }> => ({
    removed: typeof id === 'string' && id !== '' && (await deps.passkeys.remove(id)),
  })
}
