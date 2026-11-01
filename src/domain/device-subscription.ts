import { InvalidInputError } from './errors'

export interface PushKeys {
  readonly p256dh: string
  readonly auth: string
}

// One phone (or browser) that has turned on notifications. Unique by `endpoint`.
export interface DeviceSubscription {
  readonly id: string
  /** What this device is called, e.g. "Pixel 8". */
  readonly label: string
  readonly endpoint: string
  readonly keys: PushKeys
  readonly createdAt: Date
}

const MAX_LABEL = 60

export function normalizeDeviceLabel(raw: unknown): string {
  const label = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  if (label.length === 0) throw new InvalidInputError('Give this device a name')
  if (label.length > MAX_LABEL) throw new InvalidInputError(`Device name is too long (max ${MAX_LABEL})`)
  return label
}

export function parsePushSubscription(raw: unknown): { endpoint: string; keys: PushKeys } {
  if (typeof raw !== 'object' || raw === null) throw new InvalidInputError('Missing subscription')
  const { endpoint, keys } = raw as { endpoint?: unknown; keys?: unknown }
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    throw new InvalidInputError('Subscription endpoint must be an https URL')
  }
  if (typeof keys !== 'object' || keys === null) throw new InvalidInputError('Subscription keys are missing')
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown }
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) {
    throw new InvalidInputError('Subscription keys are incomplete')
  }
  return { endpoint, keys: { p256dh, auth } }
}
