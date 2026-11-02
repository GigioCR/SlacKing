'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthHero } from '../_components/AuthHero'
import { CodeField } from '../_components/CodeField'
import { Spinner } from '../_components/Loading'
import { api, type AuthStatus } from '../_lib/api'

interface LinkingStart {
  uri: string
  qrDataUrl: string
  secret: string
}

// Links Microsoft Authenticator (or any authenticator app). Needs SETUP_CODE from Vercel's
// settings, so it is also the way back in after losing the phone. Linking a new app signs out
// every browser that signed in with the old one.
export default function LinkPage() {
  const router = useRouter()
  const [setupCode, setSetupCode] = useState('')
  const [started, setStarted] = useState<LinkingStart | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Re-linking replaces the authenticator in use, so it says what that undoes first.
  const [alreadyLinked, setAlreadyLinked] = useState(false)

  useEffect(() => {
    api<AuthStatus>('/api/auth/status', { expectUnauthorized: true })
      .then((status) => setAlreadyLinked(status.linked))
      .catch(() => {
        // Unknown: the setup code still guards linking.
      })
  }, [])

  async function start() {
    setBusy(true)
    setError(null)
    try {
      setStarted(await api<LinkingStart>('/api/auth/link/start', { method: 'POST', body: { setupCode }, expectUnauthorized: true }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function confirm(value: string) {
    setBusy(true)
    setError(null)
    try {
      await api('/api/auth/link/confirm', { method: 'POST', body: { setupCode, code: value }, expectUnauthorized: true })
      router.replace('/setup')
    } catch (e) {
      setError((e as Error).message)
      setCode('')
      setBusy(false)
    }
  }

  async function copySecret() {
    if (!started) return
    try {
      await navigator.clipboard.writeText(started.secret)
      setCopied(true)
    } catch {
      // Clipboard blocked: the key is on screen to type.
    }
  }

  if (!started) {
    return (
      <>
      <AuthHero />
      {alreadyLinked && (
        <div className="card warning-card" role="note">
          <p>
            <strong>An authenticator is already linked.</strong> Linking a new one replaces it: codes from the old one stop
            working, every browser signed in with it is signed out, and all passkeys are removed.
          </p>
          <Link href="/sign-in">Back to sign in</Link>
        </div>
      )}
      <div className="card">
        <h1>Link your authenticator</h1>
        <p className="muted">
          Signing in uses a 6-digit code from Microsoft Authenticator. To link it, enter the setup code (SETUP_CODE in
          the Vercel project&apos;s settings).
        </p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (setupCode.trim()) void start()
          }}
        >
          <label htmlFor="setup-code">Setup code</label>
          <input
            id="setup-code"
            className="input"
            type="password"
            autoComplete="off"
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value)}
            disabled={busy}
            autoFocus
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button block" type="submit" disabled={busy || !setupCode.trim()}>
            {busy && <Spinner />}
            {busy ? 'Checking' : 'Continue'}
          </button>
        </form>
      </div>
      </>
    )
  }

  return (
    <div className="card">
      <h1>Scan with Microsoft Authenticator</h1>
      <ol className="steps">
        <li>In Microsoft Authenticator, tap <strong>+</strong>, then <strong>Other account</strong>.</li>
        <li>Scan this QR code. SlacKing appears in the list with a code that changes every 30 seconds.</li>
        <li>Enter that code below.</li>
      </ol>
      <img className="qr" src={started.qrDataUrl} alt="QR code for Microsoft Authenticator" width={240} height={240} />
      <details>
        <summary className="small">On this phone, so you can&apos;t scan it?</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <p className="small muted">
            In Microsoft Authenticator choose <strong>Other account</strong>, then <strong>Or enter code manually</strong>.
            Account name: SlacKing. Secret key:
          </p>
          <p className="secret">{started.secret}</p>
          <button type="button" className="button secondary" onClick={() => void copySecret()}>
            {copied ? 'Copied' : 'Copy key'}
          </button>
        </div>
      </details>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.length === 6) void confirm(code)
        }}
      >
        <label>Code from the app</label>
        <CodeField value={code} onChange={setCode} onComplete={(c) => void confirm(c)} disabled={busy} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button block" type="submit" disabled={busy || code.length !== 6}>
          {busy && <Spinner />}
          {busy ? 'Checking' : 'Link and sign in'}
        </button>
      </form>
    </div>
  )
}
