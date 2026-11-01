// Service worker: shows push notifications, sends an answer when one of their buttons is tapped,
// and opens the summary when the notification itself is tapped. It intercepts no requests. Cache
// Storage is used only to hand a tapped link to the app (see rememberTarget below), never to
// cache pages.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let message
  try {
    message = event.data ? event.data.json() : null
  } catch {
    message = null
  }
  // Every push must show something, or browsers may revoke the subscription.
  message = message || { title: 'Claude', body: 'Open the app for details.', kind: 'finished', tag: 'claude', url: '/' }
  event.waitUntil(Promise.all([showNotification(message), tellOpenWindows()]))
})

function showNotification(message) {
  return self.registration.showNotification(message.title, {
    body: message.body,
    tag: message.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    // A newer notification from the same session replaces the old one, and still makes a sound.
    renotify: true,
    // A question stays on screen until it is dealt with (desktop Chrome; Android always keeps them).
    requireInteraction: message.kind === 'needs-input',
    // The buttons; what each sends is kept in data (src/application/notification-message.ts).
    actions: (message.actions || []).map((a) => ({ action: a.id, title: a.title })),
    data: { url: message.url || '/', replyUrl: message.replyUrl || null, actions: message.actions || [] },
  })
}

/**
 * Sends a button's answer. On success the notification briefly says so; when it can't be sent
 * (signed out, offline, or Claude stopped waiting) the notification's screen opens, which says why.
 */
async function sendReply(notification, action, target) {
  const { replyUrl } = notification.data || {}
  let sent = false
  try {
    const response = await fetch(replyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(action.reply),
      credentials: 'same-origin',
    })
    sent = response.ok
  } catch {
    sent = false
  }
  if (!sent) return openApp(target)

  await tellOpenWindows()
  await self.registration.showNotification(`Sent: ${action.title}`, {
    body: notification.title,
    tag: notification.tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    silent: true,
    data: { url: target },
  })
  // Gone again after a moment; it was only there to confirm.
  await new Promise((resolve) => setTimeout(resolve, 4000))
  for (const shown of await self.registration.getNotifications({ tag: notification.tag })) {
    if (shown.title === `Sent: ${action.title}`) shown.close()
  }
}

// The app's open windows reload the inbox as soon as a push arrives. Keep the message type in
// step with app/_lib/push.ts (EVENTS_CHANGED).
async function tellOpenWindows() {
  try {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (typeof client.postMessage === 'function') client.postMessage({ type: 'events-changed' })
    }
  } catch {
    // The notification still shows; the windows refresh on their own timer.
  }
}

// Where a tap meant to go, for the app to pick up when it starts (app/_lib/deep-link.ts).
// Needed on Android when the app is installed and closed: Chrome then starts it on its home
// page and ignores the address given to openWindow(). Keep these names in step with that file.
const DEEP_LINK_CACHE = 'deep-link'
const DEEP_LINK_KEY = '/__deep-link'

async function rememberTarget(target) {
  try {
    const cache = await caches.open(DEEP_LINK_CACHE)
    await cache.put(DEEP_LINK_KEY, new Response(JSON.stringify({ url: target, at: Date.now() })))
  } catch {
    // Without Cache Storage the tap still opens the app; it just may land on the inbox.
  }
}

async function openApp(target) {
  await rememberTarget(target)
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
  if (open) {
    try {
      await open.focus()
      await open.navigate(target)
      return
    } catch {
      // navigate() is not available everywhere; fall through and open a window.
    }
  }
  await self.clients.openWindow(target)
}

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification
  notification.close()
  const data = notification.data || {}
  const target = new URL(data.url || '/', self.location.origin).href
  // A button that carries an answer sends it; any other button, or the notification, opens it.
  const action = event.action ? (data.actions || []).find((a) => a.id === event.action) : null
  event.waitUntil(action && action.reply && data.replyUrl ? sendReply(notification, action, target) : openApp(target))
})
