-- How full the session's context was when the hook sent the notification (hook/notify.mjs,
-- contextUsage). Null for notifications from hooks that don't send it.

alter table agent_events add column context_tokens integer, add column context_window integer;
