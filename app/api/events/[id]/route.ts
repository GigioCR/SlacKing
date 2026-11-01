import { getContainer } from '@/src/container'
import { handleError, json, requireSession } from '../../_lib/http'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    const { id } = await params
    return json({ event: await getContainer().useCases.getEvent(id) })
  } catch (error) {
    return handleError(error)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    const { id } = await params
    return json(await getContainer().useCases.clearEvent(id))
  } catch (error) {
    return handleError(error)
  }
}
