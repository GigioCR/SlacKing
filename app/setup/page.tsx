'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '../_lib/api'
import { disablePush, enablePush, readPushState, type PushState } from '../_lib/push'
import { storage } from '../_lib/storage'
import { useRequireSignIn } from '../_lib/use-auth'

const STATE_TEXT: Record<PushState, string> = {
  checking: 'Checking…',
  unsupported: "This browser can't receive notifications. On Android, open the app in Chrome.",
  'needs-install': 'Add this app to your Home Screen first, then open it from there.',
  denied: 'Notifications are blocked for this site. Allow them in the phone settings (Apps → Chrome → Notifications), then come back.',
  off: 'Notifications are off on this device.',
  on: 'Notifications are on. You will hear about every session that finishes or needs you.',
}

interface Delivery {
  delivered: number
  failed: number
  removed: number
}

// Turning notifications on is a tap, never automatic: Android asks for permission once, and a
// "no" is hard to undo, so the prompt only comes after this explanation.
export default function SetupPage() {
  const ready = useRequireSignIn()
  const router = useRouter()
  const [state, setState] = useState<PushState>('checking')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    setLabel(storage.getLabel() ?? (/Android/i.test(navigator.userAgent) ? 'Android phone' : 'This browser'))
    void readPushState().then(setState)
  }, [ready])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const turnOn = () => run(async () => setState(await enablePush(label.trim())))
  const turnOff = () =>
    run(async () => {
      await disablePush()
      setState(await readPushState())
    })
  const sendTest = () =>
    run(async () => {
      const result = await api<Delivery>('/api/push/test', { method: 'POST', body: { label: label.trim() || 'this device' } })
      setMessage(
        result.delivered > 0
          ? `Sent to ${result.delivered} device${result.delivered === 1 ? '' : 's'}. It should arrive in a few seconds.`
          : 'No device received it. Turn notifications on first.',
      )
    })
  const signOut = () =>
    run(async () => {
      await api('/api/auth/sign-out', { method: 'POST' })
      router.replace('/sign-in')
    })

  if (!ready) return <p className="muted">Loading…</p>

  return (
    <>
      <h1>This phone</h1>

      <section className="card">
        <h2>Notifications</h2>
        <p className={state === 'on' ? '' : 'muted'}>{STATE_TEXT[state]}</p>

        {(state === 'off' || state === 'on') && (
          <div className="stack">
            <label htmlFor="label">Device name</label>
            <input
              id="label"
              className="input"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy}
            />
          </div>
        )}

        {state === 'off' && (
          <button className="button block" onClick={() => void turnOn()} disabled={busy || !label.trim()}>
            Turn on notifications
          </button>
        )}

        {state === 'on' && (
          <div className="stack">
            <button className="button block" onClick={() => void sendTest()} disabled={busy}>
              Send a test notification
            </button>
            <button className="button secondary block" onClick={() => void turnOff()} disabled={busy}>
              Turn off on this device
            </button>
          </div>
        )}

        {message && <p>{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <h2>Install</h2>
        <p className="muted small">
          In Chrome, open the menu (⋮) and choose <strong>Add to Home screen</strong> → <strong>Install</strong>. The app
          then opens on its own, and tapping a notification goes straight to its summary.
        </p>
      </section>

      <button className="button secondary block" onClick={() => void signOut()} disabled={busy}>
        Sign out
      </button>
    </>
  )
}
