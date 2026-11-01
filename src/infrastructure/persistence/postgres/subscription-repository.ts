import type { SubscriptionRepository } from '../../../application/ports/subscription-repository'
import type { DeviceSubscription } from '../../../domain/device-subscription'
import type { Pool } from './pool'

// Table defined in migrations/001_initial.sql.

interface SubscriptionRow {
  id: string
  label: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: Date
}

function toDevice(row: SubscriptionRow): DeviceSubscription {
  return {
    id: row.id,
    label: row.label,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    createdAt: row.created_at,
  }
}

export class PostgresSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(device: DeviceSubscription): Promise<void> {
    await this.pool.query(
      `insert into device_subscriptions (id, label, endpoint, p256dh, auth, created_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (endpoint) do update set
         label = excluded.label, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now()`,
      [device.id, device.label, device.endpoint, device.keys.p256dh, device.keys.auth, device.createdAt],
    )
  }

  async findByEndpoint(endpoint: string): Promise<DeviceSubscription | null> {
    const { rows } = await this.pool.query<SubscriptionRow>(
      'select * from device_subscriptions where endpoint = $1',
      [endpoint],
    )
    return rows[0] ? toDevice(rows[0]) : null
  }

  async removeByEndpoint(endpoint: string): Promise<boolean> {
    const result = await this.pool.query('delete from device_subscriptions where endpoint = $1', [endpoint])
    return (result.rowCount ?? 0) > 0
  }

  async list(): Promise<DeviceSubscription[]> {
    const { rows } = await this.pool.query<SubscriptionRow>('select * from device_subscriptions order by created_at')
    return rows.map(toDevice)
  }
}
