import { normalizeDeviceLabel } from '../../domain/device-subscription'
import { notifyDevices, type DeliverySummary, type NotifyDeps } from '../notify-devices'
import { testMessage } from '../notification-message'

/** Pushes a test to every phone, so setup can be checked without running Claude. */
export function sendTestNotification(deps: NotifyDeps) {
  return async (label: unknown): Promise<DeliverySummary> =>
    notifyDevices(deps, testMessage(normalizeDeviceLabel(label)))
}
