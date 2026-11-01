'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api, UNAUTHORIZED_EVENT, type AuthStatus } from './api'

/**
 * For screens that need a signed-in browser: sends the person to link an authenticator app (first
 * time) or to sign in, then back here. True once signed in.
 */
export function useRequireSignIn(): boolean {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const here = () => window.location.pathname + window.location.search
    const goSignIn = () => router.replace(`/sign-in?next=${encodeURIComponent(here())}`)

    api<AuthStatus>('/api/auth/status')
      .then((status) => {
        if (cancelled) return
        if (!status.linked) router.replace('/link')
        else if (!status.signedIn) goSignIn()
        else setReady(true)
      })
      .catch(() => {
        // Offline or the server is down: show the screen; its own requests will say so.
        if (!cancelled) setReady(true)
      })

    window.addEventListener(UNAUTHORIZED_EVENT, goSignIn)
    return () => {
      cancelled = true
      window.removeEventListener(UNAUTHORIZED_EVENT, goSignIn)
    }
  }, [router])

  return ready
}

/** Only same-site paths, so a crafted link can't send someone elsewhere after signing in. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}
