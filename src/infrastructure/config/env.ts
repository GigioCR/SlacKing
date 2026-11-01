import type { VapidConfig } from '../push/web-push-notifier'

export interface AppConfig {
  /** Postgres connection string (Supabase transaction pooler). Without it, data is kept in memory. */
  databaseUrl: string | null
  /** Supabase's CA certificate, to check the database's identity. */
  databaseCaCert: string | null
  /** The hook on the computer sends this as a bearer token. */
  webhookSecret: string | null
  /** Needed to link (or re-link) the authenticator app; the way back in after losing the phone. */
  setupCode: string | null
  /** Signs sign-in sessions. */
  sessionSecret: string | null
  /** Seals the authenticator secret before it is stored. */
  encryptionKey: string | null
  vapid: VapidConfig | null
  /**
   * The app's public address, e.g. https://slac-king.vercel.app. Passkeys belong to it. Without
   * it, each request's own address is used, which is right unless a proxy rewrites the host.
   */
  appOrigin: string | null
  /** Problems worth logging at startup. Never contains secret values. */
  warnings: string[]
}

type Env = Record<string, string | undefined>

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function requireLong(name: string, value: string | null, purpose: string, warnings: string[]): string | null {
  if (!value) warnings.push(`${name} is not set: ${purpose}`)
  else if (value.length < 32) warnings.push(`${name} is short; use at least 32 random characters (npm run secrets)`)
  return value
}

export function loadConfig(env: Env): AppConfig {
  const warnings: string[] = []

  const databaseUrl = nonEmpty(env.DATABASE_URL)
  if (!databaseUrl) warnings.push('DATABASE_URL is not set: notifications and phones are kept in memory and lost on restart')
  // Vercel's settings screen keeps newlines; a value pasted on one line may carry "\n" instead.
  const databaseCaCert = nonEmpty(env.DATABASE_CA_CERT)?.replace(/\\n/g, '\n') ?? null
  if (databaseUrl && !databaseCaCert) {
    warnings.push("DATABASE_CA_CERT is not set: the database connection is encrypted but its certificate isn't checked")
  }

  const webhookSecret = requireLong('WEBHOOK_SECRET', nonEmpty(env.WEBHOOK_SECRET), 'the webhook refuses every call', warnings)
  const setupCode = requireLong('SETUP_CODE', nonEmpty(env.SETUP_CODE), 'no authenticator app can be linked', warnings)
  const sessionSecret = requireLong('SESSION_SECRET', nonEmpty(env.SESSION_SECRET), 'nobody can sign in', warnings)
  const encryptionKey = requireLong('ENCRYPTION_KEY', nonEmpty(env.ENCRYPTION_KEY), 'no authenticator app can be linked or used', warnings)

  const publicKey = nonEmpty(env.VAPID_PUBLIC_KEY)
  const privateKey = nonEmpty(env.VAPID_PRIVATE_KEY)
  const subject = nonEmpty(env.VAPID_SUBJECT)
  const vapid = publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null
  if (!vapid) warnings.push('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must all be set to send notifications')

  const appOrigin = parseOrigin(nonEmpty(env.APP_ORIGIN), warnings)

  return { databaseUrl, databaseCaCert, webhookSecret, setupCode, sessionSecret, encryptionKey, vapid, appOrigin, warnings }
}

function parseOrigin(raw: string | null, warnings: string[]): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol === 'https:' || url.hostname === 'localhost') return url.origin
  } catch {
    // Reported below.
  }
  warnings.push('APP_ORIGIN must be the https address of the app, e.g. https://slac-king.vercel.app; ignored')
  return null
}
