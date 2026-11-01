// Types for hook/notify.mjs, so the tests can import it.

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
}

export type Entry = Record<string, unknown>

export function kindOf(input: HookInput): Kind | null
export function parseLines(text: string): Entry[]
export function sessionTitle(entries: Entry[]): string
export function lastTurnSummary(entries: Entry[]): string
export function describeRequest(toolName: string | undefined, toolInput: Record<string, unknown> | undefined): string
export function buildPayload(input: HookInput, entries: Entry[]): Payload | null
