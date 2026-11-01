'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { EventBadge } from '../../_components/EventBadge'
import { BackIcon, CopyIcon, TrashIcon } from '../../_components/Icons'
import { DetailSkeleton, Spinner, Splash } from '../../_components/Loading'
import { useToast } from '../../_components/Toast'
import { api, ApiError, type AgentEventDto } from '../../_lib/api'
import { storage } from '../../_lib/storage'
import { fullTime } from '../../_lib/time'
import { useRequireSignIn } from '../../_lib/use-auth'

// Where a tapped notification lands: the whole summary, which the notification itself cuts short.
export default function EventPage() {
  const ready = useRequireSignIn()
  const router = useRouter()
  const toast = useToast()
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<AgentEventDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    if (!ready || !id) return
    storage.markSeen([id])
    api<{ event: AgentEventDto }>(`/api/events/${encodeURIComponent(id)}`)
      .then(({ event }) => setEvent(event))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) setError('This notification was cleared, or is older than 7 days.')
        else if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message)
      })
  }, [ready, id])

  async function copySummary() {
    if (!event) return
    try {
      await navigator.clipboard.writeText(`${event.sessionTitle}\n\n${event.summary}`)
      toast({ message: 'Summary copied' })
    } catch {
      toast({ message: "Couldn't copy. Select the text instead.", tone: 'error' })
    }
  }

  async function clear() {
    if (!event) return
    setClearing(true)
    try {
      await api(`/api/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' })
      toast({ message: 'Notification cleared' })
      router.replace('/')
    } catch (e) {
      setClearing(false)
      toast({ message: (e as Error).message, tone: 'error' })
    }
  }

  if (!ready) return <Splash />

  return (
    <>
      <Link href="/" className="back-link">
        <BackIcon size={18} />
        Inbox
      </Link>

      {error && (
        <div className="empty">
          <h2>Not here anymore</h2>
          <p className="muted">{error}</p>
          <Link href="/" className="button secondary">
            Back to the inbox
          </Link>
        </div>
      )}
      {!event && !error && <DetailSkeleton />}

      {event && (
        <>
          <article className="card detail">
            <EventBadge kind={event.kind} />
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

          <div className="action-bar">
            <button type="button" className="button secondary" onClick={() => void copySummary()}>
              <CopyIcon size={18} />
              Copy
            </button>
            <button type="button" className="button danger" onClick={() => void clear()} disabled={clearing}>
              {clearing ? <Spinner /> : <TrashIcon size={18} />}
              Clear
            </button>
          </div>
        </>
      )}
    </>
  )
}
