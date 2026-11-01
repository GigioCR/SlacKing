import { getContainer } from '@/src/container'
import { field, handleError, json, readJson, relyingParty, requireSession } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    const body = await readJson(request)
    const passkey = await getContainer().useCases.finishPasskeyRegistration(relyingParty(request), {
      response: field(body, 'response'),
      label: field(body, 'label'),
    })
    return json({ passkey }, 201)
  } catch (error) {
    return handleError(error)
  }
}
