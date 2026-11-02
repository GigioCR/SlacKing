import { getContainer } from '@/src/container'
import { handleError, json, requireSession } from '../_lib/http'

export const dynamic = 'force-dynamic'

// What This phone shows about the computer's hook:
//   GET /api/hook → { lastEventAt, lastCheckInAt, waitMinutes }
export async function GET(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    return json(await getContainer().useCases.getHookActivity())
  } catch (error) {
    return handleError(error)
  }
}
