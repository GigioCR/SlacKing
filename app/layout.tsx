import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Shell } from './_components/Shell'
import './globals.css'

export const metadata: Metadata = {
  title: 'SlacKing',
  description: 'Hear on your phone when Claude finishes or needs you.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'SlacKing' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Tells Chrome the app has its own dark theme, so Android's "darken websites" leaves it alone.
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0f1115' },
    { media: '(prefers-color-scheme: light)', color: '#f6f5f2' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
