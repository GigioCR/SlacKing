'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { takeDeepLink } from '../_lib/deep-link'
import { registerServiceWorker, syncSubscription } from '../_lib/push'
import { InboxIcon, PhoneIcon } from './Icons'
import { ToastProvider } from './Toast'

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
  const inInbox = pathname === '/' || pathname.startsWith('/events')

  return (
    <ToastProvider>
      <div className={bare ? 'shell bare' : 'shell'}>
        <header className="topbar">
          <Link href="/" className="brand">
            <img className="brand-icon" src="/sloth.svg" alt="" width={50} height={30} />
            SlacKing
          </Link>
        </header>
        <main className="content">{children}</main>
        {!bare && (
          <nav className="tabbar" aria-label="Main">
            <Link href="/" className={inInbox ? 'tab active' : 'tab'} aria-current={inInbox ? 'page' : undefined}>
              <InboxIcon size={22} />
              Inbox
            </Link>
            <Link
              href="/setup"
              className={pathname.startsWith('/setup') ? 'tab active' : 'tab'}
              aria-current={pathname.startsWith('/setup') ? 'page' : undefined}
            >
              <PhoneIcon size={22} />
              This phone
            </Link>
          </nav>
        )}
      </div>
    </ToastProvider>
  )
}
