import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IssuedSession, SessionTokens } from '../../application/ports/session-tokens'

// A session is "<payload>.<signature>", both base64url. The payload says which authenticator
// generation made it and when it expires; the HMAC-SHA256 signature, keyed by SESSION_SECRET,
// stops anyone from writing their own. Changing SESSION_SECRET signs everyone out.

export const SESSION_DAYS = 30

interface Payload {
  g: number
  exp: number
}

export class HmacSessionTokens implements SessionTokens {
  constructor(private readonly secret: string) {}

  issue(generation: number, now: Date): IssuedSession {
    const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60_000)
    const payload: Payload = { g: generation, exp: expiresAt.getTime() }
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return { token: `${body}.${this.sign(body)}`, expiresAt }
  }

  read(token: string | null | undefined, now: Date): { generation: number } | null {
    if (!token) return null
    const [body, signature, extra] = token.split('.')
    if (!body || !signature || extra !== undefined) return null
    const expected = Buffer.from(this.sign(body))
    const given = Buffer.from(signature)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<Payload>
      if (typeof payload.g !== 'number' || typeof payload.exp !== 'number') return null
      if (payload.exp <= now.getTime()) return null
      return { generation: payload.g }
    } catch {
      return null
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url')
  }
}
