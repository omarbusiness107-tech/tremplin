-- =====================================================================
-- Arabic full-text search
--
-- Listings on Moroccan portals appear in French *and* Arabic — 9rayti
-- publishes its post-bac concours announcements in Arabic, and the
-- ministry sites mirror most pages under /ar/. Indexed with the `french`
-- configuration those rows are tokenised but never stemmed, so
-- "المباريات" only ever matches the exact string "المباريات" and not
-- "مباراة", which is how a person would actually search for it.
--
--   to_tsvector('arabic', 'المباريات المشتركة')  ->  'مبار':1 'مشترك':2
--   to_tsvector('french', 'المباريات المشتركة')  ->  'المباريات':1 'المشتركة':2
--
-- A single text search configuration cannot serve both: snowball
-- dictionaries stem every token they are given and never fall through to
-- the next dictionary in the chain, so `french` and `arabic` cannot be
-- combined into one config. Two stored vectors is the honest way to do
-- it, and the app picks the column by the script of the query.
-- =====================================================================

-- One function for both columns, so the field weighting cannot drift
-- between languages. Replaces the French-only version below.
create or replace function public.opportunity_search_vector(
  p_config      regconfig,
  p_title       text,
  p_institution text,
  p_domains     text[],
  p_conditions  text,
  p_description text
) returns tsvector
language sql
immutable
parallel safe
as $$
  select
    setweight(pg_catalog.to_tsvector(p_config, coalesce(p_title, '')), 'A') ||
    setweight(pg_catalog.to_tsvector(p_config, coalesce(p_institution, '')), 'B') ||
    setweight(pg_catalog.to_tsvector(p_config,
              coalesce(pg_catalog.array_to_string(p_domains, ' '), '')), 'B') ||
    setweight(pg_catalog.to_tsvector(p_config, coalesce(p_conditions, '')), 'C') ||
    setweight(pg_catalog.to_tsvector(p_config, coalesce(p_description, '')), 'D');
$$;

comment on function public.opportunity_search_vector(regconfig, text, text, text[], text, text) is
  'Weighted search vector for one text search configuration. Used by both search_vector (french) and search_vector_ar (arabic).';

-- The existing column is bound to the old single-config function, and
-- replacing a function body does NOT recompute stored generated values.
-- The column is therefore rebuilt rather than redefined in place. This
-- rewrites the table; it is a one-time cost on a small catalogue.
drop index if exists opportunities_search_idx;
alter table public.opportunities drop column if exists search_vector;

alter table public.opportunities
  add column search_vector tsvector generated always as (
    public.opportunity_search_vector(
      'french'::regconfig, title, institution, domains, conditions_to_apply, description
    )
  ) stored;

alter table public.opportunities
  add column search_vector_ar tsvector generated always as (
    public.opportunity_search_vector(
      'arabic'::regconfig, title, institution, domains, conditions_to_apply, description
    )
  ) stored;

create index opportunities_search_idx    on public.opportunities using gin (search_vector);
create index opportunities_search_ar_idx on public.opportunities using gin (search_vector_ar);

comment on column public.opportunities.search_vector is
  'French-configured search vector. Queried when the search text is in Latin script.';
comment on column public.opportunities.search_vector_ar is
  'Arabic-configured search vector. Queried when the search text contains Arabic script.';

-- The five-argument, French-only version is now unused.
drop function if exists public.opportunity_search_vector(text, text, text[], text, text);
