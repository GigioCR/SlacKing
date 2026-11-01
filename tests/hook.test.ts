import { describe, expect, it } from 'vitest'
import { buildPayload, describeRequest, kindOf, lastTurnSummary, parseLines, sessionTitle } from '../hook/notify.mjs'

// Shaped like the lines of a real Claude Code session log (~/.claude/projects/<folder>/<session>.jsonl).
const user = (text: string) => ({ type: 'user', message: { role: 'user', content: text } })
const toolResult = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } })
const assistantText = (text: string) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } })
const wrapUp = (recap: string, ask?: string) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', name: 'mcp__ccd_turn__wrap_up', input: ask ? { recap, ask } : { recap } }] },
})
const title = (customTitle: string) => ({ type: 'custom-title', customTitle })

describe('kindOf', () => {
  it('maps the hook events this hook is installed for', () => {
    expect(kindOf({ hook_event_name: 'Stop' })).toBe('finished')
    expect(kindOf({ hook_event_name: 'PermissionRequest', tool_name: 'Bash' })).toBe('needs-input')
    expect(kindOf({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' })).toBe('needs-input')
    expect(kindOf({ hook_event_name: 'PreToolUse', tool_name: 'ExitPlanMode' })).toBe('needs-input')
  })

  it('ignores everything else, and a Stop that another hook is continuing', () => {
    expect(kindOf({ hook_event_name: 'PreToolUse', tool_name: 'Bash' })).toBeNull()
    expect(kindOf({ hook_event_name: 'Stop', stop_hook_active: true })).toBeNull()
    expect(kindOf({ hook_event_name: 'SessionStart' })).toBeNull()
  })
})

describe('sessionTitle', () => {
  it('uses the latest title the app gave the session', () => {
    expect(sessionTitle([title('Old name'), user('hi'), title('Fix invoice sync')])).toBe('Fix invoice sync')
  })

  it('falls back to the agent name, then nothing', () => {
    expect(sessionTitle([{ type: 'agent-name', agentName: 'Helper' }])).toBe('Helper')
    expect(sessionTitle([user('hi')])).toBe('')
  })
})

describe('lastTurnSummary', () => {
  it('uses the wrap-up recap of the last turn, with its question', () => {
    const entries = [
      user('first'),
      wrapUp('Old recap.'),
      user('do the thing'),
      assistantText('Working on it.'),
      toolResult(),
      wrapUp('Did the thing. Tests pass.', 'Commit it?'),
      assistantText('All done, here is the long explanation.'),
    ]
    expect(lastTurnSummary(entries)).toBe('Did the thing. Tests pass.\n\nQuestion: Commit it?')
  })

  it("falls back to Claude's last reply when the turn has no recap", () => {
    expect(lastTurnSummary([user('first'), wrapUp('Old recap.'), user('quick question'), assistantText('The answer is 4.')])).toBe(
      'The answer is 4.',
    )
  })

  it('does not treat tool results as the start of a turn', () => {
    expect(lastTurnSummary([user('go'), wrapUp('Recap.'), toolResult(), assistantText('trailing')])).toBe('Recap.')
  })

  it('is empty when nothing was said', () => {
    expect(lastTurnSummary([user('hello')])).toBe('')
  })
})

describe('describeRequest', () => {
  it('says what Claude wants to do', () => {
    expect(describeRequest('Bash', { command: 'git push', description: 'Push the branch' })).toBe(
      'Wants to run: git push\n(Push the branch)',
    )
    expect(describeRequest('Edit', { file_path: 'src/a.ts' })).toBe('Wants to edit src/a.ts')
    expect(describeRequest('AskUserQuestion', { questions: [{ question: 'Which DB?' }, { question: 'Which host?' }] })).toBe(
      'Asks: Which DB? / Which host?',
    )
    expect(describeRequest('ExitPlanMode', {})).toBe('Has a plan ready and wants your approval.')
    expect(describeRequest('mcp__github__create_pr', {})).toBe('Wants to use mcp__github__create_pr')
  })
})

describe('buildPayload', () => {
  const entries = [title('Fix invoice sync'), user('go'), wrapUp('Fixed it.')]

  it('builds what the webhook expects', () => {
    expect(
      buildPayload(
        { hook_event_name: 'Stop', session_id: 's1', cwd: 'C:\\Users\\me\\code\\hecho-syncware' },
        entries,
      ),
    ).toEqual({
      kind: 'finished',
      sessionId: 's1',
      sessionTitle: 'Fix invoice sync',
      project: process.platform === 'win32' ? 'hecho-syncware' : 'C:\\Users\\me\\code\\hecho-syncware',
      summary: 'Fixed it.',
    })
  })

  it('describes the request for a permission prompt', () => {
    const payload = buildPayload(
      { hook_event_name: 'PermissionRequest', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'rm -rf dist' } },
      entries,
    )
    expect(payload?.kind).toBe('needs-input')
    expect(payload?.summary).toBe('Wants to run: rm -rf dist')
  })

  it('sends nothing for an ignored event', () => {
    expect(buildPayload({ hook_event_name: 'PostToolUse' }, entries)).toBeNull()
  })
})

describe('parseLines', () => {
  it('skips a line cut short by the tail read', () => {
    expect(parseLines('{"type":"user"\n{"type":"custom-title","customTitle":"A"}\n')).toEqual([
      { type: 'custom-title', customTitle: 'A' },
    ])
  })
})
