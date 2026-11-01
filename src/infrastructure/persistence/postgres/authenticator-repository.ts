import type { AuthenticatorRepository } from '../../../application/ports/authenticator-repository'
import type { Authenticator } from '../../../domain/authenticator'
import type { Pool } from './pool'

// Table defined in migrations/001_initial.sql: one row, id 1.

interface AuthenticatorRow {
  sealed_secret: string | null
  pending_sealed_secret: string | null
  generation: number
  last_used_step: number
  failed_attempts: number
  locked_until: Date | null
  linked_at: Date | null
}

export class PostgresAuthenticatorRepository implements AuthenticatorRepository {
  constructor(private readonly pool: Pool) {}

  async get(): Promise<Authenticator | null> {
    const { rows } = await this.pool.query<AuthenticatorRow>('select * from authenticator where id = 1')
    const row = rows[0]
    if (!row) return null
    return {
      sealedSecret: row.sealed_secret,
      pendingSealedSecret: row.pending_sealed_secret,
      generation: row.generation,
      lastUsedStep: row.last_used_step,
      failedAttempts: row.failed_attempts,
      lockedUntil: row.locked_until,
      linkedAt: row.linked_at,
    }
  }

  async save(auth: Authenticator): Promise<void> {
    await this.pool.query(
      `insert into authenticator (id, sealed_secret, pending_sealed_secret, generation, last_used_step,
                                  failed_attempts, locked_until, linked_at)
       values (1, $1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         sealed_secret = excluded.sealed_secret,
         pending_sealed_secret = excluded.pending_sealed_secret,
         generation = excluded.generation,
         last_used_step = excluded.last_used_step,
         failed_attempts = excluded.failed_attempts,
         locked_until = excluded.locked_until,
         linked_at = excluded.linked_at,
         updated_at = now()`,
      [
        auth.sealedSecret,
        auth.pendingSealedSecret,
        auth.generation,
        auth.lastUsedStep,
        auth.failedAttempts,
        auth.lockedUntil,
        auth.linkedAt,
      ],
    )
  }
}
