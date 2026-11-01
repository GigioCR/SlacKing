import { getContainer } from '@/src/container'
import { handleError, json, readSessionToken } from '../../_lib/http'

export const dynamic = 'force-dynamic'

/** Whether an authenticator app is linked and whether this browser is signed in. */
export async function GET(request: Request) {
  try {
    return json(await getContainer().useCases.checkSession(readSessionToken(request)))
  } catch (error) {
    return handleError(error)
  }
}
