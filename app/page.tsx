'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { EventBadge } from './_components/EventBadge'
import { api, ApiError, type AgentEventDto } from './_lib/api'
import { onEventsChanged, readPushState, type PushState } from './_lib/push'
import { storage } from './_lib/storage'
import { timeAgo } from './_lib/time'
import { useRequireSignIn } from './_lib/use-auth'

// Without a push (notifications off), the inbox still catches up on its own.
const REFRESH_MS = 30_000

export default function InboxPage() {
  const ready = useRequireSignIn()
  const [events, setEvents] = useState<AgentEventDto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [push, setPush] = useState<PushState>('checking')
  const [seen, setSeen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const { events } = await api<{ events: AgentEventDto[] }>('/api/events')
      setEvents(events)
      setError(null)
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    setSeen(storage.seenIds())
    void load()
    void readPushState().then(setPush)
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
  }, [ready, load])

  if (!ready) return <p className="muted">Loading…</p>

  return (
    <>
      <h1>Inbox</h1>

      {push !== 'on' && push !== 'checking' && (
        <div className="notice">
          <p>Notifications are off on this device, so nothing will reach your lock screen.</p>
          <Link href="/setup" className="button block">
            Turn on notifications
          </Link>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {events === null && !error && <p className="muted">Loading…</p>}

      {events?.length === 0 && (
        <div className="empty">
          <p>Nothing yet.</p>
          <p className="small">When Claude finishes a task or needs a decision, it shows up here.</p>
        </div>
      )}

      {events && events.length > 0 && (
        <ul className="inbox">
          {events.map((event) => (
            <li key={event.id}>
              <Link href={`/events/${event.id}`} className={seen.has(event.id) ? 'event' : 'event new'}>
                <div className="event-body">
                  <span className="event-title">{event.sessionTitle}</span>
                  <span className="event-summary">{event.summary}</span>
                  <span className="meta">
                    {event.project && event.project !== event.sessionTitle && <span>{event.project}</span>}
                    <span>{timeAgo(event.receivedAt)}</span>
                  </span>
                </div>
                <EventBadge kind={event.kind} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {events && events.length > 0 && <p className="muted small">Notifications are kept for 7 days.</p>}
    </>
  )
}
