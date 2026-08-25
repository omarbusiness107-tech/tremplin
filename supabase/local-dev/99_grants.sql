-- =====================================================================
-- Local development only — NEVER applied to Supabase.
--
-- Supabase grants anon/authenticated table privileges through platform
-- default privileges, so the migrations deliberately grant nothing: RLS
-- alone decides who sees what there. A plain Postgres has no such
-- defaults, so PostgREST would get "permission denied" before a policy
-- was ever consulted. This grants the same baseline, after the migrations
-- have created the objects.
-- =====================================================================

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.bookmarks to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update on public.user_preferences to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- PostgREST switches into these roles, so they must be able to log in.
alter role anon login;
alter role authenticated login;
