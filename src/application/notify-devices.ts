import type { NotificationMessage } from './notification-message'
import type { Notifier } from './ports/notifier'
import type { SubscriptionRepository } from './ports/subscription-repository'

export interface NotifyDeps {
  subscriptions: SubscriptionRepository
  notifier: Notifier
}

export interface DeliverySummary {
  delivered: number
  failed: number
  removed: number
}

/** Sends to every subscribed device and forgets devices that are gone. */
export async function notifyDevices(deps: NotifyDeps, message: NotificationMessage): Promise<DeliverySummary> {
  const devices = await deps.subscriptions.list()
  const results = await Promise.all(
    devices.map(async (device) => ({ device, result: await deps.notifier.send(device, message) })),
  )
  const summary: DeliverySummary = { delivered: 0, failed: 0, removed: 0 }
  for (const { device, result } of results) {
    if (result === 'delivered') summary.delivered++
    else if (result === 'failed') summary.failed++
    else {
      await deps.subscriptions.removeByEndpoint(device.endpoint)
      summary.removed++
    }
  }
  return summary
}
