# Ingestion

See the [root README](../README.md) for setup and the CLI. This file covers
adding a source.

## Adding a source

One file under `morocco_scraper/sources/`. Nothing imports it by name —
`registry.load_all()` discovers it, and `store.ensure_source()` registers it in
the database on first run.

### 1. Check what the site allows

Read its `robots.txt` and terms of service first. Record what you found in
`robots_note`; it ends up in `sources.notes`, so the decision is auditable
later. If the terms forbid automated access, do not write the scraper.

### 2. Write it

```python
from collections.abc import Iterator

from ..models import Opportunity, OpportunityType
from ..normalize import classify_domains, clean_text, parse_deadline
from ..registry import register
from .base import BaseScraper


@register
class ExampleScraper(BaseScraper):
    key = "example"                      # must be unique; becomes sources.key
    name = "Example Careers"
    homepage_url = "https://example.ma"
    robots_note = "robots.txt allows /jobs/; checked 2026-08-24."

    def scrape(self) -> Iterator[Opportunity]:
        soup = BeautifulSoup(self.http.get_text(f"{self.homepage_url}/jobs"), "lxml")

        cards = soup.select(".job-card")
        if not cards:
            # Nothing parsed at all means the layout changed. Fail loudly so
            # the run is marked failed and shows up on the admin page.
            raise LayoutChanged("no .job-card elements found")

        for card in cards:
            try:
                yield self._parse(card)
            except Exception as exc:
                # One bad card must not cost you the other fifty.
                self.warn(f"could not parse a card: {exc}")
```

### 3. Rules that keep the pipeline healthy

- **Yield, don't store.** A scraper never touches the database. Dedup,
  upserting and run bookkeeping happen in `pipeline.py` and `store.py`.
- **Use `self.http`.** It handles robots.txt, rate limiting and retries. Never
  construct your own `requests` session — that is how a site ends up hammered.
- **Normalize through `normalize.py`.** French dates, accent folding, domain
  tagging and the dedup hashes all live there. If a site needs a new date
  format, add it there with a test, not in the scraper.
- **`external_id` must be stable.** It is the primary dedup key. A URL slug or
  a numeric id is fine; a row index on the listing page is not.
- **Fail at the right level.** Per-item problems → `self.warn()`. An
  unrecognisable page → raise. Only the second one should fail the run.
- **Put unmapped fields in `attributes`.** It is `jsonb` and the detail page
  renders it, so a source-specific label needs no migration.

### 4. Test it offline

Save a page under `tests/fixtures/` (strip `<script>`, `<style>` and `<svg>`
first — it keeps the repo light) and drive the scraper with a fake session, as
in `tests/test_emploi_public.py`. Tests must not hit the network: they pin the
parsing rules, while `source_health` catches live drift.

```bash
pytest tests/ -q
```

Then try it for real, small:

```bash
python -m morocco_scraper run --source example --pages 1 --max-items 5 --dry-run
```

## Current sources

| Key | Site | Types | Notes |
| --- | --- | --- | --- |
| `emploi_public` | [emploi-public.ma](https://www.emploi-public.ma) | `concours` | Official MMSP portal. Server-rendered, UUID per listing, structured detail pages. robots.txt disallows only `/*/concours/download/`. |
| `moncallcenter` | [moncallcenter.ma](https://www.moncallcenter.ma) | `job` | Call-centre and BPO board. Rolling adverts with **no deadline**, plus languages, city and a remote flag. Sponsored offers repeat on the same page under the same id. |
| `bourses_9rayti` | [9rayti.com](https://www.9rayti.com) | `scholarship` | Student portal. Prose announcements; the deadline lives in a `data-target-date` attribute — **the visible date is a placeholder**, see below. |

Planned next, per the build plan: university admissions (ENSA, ENCG, EMI, Al
Akhawayn), CNRST and the Ministry of Higher Education for doctorat calls, and
AMCI / Campus France / DAAD / Erasmus+ for scholarships.

## Two traps worth reading before you write a scraper

Both were found by checking the data rather than trusting the page, and both
would have failed silently.

**A visible value can be a placeholder.** On 9rayti every scholarship detail
page prints its deadline twice: `data-target-date` on the countdown element,
and the rendered text inside it. The rendered text is identical on every page
— a template default that JavaScript overwrites at runtime. Scraping what a
human sees would have given all twenty scholarships the same wrong deadline,
and since the deadline drives sorting, urgency and email alerts, nothing would
have looked broken. Check that a field actually *varies* across pages before
trusting it.

**The same listing can appear twice on one page.** MonCallCenter repeats
sponsored offers further down the normal list, and emploi-public shows a
"last chance" carousel of listings that are also in the grid. Neither is a
reason to write a filter: both carry the same id, so the store's
`(source_key, external_id)` match collapses them. Scoping selectors to the
results container handles the carousel; the sponsored repeats are simply
allowed through.
