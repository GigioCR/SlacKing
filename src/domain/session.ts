// How long a sign-in lasts, and when it is extended. A session ends SESSION_DAYS after the last
// visit, not after signing in: each visit with less than a day used up issues a fresh one, so the
// phone app stays signed in for as long as it keeps being opened.

export const SESSION_DAYS = 30
const DAY_MS = 24 * 60 * 60_000

export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_DAYS * DAY_MS)
}

/** True once a session has been in use for a day: renewing then keeps cookies from churning. */
export function shouldRenew(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() - now.getTime() < (SESSION_DAYS - 1) * DAY_MS
}
