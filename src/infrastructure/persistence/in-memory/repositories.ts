import type { AuthenticatorRepository } from '../../../application/ports/authenticator-repository'
import type { EventRepository } from '../../../application/ports/event-repository'
import type { ChallengeStore, PasskeyRepository } from '../../../application/ports/passkey-repository'
import type { SubscriptionRepository } from '../../../application/ports/subscription-repository'
import type { AgentEvent, EventCursor } from '../../../domain/agent-event'
import type { Authenticator } from '../../../domain/authenticator'
import type { DeviceSubscription } from '../../../domain/device-subscription'
import type { CeremonyPurpose, Passkey } from '../../../domain/passkey'

// Used when DATABASE_URL is not set (local development) and in tests. Lost on restart.

export class InMemoryPasskeyRepository implements PasskeyRepository {
  private readonly byId = new Map<string, Passkey>()

  async list(): Promise<Passkey[]> {
    return [...this.byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }

  async find(id: string): Promise<Passkey | null> {
    return this.byId.get(id) ?? null
  }

  async add(passkey: Passkey): Promise<void> {
    this.byId.set(passkey.id, passkey)
  }

  async recordUse(id: string, counter: number, at: Date): Promise<void> {
    const passkey = this.byId.get(id)
    if (passkey) this.byId.set(id, { ...passkey, counter, lastUsedAt: at })
  }

  async remove(id: string): Promise<boolean> {
    return this.byId.delete(id)
  }

  async removeAll(): Promise<number> {
    const count = this.byId.size
    this.byId.clear()
    return count
  }
}

export class InMemoryChallengeStore implements ChallengeStore {
  private readonly byChallenge = new Map<string, { purpose: CeremonyPurpose; expiresAt: Date }>()

  async save(challenge: string, purpose: CeremonyPurpose, expiresAt: Date): Promise<void> {
    this.byChallenge.set(challenge, { purpose, expiresAt })
  }

  async take(challenge: string, purpose: CeremonyPurpose, now: Date): Promise<boolean> {
    const entry = this.byChallenge.get(challenge)
    this.byChallenge.delete(challenge)
    return Boolean(entry && entry.purpose === purpose && entry.expiresAt > now)
  }
}

export class InMemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, AgentEvent>()

  async add(event: AgentEvent): Promise<void> {
    this.events.set(event.id, event)
  }

  async get(id: string): Promise<AgentEvent | null> {
    return this.events.get(id) ?? null
  }

  async listPage(after: EventCursor | null, limit: number): Promise<AgentEvent[]> {
    // Same order as Postgres: newest first, then the larger id (lowercase uuids compare like bytes).
    const newestFirst = (a: Pick<AgentEvent, 'receivedAt' | 'id'>, b: Pick<AgentEvent, 'receivedAt' | 'id'>) =>
      b.receivedAt.getTime() - a.receivedAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
    return [...this.events.values()]
      .filter((e) => !after || newestFirst(after, e) < 0)
      .sort(newestFirst)
      .slice(0, limit)
  }

  async count(): Promise<number> {
    return this.events.size
  }

  async delete(id: string): Promise<boolean> {
    return this.events.delete(id)
  }

  async deleteUpTo(upTo: Date): Promise<number> {
    return this.deleteWhere((event) => event.receivedAt <= upTo)
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    return this.deleteWhere((event) => event.receivedAt < cutoff)
  }

  private deleteWhere(test: (event: AgentEvent) => boolean): number {
    let removed = 0
    for (const [id, event] of this.events) {
      if (test(event)) {
        this.events.delete(id)
        removed++
      }
    }
    return removed
  }
}

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly byEndpoint = new Map<string, DeviceSubscription>()

  async upsert(device: DeviceSubscription): Promise<void> {
    this.byEndpoint.set(device.endpoint, device)
  }

  async findByEndpoint(endpoint: string): Promise<DeviceSubscription | null> {
    return this.byEndpoint.get(endpoint) ?? null
  }

  async removeByEndpoint(endpoint: string): Promise<boolean> {
    return this.byEndpoint.delete(endpoint)
  }

  async list(): Promise<DeviceSubscription[]> {
    return [...this.byEndpoint.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  }
}

export class InMemoryAuthenticatorRepository implements AuthenticatorRepository {
  private current: Authenticator | null = null

  async get(): Promise<Authenticator | null> {
    return this.current
  }

  async save(auth: Authenticator): Promise<void> {
    this.current = auth
  }
}
