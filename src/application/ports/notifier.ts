import type { DeviceSubscription } from '../../domain/device-subscription'
import type { NotificationMessage } from '../notification-message'

/** `gone` means the device will never receive again (uninstalled, permission revoked). */
export type DeliveryResult = 'delivered' | 'gone' | 'failed'

export interface Notifier {
  send(device: DeviceSubscription, message: NotificationMessage): Promise<DeliveryResult>
}
