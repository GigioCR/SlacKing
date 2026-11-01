-- Answering from the phone (src/domain/prompt.ts): what Claude is waiting on, until when, and the
-- answer. All empty for notifications that can't be answered, including every one sent before this.

alter table agent_events
  add column prompt      jsonb,                     -- { type: 'permission' | 'plan' | 'question' | 'reply', ... }
  add column answer_by   timestamptz,               -- the hook stops waiting then
  add column reply       jsonb,                     -- { type: 'allow' | 'deny' | 'answers' | 'message', ... }
  add column replied_at  timestamptz,
  add column closed_at   timestamptz;               -- stopped waiting without an answer from the phone

-- A new notification from a session closes that session's open prompts.
create index agent_events_open_prompts on agent_events (session_id) where prompt is not null and reply is null and closed_at is null;
