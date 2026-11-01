import { getContainer } from '@/src/container'
import { handleError, json, problem, requireSession } from '../../_lib/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    const publicKey = getContainer().config.vapidPublicKey
    if (!publicKey) return problem(503, 'Notifications are not set up on the server (VAPID keys are missing)')
    return json({ publicKey })
  } catch (error) {
    return handleError(error)
  }
}
