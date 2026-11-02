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
`{ kind, sessionId, sessionTitle, project, summary, context }` to `/api/webhooks/claude` with
`Authorization: Bearer WEBHOOK_SECRET`. `context` is how full the session is: the tokens the last
reply read (its `usage`: input plus cache writes and reads) out of the model's window, which the
log doesn't record, so the hook goes by the model (1M for `[1m]` and Opus 5, else 200k) unless
`contextWindow` in `slacking.json` says otherwise. The inbox colours it from 70% and 90%. `receiveAgentEvent` validates it, stores it, pushes it to
every phone, forgets phones the push service reports gone, and deletes events older than 7 days.

**Answering from the phone.** The hook adds what can be answered to the POST: `prompt`
(`src/domain/prompt.ts`: a permission, a plan, questions with options, or a reply to a finished
turn) and `waitSeconds`. The event stores it with `answerBy`. The phone answers with
`POST /api/events/{id}/reply`; `answerPrompt` checks it against the prompt and saves it only while
open (no answer yet, not closed, before `answerBy`), in one conditional update, so only the first
answer counts. The hook polls `GET /api/webhooks/claude/events/{id}` every 2 s and hands the
answer to Claude:

- *PermissionRequest* (also fired for AskUserQuestion and ExitPlanMode): the hook runs while the
  computer shows its own prompt, and whichever answers first wins. The answer goes back as the
  hook's `decision`: allow; deny with a message; allow with `updatedInput.answers` for questions;
  allow with the plan handed back for plans (a bare allow leaves that prompt open).
- *Stop*: installed with `asyncRewake`, so it waits in the background. A reply exits 2 with the
  text on stderr, which wakes Claude with it. Claude Code marks the next Stop as continued by a
  hook (`stop_hook_active`); a marker file in `~/.claude/hooks/slacking-woke/` tells the hook that
  one did finish, so it still notifies.

While a prompt is open the session log stays still. A new person-side line (the tool result of an
answer at the computer, an interruption, a typed message) means the session moved on: the hook
stops and `DELETE`s the prompt, which closes it on the phone. A new event from a session also
closes that session's open prompts. A session that ends takes its waiting hook with it (closed,
killed, or the computer asleep: no SessionEnd hook runs when it is killed), so each poll is also a
heartbeat (`hook_seen_at`): 30 s without one reads as closed (`HOOK_SILENCE_MS`), and a poll after
that opens it again. Buttons on the notification (`public/sw.js`, at most two on
Android) send a one-tap answer only where that is safe: Deny, a two-option question, a quick reply.
Allow and Approve open the screen first.

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
`passkeys` and `webauthn_challenges` in 002; the prompt and reply columns of `agent_events` in 003, the hook's heartbeat in 004, and context usage in 005.
Row level security is on with no policies and the Data API roles lose their grants, so only the
app's own connection can read them. Without `DATABASE_URL` the in-memory repositories are used.

## Not done

- Icons are Dotario Monitor's placeholders (`public/icons/`).
- No way to delete a single notification or a device from the phone; they expire (7 days) or are
  removed when the push service reports them gone.
- Concurrent sign-ins with the same code at the same instant could both succeed (no row lock).
  One person uses this app, so this was left simple.
