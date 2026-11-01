import type { AuthenticatorRepository } from '../../../application/ports/authenticator-repository'
import type { EventRepository } from '../../../application/ports/event-repository'
import type { SubscriptionRepository } from '../../../application/ports/subscription-repository'
import type { AgentEvent } from '../../../domain/agent-event'
import type { Authenticator } from '../../../domain/authenticator'
import type { DeviceSubscription } from '../../../domain/device-subscription'

// Used when DATABASE_URL is not set (local development) and in tests. Lost on restart.

export class InMemoryEventRepository implements EventRepository {
  private readonly events = new Map<string, AgentEvent>()

  async add(event: AgentEvent): Promise<void> {
    this.events.set(event.id, event)
  }

  async get(id: string): Promise<AgentEvent | null> {
    return this.events.get(id) ?? null
  }

  async listRecent(limit: number): Promise<AgentEvent[]> {
    return [...this.events.values()]
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .slice(0, limit)
  }

  async deleteBefore(cutoff: Date): Promise<number> {
    let removed = 0
    for (const [id, event] of this.events) {
      if (event.receivedAt < cutoff) {
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
