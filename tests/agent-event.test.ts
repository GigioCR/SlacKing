import { describe, expect, it } from 'vitest'
import { clip, parseAgentEventInput, retentionCutoff } from '../src/domain/agent-event'
import { eventMessage } from '../src/application/notification-message'

describe('parseAgentEventInput', () => {
  it('accepts what the hook sends', () => {
    expect(
      parseAgentEventInput({
        kind: 'finished',
        sessionId: 'abc',
        sessionTitle: 'Fix invoice sync',
        project: 'hecho-syncware',
        summary: 'Fixed the sync.',
      }),
    ).toEqual({
      kind: 'finished',
      sessionId: 'abc',
      sessionTitle: 'Fix invoice sync',
      project: 'hecho-syncware',
      summary: 'Fixed the sync.',
    })
  })

  it('falls back to the project, then a placeholder, for a missing title', () => {
    expect(parseAgentEventInput({ kind: 'finished', sessionId: 'a', project: 'api' }).sessionTitle).toBe('api')
    expect(parseAgentEventInput({ kind: 'finished', sessionId: 'a' }).sessionTitle).toBe('Untitled session')
  })

  it('fills in a summary when none is sent', () => {
    expect(parseAgentEventInput({ kind: 'needs-input', sessionId: 'a' }).summary).toBe('Claude needs your decision.')
  })

  it('refuses an unknown kind or a missing session id', () => {
    expect(() => parseAgentEventInput({ kind: 'other', sessionId: 'a' })).toThrow(/kind must be/)
    expect(() => parseAgentEventInput({ kind: 'finished' })).toThrow(/sessionId/)
    expect(() => parseAgentEventInput('nope')).toThrow(/JSON object/)
  })

  it('cuts a long summary instead of refusing it', () => {
    const summary = parseAgentEventInput({ kind: 'finished', sessionId: 'a', summary: 'x'.repeat(5_000) }).summary
    expect(summary).toHaveLength(2_000)
    expect(summary.endsWith('…')).toBe(true)
  })
})

describe('clip', () => {
  it('collapses spaces and blank lines but keeps paragraphs', () => {
    expect(clip('  a   b\n\n\n\nc  ', 100)).toBe('a b\n\nc')
  })
})

describe('retentionCutoff', () => {
  it('is seven days back', () => {
    expect(retentionCutoff(new Date('2026-10-27T12:00:00Z')).toISOString()).toBe('2026-10-20T12:00:00.000Z')
  })
})

describe('eventMessage', () => {
  const base = {
    id: 'e1',
    sessionId: 's1',
    sessionTitle: 'Fix invoice sync',
    project: 'hecho-syncware',
    summary: 'Fixed it.',
    receivedAt: new Date(),
  }

  it('names the session and project and links to the summary', () => {
    expect(eventMessage({ ...base, kind: 'finished' })).toEqual({
      kind: 'finished',
      title: 'Done: Fix invoice sync · hecho-syncware',
      body: 'Fixed it.',
      tag: 'session:s1',
      url: '/events/e1',
    })
    expect(eventMessage({ ...base, kind: 'needs-input' }).title).toBe('Needs you: Fix invoice sync · hecho-syncware')
  })

  it('does not repeat the project when it is the title', () => {
    expect(eventMessage({ ...base, kind: 'finished', sessionTitle: 'api', project: 'api' }).title).toBe('Done: api')
  })
})
