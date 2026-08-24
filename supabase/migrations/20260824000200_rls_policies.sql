-- =====================================================================
-- Row Level Security
--
-- Reading opportunities is public: the browse page works signed out.
-- Writing them is not — ingestion connects with the service role, which
-- bypasses RLS, so no write policy exists for anon/authenticated.
-- Everything user-owned is readable and writable only by its owner.
-- =====================================================================

alter table public.sources          enable row level security;
alter table public.domains          enable row level security;
alter table public.opportunities    enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_preferences enable row level security;
alter table public.bookmarks        enable row level security;
alter table public.scraper_runs     enable row level security;

-- --- Public catalogue -------------------------------------------------

create policy "Opportunities are publicly readable"
  on public.opportunities for select
  to anon, authenticated
  using (true);

create policy "Sources are publicly readable"
  on public.sources for select
  to anon, authenticated
  using (true);

create policy "Domains are publicly readable"
  on public.domains for select
  to anon, authenticated
  using (true);

-- --- profiles ---------------------------------------------------------

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- --- user_preferences -------------------------------------------------

create policy "Users can read their own preferences"
  on public.user_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own preferences"
  on public.user_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own preferences"
  on public.user_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- --- bookmarks --------------------------------------------------------

create policy "Users can read their own bookmarks"
  on public.bookmarks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own bookmarks"
  on public.bookmarks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own bookmarks"
  on public.bookmarks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own bookmarks"
  on public.bookmarks for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- --- scraper_runs (admin monitoring page) -----------------------------

create policy "Admins can read scraper runs"
  on public.scraper_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.is_admin
    )
  );

-- The monitoring view must not become a way around scraper_runs' policy.
alter view public.source_health set (security_invoker = on);
