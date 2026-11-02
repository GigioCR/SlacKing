// Types for hook/notify.mjs, so the tests can import it.

import type { Prompt, Reply } from '../src/domain/prompt'

export type Kind = 'finished' | 'needs-input'

export interface HookInput {
  hook_event_name?: string
  session_id?: string
  transcript_path?: string
  cwd?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  stop_hook_active?: boolean
}

export interface Payload {
  kind: Kind
  sessionId: string
  sessionTitle: string
  project: string
  summary: string
  context?: ContextUsage
  prompt?: Prompt
  waitSeconds?: number
}

export interface PayloadOptions {
  answers?: boolean
  waitMinutes?: number
  wokeByPhone?: boolean
  contextWindow?: number | null
}

export interface ContextUsage {
  usedTokens: number
  windowTokens: number
}

export interface HookAnswer {
  exitCode: number
  stdout: string
  stderr: string
}

export type Entry = Record<string, unknown>

export const DEFAULT_WAIT_MINUTES: number

export function kindOf(input: HookInput, options?: { wokeByPhone?: boolean }): Kind | null
export function parseLines(text: string): Entry[]
export function sessionTitle(entries: Entry[]): string
export function lastTurnSummary(entries: Entry[]): string
export function contextUsage(entries: Entry[], options?: { contextWindow?: number | null }): ContextUsage | null
export function describeRequest(toolName: string | undefined, toolInput: Record<string, unknown> | undefined): string
export function promptFor(input: HookInput, entries: Entry[]): Prompt | null
export function buildPayload(input: HookInput, entries: Entry[], options?: PayloadOptions): Payload | null
export function answerFor(input: HookInput, reply: Reply): HookAnswer | null
export function movedOn(newEntries: Entry[]): boolean
