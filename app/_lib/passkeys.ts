import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser'
import { api } from './api'

export interface PasskeyDto {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

export function supportsPasskeys(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn()
}

/** Thrown when the person closed the passkey prompt: not an error worth shouting about. */
export class PasskeyCancelled extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'PasskeyCancelled'
  }
}

// The browser reports a closed prompt (or one that timed out) as NotAllowedError.
function translate(error: unknown): never {
  const name = (error as { name?: string })?.name
  const code = error instanceof WebAuthnError ? error.code : null
  if (name === 'NotAllowedError' || code === 'ERROR_CEREMONY_ABORTED') throw new PasskeyCancelled()
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') throw new Error('This device already has a passkey for SlacKing.')
  throw error instanceof Error ? error : new Error("The passkey prompt didn't work. Try again.")
}

/** Creates a passkey on this device (fingerprint or screen lock) and saves its public key. */
export async function addPasskey(label: string): Promise<PasskeyDto> {
  const optionsJSON = await api<Parameters<typeof startRegistration>[0]['optionsJSON']>('/api/passkeys/register/options', {
    method: 'POST',
  })
  let response
  try {
    response = await startRegistration({ optionsJSON })
  } catch (error) {
    translate(error)
  }
  const { passkey } = await api<{ passkey: PasskeyDto }>('/api/passkeys/register/verify', {
    method: 'POST',
    body: { response, label },
  })
  return passkey
}

/** Signs this browser in with a passkey: on this phone, or from a computer by scanning its QR code. */
export async function signInWithPasskey(): Promise<void> {
  const optionsJSON = await api<Parameters<typeof startAuthentication>[0]['optionsJSON']>('/api/passkeys/sign-in/options', {
    method: 'POST',
    expectUnauthorized: true,
  })
  let response
  try {
    response = await startAuthentication({ optionsJSON })
  } catch (error) {
    translate(error)
  }
  await api('/api/passkeys/sign-in/verify', { method: 'POST', body: { response }, expectUnauthorized: true })
}
