'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '../_lib/api'
import { addPasskey, PasskeyCancelled, supportsPasskeys, type PasskeyDto } from '../_lib/passkeys'
import { timeAgo } from '../_lib/time'
import { CloseIcon, FingerprintIcon, KeyIcon } from './Icons'
import { Spinner } from './Loading'
import { useToast } from './Toast'

/** The passkeys that can sign in, with adding one here and removing any. */
export function PasskeysCard({ deviceLabel }: { deviceLabel: string }) {
  const toast = useToast()
  const [passkeys, setPasskeys] = useState<PasskeyDto[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [supported, setSupported] = useState(true)

  const load = useCallback(async () => {
    try {
      setPasskeys((await api<{ passkeys: PasskeyDto[] }>('/api/passkeys')).passkeys)
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' })
    }
  }, [toast])

  useEffect(() => {
    setSupported(supportsPasskeys())
    void load()
  }, [load])

  async function add() {
    setAdding(true)
    try {
      await addPasskey(deviceLabel.trim() || 'This device')
      toast({ message: 'Passkey added. Next time, sign in with your fingerprint.' })
      await load()
    } catch (e) {
      if (!(e instanceof PasskeyCancelled)) toast({ message: (e as Error).message, tone: 'error' })
    } finally {
      setAdding(false)
    }
  }

  async function remove(passkey: PasskeyDto) {
    try {
      await api(`/api/passkeys/${encodeURIComponent(passkey.id)}`, { method: 'DELETE' })
      toast({ message: `Removed "${passkey.label}"` })
      await load()
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' })
    }
  }

  return (
    <section className="card">
      <div className="row">
        <h2>Passkeys</h2>
        {passkeys && passkeys.length > 0 && <span className="status-chip ok push-right">{passkeys.length} added</span>}
      </div>
      <p className="muted">
        Sign in with your fingerprint or screen lock instead of a code. On a computer, the browser shows a QR code to scan
        with this phone.
      </p>

      {passkeys === null && <div className="skeleton skeleton-line" style={{ height: 44 }} />}

      {passkeys && passkeys.length > 0 && (
        <ul className="key-list">
          {passkeys.map((passkey) => (
            <li key={passkey.id}>
              <KeyIcon size={20} />
              <span className="key-text">
                <span className="key-label">{passkey.label}</span>
                <span className="muted small">
                  Added {timeAgo(passkey.createdAt)}
                  {passkey.lastUsedAt ? ` · used ${timeAgo(passkey.lastUsedAt)}` : ' · not used yet'}
                </span>
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove passkey "${passkey.label}"`}
                onClick={() => void remove(passkey)}
              >
                <CloseIcon size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {supported ? (
        <button className="button block" type="button" onClick={() => void add()} disabled={adding}>
          {adding ? <Spinner /> : <FingerprintIcon size={20} />}
          Add a passkey on this device
        </button>
      ) : (
        <p className="muted small">This browser can&apos;t make passkeys. Open the app in Chrome on your phone.</p>
      )}
    </section>
  )
}
