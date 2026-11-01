// Installs the Claude Code hook that sends notifications to the app.
//
//   npm run hook:install -- --url https://<your-app>.vercel.app --secret <WEBHOOK_SECRET>
//
// 1. Copies hook/notify.mjs to ~/.claude/hooks/slacking-notify.mjs.
// 2. Writes the app's address and webhook secret to ~/.claude/hooks/slacking.json.
// 3. Adds the hook to ~/.claude/settings.json for Stop, PermissionRequest, and PreToolUse on
//    AskUserQuestion|ExitPlanMode, next to any hooks already there. A backup is saved first.
// Safe to run again (for a new address or secret): nothing is added twice.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

const url = arg('url')?.replace(/\/+$/, '')
const secret = arg('secret')
if (!url || !/^https?:\/\//.test(url) || !secret) {
  console.error('Usage: npm run hook:install -- --url https://<your-app>.vercel.app --secret <WEBHOOK_SECRET>')
  process.exit(1)
}

const claudeDir = join(homedir(), '.claude')
const hookDir = join(claudeDir, 'hooks')
const hookFile = join(hookDir, 'slacking-notify.mjs')
const settingsFile = join(claudeDir, 'settings.json')
mkdirSync(hookDir, { recursive: true })

copyFileSync(fileURLToPath(new URL('../hook/notify.mjs', import.meta.url)), hookFile)
writeFileSync(join(hookDir, 'slacking.json'), JSON.stringify({ url, secret }, null, 2) + '\n')
console.log(`[hook] copied the hook to ${hookFile}`)
console.log(`[hook] saved the address and secret to ${join(hookDir, 'slacking.json')}`)

// Forward slashes work for node on Windows and survive the shell Claude Code runs hooks in.
const command = `node "${hookFile.replace(/\\/g, '/')}"`
const wanted = [
  { event: 'Stop', matcher: undefined },
  { event: 'PermissionRequest', matcher: '*' },
  { event: 'PreToolUse', matcher: 'AskUserQuestion|ExitPlanMode' },
]

const settings = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {}
if (existsSync(settingsFile)) {
  const backup = `${settingsFile}.bak-${Date.now()}`
  copyFileSync(settingsFile, backup)
  console.log(`[hook] backed up your settings to ${backup}`)
}

settings.hooks ??= {}
let added = 0
for (const { event, matcher } of wanted) {
  const groups = (settings.hooks[event] ??= [])
  // Any earlier copy of this hook, wherever it is, is replaced by the one below.
  for (const group of groups) group.hooks = (group.hooks ?? []).filter((h) => !String(h.command ?? '').includes('slacking-notify.mjs'))
  let group = groups.find((g) => (g.matcher ?? undefined) === matcher)
  if (!group) {
    group = matcher === undefined ? { hooks: [] } : { matcher, hooks: [] }
    groups.push(group)
  }
  group.hooks.push({ type: 'command', command, async: true, timeout: 20 })
  added++
}
writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n')
console.log(`[hook] added the hook to ${added} events in ${settingsFile}`)
console.log('[hook] done. New Claude Code sessions pick it up; problems are written to ~/.claude/hooks/slacking-notify.log')
