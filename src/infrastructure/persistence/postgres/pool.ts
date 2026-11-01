import pg from 'pg'

export type Pool = pg.Pool

export interface PoolOptions {
  connectionString: string
  /** Supabase's CA certificate (PEM). With it, the server's certificate is checked. */
  caCert: string | null
}

// One small pool per serverless instance. Use Supabase's transaction pooler (port 6543): Vercel
// starts many short-lived instances, and the pooler shares a few real connections among them.
// pg never uses named prepared statements unless asked, which the transaction pooler needs.
// The schema comes from migrations/ (scripts/migrate.mjs), never from here.
export function createPool({ connectionString, caCert }: PoolOptions): Pool {
  const url = new URL(connectionString)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  // sslmode in the address would override the ssl option below, so it is removed.
  url.searchParams.delete('sslmode')
  const ssl = local ? undefined : caCert ? { ca: caCert } : { rejectUnauthorized: false }
  const pool = new pg.Pool({ connectionString: url.toString(), ssl, max: 3, idleTimeoutMillis: 10_000 })
  // An idle connection dropped by the server must not crash the process; the next query reconnects.
  pool.on('error', (error) => console.error('[db] idle connection error', error.message))
  return pool
}
