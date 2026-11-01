// Where a tapped notification meant to go, left by the service worker (public/sw.js,
// rememberTarget). On Android, an installed app that was closed is started on its home page
// whatever address the tap asked for, so the app checks for this when it starts.
// Keep these names in step with public/sw.js.
const DEEP_LINK_CACHE = 'deep-link'
const DEEP_LINK_KEY = '/__deep-link'

// Long enough for a cold start of the app, short enough that an old tap is never replayed.
const MAX_AGE_MS = 2 * 60_000

/**
 * The path to go to, or null to stay. Only a recent tap, only within this site, and only
 * when the app is not already there (the tap often works, and then there is nothing to do).
 */
export function deepLinkToFollow(record: unknown, now: number, here: { origin: string; pathname: string }): string | null {
  if (typeof record !== 'object' || record === null) return null
  const { url, at } = record as { url?: unknown; at?: unknown }
  if (typeof url !== 'string' || typeof at !== 'number' || now - at > MAX_AGE_MS || at > now + 60_000) return null
  let target: URL
  try {
    target = new URL(url, here.origin)
  } catch {
    return null
  }
  if (target.origin !== here.origin || target.pathname === here.pathname) return null
  return target.pathname + target.search + target.hash
}

/** Reads and clears the service worker's note. Never throws: on any trouble the app just stays put. */
export async function takeDeepLink(): Promise<string | null> {
  try {
    if (!('caches' in window)) return null
    const cache = await caches.open(DEEP_LINK_CACHE)
    const response = await cache.match(DEEP_LINK_KEY)
    if (!response) return null
    await cache.delete(DEEP_LINK_KEY)
    return deepLinkToFollow(await response.json(), Date.now(), window.location)
  } catch {
    return null
  }
}
