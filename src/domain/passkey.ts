// A passkey: a sign-in key kept on the phone (Google Password Manager on Android) and unlocked
// with its fingerprint or screen lock. This app keeps only the public half; the private half never
// leaves the phone. Several can exist (a phone, a laptop), each named by the person.

export interface Passkey {
  /** The credential id the browser reports (base64url). */
  readonly id: string
  /** The public key in COSE form (base64url). */
  readonly publicKey: string
  /** The authenticator's signature counter; many phones always report 0. */
  readonly counter: number
  /** How the browser can reach it: internal, hybrid (the QR code from a computer), usb, … */
  readonly transports: readonly string[]
  readonly label: string
  readonly createdAt: Date
  readonly lastUsedAt: Date | null
}

export type CeremonyPurpose = 'register' | 'sign-in'

/** How long a passkey prompt stays answerable. */
export const CHALLENGE_TTL_MS = 5 * 60_000

const MAX_LABEL = 60

export function normalizePasskeyLabel(raw: unknown): string {
  const label = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, MAX_LABEL) : ''
  return label || 'Passkey'
}

/**
 * A counter that went backwards means the key may have been copied. Authenticators that don't
 * count (they always say 0) are exempt, as the WebAuthn spec allows.
 */
export function counterLooksCloned(stored: number, reported: number): boolean {
  return (stored > 0 || reported > 0) && reported <= stored
}
