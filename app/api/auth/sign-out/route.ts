import { json, withoutSessionCookie } from '../../_lib/http'

export const dynamic = 'force-dynamic'

export async function POST() {
  return withoutSessionCookie(json({ signedIn: false }))
}
