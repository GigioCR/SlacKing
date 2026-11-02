// Installs the Claude Code hook that sends notifications to the app and hands answers from the
// phone back to Claude.
//
//   npm run hook:install -- --url https://<your-app>.vercel.app --secret <WEBHOOK_SECRET>
//   npm run hook:install https://<your-app>.vercel.app <WEBHOOK_SECRET>     (works in PowerShell too)
//
// PowerShell drops the "--" before npm sees it, so npm takes --url and --secret as its own options
// and passes only the two values on. Those are accepted as they are: the address, then the secret.
//
// 1. Copies hook/notify.mjs to ~/.claude/hooks/slacking-notify.mjs.
// 2. Writes the app's address and webhook secret to ~/.claude/hooks/slacking.json, keeping
//    "answers" (false: notify only), "waitMinutes" (how long to wait for the phone) and
//    "contextWindow" (the model's window, for the context percentage) if set.
// 3. Adds the hook to ~/.claude/settings.json next to any hooks already there (a backup is saved
//    first), and removes it from anywhere else an earlier version put it:
//    - Stop, in the background with asyncRewake, so a reply from the phone can wake Claude.
//    - PermissionRequest (permissions, questions and plans), waiting for the phone's answer while
//      the computer asks too. Its timeout is a minute past the wait.
//    With "answers": false both run in the background and only notify.
// Safe to run again (for a new address, secret or wait): nothing is added twice.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Keep in step with DEFAULT_WAIT_MINUTES in hook/notify.mjs.
const DEFAULT_WAIT_MINUTES = 30

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))
const url = (arg('url') ?? positional[0])?.replace(/\/+$/, '')
const secret = arg('secret') ?? positional[1]
if (!url || !/^https?:\/\//.test(url) || !secret) {
  console.error('Usage: npm run hook:install https://<your-app>.vercel.app <WEBHOOK_SECRET>')
  process.exit(1)
}

const claudeDir = join(homedir(), '.claude')
const hookDir = join(claudeDir, 'hooks')
const hookFile = join(hookDir, 'slacking-notify.mjs')
const configFile = join(hookDir, 'slacking.json')
const settingsFile = join(claudeDir, 'settings.json')
mkdirSync(hookDir, { recursive: true })

let previous = {}
try {
  previous = JSON.parse(readFileSync(configFile, 'utf8'))
} catch {
  // First install.
}
const answers = previous.answers !== false
const waitMinutes = Number(previous.waitMinutes) > 0 ? Number(previous.waitMinutes) : DEFAULT_WAIT_MINUTES
const contextWindow = Number.isSafeInteger(previous.contextWindow) && previous.contextWindow > 0 ? previous.contextWindow : undefined

copyFileSync(fileURLToPath(new URL('../hook/notify.mjs', import.meta.url)), hookFile)
writeFileSync(configFile, JSON.stringify({ url, secret, answers, waitMinutes, contextWindow }, null, 2) + '\n')
console.log(`[hook] copied the hook to ${hookFile}`)
console.log(`[hook] saved the address and secret to ${configFile}`)

// Forward slashes work for node on Windows and survive the shell Claude Code runs hooks in.
const command = `node "${hookFile.replace(/\\/g, '/')}"`
const notifyOnly = { type: 'command', command, async: true, timeout: 20 }
const wanted = [
  { event: 'Stop', matcher: undefined, hook: answers ? { type: 'command', command, asyncRewake: true } : notifyOnly },
  {
    event: 'PermissionRequest',
    matcher: '*',
    hook: answers ? { type: 'command', command, timeout: Math.round(waitMinutes * 60) + 60 } : notifyOnly,
  },
]

const settings = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {}
if (existsSync(settingsFile)) {
  const backup = `${settingsFile}.bak-${Date.now()}`
  copyFileSync(settingsFile, backup)
  console.log(`[hook] backed up your settings to ${backup}`)
}

settings.hooks ??= {}
// Any earlier copy of this hook, wherever it is (earlier versions also used PreToolUse), goes;
// groups and events left empty by that go too.
for (const [event, groups] of Object.entries(settings.hooks)) {
  if (!Array.isArray(groups)) continue
  for (const group of groups) group.hooks = (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes('slacking-notify.mjs'))
  settings.hooks[event] = groups.filter((group) => group.hooks.length > 0)
  if (settings.hooks[event].length === 0) delete settings.hooks[event]
}

for (const { event, matcher, hook } of wanted) {
  const groups = (settings.hooks[event] ??= [])
  let group = groups.find((g) => (g.matcher ?? undefined) === matcher)
  if (!group) {
    group = matcher === undefined ? { hooks: [] } : { matcher, hooks: [] }
    groups.push(group)
  }
  group.hooks.push(hook)
}
writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n')
console.log(`[hook] added the hook to ${wanted.map((w) => w.event).join(' and ')} in ${settingsFile}`)
console.log(
  answers
    ? `[hook] answering from the phone is on; Claude waits up to ${waitMinutes} min for it (computer prompts still show at once)`
    : '[hook] notifications only ("answers": false in slacking.json)',
)
console.log('[hook] done. New Claude Code sessions pick it up; problems are written to ~/.claude/hooks/slacking-notify.log')
