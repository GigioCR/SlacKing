export interface IssuedSession {
  token: string
  expiresAt: Date
}

/** Signed sign-in sessions, kept by the browser in a cookie. */
export interface SessionTokens {
  issue(generation: number, now: Date): IssuedSession
  /** The authenticator generation the session was made with, or null if it is forged or expired. */
  read(token: string | null | undefined, now: Date): { generation: number } | null
}
