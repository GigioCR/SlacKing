import { Secret, TOTP } from 'otpauth'
import type { OneTimeCodes } from '../../application/ports/one-time-codes'

// Standard TOTP (RFC 6238): SHA-1, 6 digits, a new code every 30 seconds. These are the settings
// Microsoft Authenticator, Google Authenticator and every other authenticator app expect.
const PERIOD_SECONDS = 30
const ISSUER = 'SlacKing'
// Accept the code before and after the current one, for a phone clock a little off.
const WINDOW = 1

function totp(secret: string, account: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label: account,
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD_SECONDS,
    secret: Secret.fromBase32(secret),
  })
}

export class OtpauthCodes implements OneTimeCodes {
  newSecret(): string {
    // 160 bits, the size RFC 4226 recommends.
    return new Secret({ size: 20 }).base32
  }

  enrollmentUri(secret: string, account: string): string {
    return totp(secret, account).toString()
  }

  matchStep(secret: string, code: string, now: Date): number | null {
    const timestamp = now.getTime()
    const delta = totp(secret, ISSUER).validate({ token: code, timestamp, window: WINDOW })
    if (delta === null) return null
    return Math.floor(timestamp / 1000 / PERIOD_SECONDS) + delta
  }
}
