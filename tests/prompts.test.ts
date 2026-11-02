import { describe, expect, it } from 'vitest'
import { eventMessage } from '../src/application/notification-message'
import { answerPrompt, closePrompt, readPromptAnswer } from '../src/application/use-cases/answer-prompt'
import { receiveAgentEvent } from '../src/application/use-cases/receive-agent-event'
import { NO_PROMPT, type AgentEvent } from '../src/domain/agent-event'
import { parsePrompt, parsePromptInput, parseReply, promptState, type Prompt } from '../src/domain/prompt'
import { InMemoryEventRepository, InMemorySubscriptionRepository } from '../src/infrastructure/persistence/in-memory/repositories'

const question: Prompt = {
  type: 'question',
  questions: [
    { question: 'Which DB?', header: 'DB', multiSelect: false, options: [{ label: 'Postgres', description: '' }, { label: 'SQLite', description: '' }] },
  ],
}

describe('parsePromptInput', () => {
  const at = new Date('2026-11-01T12:00:00Z')

  it('keeps a prompt only with a wait, and clamps the wait', () => {
    expect(parsePromptInput({ prompt: { type: 'plan' } }, at)).toEqual({ prompt: null, answerBy: null })
    expect(parsePromptInput({ prompt: { type: 'plan' }, waitSeconds: 1800 }, at)).toEqual({
      prompt: { type: 'plan' },
      answerBy: new Date('2026-11-01T12:30:00Z'),
    })
    expect(parsePromptInput({ prompt: { type: 'plan' }, waitSeconds: 99_999 }, at).answerBy).toEqual(new Date('2026-11-01T13:00:00Z'))
  })

  it('cleans what the hook sent', () => {
    expect(parsePrompt({ type: 'permission' })).toEqual({ type: 'permission', tool: 'a tool' })
    expect(parsePrompt({ type: 'reply', suggestions: ['  Commit it ', '', 7, 'Not yet', 'Three', 'Four'] })).toEqual({
      type: 'reply',
      suggestions: ['Commit it', 'Not yet', 'Three'],
    })
    expect(parsePrompt({ type: 'question', questions: [{ question: 'Same?' }, { question: 'Same?' }] })).toBeNull()
    expect(parsePrompt({ type: 'question', questions: [] })).toBeNull()
    expect(parsePrompt({ type: 'shell' })).toBeNull()
  })
})

describe('parseReply', () => {
  it('takes allow and deny, with an optional message, for permissions and plans', () => {
    expect(parseReply({ type: 'permission', tool: 'Bash' }, { type: 'allow' })).toEqual({ type: 'allow' })
    expect(parseReply({ type: 'plan' }, { type: 'deny' })).toEqual({ type: 'deny', message: '' })
    expect(() => parseReply({ type: 'plan' }, { type: 'message', message: 'hi' })).toThrow(/allow or deny/)
  })

  it('needs an answer to every question, typed or picked', () => {
    expect(parseReply(question, { type: 'answers', answers: { 'Which DB?': 'DuckDB, typed' } })).toEqual({
      type: 'answers',
      answers: { 'Which DB?': 'DuckDB, typed' },
    })
    expect(() => parseReply(question, { type: 'answers', answers: {} })).toThrow(/Which DB/)
  })

  it('needs text for a reply', () => {
    expect(() => parseReply({ type: 'reply', suggestions: [] }, { type: 'message', message: '  ' })).toThrow(/message/i)
  })
})

describe('eventMessage buttons', () => {
  const event = (prompt: Prompt | null): AgentEvent => ({
    ...NO_PROMPT,
    id: 'e1',
    kind: 'needs-input',
    sessionId: 's1',
    sessionTitle: 'Deploy',
    project: '',
    summary: 'x',
    receivedAt: new Date(),
    prompt,
    answerBy: prompt ? new Date(Date.now() + 60_000) : null,
  })

  it('denies from the notification, but opens the screen to allow', () => {
    const message = eventMessage(event({ type: 'permission', tool: 'Bash' }))
    expect(message.actions).toEqual([
      { id: 'review', title: 'Allow…' },
      { id: 'deny', title: 'Deny', reply: { type: 'deny', message: '' } },
    ])
    expect(message.replyUrl).toBe('/api/events/e1/reply')
  })

  it('answers a two-option question from the notification, not a bigger one', () => {
    expect(eventMessage(event(question)).actions.map((a) => a.reply)).toEqual([
      { type: 'answers', answers: { 'Which DB?': 'Postgres' } },
      { type: 'answers', answers: { 'Which DB?': 'SQLite' } },
    ])
    const three: Prompt = { type: 'question', questions: [{ ...question.questions[0], options: [...question.questions[0].options, { label: 'DuckDB', description: '' }] }] }
    expect(eventMessage(event(three)).actions).toEqual([])
  })

  it('offers two quick replies, and nothing without a prompt', () => {
    expect(eventMessage(event({ type: 'reply', suggestions: ['A', 'B', 'C'] })).actions.map((a) => a.title)).toEqual(['A', 'B'])
    expect(eventMessage(event(null))).toMatchObject({ actions: [], replyUrl: null })
  })
})

describe('answering from the phone', () => {
  async function setup() {
    const events = new InMemoryEventRepository()
    let now = new Date('2026-11-01T12:00:00Z')
    const clock = { now: () => now }
    let n = 0
    const receive = receiveAgentEvent({
      events,
      subscriptions: new InMemorySubscriptionRepository(),
      notifier: { send: async () => 'delivered' as const },
      ids: { next: () => `e${++n}` },
      clock,
    })
    const deps = { events, clock }
    return {
      receive,
      answer: answerPrompt(deps),
      read: readPromptAnswer(deps),
      close: closePrompt(deps),
      later: (ms: number) => (now = new Date(now.getTime() + ms)),
    }
  }
  const asked = (sessionId = 's1') => ({ kind: 'needs-input', sessionId, summary: 'Wants to run: ls', prompt: { type: 'permission', tool: 'Bash' }, waitSeconds: 60 })

  it('takes the first answer and hands it to the hook', async () => {
    const s = await setup()
    const { id } = await s.receive(asked())
    expect(await s.read(id)).toEqual({ state: 'open', reply: null })
    expect((await s.answer(id, { type: 'deny', message: 'No' })).promptState).toBe('answered')
    await expect(s.answer(id, { type: 'allow' })).rejects.toThrow(/already answered/)
    expect(await s.read(id)).toEqual({ state: 'answered', reply: { type: 'deny', message: 'No' } })
  })

  it('refuses answers after the deadline or after the hook stopped waiting', async () => {
    const s = await setup()
    const late = await s.receive(asked())
    s.later(61_000)
    await expect(s.answer(late.id, { type: 'allow' })).rejects.toThrow(/isn't waiting/)

    const closed = await s.receive(asked('s2'))
    await s.close(closed.id)
    expect((await s.read(closed.id)).state).toBe('closed')
    await expect(s.answer(closed.id, { type: 'allow' })).rejects.toThrow(/isn't waiting/)
  })

  it("closes a session's open prompts when it sends something new", async () => {
    const s = await setup()
    const first = await s.receive(asked())
    const other = await s.receive(asked('s2'))
    await s.receive({ kind: 'finished', sessionId: 's1', summary: 'Done.' })
    expect((await s.read(first.id)).state).toBe('closed')
    expect((await s.read(other.id)).state).toBe('open')
  })

  it('reads a cleared notification as closed, so the hook stops waiting', async () => {
    const s = await setup()
    expect(await s.read('gone')).toEqual({ state: 'closed', reply: null })
  })

  it('closes while the hook is quiet (session closed, killed, computer asleep), and reopens when it is back', async () => {
    const s = await setup()
    const { id } = await s.receive(asked())
    s.later(31_000)
    await expect(s.answer(id, { type: 'allow' })).rejects.toThrow(/isn't waiting/)
    // The hook polls again: it is still there.
    expect((await s.read(id)).state).toBe('open')
    s.later(20_000)
    expect((await s.answer(id, { type: 'allow' })).promptState).toBe('answered')
  })

  it('is not answerable without a prompt', () => {
    expect(promptState({ ...NO_PROMPT, receivedAt: new Date() }, new Date())).toBe('none')
  })
})
