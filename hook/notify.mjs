#!/usr/bin/env node
// Claude Code hook: tells the SlacKing app that a session finished or needs a decision.
//
// Claude Code runs this on Stop, PermissionRequest, and PreToolUse for AskUserQuestion and
// ExitPlanMode (scripts/install-hook.mjs adds those to ~/.claude/settings.json). It gets the
// hook's JSON on stdin, reads the session's name and a summary from the session log on this
// computer, and POSTs only those to the app. The log itself never leaves the computer.
//
// Settings, from ~/.claude/hooks/slacking.json ({ "url": ..., "secret": ... }) or the
// environment (SLACKING_URL, SLACKING_WEBHOOK_SECRET). It never fails the hook: problems are
// written to ~/.claude/hooks/slacking-notify.log and it exits 0.

import { appendFileSync, closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HOOK_DIR = join(homedir(), '.claude', 'hooks')
const CONFIG_FILE = join(HOOK_DIR, 'slacking.json')
const LOG_FILE = join(HOOK_DIR, 'slacking-notify.log')

// Only the end of a long log is read; titles are written all through it and the last turn is at the end.
const TAIL_BYTES = 2 * 1024 * 1024
const SUMMARY_MAX = 1_500
const TIMEOUT_MS = 8_000

/** Which kind of notification a hook event is, or null for events this hook ignores. */
export function kindOf(input) {
  switch (input?.hook_event_name) {
    case 'Stop':
      // Claude is continuing because another Stop hook asked it to: not finished yet.
      return input.stop_hook_active ? null : 'finished'
    case 'PermissionRequest':
      return 'needs-input'
    case 'PreToolUse':
      return input.tool_name === 'AskUserQuestion' || input.tool_name === 'ExitPlanMode' ? 'needs-input' : null
    default:
      return null
  }
}

export function parseLines(text) {
  const entries = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      // A line cut by the tail read, or one being written right now.
    }
  }
  return entries
}

/** The session's name as the Claude app shows it, or ''. */
export function sessionTitle(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type === 'custom-title' && typeof e.customTitle === 'string' && e.customTitle.trim()) return e.customTitle.trim()
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type === 'agent-name' && typeof e.agentName === 'string' && e.agentName.trim()) return e.agentName.trim()
  }
  return ''
}

function contentBlocks(entry) {
  const content = entry?.message?.content
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return Array.isArray(content) ? content : []
}

/** A message the person typed, as opposed to a tool result handed back to Claude. */
function isPrompt(entry) {
  if (entry.type !== 'user' || entry.isMeta) return false
  const blocks = contentBlocks(entry)
  return blocks.length > 0 && blocks.some((b) => b.type === 'text') && !blocks.some((b) => b.type === 'tool_result')
}

/**
 * What the last turn did. In the Claude desktop app every turn ends with a short recap (the
 * wrap-up the app shows under the reply); that is used when present. Otherwise, the start of
 * Claude's last reply.
 */
export function lastTurnSummary(entries) {
  let start = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isPrompt(entries[i])) {
      start = i + 1
      break
    }
  }
  const turn = entries.slice(start).filter((e) => e.type === 'assistant')

  for (let i = turn.length - 1; i >= 0; i--) {
    for (const block of contentBlocks(turn[i]).slice().reverse()) {
      if (block.type === 'tool_use' && /wrap_up$/.test(block.name ?? '') && typeof block.input?.recap === 'string') {
        const ask = typeof block.input.ask === 'string' && block.input.ask.trim() ? `\n\nQuestion: ${block.input.ask.trim()}` : ''
        return block.input.recap.trim() + ask
      }
    }
  }
  for (let i = turn.length - 1; i >= 0; i--) {
    const text = contentBlocks(turn[i])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim()
    if (text) return text
  }
  return ''
}

function oneLine(text, max) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

/** What Claude is waiting on, from the tool it wants to use. */
export function describeRequest(toolName, toolInput) {
  const input = toolInput ?? {}
  switch (toolName) {
    case 'AskUserQuestion': {
      const questions = Array.isArray(input.questions) ? input.questions : []
      const asked = questions.map((q) => q?.question).filter((q) => typeof q === 'string' && q.trim())
      return asked.length ? `Asks: ${asked.join(' / ')}` : 'Has a question for you.'
    }
    case 'ExitPlanMode':
      return 'Has a plan ready and wants your approval.'
    case 'Bash':
    case 'PowerShell':
      return `Wants to run: ${oneLine(input.command, 300)}${input.description ? `\n(${oneLine(input.description, 150)})` : ''}`
    case 'Edit':
    case 'Write':
    case 'NotebookEdit':
      return `Wants to edit ${input.file_path ?? input.notebook_path ?? 'a file'}`
    case 'WebFetch':
      return `Wants to open ${oneLine(input.url, 200)}`
    default:
      return `Wants to use ${toolName ?? 'a tool'}`
  }
}

/** The body sent to the app, or null when this event should not notify. */
export function buildPayload(input, entries) {
  const kind = kindOf(input)
  if (!kind) return null
  const summary = kind === 'finished' ? lastTurnSummary(entries) : describeRequest(input.tool_name, input.tool_input)
  return {
    kind,
    sessionId: String(input.session_id ?? 'unknown'),
    sessionTitle: sessionTitle(entries),
    project: input.cwd ? basename(String(input.cwd)) : '',
    summary: summary.length <= SUMMARY_MAX ? summary : `${summary.slice(0, SUMMARY_MAX - 1)}…`,
  }
}

function readTail(path) {
  if (!path) return ''
  try {
    const size = statSync(path).size
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    const fd = openSync(path, 'r')
    try {
      readSync(fd, buffer, 0, length, size - length)
    } finally {
      closeSync(fd)
    }
    return buffer.toString('utf8')
  } catch {
    return ''
  }
}

function readConfig() {
  let file = {}
  try {
    file = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    // No file: the environment may have the settings.
  }
  const url = process.env.SLACKING_URL || file.url
  const secret = process.env.SLACKING_WEBHOOK_SECRET || file.secret
  return url && secret ? { url: String(url).replace(/\/+$/, ''), secret: String(secret) } : null
}

function log(message) {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Nowhere to report it.
  }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const input = JSON.parse((await readStdin()) || '{}')
  if (!kindOf(input)) return

  const config = readConfig()
  if (!config) {
    log(`not sent: no url/secret in ${CONFIG_FILE} or SLACKING_URL/SLACKING_WEBHOOK_SECRET`)
    return
  }

  let entries = parseLines(readTail(input.transcript_path))
  // The log may not hold the last reply yet when Stop fires; give it a moment once.
  if (kindOf(input) === 'finished' && !lastTurnSummary(entries)) {
    await sleep(800)
    entries = parseLines(readTail(input.transcript_path))
  }
  const payload = buildPayload(input, entries)
  if (!payload) return

  const response = await fetch(`${config.url}/api/webhooks/claude`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.secret}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) log(`not sent: ${response.status} ${(await response.text()).slice(0, 200)}`)
}

// Run only when executed, not when imported by the tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => log(`failed: ${error?.message ?? error}`))
    .finally(() => process.exit(0))
}
