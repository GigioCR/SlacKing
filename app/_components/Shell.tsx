'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { takeDeepLink } from '../_lib/deep-link'
import { registerServiceWorker, syncSubscription } from '../_lib/push'

// Screens without the bottom bar: nothing to navigate to before signing in.
const BARE = ['/sign-in', '/link']

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    registerServiceWorker()
    void syncSubscription()
    // Android starts a closed app on its home page whatever the tapped notification asked for;
    // the service worker left the real target behind (public/sw.js, rememberTarget).
    void takeDeepLink().then((target) => {
      if (target) router.replace(target)
    })
  }, [router])

  const bare = BARE.some((path) => pathname.startsWith(path))

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <img className="brand-icon" src="/icons/icon-192.png" alt="" width={32} height={32} />
          SlacKing
        </Link>
      </header>
      <main className="content">{children}</main>
      {!bare && (
        <nav className="tabbar" aria-label="Main">
          <Link href="/" className={pathname === '/' || pathname.startsWith('/events') ? 'tab active' : 'tab'}>
            Inbox
          </Link>
          <Link href="/setup" className={pathname.startsWith('/setup') ? 'tab active' : 'tab'}>
            This phone
          </Link>
        </nav>
      )}
    </div>
  )
}
