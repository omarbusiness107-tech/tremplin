-- =====================================================================
-- Morocco Opportunities Tracker — core schema
--
-- Everything the tracker stores lives in `public`:
--   sources            registry of scrapable sites (one row per scraper module)
--   domains            canonical vocabulary of fields/domains used as tags
--   opportunities      the listings themselves (jobs, programs, scholarships…)
--   profiles           app-level user data, 1:1 with auth.users
--   user_preferences   what a user wants to be matched against
--   bookmarks          saved opportunities
--   scraper_runs       one row per (source, ingestion run) for monitoring
-- =====================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy matching on titles

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type public.opportunity_type as enum (
  'job',
  'internship',
  'bachelor',
  'master',
  'doctorat',
  'scholarship',
  'concours'
);

-- `unknown` covers listings published without a deadline, which is common
-- for rolling job postings and open scholarship calls.
create type public.opportunity_status as enum (
  'open',
  'closing_soon',
  'closed',
  'unknown'
);

create type public.education_level as enum (
  'bac',
  'bac_plus_2',
  'licence',
  'master',
  'doctorat',
  'other'
);

create type public.scraper_run_status as enum (
  'running',
  'success',
  'partial',
  'failed'
);

-- ---------------------------------------------------------------------
-- sources — one row per scraper module
-- ---------------------------------------------------------------------

create table public.sources (
  key                      text primary key,
  name                     text        not null,
  homepage_url             text        not null,
  category                 text,
  -- Politeness settings the scraper framework reads at runtime, so crawl
  -- rate can be tuned per site without a code change.
  request_delay_seconds    numeric(4,1) not null default 2.0
                             check (request_delay_seconds >= 0),
  respects_robots_txt      boolean     not null default true,
  enabled                  boolean     not null default true,
  notes                    text,
  created_at               timestamptz not null default now()
);

comment on table public.sources is
  'Registry of sites we ingest from. `key` matches the scraper module name in scrapers/morocco_scraper/sources/.';

-- ---------------------------------------------------------------------
-- domains — canonical tag vocabulary (AI & Data Science, Law, …)
-- ---------------------------------------------------------------------

create table public.domains (
  slug        text primary key,
  label_fr    text not null,
  label_en    text not null,
  sort_order  integer not null default 100
);

comment on table public.domains is
  'Canonical field/domain tags. opportunities.domains holds slugs from this table.';

-- ---------------------------------------------------------------------
-- Full-text search vector
--
-- Built by a helper because a generated column may only call immutable
-- functions, and array_to_string() is merely stable. Listings are mostly
-- in French, so the `french` configuration (stemming + stop words) is a
-- better default than `simple`.
--
-- Weights: title (A) > institution and domain tags (B)
--        > eligibility conditions (C) > description (D).
-- ---------------------------------------------------------------------

create or replace function public.opportunity_search_vector(
  p_title        text,
  p_institution  text,
  p_domains      text[],
  p_conditions   text,
  p_description  text
) returns tsvector
language sql
immutable
parallel safe
as $$
  select
    setweight(pg_catalog.to_tsvector('french'::regconfig, coalesce(p_title, '')), 'A') ||
    setweight(pg_catalog.to_tsvector('french'::regconfig, coalesce(p_institution, '')), 'B') ||
    setweight(pg_catalog.to_tsvector('french'::regconfig,
              coalesce(pg_catalog.array_to_string(p_domains, ' '), '')), 'B') ||
    setweight(pg_catalog.to_tsvector('french'::regconfig, coalesce(p_conditions, '')), 'C') ||
    setweight(pg_catalog.to_tsvector('french'::regconfig, coalesce(p_description, '')), 'D');
$$;

-- ---------------------------------------------------------------------
-- opportunities
-- ---------------------------------------------------------------------

create table public.opportunities (
  id                     uuid primary key default gen_random_uuid(),

  -- Provenance ------------------------------------------------------
  source_key             text not null references public.sources (key) on delete restrict,
  -- The listing's own stable id on the source site. Primary dedup key:
  -- re-scraping the same listing updates the row instead of inserting.
  external_id            text not null,
  -- Cross-source dedup key: hash of normalized
  -- (title, institution, deadline). Catches the same opportunity
  -- published on a second site. Not unique -- see the comment below.
  fingerprint            text not null,

  -- Core descriptive fields ----------------------------------------
  title                  text not null,
  type                   public.opportunity_type not null,
  institution            text,
  institution_logo_url   text,
  domains                text[] not null default '{}',
  location_city          text,
  location_region        text,
  is_remote              boolean not null default false,

  -- Eligibility: free text as published, plus structured fields when
  -- the source exposes them cleanly enough to parse.
  conditions_to_apply       text,
  required_education_level  public.education_level,
  min_experience_years      integer check (min_experience_years >= 0),
  max_age                   integer check (max_age between 16 and 99),
  languages_required        text[] not null default '{}',
  positions_available       integer check (positions_available >= 0),

  -- Dates -----------------------------------------------------------
  deadline               timestamptz,
  event_date             date,          -- exam date / programme start date
  published_at           date,          -- publication date on the source site

  -- Content ---------------------------------------------------------
  application_link       text not null,
  description            text,
  -- Source-specific extras that do not deserve a column
  -- (grade, concours code, spécialité, …). Rendered as a detail table.
  attributes             jsonb not null default '{}'::jsonb,

  -- Lifecycle -------------------------------------------------------
  status                 public.opportunity_status not null default 'unknown',
  -- Set false when a source explicitly withdraws a listing; the status
  -- trigger then forces `closed` regardless of deadline.
  is_active              boolean not null default true,

  discovered_at          timestamptz not null default now(),
  last_seen_at           timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Hash of the meaningful content fields. Ingestion compares it to
  -- decide "unchanged" vs "updated", so `updated_at` only moves when
  -- something a user would notice actually changed.
  content_hash           text not null,

  search_vector tsvector generated always as (
    public.opportunity_search_vector(title, institution, domains, conditions_to_apply, description)
  ) stored,

  constraint opportunities_source_external_id_key unique (source_key, external_id)
);

comment on column public.opportunities.fingerprint is
  'md5 of normalized title|institution|deadline. A cross-source bridge only, and deliberately NOT unique: one site legitimately publishes distinct listings that share all three (same grade, same administration, same closing date, different speciality). Within a source, external_id is the authority.';
comment on column public.opportunities.content_hash is
  'md5 of the user-visible content fields — drives updated / unchanged classification.';

create index opportunities_fingerprint_idx   on public.opportunities (fingerprint);
create index opportunities_deadline_idx      on public.opportunities (deadline nulls last);
create index opportunities_type_idx          on public.opportunities (type);
create index opportunities_status_idx        on public.opportunities (status);
create index opportunities_discovered_at_idx on public.opportunities (discovered_at desc);
create index opportunities_source_idx        on public.opportunities (source_key);
create index opportunities_city_idx          on public.opportunities (location_city);
create index opportunities_domains_idx       on public.opportunities using gin (domains);
create index opportunities_search_idx        on public.opportunities using gin (search_vector);
create index opportunities_title_trgm_idx    on public.opportunities using gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Status derivation
--
-- `status` cannot be a generated column because it depends on now(),
-- which is not immutable. Instead a trigger derives it on every write and
-- refresh_opportunity_statuses() re-derives it for the whole table
-- (called at the end of each ingestion run, and by the daily cron).
-- ---------------------------------------------------------------------

create or replace function public.compute_opportunity_status(
  p_deadline  timestamptz,
  p_is_active boolean
) returns public.opportunity_status
language sql
stable
set search_path = public
as $$
  select case
    when not p_is_active                              then 'closed'::public.opportunity_status
    when p_deadline is null                           then 'unknown'::public.opportunity_status
    when p_deadline < now()                           then 'closed'::public.opportunity_status
    when p_deadline < now() + interval '7 days'       then 'closing_soon'::public.opportunity_status
    else                                                   'open'::public.opportunity_status
  end;
$$;

create or replace function public.tg_opportunities_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := public.compute_opportunity_status(new.deadline, new.is_active);

  if tg_op = 'INSERT' then
    new.updated_at := now();
  else
    -- Touching last_seen_at on an unchanged listing must not look like an update.
    if new.content_hash is distinct from old.content_hash then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  end if;

  return new;
end;
$$;

create trigger opportunities_before_write
  before insert or update on public.opportunities
  for each row execute function public.tg_opportunities_before_write();

create or replace function public.refresh_opportunity_statuses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  with updated as (
    update public.opportunities o
       set status = public.compute_opportunity_status(o.deadline, o.is_active)
     where o.status is distinct from public.compute_opportunity_status(o.deadline, o.is_active)
    returning 1
  )
  select count(*) into changed from updated;

  return changed;
end;
$$;

comment on function public.refresh_opportunity_statuses() is
  'Re-derives status for every row. Run after each ingestion and on a daily cron so deadlines lapse on time.';

-- ---------------------------------------------------------------------
-- Users: profiles + preferences + bookmarks
-- ---------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  full_name    text,
  avatar_url   text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.user_preferences (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  education_level         public.education_level,
  fields_of_interest      text[] not null default '{}',   -- domains.slug values
  target_types            public.opportunity_type[] not null default '{}',
  preferred_cities        text[] not null default '{}',
  languages               text[] not null default '{}',
  open_to_remote          boolean not null default true,
  email_alerts_enabled    boolean not null default true,
  deadline_reminder_days  integer not null default 3
                            check (deadline_reminder_days between 0 and 30),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.bookmarks (
  user_id         uuid not null references auth.users (id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities (id) on delete cascade,
  notes           text,
  reminder_sent_at timestamptz,
  created_at      timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create index bookmarks_opportunity_idx on public.bookmarks (opportunity_id);

create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.tg_touch_updated_at();

create trigger user_preferences_touch_updated_at
  before update on public.user_preferences
  for each row execute function public.tg_touch_updated_at();

-- A profile + empty preference row for every new auth user, so the app
-- never has to handle a missing-profile case.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- scraper_runs — one row per (source, ingestion run)
-- ---------------------------------------------------------------------

create table public.scraper_runs (
  id               uuid primary key default gen_random_uuid(),
  -- Shared by every source in a single `ingest` invocation.
  run_group        uuid not null,
  source_key       text not null references public.sources (key) on delete cascade,
  status           public.scraper_run_status not null default 'running',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  duration_ms      integer,
  pages_fetched    integer not null default 0,
  items_found      integer not null default 0,
  items_created    integer not null default 0,
  items_updated    integer not null default 0,
  items_unchanged  integer not null default 0,
  items_failed     integer not null default 0,
  error_type       text,
  error_message    text,
  -- Per-item warnings (unparseable date, missing field, …) so a source
  -- degrading slowly is visible before it breaks outright.
  warnings         jsonb not null default '[]'::jsonb
);

create index scraper_runs_source_started_idx on public.scraper_runs (source_key, started_at desc);
create index scraper_runs_group_idx          on public.scraper_runs (run_group);

-- Backing view for the admin/monitoring page: latest run per source.
create or replace view public.source_health as
select
  s.key                as source_key,
  s.name,
  s.enabled,
  s.homepage_url,
  r.id                 as last_run_id,
  r.status             as last_run_status,
  r.started_at         as last_run_at,
  r.duration_ms        as last_run_duration_ms,
  r.items_found        as last_items_found,
  r.items_created      as last_items_created,
  r.items_updated      as last_items_updated,
  r.items_failed       as last_items_failed,
  r.error_message      as last_error_message,
  (select count(*) from public.opportunities o where o.source_key = s.key) as total_opportunities
from public.sources s
left join lateral (
  select * from public.scraper_runs sr
   where sr.source_key = s.key
   order by sr.started_at desc
   limit 1
) r on true;
