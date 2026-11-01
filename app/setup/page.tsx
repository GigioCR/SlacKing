'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Spinner, Splash } from '../_components/Loading'
import { useToast } from '../_components/Toast'
import { api } from '../_lib/api'
import { disablePush, enablePush, isStandalone, readPushState, type PushState } from '../_lib/push'
import { storage } from '../_lib/storage'
import { useRequireSignIn } from '../_lib/use-auth'

const STATE_TEXT: Record<PushState, string> = {
  checking: 'Checking this device.',
  unsupported: "This browser can't receive notifications. On Android, open the app in Chrome.",
  'needs-install': 'Add this app to your Home Screen first, then open it from there.',
  denied: 'Notifications are blocked for this site. Allow them in the phone settings (Apps → Chrome → Notifications), then come back.',
  off: 'Turn them on to hear about every session that finishes or needs you, even with the app closed.',
  on: 'You will hear about every session that finishes or needs you, even with the app closed.',
}

const STATE_CHIP: Record<PushState, { label: string; tone: string }> = {
  checking: { label: 'Checking', tone: 'neutral' },
  unsupported: { label: 'Not supported', tone: 'neutral' },
  'needs-install': { label: 'Install first', tone: 'warn' },
  denied: { label: 'Blocked', tone: 'danger' },
  off: { label: 'Off', tone: 'neutral' },
  on: { label: 'On', tone: 'ok' },
}

interface Delivery {
  delivered: number
  failed: number
  removed: number
}

type Busy = null | 'on' | 'off' | 'test' | 'sign-out'

// Turning notifications on is a tap, never automatic: Android asks for permission once, and a
// "no" is hard to undo, so the prompt only comes after this explanation.
export default function SetupPage() {
  const ready = useRequireSignIn()
  const router = useRouter()
  const toast = useToast()
  const [state, setState] = useState<PushState>('checking')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [installed, setInstalled] = useState(true)

  useEffect(() => {
    if (!ready) return
    setLabel(storage.getLabel() ?? (/Android/i.test(navigator.userAgent) ? 'Android phone' : 'This browser'))
    setInstalled(isStandalone())
    void readPushState().then(setState)
  }, [ready])

  async function run(which: Busy, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  const turnOn = () =>
    run('on', async () => {
      const next = await enablePush(label.trim())
      setState(next)
      if (next === 'on') toast({ message: 'Notifications are on' })
    })
  const turnOff = () =>
    run('off', async () => {
      await disablePush()
      setState(await readPushState())
      toast({ message: 'Notifications are off on this device' })
    })
  const sendTest = () =>
    run('test', async () => {
      const result = await api<Delivery>('/api/push/test', { method: 'POST', body: { label: label.trim() || 'this device' } })
      toast(
        result.delivered > 0
          ? { message: `Sent to ${result.delivered} device${result.delivered === 1 ? '' : 's'}. It should arrive in a few seconds.` }
          : { message: 'No device received it. Turn notifications on first.', tone: 'error' },
      )
    })
  const signOut = () =>
    run('sign-out', async () => {
      await api('/api/auth/sign-out', { method: 'POST' })
      router.replace('/sign-in')
    })

  if (!ready) return <Splash />

  const chip = STATE_CHIP[state]

  return (
    <>
      <div className="page-head">
        <h1>This phone</h1>
      </div>

      <section className="card">
        <div className="row">
          <h2>Notifications</h2>
          <span className={`status-chip ${chip.tone} push-right`}>{chip.label}</span>
        </div>
        <p className="muted">{STATE_TEXT[state]}</p>

        {(state === 'off' || state === 'on') && (
          <div className="stack">
            <label htmlFor="label">Device name</label>
            <input
              id="label"
              className="input"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy !== null}
            />
          </div>
        )}

        {state === 'off' && (
          <button className="button block" onClick={() => void turnOn()} disabled={busy !== null || !label.trim()}>
            {busy === 'on' && <Spinner />}
            Turn on notifications
          </button>
        )}

        {state === 'on' && (
          <div className="stack">
            <button className="button block" onClick={() => void sendTest()} disabled={busy !== null}>
              {busy === 'test' && <Spinner />}
              Send a test notification
            </button>
            <button className="button secondary block" onClick={() => void turnOff()} disabled={busy !== null}>
              {busy === 'off' && <Spinner />}
              Turn off on this device
            </button>
          </div>
        )}
      </section>

      {!installed && (
        <section className="card">
          <h2>Install</h2>
          <p className="muted small">
            In Chrome, open the menu (⋮) and choose <strong>Install</strong> (on older Chrome: Add to Home screen →
            Install), not Create shortcut. The app then opens on its own, and tapping a notification goes straight to
            its summary.
          </p>
        </section>
      )}

      <button className="button ghost block" onClick={() => void signOut()} disabled={busy !== null}>
        {busy === 'sign-out' && <Spinner />}
        Sign out
      </button>
    </>
  )
}
