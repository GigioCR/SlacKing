import type { Passkey } from '../../domain/passkey'

/** Which site passkeys belong to: the browser only offers a passkey on the site that made it. */
export interface RelyingParty {
  /** The host name, e.g. "slac-king.vercel.app" (or "localhost"). */
  id: string
  /** The full origin, e.g. "https://slac-king.vercel.app". */
  origin: string
}

export interface Ceremony {
  /** Sent to the browser as is (the WebAuthn options JSON). */
  options: unknown
  challenge: string
}

export type NewPasskey = Pick<Passkey, 'id' | 'publicKey' | 'counter' | 'transports'>

/**
 * The WebAuthn steps (creating and checking passkeys). `isExpected` is asked about the challenge
 * the browser signed; it decides whether that challenge is one we issued and not yet used.
 */
export interface PasskeyCeremonies {
  registrationOptions(rp: RelyingParty, existing: readonly Passkey[]): Promise<Ceremony>
  /** The new passkey, or null if the answer doesn't check out. */
  verifyRegistration(
    rp: RelyingParty,
    response: unknown,
    isExpected: (challenge: string) => Promise<boolean>,
  ): Promise<NewPasskey | null>
  signInOptions(rp: RelyingParty, passkeys: readonly Passkey[]): Promise<Ceremony>
  /** Which passkey the answer claims to come from, read before checking it. */
  credentialIdOf(response: unknown): string | null
  /** The passkey's new counter, or null if the answer doesn't check out. */
  verifySignIn(
    rp: RelyingParty,
    response: unknown,
    passkey: Passkey,
    isExpected: (challenge: string) => Promise<boolean>,
  ): Promise<{ counter: number } | null>
}
