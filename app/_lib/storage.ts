// localStorage can be missing or throw (private windows, blocked site data), so every
// access is guarded and the app still renders without it.

const KEYS = {
  label: 'slk.deviceLabel',
  seen: 'slk.seenEvents',
} as const

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: nothing to do.
  }
}

const MAX_SEEN = 300

export const storage = {
  getLabel: () => read(KEYS.label),
  setLabel: (label: string | null) => write(KEYS.label, label),

  /** Notifications opened on this device, so the inbox can mark the rest as new. */
  seenIds(): Set<string> {
    try {
      const parsed: unknown = JSON.parse(read(KEYS.seen) ?? '[]')
      return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
    } catch {
      return new Set()
    }
  },
  markSeen(ids: string[]): void {
    const seen = storage.seenIds()
    const before = seen.size
    for (const id of ids) seen.add(id)
    if (seen.size !== before) write(KEYS.seen, JSON.stringify([...seen].slice(-MAX_SEEN)))
  },
}
