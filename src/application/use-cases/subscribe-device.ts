import {
  normalizeDeviceLabel,
  parsePushSubscription,
  type DeviceSubscription,
} from '../../domain/device-subscription'
import type { Clock } from '../ports/clock'
import type { IdGenerator } from '../ports/id-generator'
import type { SubscriptionRepository } from '../ports/subscription-repository'

export interface SubscribeDeviceDeps {
  subscriptions: SubscriptionRepository
  ids: IdGenerator
  clock: Clock
}

export interface SubscribeDeviceInput {
  label: unknown
  subscription: unknown
}

/** Re-subscribing the same endpoint keeps its id, so a phone stays one device. */
export function subscribeDevice(deps: SubscribeDeviceDeps) {
  return async (input: SubscribeDeviceInput): Promise<{ id: string; label: string }> => {
    const label = normalizeDeviceLabel(input.label)
    const { endpoint, keys } = parsePushSubscription(input.subscription)
    const existing = await deps.subscriptions.findByEndpoint(endpoint)
    const device: DeviceSubscription = {
      id: existing?.id ?? deps.ids.next(),
      label,
      endpoint,
      keys,
      createdAt: existing?.createdAt ?? deps.clock.now(),
    }
    await deps.subscriptions.upsert(device)
    return { id: device.id, label: device.label }
  }
}
