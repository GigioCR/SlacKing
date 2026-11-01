import { getContainer } from '@/src/container'
import { bearerToken, handleError, json, problem } from '../../../../_lib/http'

export const dynamic = 'force-dynamic'

// Polled by the hook while Claude waits for an answer from the phone (hook/notify.mjs):
//   GET /api/webhooks/claude/events/{id}   Authorization: Bearer <WEBHOOK_SECRET>
//   → { state: 'open' | 'answered' | 'closed' | 'none', reply }
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const container = getContainer()
    if (!container.auth.isWebhookSecretValid(bearerToken(request))) return problem(401, 'Invalid webhook secret')
    const { id } = await params
    return json(await container.useCases.readPromptAnswer(id))
  } catch (error) {
    return handleError(error)
  }
}

// The hook stopped waiting without an answer from the phone (answered at the computer, or it
// gave up), so the phone stops offering one:
//   DELETE /api/webhooks/claude/events/{id}   Authorization: Bearer <WEBHOOK_SECRET>
// The notification itself stays in the inbox.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const container = getContainer()
    if (!container.auth.isWebhookSecretValid(bearerToken(request))) return problem(401, 'Invalid webhook secret')
    const { id } = await params
    await container.useCases.closePrompt(id)
    return json({ closed: true })
  } catch (error) {
    return handleError(error)
  }
}
