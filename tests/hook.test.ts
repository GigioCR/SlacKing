import { describe, expect, it } from 'vitest'
import { answerFor, buildPayload, describeRequest, kindOf, lastTurnSummary, movedOn, parseLines, promptFor, sessionTitle } from '../hook/notify.mjs'

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
      'Wants to run:\n\n```\ngit push\n```\n\nPush the branch',
    )
    expect(describeRequest('Edit', { file_path: 'src/a.ts' })).toBe('Wants to edit `src/a.ts`')
    // A command with backticks gets a longer fence, so it stays one block.
    expect(describeRequest('Bash', { command: 'echo ```x```' })).toBe('Wants to run:\n\n````\necho ```x```\n````')
    expect(describeRequest('AskUserQuestion', { questions: [{ question: 'Which DB?' }, { question: 'Which host?' }] })).toBe(
      'Asks: Which DB?\nWhich host?',
    )
    expect(
      describeRequest('AskUserQuestion', { questions: [{ question: 'Which DB?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }] }),
    ).toBe('Asks: Which DB? (Postgres / SQLite)')
    expect(describeRequest('ExitPlanMode', {})).toBe('Has a plan ready and wants your approval.')
    expect(describeRequest('ExitPlanMode', { plan: '1. Add the column\n2. Backfill' })).toBe(
      'Has a plan ready:\n\n1. Add the column\n2. Backfill',
    )
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
    expect(payload?.summary).toBe('Wants to run:\n\n```\nrm -rf dist\n```')
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

describe('answering from the phone', () => {
  const ask = {
    hook_event_name: 'PermissionRequest',
    session_id: 's1',
    tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question: 'Which DB?', options: [{ label: 'Postgres' }] }] },
  }
  const withActions = {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          name: 'mcp__ccd_turn__wrap_up',
          input: { recap: 'Did it.', ask: 'Commit?', actions: [{ label: 'Commit it' }, { label: 'Open PR', action: 'create_pr' }, { label: ' ' }] },
        },
      ],
    },
  }

  it('says what the phone can answer, with how long the hook waits', () => {
    const payload = buildPayload({ hook_event_name: 'Stop', session_id: 's1' }, [user('go'), withActions], { answers: true, waitMinutes: 5 })
    expect(payload).toMatchObject({ prompt: { type: 'reply', suggestions: ['Commit it'] }, waitSeconds: 300 })
    expect(buildPayload(ask, [], { answers: true })?.prompt).toEqual({ type: 'question', questions: ask.tool_input.questions })
    expect(promptFor({ hook_event_name: 'PermissionRequest', tool_name: 'ExitPlanMode' }, [])).toEqual({ type: 'plan' })
    expect(promptFor({ hook_event_name: 'PermissionRequest', tool_name: 'Bash' }, [])).toEqual({ type: 'permission', tool: 'Bash' })
  })

  it('offers nothing when answering is off, or for events it cannot answer', () => {
    expect(buildPayload(ask, [])).not.toHaveProperty('prompt')
    expect(promptFor({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' }, [])).toBeNull()
  })

  it('hands answers back as the permission decision', () => {
    const decision = (input: typeof ask | Record<string, unknown>, reply: Parameters<typeof answerFor>[1]) =>
      JSON.parse(answerFor(input, reply)?.stdout ?? 'null')?.hookSpecificOutput.decision
    expect(decision({ ...ask, tool_name: 'Bash', tool_input: { command: 'ls' } }, { type: 'allow' })).toEqual({ behavior: 'allow' })
    expect(decision({ ...ask, tool_name: 'Bash' }, { type: 'deny', message: '' })).toEqual({
      behavior: 'deny',
      message: 'The user denied this from their phone.',
    })
    expect(decision(ask, { type: 'answers', answers: { 'Which DB?': 'DuckDB' } })).toEqual({
      behavior: 'allow',
      updatedInput: { ...ask.tool_input, answers: { 'Which DB?': 'DuckDB' } },
    })
    // A plan is only approved with its input handed back.
    expect(decision({ ...ask, tool_name: 'ExitPlanMode', tool_input: { plan: 'P' } }, { type: 'allow' })).toEqual({
      behavior: 'allow',
      updatedInput: { plan: 'P' },
    })
  })

  it('wakes Claude with a reply after a finished turn', () => {
    expect(answerFor({ hook_event_name: 'Stop' }, { type: 'message', message: 'Explain it' })).toEqual({
      exitCode: 2,
      stdout: '',
      stderr: 'The user replied from their phone: Explain it',
    })
    expect(answerFor({ hook_event_name: 'Stop' }, { type: 'allow' })).toBeNull()
  })

  it('notifies after a turn the phone started, but not one another hook continued', () => {
    expect(kindOf({ hook_event_name: 'Stop', stop_hook_active: true }, { wokeByPhone: true })).toBe('finished')
    expect(kindOf({ hook_event_name: 'Stop', stop_hook_active: true })).toBeNull()
  })

  it("sees the session move on from the person's side only", () => {
    expect(movedOn([{ type: 'assistant', message: { content: 'late reply' } }, { type: 'system' }])).toBe(false)
    expect(movedOn([{ type: 'user', isMeta: true }])).toBe(false)
    expect(movedOn([toolResult()])).toBe(true)
    expect(movedOn([user('never mind')])).toBe(true)
  })
})
