import { getContainer } from '@/src/container'
import { field, handleError, json, problem, readJson, withSessionCookie } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const container = getContainer()
    const body = await readJson(request)
    const setupCode = field(body, 'setupCode')
    if (!container.auth.isSetupCodeValid(typeof setupCode === 'string' ? setupCode.trim() : null)) {
      return problem(401, 'That setup code is not right')
    }
    const session = await container.useCases.confirmLinking(field(body, 'code'))
    return withSessionCookie(json({ signedIn: true }), session)
  } catch (error) {
    return handleError(error)
  }
}
