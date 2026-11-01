-- What the app keeps. Columns mirror src/domain/agent-event.ts, src/domain/device-subscription.ts
-- and src/domain/authenticator.ts one to one.

create table agent_events (
  id             uuid primary key,
  kind           text not null check (kind in ('finished', 'needs-input')),
  session_id     text not null,
  session_title  text not null,
  project        text not null default '',
  summary        text not null,
  received_at    timestamptz not null default now()
);

-- The inbox (newest first) and the 7-day clean-up both read by time.
create index agent_events_received on agent_events (received_at desc);

create table device_subscriptions (
  id          uuid primary key,
  label       text not null,                        -- "Pixel 8"
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()    -- refreshed each time the phone opens the app
);

-- The one linked authenticator app. The check keeps it to a single row.
create table authenticator (
  id                     smallint primary key default 1 check (id = 1),
  sealed_secret          text,                      -- AES-GCM sealed TOTP secret (ENCRYPTION_KEY)
  pending_sealed_secret  text,                      -- shown as a QR code, not confirmed yet
  generation             integer not null default 0,
  last_used_step         integer not null default 0,
  failed_attempts        integer not null default 0,
  locked_until           timestamptz,
  linked_at              timestamptz,
  updated_at             timestamptz not null default now()
);

-- Supabase publishes every table in the public schema through its Data API, readable with the
-- project's public (anon) key. This app talks to Postgres directly and needs none of that, so
-- row level security is turned on with no policies (nothing gets through the API), and the API's
-- roles lose their grants. The app's own connection (the postgres role) is not affected.
alter table agent_events enable row level security;
alter table device_subscriptions enable row level security;
alter table authenticator enable row level security;
alter table schema_migrations enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on agent_events, device_subscriptions, authenticator, schema_migrations from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on agent_events, device_subscriptions, authenticator, schema_migrations from authenticated;
  end if;
end
$$;
