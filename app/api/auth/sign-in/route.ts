import { getContainer } from '@/src/container'
import { field, handleError, json, readJson, withSessionCookie } from '../../_lib/http'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await readJson(request)
    const session = await getContainer().useCases.signIn(field(body, 'code'))
    return withSessionCookie(json({ signedIn: true }), session)
  } catch (error) {
    return handleError(error)
  }
}
