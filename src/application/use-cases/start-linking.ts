import { EMPTY_AUTHENTICATOR, withPendingSecret } from '../../domain/authenticator'
import { requireSecretBox, type LinkingDeps } from './auth-deps'

export interface LinkingStart {
  /** The otpauth:// address inside the QR code. */
  uri: string
  qrDataUrl: string
  /** The same secret as text, for typing into the app when scanning is not possible. */
  secret: string
}

// The name Microsoft Authenticator shows above the codes.
const ACCOUNT = 'SlacKing'

/**
 * Makes a new secret and shows it as a QR code. It is kept as pending, so the authenticator that is
 * linked now (if any) keeps working until a code from the new one is confirmed (confirmLinking).
 */
export function startLinking(deps: LinkingDeps) {
  return async (): Promise<LinkingStart> => {
    const box = requireSecretBox(deps.secrets)
    const secret = deps.codes.newSecret()
    const current = (await deps.authenticators.get()) ?? EMPTY_AUTHENTICATOR
    await deps.authenticators.save(withPendingSecret(current, box.seal(secret)))
    const uri = deps.codes.enrollmentUri(secret, ACCOUNT)
    return { uri, qrDataUrl: await deps.qr.toDataUrl(uri), secret }
  }
}
