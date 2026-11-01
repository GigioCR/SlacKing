// Fills the local Docker database with realistic notifications spread over the last few days, to
// try the inbox (paging, clearing, day headings) without Claude or a phone.
//
//   npm run seed            (adds 40, keeps what is there)
//   npm run seed -- 60 --fresh
//
// Refuses any database that isn't on this computer, so it can never touch Supabase.

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'

function envLocal(name) {
  if (process.env[name]) return process.env[name]
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`))
    return line?.slice(name.length + 1).trim()
  } catch {
    return undefined
  }
}

const connectionString = envLocal('DATABASE_URL')
if (!connectionString) {
  console.error('[seed] DATABASE_URL is not set (in .env.local or the environment).')
  process.exit(1)
}
const host = new URL(connectionString).hostname
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(`[seed] refusing to seed ${host}: only a database on this computer can be seeded.`)
  process.exit(1)
}

const count = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 40)
const fresh = process.argv.includes('--fresh')

const sessions = [
  ['Fix invoice sync for El Arroyo', 'hecho-syncware'],
  ['Cancels tab: brand-store check', 'hecho-syncware'],
  ['Sound/notification for decisions', 'Slacking'],
  ['Dotario Monitor: Vercel usage alerts', 'dotario-monitor'],
  ['Faire payment fees handoff', 'qbo-migration'],
]
const finished = [
  'Added the cancels tab and its tests. All 112 tests pass; nothing is committed yet.',
  'Fixed the invoice sync: shipping-only invoices no longer double count. Checked against the El Arroyo CSV, totals now match.',
  'The migration ran on the test database. Two products still need a manual link; the report lists them.',
  'Refactored the webhook parser into its own module. Behaviour is unchanged and the build passes.\n\nQuestion: Open a PR for it?',
  'Investigated the slow scan: the catalog query ran once per product. Batched it, 40s down to 3s.',
  'Updated the README with the PowerShell commands and pushed to main.',
]
const needsInput = [
  'Wants to run: git push origin main\n(Push the branch)',
  'Asks: Which store should the backfill run on first?',
  'Wants to edit app/scan/products/page.tsx',
  'Has a plan ready and wants your approval.',
  'Wants to run: npm run migrate\n(Apply the new migration to the test database)',
]

const client = new pg.Client({ connectionString })
await client.connect()
try {
  if (fresh) await client.query('delete from agent_events')
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    // Spread over about four days, denser recently, a few landing in the same minute.
    const minutesAgo = Math.round(Math.pow(i / count, 1.6) * 4 * 24 * 60) + (i % 3)
    const [title, project] = sessions[i % sessions.length]
    const kind = i % 4 === 1 ? 'needs-input' : 'finished'
    const pool = kind === 'finished' ? finished : needsInput
    await client.query(
      `insert into agent_events (id, kind, session_id, session_title, project, summary, received_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), kind, `seed-${i % sessions.length}`, title, project, pool[i % pool.length], new Date(now - minutesAgo * 60_000)],
    )
  }
  const { rows } = await client.query('select count(*)::int as n from agent_events')
  console.log(`[seed] added ${count}; the inbox now has ${rows[0].n}.`)
} finally {
  await client.end()
}
