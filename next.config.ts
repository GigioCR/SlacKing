import type { NextConfig } from 'next'

// What pages may load: only this site. Inline scripts are allowed because Next.js puts its page
// data in inline <script> tags. Development also needs eval and a websocket for hot reload.
// Images allow data: for the authenticator QR code, which is a data URL.
const dev = process.env.NODE_ENV !== 'production'
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Pin the project root so a stray lockfile in a parent folder isn't picked up.
  outputFileTracingRoot: process.cwd(),
  experimental: {
    // Both of these, on in Next 16 by default, sent `next dev` into an endless page-reload loop in
    // this OneDrive folder: the MCP endpoint's request log (.next/dev/logs) was seen as a changed
    // file, and a dev cache restored from disk after a restart made every page load ask for a full
    // reload. Neither is needed here; the cost is a slower first compile after starting dev.
    mcpServer: false,
    turbopackFileSystemCacheForDev: false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        ],
      },
      {
        // The service worker must never be cached, or phones keep running an old one.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
}

export default nextConfig
