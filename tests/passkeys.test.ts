import { describe, expect, it } from 'vitest'
import type { Ceremony, NewPasskey, PasskeyCeremonies, RelyingParty } from '../src/application/ports/passkey-ceremonies'
import { getAuthStatus } from '../src/application/use-cases/check-session'
import {
  finishPasskeyRegistration,
  finishPasskeySignIn,
  listPasskeys,
  removePasskey,
  startPasskeyRegistration,
  startPasskeySignIn,
} from '../src/application/use-cases/passkeys'
import { EMPTY_AUTHENTICATOR } from '../src/domain/authenticator'
import { counterLooksCloned, type Passkey } from '../src/domain/passkey'
import { shouldRenew } from '../src/domain/session'
import { HmacSessionTokens } from '../src/infrastructure/auth/hmac-session-tokens'
import {
  InMemoryAuthenticatorRepository,
  InMemoryChallengeStore,
  InMemoryPasskeyRepository,
} from '../src/infrastructure/persistence/in-memory/repositories'

// The WebAuthn cryptography itself is @simplewebauthn's (and the phone's) job. These tests stand in
// for it with a fake that "signs" by echoing the challenge, and check everything around it: one-use
// challenges, which passkey is used, cloned-key counters, sessions and their renewal.

const rp: RelyingParty = { id: 'localhost', origin: 'http://localhost:3000' }

type FakeAnswer = { id: string; challenge: string; counter?: number; valid?: boolean }

class FakeCeremonies implements PasskeyCeremonies {
  private n = 0
  async registrationOptions(): Promise<Ceremony> {
    const challenge = `reg-${++this.n}`
    return { options: { challenge }, challenge }
  }
  async verifyRegistration(_rp: RelyingParty, response: unknown, isExpected: (c: string) => Promise<boolean>): Promise<NewPasskey | null> {
    const a = response as FakeAnswer
    if (!(await isExpected(a.challenge)) || a.valid === false) return null
    return { id: a.id, publicKey: 'pk', counter: 0, transports: ['internal', 'hybrid'] }
  }
  async signInOptions(): Promise<Ceremony> {
    const challenge = `sign-${++this.n}`
    return { options: { challenge }, challenge }
  }
  credentialIdOf(response: unknown): string | null {
    return (response as FakeAnswer | null)?.id ?? null
  }
  async verifySignIn(_rp: RelyingParty, response: unknown, _p: Passkey, isExpected: (c: string) => Promise<boolean>) {
    const a = response as FakeAnswer
    if (!(await isExpected(a.challenge)) || a.valid === false) return null
    return { counter: a.counter ?? 0 }
  }
}

async function setup() {
  let now = new Date('2026-11-01T12:00:00Z')
  const clock = { now: () => now }
  const authenticators = new InMemoryAuthenticatorRepository()
  await authenticators.save({ ...EMPTY_AUTHENTICATOR, sealedSecret: 'sealed', generation: 3, linkedAt: now })
  const deps = {
    passkeys: new InMemoryPasskeyRepository(),
    challenges: new InMemoryChallengeStore(),
    ceremonies: new FakeCeremonies(),
    authenticators,
    sessions: new HmacSessionTokens('test-session-secret-that-is-long-enough'),
    clock,
  }
  const challengeOf = (options: unknown) => (options as { challenge: string }).challenge
  async function addPasskey(id: string, label = 'Pixel 8') {
    const options = await startPasskeyRegistration(deps)(rp)
    return finishPasskeyRegistration(deps)(rp, { response: { id, challenge: challengeOf(options) }, label })
  }
  return { deps, clock, advance: (ms: number) => (now = new Date(now.getTime() + ms)), challengeOf, addPasskey }
}

describe('adding a passkey', () => {
  it('keeps it under the name given', async () => {
    const s = await setup()
    expect(await s.addPasskey('cred-1')).toMatchObject({ id: 'cred-1', label: 'Pixel 8', lastUsedAt: null })
    expect((await listPasskeys(s.deps)()).map((p) => p.label)).toEqual(['Pixel 8'])
  })

  it('refuses an answer to a prompt it never made', async () => {
    const s = await setup()
    await expect(
      finishPasskeyRegistration(s.deps)(rp, { response: { id: 'x', challenge: 'made-up' }, label: 'x' }),
    ).rejects.toThrow(/couldn't be added/)
  })

  it('names an unnamed one "Passkey"', async () => {
    const s = await setup()
    expect((await s.addPasskey('cred-1', '   ')).label).toBe('Passkey')
  })
})

describe('signing in with a passkey', () => {
  it('signs in with the linked generation and records the use', async () => {
    const s = await setup()
    await s.addPasskey('cred-1')
    const options = await startPasskeySignIn(s.deps)(rp)
    const session = await finishPasskeySignIn(s.deps)(rp, { id: 'cred-1', challenge: s.challengeOf(options) })
    expect(s.deps.sessions.read(session.token, s.clock.now())?.generation).toBe(3)
    expect((await s.deps.passkeys.find('cred-1'))?.lastUsedAt).toEqual(s.clock.now())
  })

  it('accepts each prompt once only', async () => {
    const s = await setup()
    await s.addPasskey('cred-1')
    const answer = { id: 'cred-1', challenge: s.challengeOf(await startPasskeySignIn(s.deps)(rp)) }
    await finishPasskeySignIn(s.deps)(rp, answer)
    await expect(finishPasskeySignIn(s.deps)(rp, answer)).rejects.toThrow(/wasn't accepted/)
  })

  it('refuses a prompt answered too late', async () => {
    const s = await setup()
    await s.addPasskey('cred-1')
    const answer = { id: 'cred-1', challenge: s.challengeOf(await startPasskeySignIn(s.deps)(rp)) }
    s.advance(5 * 60_000 + 1)
    await expect(finishPasskeySignIn(s.deps)(rp, answer)).rejects.toThrow(/wasn't accepted/)
  })

  it('refuses a registration prompt used to sign in', async () => {
    const s = await setup()
    await s.addPasskey('cred-1')
    const registration = s.challengeOf(await startPasskeyRegistration(s.deps)(rp))
    await expect(finishPasskeySignIn(s.deps)(rp, { id: 'cred-1', challenge: registration })).rejects.toThrow(/wasn't accepted/)
  })

  it('refuses an unknown or removed passkey', async () => {
    const s = await setup()
    await s.addPasskey('cred-1')
    await removePasskey(s.deps)('cred-1')
    await s.addPasskey('cred-2')
    const challenge = s.challengeOf(await startPasskeySignIn(s.deps)(rp))
    await expect(finishPasskeySignIn(s.deps)(rp, { id: 'cred-1', challenge })).rejects.toThrow(/wasn't accepted/)
  })

  it('refuses a key whose counter went backwards (a copied key)', async () => {
    const s = await setup()
    await s.addPasskey('cred-1')
    const first = s.challengeOf(await startPasskeySignIn(s.deps)(rp))
    await finishPasskeySignIn(s.deps)(rp, { id: 'cred-1', challenge: first, counter: 5 })
    const second = s.challengeOf(await startPasskeySignIn(s.deps)(rp))
    await expect(finishPasskeySignIn(s.deps)(rp, { id: 'cred-1', challenge: second, counter: 4 })).rejects.toThrow(/wasn't accepted/)
  })

  it('explains when no passkey has been added yet', async () => {
    const s = await setup()
    await expect(startPasskeySignIn(s.deps)(rp)).rejects.toThrow(/No passkey/)
  })
})

describe('counterLooksCloned', () => {
  it('ignores phones that always report 0', () => {
    expect(counterLooksCloned(0, 0)).toBe(false)
    expect(counterLooksCloned(3, 4)).toBe(false)
    expect(counterLooksCloned(4, 4)).toBe(true)
  })
})

describe('session renewal', () => {
  it('renews after a day of use, not before', () => {
    const now = new Date('2026-11-01T12:00:00Z')
    const day = 24 * 60 * 60_000
    expect(shouldRenew(new Date(now.getTime() + 30 * day - 60_000), now)).toBe(false)
    expect(shouldRenew(new Date(now.getTime() + 29 * day - 60_000), now)).toBe(true)
  })

  it('hands out a fresh 30 days once a signed-in session is a day old', async () => {
    const s = await setup()
    const status = getAuthStatus(s.deps)
    const session = s.deps.sessions.issue(3, s.clock.now())
    expect((await status(session.token)).renewed).toBeNull()
    s.advance(2 * 24 * 60 * 60_000)
    const { status: shown, renewed } = await status(session.token)
    expect(shown).toEqual({ linked: true, signedIn: true, passkeys: 0 })
    expect(renewed?.expiresAt).toEqual(new Date(s.clock.now().getTime() + 30 * 24 * 60 * 60_000))
  })

  it('never renews a session from an earlier authenticator', async () => {
    const s = await setup()
    const old = s.deps.sessions.issue(2, s.clock.now())
    s.advance(2 * 24 * 60 * 60_000)
    expect((await getAuthStatus(s.deps)(old.token)).renewed).toBeNull()
  })
})
