-- The hook's last check for an answer (src/domain/prompt.ts, HOOK_SILENCE_MS). When it goes quiet
-- the session is gone (closed, killed, or the computer is asleep), so the phone stops offering.

alter table agent_events add column hook_seen_at timestamptz;
