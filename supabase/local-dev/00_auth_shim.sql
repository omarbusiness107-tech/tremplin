-- =====================================================================
-- Local development only — NEVER applied to Supabase.
--
-- Supabase hosts provide the `auth` schema, the anon/authenticated/
-- service_role roles and auth.uid(). A plain Postgres container does not,
-- so this shim recreates just enough of them for the migrations in
-- supabase/migrations/ to apply unchanged against a local database.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text unique,
  raw_user_meta_data   jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

-- Supabase reads the user id out of the request JWT claims. Locally we
-- fall back to a session GUC so RLS policies can be exercised by hand:
--   set local request.jwt.claim.sub = '<uuid>';
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;
