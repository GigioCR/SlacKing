import { describe, expect, it } from 'vitest'
import type { NotificationMessage } from '../src/application/notification-message'
import type { DeliveryResult, Notifier } from '../src/application/ports/notifier'
import { receiveAgentEvent } from '../src/application/use-cases/receive-agent-event'
import { NO_PROMPT } from '../src/domain/agent-event'
import type { DeviceSubscription } from '../src/domain/device-subscription'
import {
  InMemoryEventRepository,
  InMemorySubscriptionRepository,
} from '../src/infrastructure/persistence/in-memory/repositories'

class RecordingNotifier implements Notifier {
  sent: { device: string; message: NotificationMessage }[] = []
  constructor(private readonly results: Record<string, DeliveryResult> = {}) {}
  async send(device: DeviceSubscription, message: NotificationMessage): Promise<DeliveryResult> {
    this.sent.push({ device: device.label, message })
    return this.results[device.label] ?? 'delivered'
  }
}

function phone(label: string): DeviceSubscription {
  return {
    id: label,
    label,
    endpoint: `https://push.example/${label}`,
    keys: { p256dh: 'p', auth: 'a' },
    createdAt: new Date('2026-10-01T00:00:00Z'),
  }
}

async function setup(results?: Record<string, DeliveryResult>) {
  const events = new InMemoryEventRepository()
  const subscriptions = new InMemorySubscriptionRepository()
  await subscriptions.upsert(phone('Pixel'))
  await subscriptions.upsert(phone('Old phone'))
  const notifier = new RecordingNotifier(results)
  let n = 0
  const now = new Date('2026-10-27T12:00:00Z')
  const receive = receiveAgentEvent({
    events,
    subscriptions,
    notifier,
    ids: { next: () => `id-${++n}` },
    clock: { now: () => now },
  })
  return { events, subscriptions, notifier, receive }
}

const body = { kind: 'finished', sessionId: 's1', sessionTitle: 'Fix sync', project: 'syncware', summary: 'Done.' }

describe('receiveAgentEvent', () => {
  it('keeps the event and pushes it to every phone', async () => {
    const s = await setup()
    const result = await s.receive(body)
    expect(result).toEqual({ id: 'id-1', delivered: 2, failed: 0, removed: 0, pruned: 0 })
    expect(s.notifier.sent.map((x) => x.device)).toEqual(['Pixel', 'Old phone'])
    expect(s.notifier.sent[0].message.url).toBe('/events/id-1')
    expect((await s.events.get('id-1'))?.summary).toBe('Done.')
  })

  it('forgets a phone the push service says is gone', async () => {
    const s = await setup({ 'Old phone': 'gone' })
    const result = await s.receive(body)
    expect(result.removed).toBe(1)
    expect((await s.subscriptions.list()).map((d) => d.label)).toEqual(['Pixel'])
  })

  it('deletes notifications older than seven days', async () => {
    const s = await setup()
    await s.events.add({ ...body, kind: 'finished', id: 'old', receivedAt: new Date('2026-10-19T00:00:00Z'), ...NO_PROMPT })
    await s.events.add({ ...body, kind: 'finished', id: 'recent', receivedAt: new Date('2026-10-21T00:00:00Z'), ...NO_PROMPT })
    const result = await s.receive(body)
    expect(result.pruned).toBe(1)
    expect(await s.events.get('old')).toBeNull()
    expect(await s.events.get('recent')).not.toBeNull()
  })

  it('refuses a bad body before storing or sending anything', async () => {
    const s = await setup()
    await expect(s.receive({ kind: 'finished' })).rejects.toThrow(/sessionId/)
    expect(s.notifier.sent).toHaveLength(0)
    expect(await s.events.count()).toBe(0)
  })
})
