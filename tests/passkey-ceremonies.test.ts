import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'
import { isoCBOR } from '@simplewebauthn/server/helpers'
import { describe, expect, it } from 'vitest'
import type { RelyingParty } from '../src/application/ports/passkey-ceremonies'
import type { Passkey } from '../src/domain/passkey'
import { SimpleWebAuthnCeremonies } from '../src/infrastructure/passkeys/simplewebauthn-ceremonies'

// A software authenticator that does what a phone does: makes a P-256 key, answers the
// registration with "none" attestation, and signs sign-in prompts. It checks the real adapter and
// @simplewebauthn's cryptography end to end, with no phone and no browser.

const b64url = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString('base64url')
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest()

const UP = 0x01 // user present
const UV = 0x04 // user verified (fingerprint / screen lock)
const AT = 0x40 // attested credential data included

class SoftwareAuthenticator {
  readonly credentialId = randomBytes(32)
  private readonly keys = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  private counter = 0

  constructor(private readonly flags = UP | UV) {}

  private coseKey(): Uint8Array {
    const jwk = (this.keys.publicKey as KeyObject).export({ format: 'jwk' }) as { x: string; y: string }
    // COSE EC2 key: kty 2, alg -7 (ES256), crv 1 (P-256), x, y.
    return isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
        [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))],
      ]),
    )
  }

  private authData(rpId: string, attested: boolean): Buffer {
    const count = Buffer.alloc(4)
    count.writeUInt32BE(this.counter)
    const parts = [sha256(rpId), Buffer.from([this.flags | (attested ? AT : 0)]), count]
    if (attested) {
      const idLength = Buffer.alloc(2)
      idLength.writeUInt16BE(this.credentialId.length)
      parts.push(Buffer.alloc(16), idLength, this.credentialId, Buffer.from(this.coseKey()))
    }
    return Buffer.concat(parts)
  }

  register(options: { challenge: string; rp: { id: string } }, origin: string) {
    const clientData = JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin, crossOrigin: false })
    const attestation = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(this.authData(options.rp.id, true))],
      ]) as never,
    )
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: 'public-key',
      response: { clientDataJSON: b64url(Buffer.from(clientData)), attestationObject: b64url(attestation), transports: ['internal', 'hybrid'] },
      clientExtensionResults: {},
    }
  }

  signIn(options: { challenge: string; rpId: string }, origin: string) {
    this.counter++
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }))
    const authData = this.authData(options.rpId, false)
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), this.keys.privateKey)
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: 'public-key',
      response: { clientDataJSON: b64url(clientData), authenticatorData: b64url(authData), signature: b64url(signature) },
      clientExtensionResults: {},
    }
  }
}

const rp: RelyingParty = { id: 'slac-king.example', origin: 'https://slac-king.example' }
const ceremonies = new SimpleWebAuthnCeremonies()
const accept = async () => true

async function registered(authenticator = new SoftwareAuthenticator()) {
  const { options } = await ceremonies.registrationOptions(rp, [])
  const created = await ceremonies.verifyRegistration(rp, authenticator.register(options as never, rp.origin), accept)
  if (!created) throw new Error('registration failed')
  const passkey: Passkey = { ...created, label: 'Test', createdAt: new Date(), lastUsedAt: null }
  return { authenticator, passkey }
}

describe('SimpleWebAuthnCeremonies with a software authenticator', () => {
  it('registers a passkey and keeps its public key', async () => {
    const { authenticator, passkey } = await registered()
    expect(passkey.id).toBe(b64url(authenticator.credentialId))
    expect(passkey.publicKey.length).toBeGreaterThan(50)
    expect(passkey.transports).toEqual(['internal', 'hybrid'])
  })

  it('signs in with that passkey', async () => {
    const { authenticator, passkey } = await registered()
    const { options } = await ceremonies.signInOptions(rp, [passkey])
    const answer = authenticator.signIn(options as never, rp.origin)
    expect(ceremonies.credentialIdOf(answer)).toBe(passkey.id)
    expect(await ceremonies.verifySignIn(rp, answer, passkey, accept)).toEqual({ counter: 1 })
  })

  it('passes the signed challenge to the one-use check, and refuses when it says no', async () => {
    const { authenticator, passkey } = await registered()
    const { options, challenge } = await ceremonies.signInOptions(rp, [passkey])
    const seen: string[] = []
    const refused = await ceremonies.verifySignIn(rp, authenticator.signIn(options as never, rp.origin), passkey, async (c) => {
      seen.push(c)
      return false
    })
    expect(seen).toEqual([challenge])
    expect(refused).toBeNull()
  })

  it('refuses an answer made for another site', async () => {
    const { authenticator, passkey } = await registered()
    const { options } = await ceremonies.signInOptions(rp, [passkey])
    const phished = authenticator.signIn(options as never, 'https://slac-king.evil.example')
    expect(await ceremonies.verifySignIn(rp, phished, passkey, accept)).toBeNull()
  })

  it('refuses a signature from a different key', async () => {
    const { passkey } = await registered()
    const impostor = new SoftwareAuthenticator()
    const { options } = await ceremonies.signInOptions(rp, [passkey])
    const forged = { ...impostor.signIn(options as never, rp.origin), id: passkey.id, rawId: passkey.id }
    expect(await ceremonies.verifySignIn(rp, forged, passkey, accept)).toBeNull()
  })

  it('refuses a passkey made without fingerprint or screen lock', async () => {
    const lax = new SoftwareAuthenticator(UP)
    const { options } = await ceremonies.registrationOptions(rp, [])
    expect(await ceremonies.verifyRegistration(rp, lax.register(options as never, rp.origin), accept)).toBeNull()
  })

  it('refuses garbage', async () => {
    expect(ceremonies.credentialIdOf({ nope: true })).toBeNull()
    expect(await ceremonies.verifyRegistration(rp, 'garbage', accept)).toBeNull()
  })
})
