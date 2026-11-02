'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '../_lib/api'
import { timeAgo } from '../_lib/time'
import { useToast } from './Toast'

export interface HookActivity {
  lastEventAt: string | null
  lastCheckInAt: string | null
  /** How long the hook last offered to wait for an answer; null when it never has. */
  waitMinutes: number | null
}

/** The computer's side, loaded by the screen so the sloth stays up until it is here too. */
export function useHookActivity(ready: boolean): { activity: HookActivity | null; loaded: boolean } {
  const toast = useToast()
  const [activity, setActivity] = useState<HookActivity | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      setActivity(await api<HookActivity>('/api/hook'))
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' })
    } finally {
      setLoaded(true)
    }
  }, [toast])

  useEffect(() => {
    if (ready) void load()
  }, [ready, load])

  return { activity, loaded }
}

/** What the hook on the computer last did, whether answers from here reach Claude, and which count. */
export function ComputerCard({ activity }: { activity: HookActivity | null }) {
  const answering = activity?.waitMinutes != null
  const chip = !activity?.lastEventAt
    ? { label: 'Not heard from', tone: 'warn' }
    : answering
      ? { label: 'Answering on', tone: 'ok' }
      : { label: 'Notify only', tone: 'neutral' }

  return (
    <section className="card">
      <div className="row">
        <h2>Your computer</h2>
        <span className={`status-chip ${chip.tone} push-right`}>{chip.label}</span>
      </div>
      {activity?.lastEventAt ? (
        <p className="muted">
          Last notification {timeAgo(activity.lastEventAt)}.
          {answering && ` You can answer from here: Claude waits up to ${activity.waitMinutes} min, and the computer asks at the same time.`}
        </p>
      ) : (
        <p className="muted">
          No notification in the last 7 days. Install the hook on your computer with <code>npm run hook:install</code>.
        </p>
      )}
      {activity?.lastCheckInAt && <p className="muted small">Last waited for an answer {timeAgo(activity.lastCheckInAt)}.</p>}
      <details className="help">
        <summary>What counts as your go-ahead</summary>
        <ul>
          <li>
            <strong>Allow or Deny</strong> a command, <strong>Approve</strong> a plan, and your <strong>answer</strong> to a
            question count as yours, the same as at the computer.
          </li>
          <li>
            A <strong>note</strong> after Claude finishes reaches it as your next message, but not as your OK for changes like
            committing or pushing. For those, Claude asks you a question.
          </li>
          <li>
            Claude stops waiting once you answer at the computer, when the time runs out, or when the session closes or the
            computer sleeps.
          </li>
        </ul>
      </details>
    </section>
  )
}
