import { getContainer } from '@/src/container'
import { handleError, json, requireSession } from '../_lib/http'

export const dynamic = 'force-dynamic'

/** One page of the inbox: GET /api/events?cursor=<from the previous page>&limit=15 */
export async function GET(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    const params = new URL(request.url).searchParams
    return json(
      await getContainer().useCases.listEvents({ cursor: params.get('cursor'), limit: params.get('limit') }),
    )
  } catch (error) {
    return handleError(error)
  }
}

/** Clear all: DELETE /api/events?upTo=<receivedAt of the newest one on screen> */
export async function DELETE(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    return json(await getContainer().useCases.clearEvents(new URL(request.url).searchParams.get('upTo')))
  } catch (error) {
    return handleError(error)
  }
}
