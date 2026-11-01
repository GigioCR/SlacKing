import type { DeviceSubscription } from '../../domain/device-subscription'

export interface SubscriptionRepository {
  /** Insert or replace, keyed by endpoint. */
  upsert(device: DeviceSubscription): Promise<void>
  findByEndpoint(endpoint: string): Promise<DeviceSubscription | null>
  removeByEndpoint(endpoint: string): Promise<boolean>
  list(): Promise<DeviceSubscription[]>
}
