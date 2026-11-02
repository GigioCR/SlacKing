'use client'

import { useState } from 'react'
import { api, ApiError, type AgentEventDto, type Prompt, type Question, type Reply } from '../_lib/api'
import { clockTime } from '../_lib/time'
import { CheckIcon, CloseIcon } from './Icons'
import { Spinner } from './Loading'
import { useToast } from './Toast'

type Props = {
  event: AgentEventDto
  /** The event as it is after an answer, or after the server said it was too late. */
  onChange: (event: AgentEventDto) => void
}

/** Answering what Claude is waiting on, from the phone. The hook on the computer hands it over. */
export function AnswerCard({ event, onChange }: Props) {
  if (!event.prompt || event.promptState === 'none') return null

  if (event.promptState === 'answered' && event.reply) {
    return (
      <section className="card answer-done" aria-label="Your answer">
        <div className="row">
          <CheckIcon size={20} />
          <h2>Sent to Claude</h2>
        </div>
        <p className="summary">{describeReply(event.prompt, event.reply)}</p>
        {event.repliedAt && <p className="muted small">At {clockTime(event.repliedAt)}</p>}
      </section>
    )
  }

  if (event.promptState === 'closed') {
    return (
      <section className="card" aria-label="Answer">
        <p className="muted">
          Claude isn&apos;t waiting for an answer here anymore. It was answered at the computer, the session moved on or was
          closed, or the computer is asleep.
        </p>
      </section>
    )
  }

  return <OpenPrompt event={event} prompt={event.prompt} onChange={onChange} />
}

function OpenPrompt({ event, prompt, onChange }: Props & { prompt: Prompt }) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  async function send(reply: Reply, which: string) {
    setBusy(which)
    try {
      const { event: answered } = await api<{ event: AgentEventDto }>(`/api/events/${encodeURIComponent(event.id)}/reply`, {
        method: 'POST',
        body: reply,
      })
      onChange(answered)
      void closeNotification(event.sessionId)
      toast({ message: 'Sent to Claude' })
    } catch (e) {
      toast({ message: (e as Error).message, tone: 'error' })
      // Too late: show why instead of buttons that no longer work.
      if (e instanceof ApiError && e.status === 409) onChange({ ...event, promptState: 'closed' })
    } finally {
      setBusy(null)
    }
  }

  const props = { prompt, busy, send }
  return (
    <section className="card answer" aria-label="Answer">
      {prompt.type === 'permission' && <PermissionAnswer {...props} />}
      {prompt.type === 'plan' && <PlanAnswer {...props} />}
      {prompt.type === 'question' && <QuestionsAnswer {...props} questions={prompt.questions} />}
      {prompt.type === 'reply' && <ReplyAnswer {...props} suggestions={prompt.suggestions} />}
      {event.answerBy && <p className="muted small">Claude waits for an answer here until {clockTime(event.answerBy)}.</p>}
    </section>
  )
}

type AnswerProps = {
  busy: string | null
  send: (reply: Reply, which: string) => Promise<void>
}

function PermissionAnswer({ busy, send }: AnswerProps) {
  const [message, setMessage] = useState('')
  return (
    <>
      <h2>Allow this?</h2>
      <div className="answer-pair">
        <button type="button" className="button" disabled={busy !== null} onClick={() => void send({ type: 'allow' }, 'allow')}>
          {busy === 'allow' ? <Spinner /> : <CheckIcon size={18} />}
          Allow
        </button>
        <button type="button" className="button danger" disabled={busy !== null} onClick={() => void send({ type: 'deny', message: '' }, 'deny')}>
          {busy === 'deny' ? <Spinner /> : <CloseIcon size={18} />}
          Deny
        </button>
      </div>
      <MessageBox
        label="Or tell Claude what to do instead"
        placeholder="Don't run that. First explain why…"
        value={message}
        onChange={setMessage}
        action="Deny and send"
        busy={busy === 'deny-message'}
        disabled={busy !== null}
        onSend={() => void send({ type: 'deny', message }, 'deny-message')}
      />
    </>
  )
}

function PlanAnswer({ busy, send }: AnswerProps) {
  const [message, setMessage] = useState('')
  return (
    <>
      <h2>Approve this plan?</h2>
      <button type="button" className="button block" disabled={busy !== null} onClick={() => void send({ type: 'allow' }, 'allow')}>
        {busy === 'allow' ? <Spinner /> : <CheckIcon size={18} />}
        Approve plan
      </button>
      <MessageBox
        label="Or keep planning, with feedback"
        placeholder="Also cover the migration…"
        value={message}
        onChange={setMessage}
        action="Keep planning"
        busy={busy === 'deny'}
        disabled={busy !== null}
        allowEmpty
        onSend={() => void send({ type: 'deny', message }, 'deny')}
      />
    </>
  )
}

function QuestionsAnswer({ questions, busy, send }: AnswerProps & { questions: readonly Question[] }) {
  // Per question: the chosen option labels, and anything typed instead.
  const [chosen, setChosen] = useState<Record<string, string[]>>({})
  const [typed, setTyped] = useState<Record<string, string>>({})

  function toggle(q: Question, label: string) {
    setChosen((c) => {
      const current = c[q.question] ?? []
      if (!q.multiSelect) return { ...c, [q.question]: [label] }
      return { ...c, [q.question]: current.includes(label) ? current.filter((l) => l !== label) : [...current, label] }
    })
    // One answer to a single choice: picking an option replaces what was typed.
    if (!q.multiSelect) setTyped((t) => ({ ...t, [q.question]: '' }))
  }

  function type(q: Question, text: string) {
    setTyped((t) => ({ ...t, [q.question]: text }))
    if (!q.multiSelect && text) setChosen((c) => ({ ...c, [q.question]: [] }))
  }

  // Multi-select answers join labels with commas, as Claude Code does; typed text joins them too.
  const answers: Record<string, string> = {}
  for (const q of questions) {
    answers[q.question] = [...(chosen[q.question] ?? []), typed[q.question]?.trim() ?? ''].filter(Boolean).join(', ')
  }
  const complete = questions.every((q) => answers[q.question])

  return (
    <>
      {questions.map((q, i) => (
        <fieldset key={q.question} className="question">
          <legend>
            {q.header && <span className="status-chip warn">{q.header}</span>}
            <span className="question-text">{q.question}</span>
            {q.multiSelect && <span className="muted small">Pick any</span>}
          </legend>
          <div className="choices">
            {q.options.map((option) => {
              const selected = (chosen[q.question] ?? []).includes(option.label)
              return (
                <button
                  key={option.label}
                  type="button"
                  className={selected ? 'choice selected' : 'choice'}
                  aria-pressed={selected}
                  disabled={busy !== null}
                  onClick={() => toggle(q, option.label)}
                >
                  <span className="choice-label">{option.label}</span>
                  {option.description && <span className="muted small">{option.description}</span>}
                </button>
              )
            })}
          </div>
          <input
            className="input"
            aria-label={`Your own answer to question ${i + 1}`}
            placeholder={q.multiSelect ? 'Add your own…' : 'Or type your own answer…'}
            value={typed[q.question] ?? ''}
            maxLength={500}
            disabled={busy !== null}
            onChange={(e) => type(q, e.target.value)}
          />
        </fieldset>
      ))}
      <button type="button" className="button block" disabled={!complete || busy !== null} onClick={() => void send({ type: 'answers', answers }, 'answers')}>
        {busy === 'answers' && <Spinner />}
        Send {questions.length === 1 ? 'answer' : 'answers'}
      </button>
    </>
  )
}

function ReplyAnswer({ suggestions, busy, send }: AnswerProps & { suggestions: readonly string[] }) {
  const [message, setMessage] = useState('')
  return (
    <>
      <h2>Reply to Claude</h2>
      {suggestions.length > 0 && (
        <div className="choices">
          {suggestions.map((s) => (
            <button key={s} type="button" className="button secondary" disabled={busy !== null} onClick={() => void send({ type: 'message', message: s }, s)}>
              {busy === s && <Spinner />}
              {s}
            </button>
          ))}
        </div>
      )}
      <MessageBox
        label={suggestions.length ? 'Or write your own' : 'Your message'}
        placeholder="Explain what you changed first…"
        value={message}
        onChange={setMessage}
        action="Send"
        busy={busy === 'message'}
        disabled={busy !== null}
        onSend={() => void send({ type: 'message', message }, 'message')}
      />
    </>
  )
}

function MessageBox(props: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  action: string
  busy: boolean
  disabled: boolean
  /** Send works with nothing typed (keep planning without feedback). */
  allowEmpty?: boolean
  onSend: () => void
}) {
  const empty = !props.value.trim()
  return (
    <div className="stack">
      <label htmlFor="answer-message">{props.label}</label>
      <textarea
        id="answer-message"
        className="input textarea"
        rows={3}
        maxLength={2000}
        placeholder={props.placeholder}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <button type="button" className="button secondary block" disabled={props.disabled || (empty && !props.allowEmpty)} onClick={props.onSend}>
        {props.busy && <Spinner />}
        {props.action}
      </button>
    </div>
  )
}

function describeReply(prompt: Prompt, reply: Reply): string {
  switch (reply.type) {
    case 'allow':
      return prompt.type === 'plan' ? 'Approved the plan.' : 'Allowed.'
    case 'deny': {
      const what = prompt.type === 'plan' ? 'Asked to keep planning' : 'Denied'
      return reply.message ? `${what}: ${reply.message}` : `${what}.`
    }
    case 'answers':
      return Object.entries(reply.answers)
        .map(([question, answer]) => (Object.keys(reply.answers).length > 1 ? `${question} ${answer}` : answer))
        .join('\n')
    case 'message':
      return reply.message
  }
}

/** The notification for this session is answered, so it leaves the tray. */
async function closeNotification(sessionId: string) {
  try {
    const registration = await navigator.serviceWorker?.ready
    for (const n of (await registration?.getNotifications({ tag: `session:${sessionId}` })) ?? []) n.close()
  } catch {
    // It stays in the tray; tapping it opens this screen, which shows the answer.
  }
}
