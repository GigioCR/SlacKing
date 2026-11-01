import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type {
  Ceremony,
  NewPasskey,
  PasskeyCeremonies,
  RelyingParty,
} from '../../application/ports/passkey-ceremonies'
import type { Passkey } from '../../domain/passkey'

// WebAuthn through @simplewebauthn/server. One person uses this app, so every passkey belongs to
// the same fixed user: adding a passkey again on the same phone replaces the earlier one there.

const RP_NAME = 'SlacKing'
const USER_ID = new TextEncoder().encode('slacking-owner')
const USER_NAME = 'SlacKing'

const toBytes = (base64url: string) => new Uint8Array(Buffer.from(base64url, 'base64url'))

function isResponse(raw: unknown): raw is { id: string; response: object } {
  return typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string'
}

export class SimpleWebAuthnCeremonies implements PasskeyCeremonies {
  async registrationOptions(rp: RelyingParty, existing: readonly Passkey[]): Promise<Ceremony> {
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rp.id,
      userID: USER_ID,
      userName: USER_NAME,
      userDisplayName: USER_NAME,
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: [...p.transports] })),
      authenticatorSelection: {
        // Kept on the phone and found without typing a name; always unlocked with fingerprint or PIN.
        residentKey: 'required',
        userVerification: 'required',
      },
    })
    return { options, challenge: options.challenge }
  }

  async verifyRegistration(
    rp: RelyingParty,
    response: unknown,
    isExpected: (challenge: string) => Promise<boolean>,
  ): Promise<NewPasskey | null> {
    if (!isResponse(response)) return null
    try {
      const result = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: isExpected,
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        requireUserVerification: true,
      })
      if (!result.verified) return null
      const { credential } = result.registrationInfo
      return {
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ?? [],
      }
    } catch (error) {
      console.warn('[passkeys] registration not verified:', (error as Error).message)
      return null
    }
  }

  async signInOptions(rp: RelyingParty, passkeys: readonly Passkey[]): Promise<Ceremony> {
    const options = await generateAuthenticationOptions({
      rpID: rp.id,
      allowCredentials: passkeys.map((p) => ({ id: p.id, transports: [...p.transports] })),
      userVerification: 'required',
    })
    return { options, challenge: options.challenge }
  }

  credentialIdOf(response: unknown): string | null {
    return isResponse(response) && /^[A-Za-z0-9_-]{1,1024}$/.test(response.id) ? response.id : null
  }

  async verifySignIn(
    rp: RelyingParty,
    response: unknown,
    passkey: Passkey,
    isExpected: (challenge: string) => Promise<boolean>,
  ): Promise<{ counter: number } | null> {
    if (!isResponse(response)) return null
    try {
      const result = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge: isExpected,
        expectedOrigin: rp.origin,
        expectedRPID: rp.id,
        credential: {
          id: passkey.id,
          publicKey: toBytes(passkey.publicKey),
          counter: passkey.counter,
          transports: [...passkey.transports],
        },
        requireUserVerification: true,
      })
      return result.verified ? { counter: result.authenticationInfo.newCounter } : null
    } catch (error) {
      console.warn('[passkeys] sign-in not verified:', (error as Error).message)
      return null
    }
  }
}
