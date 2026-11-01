import { api } from './api'
import { storage } from './storage'

export type PushState = 'checking' | 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

export function isIOS(): boolean {
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac with a touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Sent by public/sw.js to every open window when a push arrives (tellOpenWindows there).
const EVENTS_CHANGED = 'events-changed'

/** Calls `onChange` whenever a push arrives while the app is open. Returns the function that stops. */
export function onEventsChanged(onChange: () => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const listener = (event: MessageEvent) => {
    if ((event.data as { type?: unknown } | null)?.type === EVENTS_CHANGED) onChange()
  }
  navigator.serviceWorker.addEventListener('message', listener)
  // Messages wait in a queue until this is called (or onmessage is set).
  navigator.serviceWorker.startMessages()
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // The setup screen shows push as unsupported if this failed.
  })
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

export async function readPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator)) return 'unsupported'
  // On iPhone, push exists only for an app installed to the Home Screen.
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await readyRegistration()
  if (!registration) return 'unsupported'
  const subscription = await registration.pushManager.getSubscription()
  return subscription && Notification.permission === 'granted' ? 'on' : 'off'
}

/**
 * Asks for permission and subscribes. Must be called straight from a tap: the permission
 * prompt is the first thing awaited, so the browser still sees the user gesture.
 */
export async function enablePush(label: string): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return 'denied'
  if (permission !== 'granted') return 'off'

  const registration = await readyRegistration()
  if (!registration) return 'unsupported'

  const { publicKey } = await api<{ publicKey: string }>('/api/push/public-key')
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))

  await api('/api/push/subscribe', { method: 'POST', body: { label, subscription: subscription.toJSON() } })
  storage.setLabel(label)
  return 'on'
}

export async function disablePush(): Promise<void> {
  const registration = await readyRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } })
    await subscription.unsubscribe()
  }
}

/**
 * Re-sends this phone's subscription each time the app opens. Push services occasionally rotate
 * a subscription; this keeps the server's copy current.
 */
export async function syncSubscription(): Promise<void> {
  try {
    const label = storage.getLabel()
    if (!label || !('PushManager' in window) || Notification.permission !== 'granted') return
    const registration = await readyRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    await api('/api/push/subscribe', { method: 'POST', body: { label, subscription: subscription.toJSON() } })
  } catch {
    // Best effort. The setup screen shows the real state.
  }
}
