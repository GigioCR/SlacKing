import { Secret, TOTP } from 'otpauth'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Clock } from '../src/application/ports/clock'
import type { QrRenderer } from '../src/application/ports/qr-renderer'
import { checkSession } from '../src/application/use-cases/check-session'
import { confirmLinking } from '../src/application/use-cases/confirm-linking'
import { signIn } from '../src/application/use-cases/sign-in'
import { startLinking } from '../src/application/use-cases/start-linking'
import { LOCK_MS, MAX_FAILED_ATTEMPTS } from '../src/domain/authenticator'
import { HmacSessionTokens } from '../src/infrastructure/auth/hmac-session-tokens'
import { AesGcmSecretBox } from '../src/infrastructure/crypto/secret-box'
import { InMemoryAuthenticatorRepository } from '../src/infrastructure/persistence/in-memory/repositories'
import { OtpauthCodes } from '../src/infrastructure/totp/otpauth-codes'

// What the authenticator app on the phone would show for `secret` at `at`.
function codeAt(secret: string, at: Date): string {
  return new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 }).generate({
    timestamp: at.getTime(),
  })
}

class FakeClock implements Clock {
  constructor(public current: Date) {}
  now(): Date {
    return this.current
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }
}

const qr: QrRenderer = { toDataUrl: async (text) => `data:image/png;base64,${Buffer.from(text).toString('base64')}` }

function setup() {
  const clock = new FakeClock(new Date('2026-10-27T12:00:05Z'))
  const deps = {
    authenticators: new InMemoryAuthenticatorRepository(),
    codes: new OtpauthCodes(),
    secrets: new AesGcmSecretBox('test-encryption-key-that-is-long-enough'),
    sessions: new HmacSessionTokens('test-session-secret-that-is-long-enough'),
    clock,
  }
  return {
    clock,
    deps,
    start: startLinking({ ...deps, qr }),
    confirm: confirmLinking(deps),
    signIn: signIn(deps),
    check: checkSession(deps),
  }
}

describe('linking an authenticator app', () => {
  let s: ReturnType<typeof setup>
  beforeEach(() => {
    s = setup()
  })

  it('shows a QR code for a standard TOTP address and stores the secret sealed', async () => {
    const started = await s.start()
    expect(started.uri).toMatch(/^otpauth:\/\/totp\/SlacKing:SlacKing\?/)
    expect(started.uri).toContain(`secret=${started.secret}`)
    expect(started.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    const stored = await s.deps.authenticators.get()
    expect(stored?.pendingSealedSecret).toMatch(/^v1\./)
    expect(stored?.pendingSealedSecret).not.toContain(started.secret)
    expect(stored?.sealedSecret).toBeNull()
  })

  it('links once a code from the app is entered, and signs this browser in', async () => {
    const { secret } = await s.start()
    const session = await s.confirm(codeAt(secret, s.clock.now()))
    expect(await s.check(session.token)).toEqual({ linked: true, signedIn: true })
  })

  it('refuses a wrong confirmation code and keeps the app unlinked', async () => {
    await s.start()
    await expect(s.confirm('000000')).rejects.toThrow(/not right/)
    expect(await s.check(null)).toEqual({ linked: false, signedIn: false })
  })

  it('signs out sessions from the old app when another one is linked', async () => {
    const first = await s.start()
    const oldSession = await s.confirm(codeAt(first.secret, s.clock.now()))
    s.clock.advance(60_000)
    const second = await s.start()
    // Until the new app is confirmed, the old one keeps working.
    expect((await s.check(oldSession.token)).signedIn).toBe(true)
    const newSession = await s.confirm(codeAt(second.secret, s.clock.now()))
    expect((await s.check(oldSession.token)).signedIn).toBe(false)
    expect((await s.check(newSession.token)).signedIn).toBe(true)
  })
})

describe('signing in', () => {
  let s: ReturnType<typeof setup>
  let secret: string
  beforeEach(async () => {
    s = setup()
    secret = (await s.start()).secret
    await s.confirm(codeAt(secret, s.clock.now()))
    s.clock.advance(30_000)
  })

  it('accepts the current code', async () => {
    const session = await s.signIn(codeAt(secret, s.clock.now()))
    expect((await s.check(session.token)).signedIn).toBe(true)
  })

  it('accepts "123 456" spacing', async () => {
    const code = codeAt(secret, s.clock.now())
    await expect(s.signIn(`${code.slice(0, 3)} ${code.slice(3)}`)).resolves.toBeDefined()
  })

  it('accepts a code from just before, for a phone clock a little behind', async () => {
    const code = codeAt(secret, s.clock.now())
    s.clock.advance(30_000)
    await expect(s.signIn(code)).resolves.toBeDefined()
  })

  it('never accepts the same code twice', async () => {
    const code = codeAt(secret, s.clock.now())
    await s.signIn(code)
    await expect(s.signIn(code)).rejects.toThrow(/already used/)
  })

  it('refuses an old code', async () => {
    const code = codeAt(secret, s.clock.now())
    s.clock.advance(5 * 60_000)
    await expect(s.signIn(code)).rejects.toThrow(/not right/)
  })

  it('pauses sign-in after too many wrong codes, even for the right one', async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await expect(s.signIn('000000')).rejects.toThrow(/not right/)
    await expect(s.signIn(codeAt(secret, s.clock.now()))).rejects.toThrow(/Too many wrong codes/)
    s.clock.advance(LOCK_MS)
    await expect(s.signIn(codeAt(secret, s.clock.now()))).resolves.toBeDefined()
  })

  it('refuses a malformed code without counting it', async () => {
    await expect(s.signIn('12345')).rejects.toThrow(/6-digit/)
    expect((await s.deps.authenticators.get())?.failedAttempts).toBe(0)
  })

  it('refuses a forged or expired session', async () => {
    const session = await s.signIn(codeAt(secret, s.clock.now()))
    const [body] = session.token.split('.')
    expect((await s.check(`${body}.forged`)).signedIn).toBe(false)
    s.clock.advance(31 * 24 * 60 * 60_000)
    expect((await s.check(session.token)).signedIn).toBe(false)
  })
})

describe('before any app is linked', () => {
  it('explains that one must be linked first', async () => {
    const s = setup()
    await expect(s.signIn('123456')).rejects.toThrow(/No authenticator app is linked/)
  })
})
