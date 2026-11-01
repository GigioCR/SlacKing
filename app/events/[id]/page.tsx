'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { AnswerCard } from '../../_components/AnswerCard'
import { EventBadge } from '../../_components/EventBadge'
import { BackIcon, CopyIcon, TrashIcon } from '../../_components/Icons'
import { Spinner, Splash } from '../../_components/Loading'
import { useToast } from '../../_components/Toast'
import { api, ApiError, type AgentEventDto } from '../../_lib/api'
import { onEventsChanged } from '../../_lib/push'
import { storage } from '../../_lib/storage'
import { fullTime } from '../../_lib/time'
import { useRequireSignIn } from '../../_lib/use-auth'

const OPEN_REFRESH_MS = 10_000

// Where a tapped notification lands: the whole summary, which the notification itself cuts short,
// and the answer when Claude is waiting for one.
export default function EventPage() {
  const ready = useRequireSignIn()
  const router = useRouter()
  const toast = useToast()
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<AgentEventDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      setEvent((await api<{ event: AgentEventDto }>(`/api/events/${encodeURIComponent(id)}`)).event)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError('This notification was cleared, or is older than 7 days.')
      else if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    if (!ready || !id) return
    storage.markSeen([id])
    void load()
  }, [ready, id, load])

  // While Claude waits, an answer at the computer (or the deadline) closes it: keep the screen honest.
  const waiting = event?.promptState === 'open'
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => void load(), OPEN_REFRESH_MS)
    const stop = onEventsChanged(() => void load())
    return () => {
      window.clearInterval(timer)
      stop()
    }
  }, [waiting, load])

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

  if (!ready || (!event && !error)) return <Splash />

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
            {event.promptState === 'none' && (
              <p className="muted small">
                {event.kind === 'needs-input'
                  ? 'Claude is waiting for you at the computer.'
                  : 'Claude has finished and is waiting for your next message.'}
              </p>
            )}
          </article>

          <AnswerCard event={event} onChange={setEvent} />

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
