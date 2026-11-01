import { InvalidInputError } from './errors'

// The one authenticator app (Microsoft Authenticator, or any TOTP app) that signs into this app.
// One person uses this app, so there is one record.
//
// Linking is two steps: a new secret is kept as `pendingSealedSecret` until a code from the app
// proves it was scanned, and only then replaces the linked one. Linking again (a new phone, a lost
// one) bumps `generation`, which signs out every session made with the old app.

export interface Authenticator {
  /** The linked secret, sealed (encrypted). Null until the first link is confirmed. */
  readonly sealedSecret: string | null
  /** A secret shown as a QR code but not confirmed with a code yet. */
  readonly pendingSealedSecret: string | null
  /** Sessions carry this; a session from an older generation is no longer valid. */
  readonly generation: number
  /** The last 30-second time step a code was accepted for. A code is never accepted twice. */
  readonly lastUsedStep: number
  /** Wrong codes in a row. */
  readonly failedAttempts: number
  readonly lockedUntil: Date | null
  readonly linkedAt: Date | null
}

export const MAX_FAILED_ATTEMPTS = 5
export const LOCK_MS = 15 * 60_000

export const EMPTY_AUTHENTICATOR: Authenticator = {
  sealedSecret: null,
  pendingSealedSecret: null,
  generation: 0,
  lastUsedStep: 0,
  failedAttempts: 0,
  lockedUntil: null,
  linkedAt: null,
}

export function isLinked(auth: Authenticator | null): boolean {
  return Boolean(auth?.sealedSecret)
}

/** Milliseconds until another code may be tried, or 0. */
export function lockedFor(auth: Authenticator, now: Date): number {
  if (!auth.lockedUntil) return 0
  return Math.max(0, auth.lockedUntil.getTime() - now.getTime())
}

export function withFailure(auth: Authenticator, now: Date): Authenticator {
  const failedAttempts = auth.failedAttempts + 1
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    return { ...auth, failedAttempts: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) }
  }
  return { ...auth, failedAttempts }
}

/** A code for `step` was accepted. */
export function withSuccess(auth: Authenticator, step: number): Authenticator {
  return { ...auth, failedAttempts: 0, lockedUntil: null, lastUsedStep: step }
}

/** True when a code for `step` was already used (or an older one was), so it must be refused. */
export function isReplay(auth: Authenticator, step: number): boolean {
  return step <= auth.lastUsedStep
}

export function withPendingSecret(auth: Authenticator, pendingSealedSecret: string): Authenticator {
  return { ...auth, pendingSealedSecret }
}

/** The pending secret becomes the linked one; every older session stops working. */
export function withConfirmedLink(auth: Authenticator, step: number, now: Date): Authenticator {
  if (!auth.pendingSealedSecret) throw new InvalidInputError('Start linking again: no QR code is waiting')
  return {
    sealedSecret: auth.pendingSealedSecret,
    pendingSealedSecret: null,
    generation: auth.generation + 1,
    lastUsedStep: step,
    failedAttempts: 0,
    lockedUntil: null,
    linkedAt: now,
  }
}

/** Accepts "123456" and "123 456". */
export function normalizeCode(raw: unknown): string {
  const code = typeof raw === 'string' ? raw.replace(/\s+/g, '') : ''
  if (!/^\d{6}$/.test(code)) throw new InvalidInputError('Enter the 6-digit code from your authenticator app')
  return code
}
