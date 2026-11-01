/** Time-based one-time codes (TOTP, RFC 6238): what an authenticator app shows. */
export interface OneTimeCodes {
  /** A new random shared secret, in the form authenticator apps take (base32). */
  newSecret(): string
  /** The otpauth:// address a QR code carries; `account` is the name shown in the app. */
  enrollmentUri(secret: string, account: string): string
  /** The time step the code belongs to (allowing a little clock drift), or null if it is wrong. */
  matchStep(secret: string, code: string, now: Date): number | null
}
