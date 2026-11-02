#!/usr/bin/env node
// Claude Code hook: tells the SlacKing app that a session finished or needs a decision, and hands
// the answer from the phone back to Claude.
//
// Claude Code runs this on Stop and PermissionRequest (scripts/install-hook.mjs adds both to
// ~/.claude/settings.json). It gets the hook's JSON on stdin, reads the session's name and a
// summary from the session log on this computer, and POSTs only those to the app. The log itself
// never leaves the computer.
//
// Answering from the phone. The POST says what can be answered (a permission, a plan, questions
// with options, or a reply to a finished turn), then the hook polls the app for the answer:
// - PermissionRequest: the computer asks at the same time, and whichever is answered first wins.
//   An answer at the computer shows in the session log, so the hook stops and the phone stops
//   offering. The answer goes back as the hook's decision (an allow, a deny with a message, or
//   the chosen options).
// - Stop: installed with asyncRewake, so it waits in the background without holding anything up.
//   A reply wakes Claude with it (exit 2, the reply on stderr). A new message typed at the
//   computer ends the wait.
//
// Settings, from ~/.claude/hooks/slacking.json ({ "url", "secret", "answers", "waitMinutes" }) or
// the environment (SLACKING_URL, SLACKING_WEBHOOK_SECRET). "answers": false only notifies. It
// never fails the hook: problems are written to ~/.claude/hooks/slacking-notify.log.

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const HOOK_DIR = join(homedir(), '.claude', 'hooks')
const CONFIG_FILE = join(HOOK_DIR, 'slacking.json')
const LOG_FILE = join(HOOK_DIR, 'slacking-notify.log')
// One empty file per session this hook woke with a reply from the phone (see kindOf).
const WOKE_DIR = join(HOOK_DIR, 'slacking-woke')

// Only the end of a long log is read; titles are written all through it and the last turn is at the end.
const TAIL_BYTES = 2 * 1024 * 1024
// Long ones fold behind Show more on the phone; keep in step with LIMITS.summary in src/domain/agent-event.ts.
const SUMMARY_MAX = 6_000
const TIMEOUT_MS = 8_000
const POLL_MS = 2_000
export const DEFAULT_WAIT_MINUTES = 30

/**
 * Which kind of notification a hook event is, or null for events this hook ignores. `wokeByPhone`:
 * this hook woke the session with a reply from the phone, so the Stop that follows is a finished turn.
 */
export function kindOf(input, { wokeByPhone = false } = {}) {
  switch (input?.hook_event_name) {
    case 'Stop':
      // Claude is continuing because a Stop hook asked it to: not finished yet. Claude Code flags
      // the turn a phone reply started the same way, but that one did finish.
      return input.stop_hook_active && !wokeByPhone ? null : 'finished'
    case 'PermissionRequest':
      return 'needs-input'
    case 'PreToolUse':
      // Installs from before answering from the phone; notify only. Questions and plans now come
      // through PermissionRequest, which lets the computer ask at the same time.
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

/** Claude's messages since the person's last one. */
function lastTurn(entries) {
  let start = 0
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isPrompt(entries[i])) {
      start = i + 1
      break
    }
  }
  return entries.slice(start).filter((e) => e.type === 'assistant')
}

/**
 * The input of the last turn's wrap-up: the recap, question and reply buttons the Claude desktop
 * app shows under every reply. Null without one (the terminal has none).
 */
function lastWrapUp(turn) {
  for (let i = turn.length - 1; i >= 0; i--) {
    for (const block of contentBlocks(turn[i]).slice().reverse()) {
      if (block.type === 'tool_use' && /wrap_up$/.test(block.name ?? '') && typeof block.input?.recap === 'string') {
        return block.input
      }
    }
  }
  return null
}

/** What the last turn did: its wrap-up recap with its question when there is one, else the start of Claude's last reply. */
export function lastTurnSummary(entries) {
  const turn = lastTurn(entries)
  const wrapUp = lastWrapUp(turn)
  if (wrapUp) {
    const ask = typeof wrapUp.ask === 'string' && wrapUp.ask.trim() ? `\n\nQuestion: ${wrapUp.ask.trim()}` : ''
    return wrapUp.recap.trim() + ask
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
      const questions = (Array.isArray(input.questions) ? input.questions : []).filter(
        (q) => typeof q?.question === 'string' && q.question.trim(),
      )
      if (!questions.length) return 'Has a question for you.'
      const options = (q) => (Array.isArray(q.options) ? q.options.map((o) => o?.label).filter((l) => typeof l === 'string') : [])
      return `Asks: ${questions.map((q) => (options(q).length ? `${q.question} (${options(q).join(' / ')})` : q.question)).join('\n')}`
    }
    case 'ExitPlanMode':
      return typeof input.plan === 'string' && input.plan.trim() ? `Has a plan ready:\n\n${input.plan.trim()}` : 'Has a plan ready and wants your approval.'
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

/**
 * What the phone can answer, or null. Only for the events whose answer this hook can hand back:
 * a permission request (including questions and plans, which ask for permission too) and Stop.
 */
export function promptFor(input, entries) {
  if (input?.hook_event_name === 'Stop') {
    // The wrap-up's reply buttons, as quick replies. Ones that run an app action (commit, open a
    // pull request) do nothing as text, so they are left out.
    const actions = lastWrapUp(lastTurn(entries))?.actions
    const suggestions = (Array.isArray(actions) ? actions : [])
      .filter((a) => typeof a?.label === 'string' && a.label.trim() && !a.action)
      .map((a) => a.label.trim())
    return { type: 'reply', suggestions }
  }
  if (input?.hook_event_name !== 'PermissionRequest') return null
  switch (input.tool_name) {
    case 'AskUserQuestion': {
      const questions = Array.isArray(input.tool_input?.questions) ? input.tool_input.questions : []
      return questions.length ? { type: 'question', questions } : null
    }
    case 'ExitPlanMode':
      return { type: 'plan' }
    default:
      return { type: 'permission', tool: String(input.tool_name ?? '') }
  }
}

/** The body sent to the app, or null when this event should not notify. */
export function buildPayload(input, entries, { answers = false, waitMinutes = DEFAULT_WAIT_MINUTES, wokeByPhone = false } = {}) {
  const kind = kindOf(input, { wokeByPhone })
  if (!kind) return null
  const summary = kind === 'finished' ? lastTurnSummary(entries) : describeRequest(input.tool_name, input.tool_input)
  const prompt = answers ? promptFor(input, entries) : null
  return {
    kind,
    sessionId: String(input.session_id ?? 'unknown'),
    sessionTitle: sessionTitle(entries),
    project: input.cwd ? basename(String(input.cwd)) : '',
    summary: summary.length <= SUMMARY_MAX ? summary : `${summary.slice(0, SUMMARY_MAX - 1)}…`,
    ...(prompt ? { prompt, waitSeconds: Math.round(waitMinutes * 60) } : {}),
  }
}

/**
 * How the hook hands the phone's answer to Claude: what to print where, and the exit code. Null
 * when the answer doesn't fit the event, which leaves Claude asking at the computer.
 */
export function answerFor(input, reply) {
  if (input?.hook_event_name === 'Stop') {
    if (reply?.type !== 'message' || !reply.message) return null
    return { exitCode: 2, stdout: '', stderr: `The user replied from their phone: ${reply.message}` }
  }
  if (input?.hook_event_name !== 'PermissionRequest') return null

  const plan = input.tool_name === 'ExitPlanMode'
  let decision
  switch (reply?.type) {
    case 'allow':
      // A plan is only approved with its input handed back; a bare allow leaves the prompt open.
      decision = plan ? { behavior: 'allow', updatedInput: input.tool_input ?? {} } : { behavior: 'allow' }
      break
    case 'deny':
      decision = {
        behavior: 'deny',
        message: reply.message || (plan ? 'The user did not approve this plan from their phone. Keep planning.' : 'The user denied this from their phone.'),
      }
      break
    case 'answers':
      if (input.tool_name !== 'AskUserQuestion') return null
      decision = { behavior: 'allow', updatedInput: { ...input.tool_input, answers: reply.answers } }
      break
    default:
      return null
  }
  return { exitCode: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } }), stderr: '' }
}

/**
 * True once the session has moved on without the phone, from the log lines written since the hook
 * started: the person's side wrote something. That is the tool's result once a prompt is answered
 * at the computer, an interruption, or a new message. Claude's own lines don't count: its last
 * message can land in the log just after Stop fires.
 */
export function movedOn(newEntries) {
  return newEntries.some((e) => e.type === 'user' && !e.isMeta)
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

function fileSize(path) {
  try {
    return path ? statSync(path).size : 0
  } catch {
    return 0
  }
}

/** What was appended to the log after `offset`, capped to the tail. */
function readFrom(path, offset) {
  const size = fileSize(path)
  if (size <= offset) return ''
  const start = Math.max(offset, size - TAIL_BYTES)
  const buffer = Buffer.alloc(size - start)
  try {
    const fd = openSync(path, 'r')
    try {
      readSync(fd, buffer, 0, buffer.length, start)
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
  if (!url || !secret) return null
  const waitMinutes = Number(file.waitMinutes)
  return {
    url: String(url).replace(/\/+$/, ''),
    secret: String(secret),
    answers: file.answers !== false,
    waitMinutes: Number.isFinite(waitMinutes) && waitMinutes > 0 ? waitMinutes : DEFAULT_WAIT_MINUTES,
  }
}

function wokeMarker(sessionId) {
  return join(WOKE_DIR, String(sessionId ?? 'unknown').replace(/[^\w-]/g, '_'))
}

/** True, once, after this hook woke the session with a reply from the phone. */
function takeWokeMarker(sessionId) {
  const marker = wokeMarker(sessionId)
  if (!existsSync(marker)) return false
  rmSync(marker, { force: true })
  return true
}

function leaveWokeMarker(sessionId) {
  try {
    mkdirSync(WOKE_DIR, { recursive: true })
    writeFileSync(wokeMarker(sessionId), '')
  } catch {
    // The next Stop then looks like another hook's and doesn't notify; the reply still went through.
  }
}

function request(config, method, path, body) {
  return fetch(`${config.url}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.secret}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/**
 * Polls the app until the phone answers, the prompt closes there, the session moves on at the
 * computer, or the wait runs out. Returns the reply, or null. Without a reply the app is told,
 * so the phone stops offering one.
 */
async function waitForReply(config, id, input, waitSeconds, logOffset) {
  const deadline = Date.now() + waitSeconds * 1000
  const path = `/api/webhooks/claude/events/${encodeURIComponent(id)}`
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    if (movedOn(parseLines(readFrom(input.transcript_path, logOffset)))) break
    let answer
    try {
      const response = await request(config, 'GET', path)
      // An app without this route (not deployed yet) or a changed secret: no answer is coming.
      if (response.status === 404 || response.status === 401) break
      if (!response.ok) continue
      answer = await response.json()
    } catch {
      // Offline for a moment: keep waiting.
      continue
    }
    if (answer.state === 'answered' && answer.reply) return answer.reply
    if (answer.state !== 'open') return null
  }
  await request(config, 'DELETE', path).catch(() => {})
  return null
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

/** Returns how to hand an answer to Claude, or null to leave everything as it was. */
async function main() {
  const input = JSON.parse((await readStdin()) || '{}')
  // Anything written to the log from here on is the session moving on (see movedOn).
  const logOffset = fileSize(input.transcript_path)
  const wokeByPhone = input.hook_event_name === 'Stop' && input.stop_hook_active ? takeWokeMarker(input.session_id) : false
  const kind = kindOf(input, { wokeByPhone })
  if (!kind) return null

  const config = readConfig()
  if (!config) {
    log(`not sent: no url/secret in ${CONFIG_FILE} or SLACKING_URL/SLACKING_WEBHOOK_SECRET`)
    return null
  }

  let entries = parseLines(readTail(input.transcript_path))
  // The log may not hold the last reply yet when Stop fires; give it a moment once.
  if (kind === 'finished' && !lastTurnSummary(entries)) {
    await sleep(800)
    entries = parseLines(readTail(input.transcript_path))
  }
  const payload = buildPayload(input, entries, { answers: config.answers, waitMinutes: config.waitMinutes, wokeByPhone })
  if (!payload) return null

  const response = await request(config, 'POST', '/api/webhooks/claude', payload)
  if (!response.ok) {
    log(`not sent: ${response.status} ${(await response.text()).slice(0, 200)}`)
    return null
  }
  if (!payload.prompt) return null

  const { id } = await response.json()
  const reply = await waitForReply(config, id, input, payload.waitSeconds, logOffset)
  const answer = reply ? answerFor(input, reply) : null
  if (answer?.exitCode === 2) leaveWokeMarker(input.session_id)
  return answer
}

const write = (stream, text) => new Promise((resolve) => (text ? stream.write(text, () => resolve()) : resolve()))

// Run only when executed, not when imported by the tests. Exits explicitly: an idle connection
// kept open by fetch would otherwise hold Claude up for a few seconds.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      log(`failed: ${error?.message ?? error}`)
      return null
    })
    .then(async (answer) => {
      await write(process.stdout, answer?.stdout)
      await write(process.stderr, answer?.stderr)
      process.exit(answer?.exitCode ?? 0)
    })
}
