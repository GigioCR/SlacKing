'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthHero } from '../_components/AuthHero'
import { CodeField } from '../_components/CodeField'
import { Spinner } from '../_components/Loading'
import { api, type AuthStatus } from '../_lib/api'
import { safeNext } from '../_lib/use-auth'

export default function SignInPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const next = () => safeNext(new URLSearchParams(window.location.search).get('next'))

  useEffect(() => {
    api<AuthStatus>('/api/auth/status', { expectUnauthorized: true })
      .then((status) => {
        if (!status.linked) router.replace('/link')
        else if (status.signedIn) router.replace(next())
      })
      .catch(() => {})
  }, [router])

  async function submit(value: string) {
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

  return (
    <>
      <AuthHero />
      <div className="card">
        <h1>Sign in</h1>
        <p className="muted">Open Microsoft Authenticator and enter the code shown under SlacKing.</p>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length === 6) void submit(code)
          }}
        >
          <CodeField value={code} onChange={setCode} onComplete={(c) => void submit(c)} disabled={busy} autoFocus />
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
        <p className="muted small">
          Lost the phone with the authenticator? <Link href="/link">Link a new one</Link> with the setup code.
        </p>
      </div>
    </>
  )
}
