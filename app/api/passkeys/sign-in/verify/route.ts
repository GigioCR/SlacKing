import { getContainer } from '@/src/container'
import { field, handleError, json, readJson, relyingParty, withSessionCookie } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const session = await getContainer().useCases.finishPasskeySignIn(relyingParty(request), field(body, 'response'))
    return withSessionCookie(json({ signedIn: true }), session)
  } catch (error) {
    return handleError(error)
  }
}
