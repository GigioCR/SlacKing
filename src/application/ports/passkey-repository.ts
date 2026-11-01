import type { CeremonyPurpose, Passkey } from '../../domain/passkey'

export interface PasskeyRepository {
  /** Oldest first. */
  list(): Promise<Passkey[]>
  find(id: string): Promise<Passkey | null>
  add(passkey: Passkey): Promise<void>
  recordUse(id: string, counter: number, at: Date): Promise<void>
  remove(id: string): Promise<boolean>
  /** Used when a new authenticator app is linked: passkeys from the old phone stop working. */
  removeAll(): Promise<number>
}

/**
 * The random challenges handed to the browser for a passkey prompt. Each one can be answered once
 * and only for a few minutes, which stops a captured answer from being replayed.
 */
export interface ChallengeStore {
  save(challenge: string, purpose: CeremonyPurpose, expiresAt: Date): Promise<void>
  /** Removes the challenge; true only if it existed, was for `purpose` and hadn't expired. */
  take(challenge: string, purpose: CeremonyPurpose, now: Date): Promise<boolean>
}
