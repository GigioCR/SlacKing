import { getContainer } from '@/src/container'
import { json } from '../_lib/http'

export const dynamic = 'force-dynamic'

/** For uptime checks. Says what is set up, never any value. */
export async function GET() {
  const { config } = getContainer()
  return json({ ok: true, persistent: config.persistent, push: config.vapidPublicKey !== null })
}
