import { NotConfiguredError } from '../../domain/errors'
import type { AuthenticatorRepository } from '../ports/authenticator-repository'
import type { Clock } from '../ports/clock'
import type { OneTimeCodes } from '../ports/one-time-codes'
import type { QrRenderer } from '../ports/qr-renderer'
import type { SecretBox } from '../ports/secret-box'
import type { SessionTokens } from '../ports/session-tokens'

/** What the sign-in use cases share. */
export interface AuthDeps {
  authenticators: AuthenticatorRepository
  codes: OneTimeCodes
  /** Null when ENCRYPTION_KEY is not set: the secret can then be neither stored nor read. */
  secrets: SecretBox | null
  sessions: SessionTokens
  clock: Clock
}

export interface LinkingDeps extends AuthDeps {
  qr: QrRenderer
}

export function requireSecretBox(secrets: SecretBox | null): SecretBox {
  if (!secrets) throw new NotConfiguredError('ENCRYPTION_KEY is not set on the server, so no authenticator can be linked or used')
  return secrets
}
