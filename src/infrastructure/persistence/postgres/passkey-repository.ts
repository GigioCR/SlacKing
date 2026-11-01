import type { ChallengeStore, PasskeyRepository } from '../../../application/ports/passkey-repository'
import type { CeremonyPurpose, Passkey } from '../../../domain/passkey'
import type { Pool } from './pool'

// Tables defined in migrations/002_passkeys.sql.

interface PasskeyRow {
  id: string
  public_key: string
  counter: string // bigint comes back as text
  transports: string[]
  label: string
  created_at: Date
  last_used_at: Date | null
}

function toPasskey(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    publicKey: row.public_key,
    counter: Number(row.counter),
    transports: row.transports,
    label: row.label,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

export class PostgresPasskeyRepository implements PasskeyRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Passkey[]> {
    const { rows } = await this.pool.query<PasskeyRow>('select * from passkeys order by created_at')
    return rows.map(toPasskey)
  }

  async find(id: string): Promise<Passkey | null> {
    const { rows } = await this.pool.query<PasskeyRow>('select * from passkeys where id = $1', [id])
    return rows[0] ? toPasskey(rows[0]) : null
  }

  async add(passkey: Passkey): Promise<void> {
    await this.pool.query(
      `insert into passkeys (id, public_key, counter, transports, label, created_at, last_used_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        passkey.id,
        passkey.publicKey,
        passkey.counter,
        passkey.transports,
        passkey.label,
        passkey.createdAt,
        passkey.lastUsedAt,
      ],
    )
  }

  async recordUse(id: string, counter: number, at: Date): Promise<void> {
    await this.pool.query('update passkeys set counter = $2, last_used_at = $3 where id = $1', [id, counter, at])
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.pool.query('delete from passkeys where id = $1', [id])
    return (result.rowCount ?? 0) > 0
  }

  async removeAll(): Promise<number> {
    const result = await this.pool.query('delete from passkeys')
    return result.rowCount ?? 0
  }
}

export class PostgresChallengeStore implements ChallengeStore {
  constructor(private readonly pool: Pool) {}

  async save(challenge: string, purpose: CeremonyPurpose, expiresAt: Date): Promise<void> {
    // Unanswered prompts are swept here, so the table never grows.
    await this.pool.query('delete from webauthn_challenges where expires_at < now()')
    await this.pool.query('insert into webauthn_challenges (challenge, purpose, expires_at) values ($1, $2, $3)', [
      challenge,
      purpose,
      expiresAt,
    ])
  }

  async take(challenge: string, purpose: CeremonyPurpose, now: Date): Promise<boolean> {
    // Deleting is what makes it one use: two answers racing can't both get the row back.
    const { rowCount } = await this.pool.query(
      'delete from webauthn_challenges where challenge = $1 and purpose = $2 and expires_at > $3',
      [challenge, purpose, now],
    )
    return (rowCount ?? 0) > 0
  }
}
