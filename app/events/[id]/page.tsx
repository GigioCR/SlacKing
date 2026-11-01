'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { EventBadge } from '../../_components/EventBadge'
import { api, ApiError, type AgentEventDto } from '../../_lib/api'
import { storage } from '../../_lib/storage'
import { fullTime } from '../../_lib/time'
import { useRequireSignIn } from '../../_lib/use-auth'

// Where a tapped notification lands: the whole summary, which the notification itself cuts short.
export default function EventPage() {
  const ready = useRequireSignIn()
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<AgentEventDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready || !id) return
    storage.markSeen([id])
    api<{ event: AgentEventDto }>(`/api/events/${encodeURIComponent(id)}`)
      .then(({ event }) => setEvent(event))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) setError('This notification is gone. They are kept for 7 days.')
        else if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message)
      })
  }, [ready, id])

  return (
    <>
      <Link href="/" className="small">
        ← Inbox
      </Link>

      {error && <p className="error">{error}</p>}
      {!event && !error && <p className="muted">Loading…</p>}

      {event && (
        <article className="card">
          <div className="row">
            <EventBadge kind={event.kind} />
          </div>
          <h1>{event.sessionTitle}</h1>
          <div className="meta">
            {event.project && <span>{event.project}</span>}
            <span>{fullTime(event.receivedAt)}</span>
          </div>
          <p className="summary">{event.summary}</p>
          <p className="muted small">
            {event.kind === 'needs-input'
              ? 'Claude is waiting for you at the computer.'
              : 'Claude has finished and is waiting for your next message.'}
          </p>
        </article>
      )}
    </>
  )
}
