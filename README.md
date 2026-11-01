# SlacKing

A phone app that tells you when a Claude Code session **finishes** or **needs a decision**, with
the session's name and a short summary, so you can step away from the computer.

It's a web app you install from Chrome on Android, like Dotario Monitor, on the same stack:
Next.js 16, React 19, `web-push`, `pg`, vitest, and the same clean architecture. Data lives in a
free Supabase project; the app runs on a free Vercel project. Sign-in uses a 6-digit code from
Microsoft Authenticator (any TOTP authenticator app works).

## How it works

```
Claude Code (your PC)                         Vercel                         Your phone
─────────────────────                         ──────                         ──────────
Stop / PermissionRequest /   ──hook──▶  POST /api/webhooks/claude  ──web push──▶  notification
AskUserQuestion / ExitPlanMode           (Bearer WEBHOOK_SECRET)                  tap → full summary
        │                                         │
 hook/notify.mjs reads the session's             saves it in Supabase (7 days)
 name and summary from its local log
```

- **Done**: sent when a turn ends. The summary is the short recap the Claude desktop app shows
  under each reply; without one, the start of Claude's last message.
- **Needs you**: sent when Claude asks permission for a tool (says which command or file), asks
  you a question (says the question), or wants a plan approved.
- Notifications from the same session replace each other on the phone. Tapping one opens its full
  summary. The inbox keeps 7 days.

Only the session name, the folder name and the summary leave your computer, never the session log.
Note that a permission summary includes the command Claude wants to run.

## Setup

You need Node 20.9+, a Supabase account, a Vercel account and Microsoft Authenticator on the phone.

### 1. Supabase

1. Create a project (free plan).
2. **Connect** (top bar) → copy two connection strings:
   - **Transaction pooler** (port 6543): the app's `DATABASE_URL`.
   - **Session pooler** (port 5432): for running migrations once.
3. Optional, recommended: **Database → Settings → SSL Configuration → Download certificate**.
   Its contents go in `DATABASE_CA_CERT`, so the app checks it is really talking to Supabase.
4. Create the tables, from this folder:

   In PowerShell (Windows):

   ```powershell
   $env:DATABASE_URL = "<session pooler string>"; npm run migrate; Remove-Item Env:DATABASE_URL
   ```

   In bash, Git Bash or macOS:

   ```bash
   DATABASE_URL="<session pooler string>" npm run migrate
   ```

   Keep the quotes: the password in the string can contain characters the shell would read.

   The migration also turns on row level security, so Supabase's public Data API can read none
   of these tables.

The free plan pauses a project after about a week without activity. Using Claude keeps it awake;
after a long break, restore it from the Supabase dashboard.

### 2. Secrets

```bash
npm run secrets
```

prints a value for `WEBHOOK_SECRET`, `SETUP_CODE`, `SESSION_SECRET`, `ENCRYPTION_KEY`,
`VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Keep `SETUP_CODE` in your password manager: it's how
you link a new phone if you lose this one.

### 3. Vercel

1. Push this folder to a GitHub repository and import it in Vercel (framework: Next.js; no other
   settings needed).
2. **Settings → Environment Variables**: add everything from `.env.example`, using the values from
   steps 1 and 2, and `VAPID_SUBJECT=mailto:<your email>`.
3. Deploy. `https://<project>.vercel.app/api/health` should say `"persistent": true, "push": true`.

### 4. Phone

1. Open `https://<project>.vercel.app` in **Chrome** on the phone.
2. **Link your authenticator**: enter `SETUP_CODE`, then in Microsoft Authenticator tap
   **+ → Other account** and scan the QR code. On the phone itself you can't scan your own screen:
   open **On this phone, so you can't scan it?** and enter the key by hand instead, or open the
   link page on your computer and scan from there. Enter the 6-digit code to finish.
3. Chrome menu (⋮) → **Install** (older Chrome: Add to Home screen → Install), then open the app
   from the home screen. Not **Create shortcut**: that opens in a Chrome tab, and a tapped
   notification may not land on its summary.
4. **This phone → Turn on notifications**, allow them, then **Send a test notification**.

Sessions last 30 days. Linking a new authenticator signs every browser out.

### 5. The hook on your computer

```bash
npm run hook:install -- --url https://<project>.vercel.app --secret <WEBHOOK_SECRET>
```

This copies the hook to `~/.claude/hooks/`, saves the address and secret next to it, and adds it to
`~/.claude/settings.json` beside your existing hooks (a backup of the file is saved first). New
Claude Code sessions use it. If nothing arrives, look in `~/.claude/hooks/slacking-notify.log`.

## Local development

Local development uses its own Postgres in Docker, never the real Supabase database, and its own
VAPID keys, so nothing you do locally reaches your phone.

```bash
cp .env.example .env.local   # fill in at least SETUP_CODE, SESSION_SECRET, ENCRYPTION_KEY
docker compose up -d         # Postgres on localhost:54432 (docker-compose.yml)
```

Add the local database to `.env.local` and create its tables (PowerShell):

```powershell
Add-Content .env.local "DATABASE_URL=postgresql://slacking:slacking@localhost:54432/slacking"
$env:DATABASE_URL = "postgresql://slacking:slacking@localhost:54432/slacking"; npm run migrate; Remove-Item Env:DATABASE_URL
```

Then:

```bash
npm run seed -- 40 --fresh   # 40 realistic notifications over the last days (local database only)
npm run dev                  # http://localhost:3000
npm run check                # lint, typecheck, tests
```

`npm test` also runs the paging and clearing tests against the Docker database when
`TEST_DATABASE_URL` is set to the same address (they empty `agent_events` there first).
Without `DATABASE_URL`, the app keeps everything in memory instead. Server-side code is wired
once per dev-server start (`src/container.ts`), so restart `npm run dev` after changing it.

Send a test event:

```bash
curl -X POST http://localhost:3000/api/webhooks/claude \
  -H "authorization: Bearer $WEBHOOK_SECRET" -H "content-type: application/json" \
  -d '{"kind":"finished","sessionId":"test","sessionTitle":"Test session","project":"slacking","summary":"Hello from curl."}'
```

## Code

See [docs/architecture.md](docs/architecture.md).
