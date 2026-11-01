import { getContainer } from '@/src/container'
import { handleError, json, readSessionToken, withSessionCookie } from '../../_lib/http'

export const dynamic = 'force-dynamic'

/**
 * Whether an authenticator app is linked, whether this browser is signed in, and whether passkeys
 * exist. Every screen asks on load, so this is also where a session in use gets renewed.
 */
export async function GET(request: Request) {
  try {
    const { status, renewed } = await getContainer().useCases.getAuthStatus(readSessionToken(request))
    const response = json(status)
    return renewed ? withSessionCookie(response, renewed) : response
  } catch (error) {
    return handleError(error)
  }
}
