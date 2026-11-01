# Architecture

Clean architecture, laid out like Dotario Monitor. Dependencies point inward only, and
`eslint.config.mjs` enforces it:

| Layer | Folder | May import | Holds |
|---|---|---|---|
| Domain | `src/domain` | nothing | `AgentEvent`, `DeviceSubscription`, `Authenticator` and their rules (validation, retention, lockout, replay) |
| Application | `src/application` | domain | Use cases (`use-cases/`), ports (`ports/`), notification wording |
| Infrastructure | `src/infrastructure` | application, domain | Postgres and in-memory repositories, web push, TOTP (`otpauth`), QR (`qrcode`), AES-GCM, HMAC sessions, config |
| Composition | `src/container.ts` | everything | Picks an adapter for each port |
| Delivery | `app/` | the container | Route handlers (thin) and the phone screens |

`hook/notify.mjs` is outside the app: it runs on the computer, inside Claude Code.

## Flows

**A session finishes or needs a decision.** Claude Code runs `hook/notify.mjs` with the hook's
JSON. It reads the session title (`custom-title` lines) and the last turn's recap (the
`wrap_up` tool call the desktop app ends each turn with) from the session log, and POSTs
`{ kind, sessionId, sessionTitle, project, summary }` to `/api/webhooks/claude` with
`Authorization: Bearer WEBHOOK_SECRET`. `receiveAgentEvent` validates it, stores it, pushes it to
every phone, forgets phones the push service reports gone, and deletes events older than 7 days.

**Push.** The same as Dotario Monitor: the phone subscribes with the VAPID public key, the server
encrypts each message to that phone and signs it with the VAPID private key; `public/sw.js` shows
it and opens `/events/{id}` on a tap (with the Cache Storage hand-off for a closed Android app).

**Sign-in (TOTP).**

1. *Link.* `/link` asks for `SETUP_CODE`. `startLinking` makes a 160-bit secret, stores it sealed
   (AES-256-GCM, `ENCRYPTION_KEY`) as *pending*, and shows it as an `otpauth://` QR code.
   `confirmLinking` checks a code from the app against the pending secret; only then does it become
   the linked one. `generation` goes up, which signs out sessions made with an earlier app.
2. *Sign in.* `signIn` checks the code with ±1 step (30 s) of clock drift. A code is never accepted
   twice (`lastUsedStep`). Five wrong codes in a row pause sign-in for 15 minutes; the counter is
   in the database, so it holds across Vercel's instances.
3. *Session.* An HMAC-SHA256 signed token (`SESSION_SECRET`) with the generation and a 30-day expiry,
   in an `HttpOnly; Secure; SameSite=Lax` cookie. Every API call except the webhook, the sign-in
   routes and health checks it, including that its generation is still the linked one. Sessions
   slide: `/api/auth/status`, asked on every screen load, issues a fresh 30 days once a session is
   a day old (`src/domain/session.ts`), so it only runs out after 30 days without opening the app.

**Passkeys (WebAuthn).** Optional, added on This phone once signed in; the code stays as the backup.

1. *Add.* `startPasskeyRegistration` asks `@simplewebauthn/server` for creation options: the site
   (rpID = the app's host, `APP_ORIGIN` or the request's), a discoverable key, user verification
   required (fingerprint or screen lock). The random challenge goes into `webauthn_challenges` for
   5 minutes. The phone makes a key pair; `finishPasskeyRegistration` checks the answer (origin,
   site, challenge, user verified) and keeps only the public key in `passkeys`.
2. *Sign in.* `startPasskeySignIn` issues a fresh challenge listing the stored passkeys. The phone
   signs it after a fingerprint; on a computer, Chrome shows a QR code for the phone instead
   (WebAuthn "hybrid": phone and computer also check they are near each other over Bluetooth).
   `finishPasskeySignIn` finds the passkey, checks the signature with its public key, and *takes*
   the challenge (a delete, so an answer works once), refuses a counter that went backwards (a
   copied key), and issues a session with the linked authenticator's generation.
3. *Recovery.* Linking a new authenticator (with `SETUP_CODE`) removes every passkey, because that
   is how someone gets back in after losing the phone that held them.

The adapter is `src/infrastructure/passkeys/simplewebauthn-ceremonies.ts`, behind the
`PasskeyCeremonies` port. `tests/passkey-ceremonies.test.ts` runs it against a software
authenticator (real P-256 keys and signatures), including answers made for another site.

## Storage

Supabase Postgres through `pg` and Supabase's transaction pooler (fits serverless). Tables in
`migrations/`: `agent_events`, `device_subscriptions`, `authenticator` (one row) in 001;
`passkeys` and `webauthn_challenges` in 002.
Row level security is on with no policies and the Data API roles lose their grants, so only the
app's own connection can read them. Without `DATABASE_URL` the in-memory repositories are used.

## Not done

- Icons are Dotario Monitor's placeholders (`public/icons/`).
- No way to delete a single notification or a device from the phone; they expire (7 days) or are
  removed when the push service reports them gone.
- Concurrent sign-ins with the same code at the same instant could both succeed (no row lock).
  One person uses this app, so this was left simple.
