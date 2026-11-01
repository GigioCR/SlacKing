// Service worker: shows push notifications and opens the summary when one is tapped.
// It intercepts no requests. Cache Storage is used only to hand a tapped link to the app
// (see rememberTarget below), never to cache pages.

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
    data: { url: message.url || '/' },
  })
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data || {}).url || '/', self.location.origin).href

  event.waitUntil(
    (async () => {
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
    })(),
  )
})
