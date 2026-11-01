import webpush from 'web-push'
import type { DeviceSubscription } from '../../domain/device-subscription'
import type { DeliveryResult, Notifier } from '../../application/ports/notifier'
import type { NotificationMessage } from '../../application/notification-message'

export interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

// How long the push service keeps a message for a phone that is offline. A question goes stale
// fast (you'll see it at the computer); a finished summary is worth reading later.
const TTL_SECONDS: Record<NotificationMessage['kind'], number> = {
  'needs-input': 60 * 60,
  finished: 6 * 60 * 60,
  test: 5 * 60,
}

export class WebPushNotifier implements Notifier {
  constructor(private readonly vapid: VapidConfig) {}

  async send(device: DeviceSubscription, message: NotificationMessage): Promise<DeliveryResult> {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: device.keys },
        JSON.stringify(message),
        {
          vapidDetails: this.vapid,
          TTL: TTL_SECONDS[message.kind],
          // High urgency wakes an Android phone from Doze at once; normal may wait for a while.
          urgency: 'high',
        },
      )
      return 'delivered'
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      // 404/410: the push service says this subscription no longer exists.
      if (status === 404 || status === 410) return 'gone'
      console.error(`[push] delivery to "${device.label}" failed`, status ?? '', (error as Error).message)
      return 'failed'
    }
  }
}

/** Used when VAPID keys are not configured, so the app still runs and reports the problem. */
export class DisabledNotifier implements Notifier {
  async send(device: DeviceSubscription): Promise<DeliveryResult> {
    console.error(`[push] not sending to "${device.label}": VAPID keys are not configured`)
    return 'failed'
  }
}
