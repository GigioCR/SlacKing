'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { KindIcon } from './_components/EventBadge'
import { BackIcon, BellOffIcon, CloseIcon, NextIcon, RetryIcon, TrashIcon } from './_components/Icons'
import { Splash } from './_components/Loading'
import { useToast } from './_components/Toast'
import { api, ApiError, type AgentEventDto, type EventPage } from './_lib/api'
import { onEventsChanged, readPushState, type PushState } from './_lib/push'
import { storage } from './_lib/storage'
import { clockTime, dayLabel } from './_lib/time'
import { useRequireSignIn } from './_lib/use-auth'
import { useDeferredClear } from './_lib/use-deferred-clear'
import { markdownToPlainText } from '@/src/domain/plain-text'

// Without a push (notifications off), the first page still catches up on its own.
const REFRESH_MS = 30_000
// Same as PAGE_SIZE in src/application/use-cases/list-events.ts.
const PAGE_SIZE = 15

export default function InboxPage() {
  const ready = useRequireSignIn()
  const toast = useToast()
  // The cursor each page starts from; the last one is the page on screen. Page 1 starts at null.
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [page, setPage] = useState<EventPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [push, setPush] = useState<PushState>('checking')
  const [seen, setSeen] = useState<Set<string>>(new Set())
  const [, setMinute] = useState(0)

  const pageIndex = cursors.length - 1
  const cursor = cursors[pageIndex]

  const load = useCallback(async () => {
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      const next = await api<EventPage>(`/api/events${query}`)
      // Everything on a later page was cleared: show the page before it instead.
      if (next.events.length === 0 && cursor) {
        setCursors((c) => (c.length > 1 ? c.slice(0, -1) : c))
        return
      }
      setPage(next)
      setError(null)
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message)
    }
  }, [cursor])

  const deferred = useDeferredClear(load)

  useEffect(() => {
    if (!ready) return
    setSeen(storage.seenIds())
    void readPushState().then(setPush)
  }, [ready])

  useEffect(() => {
    if (!ready) return
    void load()
    // Only the first page follows new arrivals; an older page holds still while it is read.
    if (pageIndex > 0) return
    const stop = onEventsChanged(() => void load())
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready, load, pageIndex])

  // "5 min ago"-style text stays right while the screen is open.
  useEffect(() => {
    const timer = window.setInterval(() => setMinute((m) => m + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const visible = useMemo(
    () =>
      (page?.events ?? []).filter(
        (e) => !deferred.hiddenIds.has(e.id) && !(deferred.hiddenUpTo && e.receivedAt <= deferred.hiddenUpTo),
      ),
    [page, deferred.hiddenIds, deferred.hiddenUpTo],
  )
  const hiddenCount = (page?.events.length ?? 0) - visible.length
  const total = Math.max(0, (page?.total ?? 0) - hiddenCount)

  const groups = useMemo(() => {
    const byDay: { day: string; events: AgentEventDto[] }[] = []
    for (const event of visible) {
      const day = dayLabel(event.receivedAt)
      const last = byDay.at(-1)
      if (last?.day === day) last.events.push(event)
      else byDay.push({ day, events: [event] })
    }
    return byDay
  }, [visible])

  function goTo(nextCursors: (string | null)[]) {
    setCursors(nextCursors)
    setPage(null)
    window.scrollTo({ top: 0 })
  }

  function clearOne(event: AgentEventDto) {
    const undo = deferred.clear({ kind: 'one', id: event.id })
    toast({ message: 'Notification cleared', action: { label: 'Undo', onClick: undo } })
  }

  function clearAll() {
    // Up to the newest one on screen: anything that arrives meanwhile is kept.
    const newest = page?.events[0]?.receivedAt
    if (!newest || pageIndex > 0) return
    const count = total
    const undo = deferred.clear({ kind: 'all', upTo: newest })
    toast({
      message: `Cleared ${count} notification${count === 1 ? '' : 's'}`,
      action: { label: 'Undo', onClick: undo },
    })
  }

  // The sloth stays until the page and the notifications banner are both known, so nothing pops in.
  if (!ready || push === 'checking' || (!page && !error)) return <Splash />

  const start = pageIndex * PAGE_SIZE + 1
  const end = pageIndex * PAGE_SIZE + visible.length
  const paged = pageIndex > 0 || Boolean(page?.nextCursor)

  return (
    <>
      <div className="page-head">
        <h1>Inbox</h1>
        {total > 0 && <span className="count-chip">{total}</span>}
        {pageIndex === 0 && visible.length > 0 && (
          <button type="button" className="button ghost compact push-right" onClick={clearAll}>
            <TrashIcon size={18} />
            Clear all
          </button>
        )}
      </div>

      {push !== 'on' && (
        <Link href="/setup" className="banner">
          <BellOffIcon size={20} />
          <span>Notifications are off on this device</span>
          <span className="banner-action">Turn on</span>
        </Link>
      )}

      {error && (
        <div className="card error-card">
          <p>{error}</p>
          <button type="button" className="button secondary" onClick={() => void load()}>
            <RetryIcon size={18} />
            Try again
          </button>
        </div>
      )}

      {page && visible.length === 0 && pageIndex === 0 && (
        <div className="empty">
          <img src="/sloth.svg" alt="" width={180} height={108} className="empty-sloth" />
          <h2>All caught up</h2>
          <p className="muted">When Claude finishes a task or needs a decision, it shows up here.</p>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.day} className="day-group" aria-label={group.day}>
          <h2 className="day-heading">{group.day}</h2>
          <ul className="inbox">
            {group.events.map((event) => (
              <li key={event.id} className={seen.has(event.id) ? 'event' : 'event unread'}>
                <Link href={`/events/${event.id}`} className="event-link">
                  <KindIcon kind={event.kind} />
                  <span className="event-body">
                    <span className="event-title">{event.sessionTitle}</span>
                    <span className="event-summary">{markdownToPlainText(event.summary)}</span>
                    <span className="meta">
                      {event.promptState === 'open' && <span className="waiting">Waiting for you</span>}
                      {event.promptState === 'answered' && <span>Answered</span>}
                      {event.project && event.project !== event.sessionTitle && <span>{event.project}</span>}
                      <span>{clockTime(event.receivedAt)}</span>
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="icon-button dismiss"
                  aria-label={`Clear "${event.sessionTitle}"`}
                  onClick={() => clearOne(event)}
                >
                  <CloseIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {page && paged && visible.length > 0 && (
        <nav className="pager" aria-label="Pages">
          <button
            type="button"
            className="button secondary compact"
            disabled={pageIndex === 0}
            onClick={() => goTo(cursors.slice(0, -1))}
          >
            <BackIcon size={18} />
            Newer
          </button>
          <span className="muted small">
            {start}–{end} of {total}
          </span>
          <button
            type="button"
            className="button secondary compact"
            disabled={!page.nextCursor}
            onClick={() => page.nextCursor && goTo([...cursors, page.nextCursor])}
          >
            Older
            <NextIcon size={18} />
          </button>
        </nav>
      )}

      {page && total > 0 && <p className="muted small center">Notifications are kept for 7 days.</p>}
    </>
  )
}
