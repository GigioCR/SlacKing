import { getContainer } from '@/src/container'
import { field, handleError, json, readJson, requireSession } from '../../_lib/http'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    const body = await readJson(request)
    return json(await getContainer().useCases.sendTestNotification(field(body, 'label')))
  } catch (error) {
    return handleError(error)
  }
}
