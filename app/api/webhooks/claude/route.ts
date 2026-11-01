import { getContainer } from '@/src/container'
import { bearerToken, handleError, json, problem, readJson } from '../../_lib/http'

export const dynamic = 'force-dynamic'

// Called by the Claude Code hook on the computer (hook/notify.mjs):
//   POST /api/webhooks/claude   Authorization: Bearer <WEBHOOK_SECRET>
//   { kind: 'finished' | 'needs-input', sessionId, sessionTitle, project, summary }
export async function POST(request: Request) {
  try {
    const container = getContainer()
    if (!container.auth.isWebhookSecretValid(bearerToken(request))) return problem(401, 'Invalid webhook secret')

    // Answer after delivery has been attempted, so a failed push shows up in the logs beside it.
    const result = await container.useCases.receiveAgentEvent(await readJson(request))
    console.log(
      `[webhook] event ${result.id}: delivered ${result.delivered}, failed ${result.failed}, ` +
        `removed ${result.removed}, pruned ${result.pruned}`,
    )
    return json(result, 201)
  } catch (error) {
    return handleError(error)
  }
}
