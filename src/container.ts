import type { SessionTokens } from './application/ports/session-tokens'
import { checkSession, getAuthStatus } from './application/use-cases/check-session'
import {
  finishPasskeyRegistration,
  finishPasskeySignIn,
  listPasskeys,
  removePasskey,
  startPasskeyRegistration,
  startPasskeySignIn,
} from './application/use-cases/passkeys'
import { answerPrompt, closePrompt, readPromptAnswer } from './application/use-cases/answer-prompt'
import { clearEvent, clearEvents } from './application/use-cases/clear-events'
import { confirmLinking } from './application/use-cases/confirm-linking'
import { getEvent } from './application/use-cases/get-event'
import { getHookActivity } from './application/use-cases/hook-activity'
import { listEvents } from './application/use-cases/list-events'
import { receiveAgentEvent } from './application/use-cases/receive-agent-event'
import { sendTestNotification } from './application/use-cases/send-test-notification'
import { signIn } from './application/use-cases/sign-in'
import { startLinking } from './application/use-cases/start-linking'
import { subscribeDevice } from './application/use-cases/subscribe-device'
import { unsubscribeDevice } from './application/use-cases/unsubscribe-device'
import { HmacSessionTokens } from './infrastructure/auth/hmac-session-tokens'
import { secretsMatch } from './infrastructure/auth/secret-compare'
import { loadConfig, type AppConfig } from './infrastructure/config/env'
import { AesGcmSecretBox } from './infrastructure/crypto/secret-box'
import { SimpleWebAuthnCeremonies } from './infrastructure/passkeys/simplewebauthn-ceremonies'
import {
  InMemoryAuthenticatorRepository,
  InMemoryChallengeStore,
  InMemoryEventRepository,
  InMemoryPasskeyRepository,
  InMemorySubscriptionRepository,
} from './infrastructure/persistence/in-memory/repositories'
import { PostgresAuthenticatorRepository } from './infrastructure/persistence/postgres/authenticator-repository'
import { PostgresEventRepository } from './infrastructure/persistence/postgres/event-repository'
import { PostgresChallengeStore, PostgresPasskeyRepository } from './infrastructure/persistence/postgres/passkey-repository'
import { createPool } from './infrastructure/persistence/postgres/pool'
import { PostgresSubscriptionRepository } from './infrastructure/persistence/postgres/subscription-repository'
import { DisabledNotifier, WebPushNotifier } from './infrastructure/push/web-push-notifier'
import { qrcodeRenderer } from './infrastructure/qr/qrcode-renderer'
import { systemClock } from './infrastructure/system/system-clock'
import { uuidGenerator } from './infrastructure/system/uuid-generator'
import { OtpauthCodes } from './infrastructure/totp/otpauth-codes'

// The composition root: the one place that knows which adapter fills each port.

/** Refuses every session when SESSION_SECRET is missing, so nobody is let in by accident. */
const noSessions: SessionTokens = {
  issue: () => {
    throw new Error('SESSION_SECRET is not set')
  },
  read: () => null,
}

function build(config: AppConfig) {
  const pool = config.databaseUrl ? createPool({ connectionString: config.databaseUrl, caCert: config.databaseCaCert }) : null
  const events = pool ? new PostgresEventRepository(pool) : new InMemoryEventRepository()
  const subscriptions = pool ? new PostgresSubscriptionRepository(pool) : new InMemorySubscriptionRepository()
  const authenticators = pool ? new PostgresAuthenticatorRepository(pool) : new InMemoryAuthenticatorRepository()
  const notifier = config.vapid ? new WebPushNotifier(config.vapid) : new DisabledNotifier()
  const sessions = config.sessionSecret ? new HmacSessionTokens(config.sessionSecret) : noSessions
  const secrets = config.encryptionKey ? new AesGcmSecretBox(config.encryptionKey) : null
  const passkeys = pool ? new PostgresPasskeyRepository(pool) : new InMemoryPasskeyRepository()
  const challenges = pool ? new PostgresChallengeStore(pool) : new InMemoryChallengeStore()
  const authDeps = { authenticators, codes: new OtpauthCodes(), secrets, sessions, clock: systemClock }
  const passkeyDeps = { passkeys, challenges, ceremonies: new SimpleWebAuthnCeremonies(), authenticators, sessions, clock: systemClock }
  const notifyDeps = { subscriptions, notifier }

  return {
    config: {
      vapidPublicKey: config.vapid?.publicKey ?? null,
      persistent: pool !== null,
      /** APP_ORIGIN when set; otherwise the address each request came to (see app/api/_lib/http.ts). */
      appOrigin: config.appOrigin,
    },
    auth: {
      isWebhookSecretValid: (provided: string | null) => secretsMatch(config.webhookSecret, provided),
      isSetupCodeValid: (provided: string | null) => secretsMatch(config.setupCode, provided),
    },
    useCases: {
      receiveAgentEvent: receiveAgentEvent({ events, ...notifyDeps, ids: uuidGenerator, clock: systemClock }),
      listEvents: listEvents({ events, clock: systemClock }),
      getEvent: getEvent({ events, clock: systemClock }),
      answerPrompt: answerPrompt({ events, clock: systemClock }),
      readPromptAnswer: readPromptAnswer({ events, clock: systemClock }),
      closePrompt: closePrompt({ events, clock: systemClock }),
      getHookActivity: getHookActivity({ events }),
      clearEvent: clearEvent({ events }),
      clearEvents: clearEvents({ events }),
      subscribeDevice: subscribeDevice({ subscriptions, ids: uuidGenerator, clock: systemClock }),
      unsubscribeDevice: unsubscribeDevice({ subscriptions }),
      sendTestNotification: sendTestNotification(notifyDeps),
      startLinking: startLinking({ ...authDeps, qr: qrcodeRenderer }),
      confirmLinking: confirmLinking({ ...authDeps, passkeys }),
      signIn: signIn(authDeps),
      checkSession: checkSession(authDeps),
      getAuthStatus: getAuthStatus({ ...authDeps, passkeys }),
      startPasskeyRegistration: startPasskeyRegistration(passkeyDeps),
      finishPasskeyRegistration: finishPasskeyRegistration(passkeyDeps),
      startPasskeySignIn: startPasskeySignIn(passkeyDeps),
      finishPasskeySignIn: finishPasskeySignIn(passkeyDeps),
      listPasskeys: listPasskeys(passkeyDeps),
      removePasskey: removePasskey(passkeyDeps),
    },
  }
}

export type Container = ReturnType<typeof build>

// Route handlers can be bundled separately, so one instance on globalThis keeps them all looking
// at the same state (the in-memory repositories, one database pool).
const KEY = Symbol.for('slacking.container')

export function getContainer(): Container {
  const holder = globalThis as unknown as Record<symbol, Container | undefined>
  if (!holder[KEY]) {
    const config = loadConfig(process.env)
    for (const warning of config.warnings) console.warn(`[config] ${warning}`)
    holder[KEY] = build(config)
  }
  return holder[KEY]
}
