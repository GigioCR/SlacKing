'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthHero } from '../_components/AuthHero'
import { CodeField } from '../_components/CodeField'
import { FingerprintIcon } from '../_components/Icons'
import { Spinner, Splash } from '../_components/Loading'
import { api, type AuthStatus } from '../_lib/api'
import { PasskeyCancelled, signInWithPasskey, supportsPasskeys } from '../_lib/passkeys'
import { safeNext } from '../_lib/use-auth'

type Method = 'checking' | 'passkey' | 'code'

// With a passkey added, signing in is one tap and a fingerprint (on a computer: scan the QR code
// the browser shows with the phone). The authenticator code is always there as the way around it.
export default function SignInPage() {
  const router = useRouter()
  const [method, setMethod] = useState<Method>('checking')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = () => safeNext(new URLSearchParams(window.location.search).get('next'))

  useEffect(() => {
    api<AuthStatus>('/api/auth/status', { expectUnauthorized: true })
      .then((status) => {
        if (!status.linked) router.replace('/link')
        else if (status.signedIn) router.replace(next())
        else setMethod(status.passkeys > 0 && supportsPasskeys() ? 'passkey' : 'code')
      })
      .catch(() => setMethod('code'))
  }, [router])

  async function submitCode(value: string) {
    setBusy(true)
    setError(null)
    try {
      await api('/api/auth/sign-in', { method: 'POST', body: { code: value }, expectUnauthorized: true })
      router.replace(next())
    } catch (e) {
      setError((e as Error).message)
      setCode('')
      setBusy(false)
    }
  }

  async function usePasskey() {
    setBusy(true)
    setError(null)
    try {
      await signInWithPasskey()
      router.replace(next())
    } catch (e) {
      if (!(e instanceof PasskeyCancelled)) setError((e as Error).message)
      setBusy(false)
    }
  }

  if (method === 'checking') return <Splash />

  return (
    <>
      <AuthHero />
      <div className="card">
        <h1>Sign in</h1>

        {method === 'passkey' ? (
          <>
            <p className="muted">Use your fingerprint or screen lock. On a computer, scan the QR code it shows with your phone.</p>
            <button className="button block" type="button" onClick={() => void usePasskey()} disabled={busy}>
              {busy ? <Spinner /> : <FingerprintIcon size={20} />}
              Sign in with passkey
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button ghost block"
              type="button"
              onClick={() => {
                setError(null)
                setMethod('code')
              }}
              disabled={busy}
            >
              Use a code from Microsoft Authenticator
            </button>
          </>
        ) : (
          <>
            <p className="muted">Open Microsoft Authenticator and enter the code shown under SlacKing.</p>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                if (code.length === 6) void submitCode(code)
              }}
            >
              <CodeField value={code} onChange={setCode} onComplete={(c) => void submitCode(c)} disabled={busy} autoFocus />
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="button block" type="submit" disabled={busy || code.length !== 6}>
                {busy && <Spinner />}
                {busy ? 'Checking' : 'Sign in'}
              </button>
            </form>
            {supportsPasskeys() && (
              <button
                className="button ghost block"
                type="button"
                onClick={() => {
                  setError(null)
                  setMethod('passkey')
                }}
                disabled={busy}
              >
                <FingerprintIcon size={18} />
                Use a passkey instead
              </button>
            )}
          </>
        )}

        <p className="muted small">
          Lost the phone with the authenticator? <Link href="/link">Link a new one</Link> with the setup code.
        </p>
      </div>
    </>
  )
}
