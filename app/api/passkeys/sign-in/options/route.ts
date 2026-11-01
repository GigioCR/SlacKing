import { getContainer } from '@/src/container'
import { handleError, json, relyingParty } from '../../../_lib/http'

export const dynamic = 'force-dynamic'

/** Open to anyone: the prompt is worthless without the phone and its fingerprint. */
export async function POST(request: Request) {
  try {
    return json(await getContainer().useCases.startPasskeySignIn(relyingParty(request)))
  } catch (error) {
    return handleError(error)
  }
}
