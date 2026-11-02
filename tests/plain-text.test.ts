import { describe, expect, it } from 'vitest'
import { eventMessage } from '../src/application/notification-message'
import { NO_PROMPT } from '../src/domain/agent-event'
import { markdownPreview, markdownToPlainText } from '../src/domain/plain-text'

describe('markdownToPlainText', () => {
  it('keeps the words and drops the syntax', () => {
    expect(markdownToPlainText('## Done\n\n**Fixed** the `sync` in [the job](https://x.test).')).toBe(
      'Done\n\nFixed the sync in the job.',
    )
  })

  it('turns lists, quotes and checklists into plain lines', () => {
    expect(markdownToPlainText('- one\n* two\n- [x] three\n> quoted')).toBe('• one\n• two\nthree\nquoted')
  })

  it('keeps code but not its fences, and tables as cells', () => {
    expect(markdownToPlainText('```ts\nconst a = 1\n```')).toBe('const a = 1')
    expect(markdownToPlainText('| Step | Result |\n|---|:--:|\n| Build | ok |')).toBe('Step · Result\nBuild · ok')
  })

  it('leaves snake_case, lone asterisks and maths alone', () => {
    expect(markdownToPlainText('Set max_retry_count to 2 * 3 in config_file.')).toBe('Set max_retry_count to 2 * 3 in config_file.')
    expect(markdownToPlainText('an _emphasised_ and *italic* word')).toBe('an emphasised and italic word')
  })

  it('makes a one-line inbox preview that keeps lines apart', () => {
    expect(markdownPreview('Has a plan ready:\n\n## Goal\n\nLet people pick a theme.\n\n- Add a toggle')).toBe(
      'Has a plan ready: Goal · Let people pick a theme. · • Add a toggle',
    )
    expect(markdownPreview('Wants to run:\n\n```\ngit push\n```\n\nPush to main')).toBe('Wants to run: git push · Push to main')
  })

  it('is what the notification shows', () => {
    const message = eventMessage({
      ...NO_PROMPT,
      id: 'e1',
      kind: 'finished',
      sessionId: 's',
      sessionTitle: 'T',
      project: '',
      summary: '**Shipped** it.\n\n---\n\n- tests pass',
      receivedAt: new Date(),
    })
    expect(message.body).toBe('Shipped it.\n\n• tests pass')
  })
})
