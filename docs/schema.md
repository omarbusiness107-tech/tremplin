# Database schema

Defined in `supabase/migrations/`, applied in filename order:

| Migration | Contents |
| --- | --- |
| `20260824000100_init_schema.sql` | enums, tables, indexes, triggers, functions, `source_health` view |
| `20260824000200_rls_policies.sql` | row level security |
| `20260824000300_seed_reference_data.sql` | domain vocabulary + source registry (idempotent) |
| `20260824000400_browse_views.sql` | `available_cities` facet view for the filter UI |
| `20260824000500_notifications.sql` | `notifications` table + RLS |
| `20260824000600_recommendations.sql` | `education_rank()` and `recommended_opportunities()` |

```
sources ──< opportunities >── domains (by slug, soft reference)
   │             │
   │             └──< bookmarks >── auth.users ──< profiles
   │                                          └──< user_preferences
   └──< scraper_runs
```

## Enums

| Type | Values |
| --- | --- |
| `opportunity_type` | `job`, `internship`, `bachelor`, `master`, `doctorat`, `scholarship`, `concours` |
| `opportunity_status` | `open`, `closing_soon`, `closed`, `unknown` |
| `education_level` | `bac`, `bac_plus_2`, `licence`, `master`, `doctorat`, `other` |
| `scraper_run_status` | `running`, `success`, `partial`, `failed` |

`unknown` matters: plenty of listings publish no deadline, and treating those as
`closed` would hide real opportunities.

## `opportunities`

The listings themselves.

### Provenance and deduplication

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `source_key` | `text` → `sources.key` | which scraper found it |
| `external_id` | `text` | the listing's own id on the source site |
| `fingerprint` | `text`, indexed | md5 of normalized *title \| institution \| deadline date* |
| `content_hash` | `text` | md5 of the user-visible fields |

`unique (source_key, external_id)` is the only uniqueness constraint, and the
primary dedup key.

`fingerprint` is a cross-source bridge and is **not** unique — one site
legitimately publishes distinct listings sharing all three inputs (same grade,
same administration, same closing date, different speciality). Ingestion only
consults it against *other* sources; within a source the site's own id decides.

`content_hash` is what separates "unchanged" from "genuinely updated" on a
re-scrape.

### Descriptive

| Column | Type | Notes |
| --- | --- | --- |
| `title` | `text` not null | |
| `type` | `opportunity_type` not null | |
| `institution` | `text` | school / university / company |
| `institution_logo_url` | `text` | |
| `domains` | `text[]` | slugs from `domains`; GIN indexed for multi-select filtering |
| `location_city`, `location_region` | `text` | null means nationwide |
| `is_remote` | `boolean` | |

### Eligibility

Free text as published, plus structured fields where a source exposes them
cleanly enough to parse. Structured fields are best-effort and nullable —
filtering on them should always be opt-in.

| Column | Type |
| --- | --- |
| `conditions_to_apply` | `text` |
| `required_education_level` | `education_level` |
| `min_experience_years` | `integer` |
| `max_age` | `integer` |
| `languages_required` | `text[]` |
| `positions_available` | `integer` |

### Dates and lifecycle

| Column | Type | Notes |
| --- | --- | --- |
| `deadline` | `timestamptz` | drives sorting, urgency colour and alerts |
| `event_date` | `date` | exam date / programme start |
| `published_at` | `date` | publication date on the source |
| `status` | `opportunity_status` | derived, never written by hand — see below |
| `is_active` | `boolean` | false when a source withdraws a listing; forces `closed` |
| `discovered_at` | `timestamptz` | *date discovered* — never overwritten; drives the "New" badge |
| `last_seen_at` | `timestamptz` | last run that still saw the listing |
| `updated_at` | `timestamptz` | *date last updated* — moves only when `content_hash` changes |

### Content

| Column | Type | Notes |
| --- | --- | --- |
| `application_link` | `text` not null | source URL |
| `description` | `text` | |
| `attributes` | `jsonb` | source-specific extras (grade, concours code, spécialité…) rendered as a detail table, so a new label needs no migration |
| `search_vector` | `tsvector` generated | GIN indexed |

### Full-text search

`search_vector` is a stored generated column built by
`opportunity_search_vector()`, using the `french` configuration — listings are
predominantly French, so stemming and stop words matter.

Weights: `title` **A** > `institution` and `domains` **B** >
`conditions_to_apply` **C** > `description` **D**.

```sql
select *, ts_rank(search_vector, q) as rank
  from opportunities, websearch_to_tsquery('french', 'ingénieur informatique') q
 where search_vector @@ q
 order by rank desc;
```

A helper function must build the vector because a generated column may only
call immutable functions, and `array_to_string()` is merely stable.

There is also a `pg_trgm` index on `title` for fuzzy and prefix matching.

### Status derivation

`status` cannot be a generated column: it depends on `now()`. Instead:

- `compute_opportunity_status(deadline, is_active)` — `closed` when inactive or
  past, `closing_soon` within 7 days, `open` beyond that, `unknown` with no
  deadline;
- a `before insert or update` trigger applies it on every write, and also
  protects `updated_at` from being moved by a `last_seen_at` touch;
- `refresh_opportunity_statuses()` re-derives the whole table and returns how
  many rows changed. Ingestion calls it at the end of every run; call it from a
  daily cron too, so deadlines lapse without a scrape.

## `sources`

One row per scraper module. `key` matches the module name under
`scrapers/morocco_scraper/sources/`. `request_delay_seconds` and
`enabled` let crawl rate be tuned, and a misbehaving source be switched off,
without a code change. `store.ensure_source()` upserts this row on every run.

## `domains`

Canonical tag vocabulary (`slug`, `label_fr`, `label_en`, `sort_order`) — 20
seeded domains from *AI & Data Science* to *Public Administration*.
`opportunities.domains` holds slugs from here. Tags are assigned by the keyword
classifier in `normalize.py`, which is deliberately inspectable rather than
learned.

## `notifications`

One row per `(user_id, opportunity_id, kind)` — and that unique constraint,
`notifications_once_per_reason`, is the entire duplicate-email guarantee. The
notifier inserts the row *before* attempting the send, so a crash mid-send
costs a missed email rather than a duplicate.

| Column | Notes |
| --- | --- |
| `kind` | `new_match` or `deadline_reminder` |
| `created_at` | when the send was claimed |
| `sent_at` | null until the provider accepted it |
| `error` | why it failed, kept for debugging |

A row with `sent_at` set blocks that notification forever. A row with an error
blocks it only for a cooldown (20 hours), after which the claim is re-taken via
`on conflict … do update … where sent_at is null` — so a transient email outage
retries tomorrow instead of silently swallowing the alert.

## `recommended_opportunities(p_limit)`

Ranks open opportunities against `auth.uid()`'s preferences and returns
`(opportunity, match_score, match_reasons)`. `security invoker`, so the
`opportunities` read policy still applies and it cannot be used to read another
user's preferences.

| Signal | Weight |
| --- | --- |
| Type is one the user wants | +4 |
| Each matching domain tag | +3, capped at +6 |
| Remote (and open to it), or a preferred city | +2 |
| Meets the stated education requirement | +3 |
| Falls short of it | **−2** |
| Closes within 30 days | +1 |

Falling short is scored negatively rather than zero, so listings the user
cannot apply for sink instead of merely not rising. The preferences row is
joined rather than read through scalar subqueries, so an empty profile yields
no rows at all and the page prompts the user to fill it in.

`match_reasons` is ordered most-specific-first: "matches the type you are
looking for" is true of nearly every recommendation, so leading with it would
make every card show the same badge.

`education_rank()` exists because the `education_level` enum declares `other`
last, which is meaningless as a level — it maps `bac`…`doctorat` to 1–5 and
everything else to 0 (unknown, not lowest).

## `profiles`, `user_preferences`, `bookmarks`

`profiles` is 1:1 with `auth.users` and carries `is_admin`.
`user_preferences` holds what personalised matching scores against:
`education_level`, `fields_of_interest`, `target_types`, `preferred_cities`,
`languages`, plus `email_alerts_enabled` and `deadline_reminder_days` for
notifications. `bookmarks` is a `(user_id, opportunity_id)` join with `notes`.

Writes go through RLS, never through a page-level check: `with check
(auth.uid() = user_id)` means a forged `user_id` is rejected by the database
itself, whatever the app sends.

A trigger on `auth.users` creates the profile and an empty preferences row on
sign-up, so the app never handles a missing profile.

## `available_cities`

Cities that currently have open listings, with counts, for the browse page's
city filter — a view rather than a client-side distinct so it does not grow
with the table. `security_invoker`, so the `opportunities` read policy applies.

## `scraper_runs` and `source_health`

One `scraper_runs` row per (source, run), sharing a `run_group` uuid across a
single `ingest` invocation. It records status, timing, `pages_fetched`, the
created/updated/unchanged/failed counts, any error, and a `warnings` JSON array
of per-item problems — so a source degrading slowly is visible before it breaks
outright.

`source_health` is the view behind the monitoring page (step 12): one row per
source with its latest run and total listing count.

## Row level security

Enabled on every table.

| Table | anon | authenticated |
| --- | --- | --- |
| `opportunities`, `sources`, `domains` | read | read |
| `profiles`, `user_preferences`, `bookmarks` | — | own rows only |
| `notifications` | — | read own only |
| `scraper_runs` | — | read if `profiles.is_admin` |

No table grants write access to `anon` or `authenticated`: ingestion is the
only writer of `opportunities`, and it connects with the service role, which
bypasses RLS. `source_health` is `security_invoker`, so it cannot be used to
read around the `scraper_runs` policy.
