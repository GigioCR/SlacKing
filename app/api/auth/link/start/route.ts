import { getContainer } from '@/src/container'
import { field, handleError, json, problem, readJson } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

// Linking (or re-linking after losing the phone) needs SETUP_CODE from Vercel's settings, so only
// the person who runs the app can do it, even before anyone can sign in.
export async function POST(request: Request) {
  try {
    const container = getContainer()
    const body = await readJson(request)
    const setupCode = field(body, 'setupCode')
    if (!container.auth.isSetupCodeValid(typeof setupCode === 'string' ? setupCode.trim() : null)) {
      return problem(401, 'That setup code is not right')
    }
    return json(await container.useCases.startLinking())
  } catch (error) {
    return handleError(error)
  }
}
