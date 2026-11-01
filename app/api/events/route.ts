import { getContainer } from '@/src/container'
import { handleError, json, requireSession } from '../_lib/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    return json({ events: await getContainer().useCases.listEvents() })
  } catch (error) {
    return handleError(error)
  }
}
