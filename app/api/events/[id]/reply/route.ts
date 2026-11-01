import { getContainer } from '@/src/container'
import { handleError, json, readJson, requireSession } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

// The phone answers what Claude is waiting on (a notification button or the notification's screen):
//   POST /api/events/{id}/reply   { type: 'allow' } | { type: 'deny', message } |
//                                 { type: 'answers', answers: { [question]: answer } } | { type: 'message', message }
// 409 when Claude is no longer waiting for it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    const { id } = await params
    return json({ event: await getContainer().useCases.answerPrompt(id, await readJson(request)) })
  } catch (error) {
    return handleError(error)
  }
}
