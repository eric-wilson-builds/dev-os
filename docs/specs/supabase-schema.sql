-- =============================================================================
-- ContractIQ — Supabase Schema
-- Paste this entire file into the Supabase SQL Editor and run it once on a
-- fresh project. Safe to re-run: every statement is idempotent.
-- Source: docs/engineering/engineering-doc.md, Section 7 (Database Design)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type contract_type as enum ('nda', 'msa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type contract_status as enum ('pending', 'processing', 'completed', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_role as enum ('user', 'assistant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type feedback_rating as enum ('up', 'down');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------------------------------
-- Table: contracts
-- -----------------------------------------------------------------------------
create table if not exists contracts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  contract_type     contract_type not null,
  file_name         text not null,
  file_path         text,                              -- null if Storage upload failed (non-blocking)
  contract_text     text not null,                     -- full text with [PAGE N] markers
  page_count        int not null,
  status            contract_status not null default 'pending',
  last_accessed_at  timestamptz not null default now(), -- drives 90-day retention sweep
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_contracts_user_id on contracts (user_id);
create index if not exists idx_contracts_user_created on contracts (user_id, created_at desc);

drop trigger if exists trg_contracts_updated_at on contracts;
create trigger trg_contracts_updated_at
  before update on contracts
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Table: key_terms
-- -----------------------------------------------------------------------------
create table if not exists key_terms (
  id                 uuid primary key default gen_random_uuid(),
  contract_id        uuid not null references contracts(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  term_name          text not null,
  value              text not null,
  page_number        int not null,
  confidence_score   numeric(5,2) not null check (confidence_score >= 0 and confidence_score <= 100),
  source_sentence    text not null,
  is_custom          boolean not null default false,
  original_ai_value  text,                              -- set on first edit
  edited             boolean not null default false,
  edited_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_key_terms_contract_id on key_terms (contract_id);

drop trigger if exists trg_key_terms_updated_at on key_terms;
create trigger trg_key_terms_updated_at
  before update on key_terms
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Table: custom_key_terms
-- -----------------------------------------------------------------------------
create table if not exists custom_key_terms (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references contracts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  term_name    text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_custom_key_terms_contract_id on custom_key_terms (contract_id);

-- Enforce max 5 custom terms per contract at the database layer as a defense-in-depth
-- backstop (the Route Handler also enforces this before insert).
create or replace function check_custom_key_terms_limit()
returns trigger as $$
begin
  if (select count(*) from custom_key_terms where contract_id = new.contract_id) >= 5 then
    raise exception 'Maximum of 5 custom key terms per contract';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_custom_key_terms_limit on custom_key_terms;
create trigger trg_custom_key_terms_limit
  before insert on custom_key_terms
  for each row execute function check_custom_key_terms_limit();

-- -----------------------------------------------------------------------------
-- Table: chat_sessions
-- -----------------------------------------------------------------------------
create table if not exists chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null unique references contracts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now()
);

create index if not exists idx_chat_sessions_user_id on chat_sessions (user_id);

-- -----------------------------------------------------------------------------
-- Table: chat_messages
-- -----------------------------------------------------------------------------
create table if not exists chat_messages (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references chat_sessions(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  role           message_role not null,
  content        text not null,
  page_citation  int,
  created_at     timestamptz not null default now()
);

create index if not exists idx_chat_messages_session_created on chat_messages (session_id, created_at asc);

-- -----------------------------------------------------------------------------
-- Table: user_feedback
-- -----------------------------------------------------------------------------
create table if not exists user_feedback (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references contracts(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  rating       feedback_rating not null,
  comment      text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_user_feedback_contract_id on user_feedback (contract_id);

-- -----------------------------------------------------------------------------
-- Table: rate_limit_events
-- Backs the token-bucket rate limiter for /process and /chat (see infrastructure-spec.md).
-- No extra service (e.g. Redis) required — kept in Postgres to minimise ops surface.
-- -----------------------------------------------------------------------------
create table if not exists rate_limit_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  route_key    text not null,        -- e.g. 'process', 'chat'
  created_at   timestamptz not null default now()
);

create index if not exists idx_rate_limit_user_route_time on rate_limit_events (user_id, route_key, created_at);

-- -----------------------------------------------------------------------------
-- Table: app_config
-- App-wide key/value flags not scoped to any user (e.g. calibration_status, set
-- manually by an operator after reviewing an scripts/eval/ report). RLS is
-- enabled with zero policies (default-deny) — only the service role can read
-- or write it; see results-display-spec.md's calibration banner.
-- -----------------------------------------------------------------------------
create table if not exists app_config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_app_config_updated_at on app_config;
create trigger trg_app_config_updated_at
  before update on app_config
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- View: term_corrections
-- Powers the weekly correction-rate check (PRD §8): trigger a prompt review if
-- correction rate exceeds 12% of terms in any 7-day window.
-- -----------------------------------------------------------------------------
create or replace view term_corrections as
select
  id,
  contract_id,
  user_id,
  term_name,
  original_ai_value,
  value as corrected_value,
  edited_at
from key_terms
where edited = true;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table contracts          enable row level security;
alter table key_terms          enable row level security;
alter table custom_key_terms   enable row level security;
alter table chat_sessions      enable row level security;
alter table chat_messages      enable row level security;
alter table user_feedback      enable row level security;
alter table rate_limit_events  enable row level security;
alter table app_config         enable row level security; -- no policies: default-deny, service-role only

-- contracts
drop policy if exists "select_own" on contracts;
create policy "select_own" on contracts for select using (auth.uid() = user_id);
drop policy if exists "insert_own" on contracts;
create policy "insert_own" on contracts for insert with check (auth.uid() = user_id);
drop policy if exists "update_own" on contracts;
create policy "update_own" on contracts for update using (auth.uid() = user_id);
drop policy if exists "delete_own" on contracts;
create policy "delete_own" on contracts for delete using (auth.uid() = user_id);

-- key_terms
drop policy if exists "select_own" on key_terms;
create policy "select_own" on key_terms for select using (auth.uid() = user_id);
drop policy if exists "insert_own" on key_terms;
create policy "insert_own" on key_terms for insert with check (auth.uid() = user_id);
drop policy if exists "update_own" on key_terms;
create policy "update_own" on key_terms for update using (auth.uid() = user_id);
drop policy if exists "delete_own" on key_terms;
create policy "delete_own" on key_terms for delete using (auth.uid() = user_id);

-- custom_key_terms
drop policy if exists "select_own" on custom_key_terms;
create policy "select_own" on custom_key_terms for select using (auth.uid() = user_id);
drop policy if exists "insert_own" on custom_key_terms;
create policy "insert_own" on custom_key_terms for insert with check (auth.uid() = user_id);
drop policy if exists "update_own" on custom_key_terms;
create policy "update_own" on custom_key_terms for update using (auth.uid() = user_id);
drop policy if exists "delete_own" on custom_key_terms;
create policy "delete_own" on custom_key_terms for delete using (auth.uid() = user_id);

-- chat_sessions
drop policy if exists "select_own" on chat_sessions;
create policy "select_own" on chat_sessions for select using (auth.uid() = user_id);
drop policy if exists "insert_own" on chat_sessions;
create policy "insert_own" on chat_sessions for insert with check (auth.uid() = user_id);
drop policy if exists "update_own" on chat_sessions;
create policy "update_own" on chat_sessions for update using (auth.uid() = user_id);
drop policy if exists "delete_own" on chat_sessions;
create policy "delete_own" on chat_sessions for delete using (auth.uid() = user_id);

-- chat_messages
drop policy if exists "select_own" on chat_messages;
create policy "select_own" on chat_messages for select using (auth.uid() = user_id);
drop policy if exists "insert_own" on chat_messages;
create policy "insert_own" on chat_messages for insert with check (auth.uid() = user_id);
drop policy if exists "update_own" on chat_messages;
create policy "update_own" on chat_messages for update using (auth.uid() = user_id);
drop policy if exists "delete_own" on chat_messages;
create policy "delete_own" on chat_messages for delete using (auth.uid() = user_id);

-- user_feedback
drop policy if exists "select_own" on user_feedback;
create policy "select_own" on user_feedback for select using (auth.uid() = user_id);
drop policy if exists "insert_own" on user_feedback;
create policy "insert_own" on user_feedback for insert with check (auth.uid() = user_id);
drop policy if exists "update_own" on user_feedback;
create policy "update_own" on user_feedback for update using (auth.uid() = user_id);
drop policy if exists "delete_own" on user_feedback;
create policy "delete_own" on user_feedback for delete using (auth.uid() = user_id);

-- rate_limit_events: intentionally zero policies. Rate limiting only works if users can't
-- read/reset their own throttle history, so this table is service-role only (see
-- supabase/rls-policies.sql for the audit trail behind this).
drop policy if exists "select_own" on rate_limit_events;
drop policy if exists "insert_own" on rate_limit_events;
drop policy if exists "delete_own" on rate_limit_events;

-- -----------------------------------------------------------------------------
-- Storage: contracts bucket + RLS
-- File path convention: contracts/{user_id}/{contract_id}/{filename}.pdf
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('contracts', 'contracts', false, 10485760) -- 10 MB, matches the PRD upload limit
on conflict (id) do nothing;

drop policy if exists "insert_own_contract_files" on storage.objects;
create policy "insert_own_contract_files" on storage.objects for insert
  with check (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "select_own_contract_files" on storage.objects;
create policy "select_own_contract_files" on storage.objects for select
  using (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "delete_own_contract_files" on storage.objects;
create policy "delete_own_contract_files" on storage.objects for delete
  using (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

-- =============================================================================
-- End of schema
-- =============================================================================
