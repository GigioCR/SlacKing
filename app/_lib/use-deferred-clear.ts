'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Clearing hides at once but is only sent after a few seconds, so Undo can take it back without
// the server ever having to restore anything. Leaving the screen (or the app) sends what is due.

const UNDO_MS = 5_000

export type ClearRequest = { kind: 'one'; id: string } | { kind: 'all'; upTo: string }

function send(request: ClearRequest): Promise<Response> {
  const url = request.kind === 'one' ? `/api/events/${encodeURIComponent(request.id)}` : `/api/events?upTo=${encodeURIComponent(request.upTo)}`
  // keepalive lets the request finish even if the page is closing.
  return fetch(url, { method: 'DELETE', credentials: 'same-origin', keepalive: true })
}

export interface DeferredClear {
  /** Ids hidden while their Undo is still possible. */
  hiddenIds: Set<string>
  /** Everything at or before this time is hidden (a pending "Clear all"). */
  hiddenUpTo: string | null
  /** Hides now, sends after the undo window. Returns the function that undoes it. */
  clear(request: ClearRequest): () => void
}

export function useDeferredClear(onSent: () => Promise<void> | void): DeferredClear {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [hiddenUpTo, setHiddenUpTo] = useState<string | null>(null)
  const pending = useRef(new Map<number, { request: ClearRequest; timer: number }>())
  const nextKey = useRef(1)
  const onSentRef = useRef(onSent)
  onSentRef.current = onSent

  const unhide = useCallback((request: ClearRequest) => {
    if (request.kind === 'one') {
      setHiddenIds((ids) => {
        const next = new Set(ids)
        next.delete(request.id)
        return next
      })
    } else {
      setHiddenUpTo(null)
    }
  }, [])

  const flush = useCallback(() => {
    for (const [key, { request, timer }] of pending.current) {
      window.clearTimeout(timer)
      pending.current.delete(key)
      void send(request)
    }
  }, [])

  const clear = useCallback(
    (request: ClearRequest) => {
      if (request.kind === 'one') setHiddenIds((ids) => new Set(ids).add(request.id))
      else setHiddenUpTo(request.upTo)

      const key = nextKey.current++
      const timer = window.setTimeout(async () => {
        pending.current.delete(key)
        try {
          await send(request)
          // Reload first, then stop hiding, so a cleared row never flashes back in between.
          await onSentRef.current()
        } finally {
          unhide(request)
        }
      }, UNDO_MS)
      pending.current.set(key, { request, timer })

      return () => {
        const entry = pending.current.get(key)
        if (!entry) return
        window.clearTimeout(entry.timer)
        pending.current.delete(key)
        unhide(request)
      }
    },
    [unhide],
  )

  // Leaving the screen or closing the app sends whatever is waiting, rather than losing it.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return { hiddenIds, hiddenUpTo, clear }
}
