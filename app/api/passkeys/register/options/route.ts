import { getContainer } from '@/src/container'
import { handleError, json, relyingParty, requireSession } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

/** Adding a passkey needs a signed-in browser: it is proof of the authenticator code, kept on the phone. */
export async function POST(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    return json(await getContainer().useCases.startPasskeyRegistration(relyingParty(request)))
  } catch (error) {
    return handleError(error)
  }
}
