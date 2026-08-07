-- =============================================================================
-- ContractIQ — Security Foundation RLS Policies
-- Paste-and-run in the Supabase SQL Editor. Every statement is idempotent.
--
-- This file is the security-audit deliverable (Stage 7 / security-foundation).
-- It re-asserts RLS on every table (idempotent, matches docs/specs/supabase-schema.sql)
-- and FIXES one finding: rate_limit_events previously granted authenticated users
-- select/insert/delete access to their own rows. Since rate limiting is enforced by
-- reading this table, a user could call `supabase.from('rate_limit_events').delete()...`
-- directly from the browser (anon key + their own JWT) to erase their own throttle
-- history and bypass the /process and /chat rate limits entirely. Rate limit
-- reads/writes only ever happen server-side via the service-role client
-- (lib/security/rateLimiter.ts), so this table should have NO user-facing policies —
-- service role bypasses RLS anyway, and default-deny blocks everyone else.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Re-assert RLS is enabled on every user-data table (idempotent — safe if already on)
-- -----------------------------------------------------------------------------
alter table contracts          enable row level security;
alter table key_terms          enable row level security;
alter table custom_key_terms   enable row level security;
alter table chat_sessions      enable row level security;
alter table chat_messages      enable row level security;
alter table user_feedback      enable row level security;
alter table rate_limit_events  enable row level security;
alter table app_config         enable row level security; -- no policies: default-deny, service-role only

-- -----------------------------------------------------------------------------
-- FIX: rate_limit_events — drop all user-facing policies.
-- No `create policy` statements follow for this table on purpose: with RLS enabled
-- and zero policies, every role except service_role (which bypasses RLS) is denied
-- by default. Only lib/security/rateLimiter.ts (via createAdminClient()) may read
-- or write this table.
-- -----------------------------------------------------------------------------
drop policy if exists "select_own" on rate_limit_events;
drop policy if exists "insert_own" on rate_limit_events;
drop policy if exists "delete_own" on rate_limit_events;

-- -----------------------------------------------------------------------------
-- contracts — unchanged from docs/specs/supabase-schema.sql, restated for completeness
-- -----------------------------------------------------------------------------
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

-- app_config: intentionally zero policies (service-role only, default-deny)

-- -----------------------------------------------------------------------------
-- Storage: contracts bucket — unchanged, restated for completeness
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('contracts', 'contracts', false, 10485760) -- 10 MB, private bucket, signed URLs only
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
-- End of security policies
-- =============================================================================
