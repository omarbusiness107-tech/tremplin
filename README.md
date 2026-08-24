# Morocco Opportunities Tracker

Aggregates opportunities in Morocco — jobs, internships, Bachelor/Master/Doctorat
programmes, scholarships and public-sector *concours* — discovers new listings
automatically, keeps them up to date, and presents them in a searchable,
filterable interface sorted by how soon they close.

**Status: steps 1–7 of the build plan are done.** The schema, the scraper
framework and the first source (`emploi_public`) are in place and tested end to
end; ingestion runs daily on GitHub Actions; and the app has a browse page with
URL-backed filtering, sorting, full-text search and an opportunity detail page.

---

## Repository layout

```
.github/workflows/     daily ingestion + CI
supabase/
  migrations/          schema, RLS policies, seed reference data
  local-dev/           run the same migrations against plain Postgres
scrapers/
  morocco_scraper/     the ingestion pipeline (see "How ingestion works")
    sources/           one module per site — add a source by adding a file
  tests/               offline tests, incl. saved HTML fixtures
web/                   Next.js 16 + Tailwind v4 + shadcn-style components
docs/schema.md         table-by-table schema reference
```

The scrapers never import from the web app and the web app never imports from
the scrapers. They meet only at the database.

---

## Setup

### 1. Database

Create a Supabase project, then apply the migrations:

```bash
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase db push
```

Or paste `supabase/migrations/*.sql` into the SQL editor in order. See
[`docs/schema.md`](docs/schema.md) for what each table holds.

<details>
<summary>Local Postgres instead of Supabase</summary>

The migrations reference `auth.users` and `auth.uid()`, which Supabase
provides. `supabase/local-dev/00_auth_shim.sql` recreates just enough of them
to run against a plain Postgres:

```bash
createdb morocco_opportunities
DATABASE_URL=postgresql://localhost/morocco_opportunities \
  ./supabase/local-dev/apply.sh
```
</details>

### 2. Scrapers

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r scrapers/requirements.txt

cp scrapers/.env.example scrapers/.env
# set DATABASE_URL to the Supabase connection string (Settings -> Database)
```

### 3. Web app

```bash
cd web
npm install
cp .env.example .env.local
# set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

---

## Running the scraper

All commands run from `scrapers/`.

```bash
cd scrapers

# What sources are registered?
python -m morocco_scraper list

# Parse and normalize without touching the database — no DATABASE_URL needed.
python -m morocco_scraper run --source emploi_public --pages 1 --dry-run

# Same, but dump the normalized rows to JSON to eyeball them.
python -m morocco_scraper run --source emploi_public --dry-run --out out/preview.json

# The real thing: scrape and upsert.
python -m morocco_scraper run --source emploi_public

# Every registered source. Failures are per-source, so one broken site
# does not stop the others.
python -m morocco_scraper run --all

# Re-derive open / closing soon / closed from deadlines. Ingestion does this
# automatically; run it on its own from a daily cron so deadlines lapse on time.
python -m morocco_scraper refresh-status
```

Useful flags for `run`:

| Flag | Effect |
| --- | --- |
| `--pages N` | How many listing pages to walk (default 3) |
| `--max-items N` | Stop after N items — handy while developing |
| `--no-details` | Skip detail pages: far fewer requests, less complete rows |
| `--include-all-stages` | Keep follow-up notices, not just open calls |
| `--dry-run` | Parse and normalize, write nothing |
| `--out FILE` | With `--dry-run`, write the normalized rows as JSON |
| `-v` | Debug logging |

A run prints a per-source report:

```
source               status     found    new    upd   same   fail
----------------------------------------------------------------
emploi_public        success        8      8      0      0      0
```

Exit code is non-zero only if *every* source failed — a partial run still
delivered listings.

### Tests

```bash
pip install -r scrapers/requirements-dev.txt
cd scrapers && pytest                     # offline: fixtures, no network

# Also exercise the dedup SQL against a real database:
TEST_DATABASE_URL=postgresql://localhost/morocco_opportunities pytest
```

---

## How ingestion works

```
sources/<site>.py          pipeline.py                store.py
  scrape() ──yields──▶  Opportunity ──▶  dedup ──▶  insert / update / touch
                             │                            │
                             └── warnings ────────▶  scraper_runs
```

**A scraper only parses.** It yields `Opportunity` objects and never sees the
database. Everything else — politeness, deduplication, persistence, run
bookkeeping — belongs to the pipeline, which is why a new source is one file.

**Deduplication** happens in `store.py`, identically for every source:

1. match on `(source_key, external_id)` — the same listing, re-scraped;
2. else match on `fingerprint` **from a different source** — an md5 of the
   normalized *title + institution + deadline date*, catching one opportunity
   published on two sites. The incumbent row wins and the duplicate is
   suppressed, so two sources never fight over the same row;
3. else insert.

Step 2 deliberately ignores matches within the same source. A site's own id is
the authority there: emploi-public.ma publishes distinct concours that share
grade, administration and closing date and differ only in speciality, and
merging those would silently drop a real opportunity.

A match whose `content_hash` is unchanged only has `last_seen_at` bumped, so
`updated_at` stays meaningful for a "recently updated" view. `discovered_at` is
never overwritten.

**Failure is contained.** A broken card is a warning and the run continues; a
broken detail page still leaves the listing-level data; only an unrecognisable
listing page fails the source, and other sources still run. Every outcome lands
in `scraper_runs`, which the admin page (step 12) reads through the
`source_health` view.

### Politeness

`http_client.py` gives every scraper, without the scraper asking:

- `robots.txt` fetched once per host and checked before **every** request — a
  disallowed URL raises rather than being fetched;
- a minimum delay between requests to the same host (default 2s, jittered),
  with a stricter `Crawl-delay` from robots.txt always winning;
- exponential-backoff retries on 429/5xx and connection errors, and no retry on
  4xx;
- an honest `User-Agent` naming the project, with a URL to reach the operator.

If a site's `robots.txt` is unreachable, the host is treated as disallowed.

---

## Adding a source

Add one file under `scrapers/morocco_scraper/sources/` — nothing else imports it
by name, and `store.ensure_source()` registers it in the database on first run.
See [`scrapers/README.md`](scrapers/README.md) for the walkthrough.

Before writing a scraper, check the site's `robots.txt` and terms, and record
what you found in the class's `robots_note`.

---

---

## Scheduled ingestion

`.github/workflows/ingest.yml` runs every day at 05:00 UTC (06:00 in
Casablanca), plus on demand from the Actions tab with per-run source, page-count
and dry-run inputs. Runs are serialised by a concurrency group so two
ingestions never write at once.

Configure once, in the repository settings:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `SUPABASE_DB_URL` | the Supabase Postgres connection string |
| Variable | `SCRAPER_USER_AGENT` | your crawler UA, with a contact URL |

The job only fails when *every* source failed, so one broken site does not turn
the whole run red. A source that ends `partial` or `failed` is written to the
run summary and raises a workflow warning; the underlying detail lands in
`scraper_runs`.

`.github/workflows/ci.yml` runs the Python tests against a real Postgres 16
service with the migrations applied, and lints and builds the web app.

---

## Browsing

All browse state lives in the URL, so any filtered view is shareable and
survives a reload:

```
/?q=ingénieur&type=concours&domain=civil-engineering&within=30d&sort=newest
```

| Param | Meaning |
| --- | --- |
| `q` | full-text search (websearch syntax: quoted phrases, `-exclusions`) |
| `type` | comma-separated opportunity types |
| `domain` | comma-separated domain slugs |
| `city` | comma-separated cities |
| `within` | `7d`, `30d` or `90d` from now |
| `closed` | `1` to include listings past their deadline |
| `sort` | `deadline` (default), `newest`, `title` |
| `page` | 1-based |

Different filters combine with AND; multiple values inside one filter are OR —
"master **or** doctorat, in Rabat" is what a multi-select means to a reader.

Search runs against the stored `search_vector` with the `french` configuration.
Because French stemming collapses *administrateur* and *administration* to one
token, scrapers must keep field **labels** out of indexed text — see
`COLUMN_BACKED_LABELS` in the emploi-public scraper for what that looks like in
practice.

---

## What's next

Steps 8–12 of the plan: Supabase Auth accounts and profiles, personalised
matching, bookmarks, email notifications, and the scraper monitoring page.

The schema already carries what these need — `profiles`, `user_preferences`,
`bookmarks`, `scraper_runs` and the `source_health` view — so they are
additive.
