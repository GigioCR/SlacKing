import { getContainer } from '@/src/container'
import { handleError, json, requireSession } from '../_lib/http'

export const dynamic = 'force-dynamic'

/** The passkeys that can sign in, for the This phone screen. */
export async function GET(request: Request) {
  try {
    const denied = await requireSession(request)
    if (denied) return denied
    return json({ passkeys: await getContainer().useCases.listPasskeys() })
  } catch (error) {
    return handleError(error)
  }
}
