// Applies migrations/*.sql that have not run yet, in file-name order, each in its own
// transaction. Run it from your computer before the first deploy and after adding a migration.
//
//   DATABASE_URL=postgresql://... npm run migrate
//
// Use Supabase's session pooler or direct connection string here (port 5432), not the
// transaction pooler the app uses (port 6543): advisory locks need a session.
//
// Safe to run more than once, and from two places at once: an advisory lock serialises runs.
// Never edit a migration that has been applied; add a new file instead.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const LOCK_ID = 727_101 // Any constant; identifies this app's migration lock.
const dir = fileURLToPath(new URL('../migrations/', import.meta.url))

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('[migrate] DATABASE_URL is not set; nothing to migrate.')
  process.exit(1)
}

// Same TLS rules as the app (src/infrastructure/persistence/postgres/pool.ts): Supabase requires
// TLS; its certificate is checked when DATABASE_CA_CERT holds Supabase's CA certificate.
let url
try {
  url = new URL(connectionString)
} catch {
  console.error('[migrate] DATABASE_URL is not a valid connection string.')
  console.error('[migrate] - Check it starts with postgresql:// and is wrapped in quotes.')
  console.error('[migrate] - A # in the password breaks it: write # as %23 (and % as %25).')
  process.exit(1)
}
const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
url.searchParams.delete('sslmode')
const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n')
const ssl = local ? undefined : ca ? { ca } : { rejectUnauthorized: false }
const client = new pg.Client({ connectionString: url.toString(), ssl })
// A refused connection can still report a reset socket afterwards; the explanation below covers it.
client.on('error', () => {})
try {
  await client.connect()
} catch (error) {
  explainConnectionProblem(url, error)
  process.exit(1)
}

/**
 * Says which usual mistake in a Supabase connection string caused a refused sign-in.
 * Shows the user, host and the password's length, never the password.
 */
function explainConnectionProblem(url, error) {
  // Connecting to "localhost" tries IPv6 and IPv4 and reports both in an AggregateError, whose message is empty.
  const reason = error.message || error.errors?.map((e) => e.message).join('; ') || error.code || String(error)
  console.error(`[migrate] could not connect: ${reason}`)
  const signInRefused = error.code === '28P01' || /tenant or user not found/i.test(error.message)
  if (!signInRefused) return

  let password = url.password
  try {
    password = decodeURIComponent(url.password)
  } catch {
    console.error('[migrate] - The password has a "%" that is not part of a %XX code. Write a literal % as %25.')
  }
  console.error(`[migrate] Tried user "${decodeURIComponent(url.username)}" at ${url.hostname}:${url.port || 5432}, password ${password.length} characters.`)

  const hints = []
  if (/YOUR[-_ ]?PASSWORD/i.test(password) || /^\[.*\]$/.test(password)) {
    hints.push('The password is still the [YOUR-PASSWORD] placeholder, or keeps its square brackets. Replace the whole [YOUR-PASSWORD], brackets included, with your database password.')
  }
  if (url.hash) {
    hints.push('The string contains "#", which cut the password short. In the password, write # as %23.')
  }
  if (/[\s?/@:]/.test(password)) {
    hints.push('The password contains a space, ?, /, @ or :. In the string, write them as %20, %3F, %2F, %40 and %3A.')
  }
  if (url.hostname.endsWith('pooler.supabase.com') && !decodeURIComponent(url.username).includes('.')) {
    hints.push('The pooler needs the user "postgres.<project-ref>", not just "postgres". Copy the user from Supabase → Connect → Session pooler.')
  }
  if (hints.length === 0) {
    hints.push(
      'The string looks well formed, so the password itself is probably wrong. Reset it in Supabase → ' +
        'Project Settings → Database → Reset database password, then use the new one.',
    )
  }
  for (const hint of hints) console.error(`[migrate] - ${hint}`)
}

try {
  await client.query('select pg_advisory_lock($1)', [LOCK_ID])
  await client.query(`
    create table if not exists schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    )`)

  const { rows } = await client.query('select version from schema_migrations')
  const applied = new Set(rows.map((r) => r.version))
  const pending = (await readdir(dir)).filter((f) => f.endsWith('.sql') && !applied.has(f)).sort()

  for (const file of pending) {
    const sql = await readFile(dir + file, 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into schema_migrations (version) values ($1)', [file])
      await client.query('commit')
      console.log(`[migrate] applied ${file}`)
    } catch (error) {
      await client.query('rollback')
      throw new Error(`${file} failed: ${error.message}`, { cause: error })
    }
  }
  if (pending.length === 0) console.log('[migrate] up to date')
} catch (error) {
  console.error(`[migrate] ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
