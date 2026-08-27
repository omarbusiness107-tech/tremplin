# Tremplin

*Tremplin* — French for springboard, which is what the thing is meant to be.

Aggregates opportunities in Morocco — jobs, internships, Bachelor/Master/Doctorat
programmes, scholarships and public-sector *concours* — discovers new listings
automatically, keeps them up to date, and presents them in a searchable,
filterable interface sorted by how soon they close, in **French, English and
Arabic**.

The Python packages are still named `morocco_scraper` and `morocco_notifier`.
Renaming them would touch every import for no reader-facing gain, so the name
change stops at what people actually see.

**Status: all twelve steps of the build plan are done.** Ingestion runs daily
on GitHub Actions from a modular scraper framework; the app browses, filters,
searches and details opportunities; accounts, profiles, personalised
recommendations, bookmarks, email alerts and a scraper monitoring page are all
in place.

Five sources are live, covering public-sector *concours*, post-bac entrance
exams, call-centre jobs, scholarships, and Bachelor/Master/Doctorat programme
catalogues — in both French and Arabic. Adding another source is one file —
see [`scrapers/README.md`](scrapers/README.md).

---

## Repository layout

```
.github/workflows/     daily ingestion, notifications, CI
scripts/               smoke_test.py — check a live deployment
supabase/
  migrations/          schema, RLS policies, seed reference data
  local-dev/           run the same migrations against plain Postgres
scrapers/
  morocco_scraper/     the ingestion pipeline (see "How ingestion works")
    sources/           one module per site — add a source by adding a file
  tests/               offline tests, incl. saved HTML fixtures
notifier/
  morocco_notifier/    email alerts and deadline reminders
web/
  src/i18n/            locale config + fr/en/ar dictionaries
  src/app/[locale]/    every page, under its locale segment
docs/schema.md         table-by-table schema reference
docs/deploy.md         going from a clone to something people can use
```

The three parts share a database and nothing else. Scrapers never import from
the web app, the notifier never imports from the scrapers, and the web app
imports from neither — so a source, an email template or a page can change
without touching the others.

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

### Deploying

[`docs/deploy.md`](docs/deploy.md) walks through Supabase, Vercel, the GitHub
secrets, sign-in redirect URLs and Resend — about 30 minutes. Then:

```bash
python scripts/smoke_test.py --url https://your-app.vercel.app \
  --database-url "$SUPABASE_DB_URL" \
  --supabase-url https://YOUR-REF.supabase.co \
  --anon-key "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
```

Twenty-three checks across the public pages — all three locales, each asserted
on its `lang`/`dir` rather than on translated copy — plus the RLS rules and the
database, including that bookmarks, profiles and scraper runs are *not*
readable anonymously. Exit code is 0 only if all of them pass, so it works in
CI or a cron.

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
pip install -r scrapers/requirements-dev.txt -r notifier/requirements-dev.txt

cd scrapers && pytest    # offline: saved HTML fixtures, no network
cd notifier && pytest    # offline: rendering is pure

# The dedup, RLS and trigger behaviour is SQL, so those tests want a real
# database. Use a dedicated one — they assert exact counts.
createdb tracker_test
DATABASE_URL=postgresql://localhost/tracker_test ./supabase/local-dev/apply.sh
TEST_DATABASE_URL=postgresql://localhost/tracker_test pytest
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

| Kind | Name | Used by | Value |
| --- | --- | --- | --- |
| Secret | `SUPABASE_DB_URL` | ingestion, notifications | the Supabase Postgres connection string |
| Secret | `RESEND_API_KEY` | notifications | Resend API key |
| Variable | `SCRAPER_USER_AGENT` | ingestion | your crawler UA, with a contact URL |
| Variable | `NOTIFIER_FROM` | notifications | `Name <alerts@your-domain.ma>`, on a verified domain |
| Variable | `SITE_URL` | notifications | deployment URL, used for links in emails |

The job only fails when *every* source failed, so one broken site does not turn
the whole run red. A source that ends `partial` or `failed` is written to the
run summary and raises a workflow warning; the underlying detail lands in
`scraper_runs`.

`notify.yml` runs after ingestion completes, with a daily schedule as a safety
net so deadline reminders still go out on a day ingestion failed. Both firing is
harmless — the dedup described under [Notifications](#notifications) means the
second run sends nothing.

`ci.yml` runs the scraper and notifier tests against a real Postgres 16 service
with the migrations applied, and lints and builds the web app.

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

### Search, in two languages

Listings appear in French and Arabic, and one Postgres text search
configuration cannot serve both: snowball dictionaries stem every token they
are handed and never fall through to the next dictionary, so `french` and
`arabic` cannot be chained. There are therefore two stored vectors, and the
query picks one by the script the person typed.

What the Arabic configuration buys is **clitic stripping**, the dominant
problem in Arabic search — an announcement writes `الترشيح`, a person types
`ترشيح`, and under the French configuration those are simply different tokens:

| query | `search_vector` (french) | `search_vector_ar` (arabic) |
| --- | --- | --- |
| `ترشيح` | no match | matches `الترشيح` |
| `مدارس` | no match | matches `المدارس` |

It does **not** unify broken plurals — `مباراة` and `مباريات` still stem apart.
That would need trigram or lemma-based matching.

Two things follow for scrapers. Keep field **labels** out of indexed text:
French stemming collapses *administrateur* and *administration* to one token,
so a boilerplate label leaking into every description made a search for that
grade match the whole table (see `COLUMN_BACKED_LABELS` in the emploi-public
scraper). And render user content with `dir="auto"`, so an Arabic title lays
out right-to-left without the page needing to know which language it is.

`concoursa_9rayti` (below) is the source that actually exercises this — real
Arabic listings, not just tests. Confirmed against the live data: `ترشيح`
matches 5 rows and `مباراة` matches 8, neither of which the French column can
reach at all.

---

---

## Accounts and personalisation

Sign-in is Supabase Auth — a magic link by email, or Google. Browsing needs no
account; signing in adds the personal parts:

- **Profile** (`/profile`) — education level, fields of interest, target
  opportunity types, preferred cities, languages, and alert settings.
- **Recommended for you** — the home page ranks open listings against that
  profile. Scoring is a SQL function, `recommended_opportunities()`, so ranking
  happens next to the data instead of the app fetching everything to sort it.
  Weights are plain integers and every row comes back with the reasons it
  matched, which is what the card badge shows. An empty profile returns nothing
  at all rather than an arbitrary list.
- **Saved** (`/saved`) — bookmarks, soonest deadline first, with a banner for
  anything closing within a week.

Every table is protected by RLS rather than by page-level checks: a user can
only ever read or write their own rows, and forging someone else's `user_id`
is rejected by the database. `/admin` is admin-only and returns 404 to everyone
else — a non-admin has no business knowing it exists.

---

## Notifications

`notifier/` is a separate package from `scrapers/` on purpose: they share a
database and nothing else.

```bash
cd notifier
python -m morocco_notifier send --kind new_match --dry-run   # prints, sends nothing
python -m morocco_notifier send --all                        # both kinds
```

Two kinds:

- **new_match** — a listing discovered since yesterday that matches a profile.
  Stricter than the on-site ranking: it must match a target type or a field of
  interest, *and* the user must meet any stated education requirement. An email
  is interruptive in a way a list on a page is not.
- **deadline_reminder** — a bookmarked listing closing inside the user's chosen
  window (`deadline_reminder_days`, 0 to opt out).

Each person gets **one email per kind per run**, as a digest. Five separate
alerts in an inbox is how an alerts feature gets muted.

**Nobody is emailed twice.** `notifications` has a unique constraint on
`(user_id, opportunity_id, kind)`, and the runner *claims* rows before sending
rather than after. A crash mid-send costs one missed email; doing it the other
way round would cost duplicates, which is the worse failure. A failed send
keeps its row with the error recorded and is retried on the next run after a
cooldown.

Sending is via Resend; `--dry-run` prints the rendered emails and rolls back.

---

## The interface

Three locales, French by default — it is the working language of Moroccan
higher education and public-sector recruitment, and most announcements are
published in it. A bare URL redirects to `/fr`, or to whichever locale a
returning visitor last used.

Arabic is a first-class locale rather than a translation bolted on. It flips
the page to `dir="rtl"`, which the layout follows without a single
RTL-specific rule because spacing and alignment are written with logical
properties (`ms-`, `pe-`, `text-start`). It also selects the Arabic search
vector. Both typefaces — Readex Pro for display, IBM Plex Sans Arabic for
body — carry full Latin *and* Arabic coverage, so a card showing an Arabic
title above a French institution name renders in one family instead of
falling back mid-line.

Listings themselves stay in whatever language their source published them in.
A French concours notice is not machine-translated into Arabic; putting
invented wording next to an official announcement would be worse than leaving
it alone. `dir="auto"` on every piece of scraped text means each one lays out
correctly whichever way the page runs.

**Every listing has a cover image.** Where a source published a logo it sits on
a plate; where it did not, or where a remote image fails to load, what you see
is a generated *zellij* panel — the interlaced eight-point star of Moroccan
tilework, coloured by opportunity type and varied per listing by a hash of its
id. It is drawn as inline SVG rather than shipped as a placeholder graphic, so
there is no request, no layout shift, and no broken state: a card whose image
404s still looks finished.

## Sources

| Key | Site | Type | Shape it exercises |
| --- | --- | --- | --- |
| `emploi_public` | [emploi-public.ma](https://www.emploi-public.ma) | `concours` | Structured label/value detail pages, hard deadlines, no city |
| `moncallcenter` | [moncallcenter.ma](https://www.moncallcenter.ma) | `job` | **No deadline** (rolling), required languages, city, remote flag |
| `bourses_9rayti` | [9rayti.com](https://www.9rayti.com) | `scholarship` | Prose announcements, deadline only in a data attribute |
| `concoursa_9rayti` | [9rayti.com](https://www.9rayti.com) | `concours`, `bachelor`, `master`, `doctorat` | Same trap as above, mostly **Arabic** content, institution acronyms instead of a field description; explicit study cycles go to their own filter |
| `formations_9rayti` | [9rayti.com](https://www.9rayti.com) | `bachelor`, `master`, `doctorat` | Server-rendered programme catalogue, no deadline, full programme page as the link |

That spread is the point: between them they cover every branch of the pipeline
— a source whose listings never close, one whose deadline is machine-readable
only, one that publishes everything as label/value pairs, and one in a second
script and writing system entirely.

The two 9rayti announcement sources share a template (`sources/_nine_rayti.py`) since they are the
same site's two sections — same listing grid, same deadline trap, same
article structure. A new 9rayti section is a ten-line leaf on that base
rather than a full scraper; see the file for what it provides.

## What's next

Breadth, still. The obvious gaps are university admissions (ENSA's own sites,
EMI, Al Akhawayn — beyond what 9rayti already surfaces), CNRST and the
Ministry of Higher Education for doctorat calls, and AMCI / Campus France /
DAAD for more scholarships.

Worth knowing before adding them:

- **Some sites need a browser.** UM6P renders its programme catalogue entirely
  client-side — 338 KB of JavaScript and no text in the HTML. The framework can
  take a Playwright-backed session, but nothing needs one yet, so none is wired
  in.
- **The domain classifier now understands institution acronyms.** Titles that
  name only "FST" or "ENCG" with no field description are tagged via
  `normalize.ACRONYM_DOMAINS` — matched case-sensitively and whole-word against
  the *original* text, never folded, because a folded "EST" collides with the
  ordinary French verb ("c'est"). Extend that dict, not the keyword lists,
  when a new source names institutions this way.
