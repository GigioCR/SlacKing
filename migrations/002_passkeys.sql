-- Passkeys (src/domain/passkey.ts) and the one-use challenges of their prompts.

create table passkeys (
  id            text primary key,                   -- the credential id the browser reports (base64url)
  public_key    text not null,                      -- COSE public key (base64url); the private key stays on the phone
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  label         text not null,                      -- "Pixel 8", named by the person
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create table webauthn_challenges (
  challenge   text primary key,
  purpose     text not null check (purpose in ('register', 'sign-in')),
  expires_at  timestamptz not null
);

-- Same as 001: nothing here is reachable through Supabase's Data API.
alter table passkeys enable row level security;
alter table webauthn_challenges enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on passkeys, webauthn_challenges from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on passkeys, webauthn_challenges from authenticated;
  end if;
end
$$;
