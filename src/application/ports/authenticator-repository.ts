import type { Authenticator } from '../../domain/authenticator'

/** The single authenticator record (src/domain/authenticator.ts). */
export interface AuthenticatorRepository {
  get(): Promise<Authenticator | null>
  save(auth: Authenticator): Promise<void>
}
