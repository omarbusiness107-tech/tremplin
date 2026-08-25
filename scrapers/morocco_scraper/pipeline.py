"""Runs scrapers and writes what they find.

The pipeline knows nothing about any particular site, and the scrapers know
nothing about the database. That separation is what lets a source be added
or dropped by adding or deleting one file under `sources/`.

Failure is contained per source: an exception from one scraper marks that
source's run `failed` and the loop continues with the next one.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Iterable

from .http_client import PoliteSession
from .models import RunStats
from .registry import load_all
from .sources.base import BaseScraper
from .store import Store

log = logging.getLogger(__name__)


def run_source(
    scraper_cls: type[BaseScraper],
    store: Store,
    *,
    run_group: uuid.UUID,
    options: dict | None = None,
    session: PoliteSession | None = None,
) -> RunStats:
    """Run one scraper end to end and record the outcome."""
    stats = RunStats(source_key=scraper_cls.key)
    store.ensure_source(
        key=scraper_cls.key,
        name=scraper_cls.name,
        homepage_url=scraper_cls.homepage_url,
        notes=scraper_cls.robots_note,
    )
    run_id = store.start_run(run_group, scraper_cls.key)

    owns_session = session is None
    http = session or PoliteSession()
    scraper = scraper_cls(http, options)
    started = time.monotonic()

    try:
        for opportunity in scraper.scrape():
            stats.items_found += 1
            try:
                result = store.upsert(opportunity)
            except Exception as exc:
                # A row we cannot store is one lost listing, not a lost run.
                stats.items_failed += 1
                scraper.warn(f"could not store {opportunity.external_id}: {exc}")
                log.exception("upsert failed for %s", opportunity.external_id)
                continue
            setattr(stats, f"items_{result}", getattr(stats, f"items_{result}") + 1)

    except Exception as exc:
        stats.error_type = type(exc).__name__
        stats.error_message = str(exc)[:2000]
        log.exception("scraper %s failed", scraper_cls.key)

    finally:
        stats.pages_fetched = http.pages_fetched
        stats.warnings = scraper.warnings
        if owns_session:
            http.close()

    elapsed = time.monotonic() - started
    log.info("%s (%.1fs)", stats.summary(), elapsed)
    store.finish_run(run_id, stats)
    return stats


def ingest(
    store: Store,
    *,
    source_keys: Iterable[str] | None = None,
    options: dict | None = None,
) -> list[RunStats]:
    """Run every requested scraper, then re-derive deadline-based statuses."""
    scrapers = load_all()
    keys = list(source_keys) if source_keys else sorted(scrapers)

    unknown = [k for k in keys if k not in scrapers]
    if unknown:
        raise KeyError(f"unknown source(s): {', '.join(unknown)}")

    run_group = uuid.uuid4()
    log.info("ingestion run %s over %s", run_group, ", ".join(keys))

    results: list[RunStats] = []
    # One session across sources so robots.txt and connections are reused;
    # rate limiting is per host, so sources never starve each other.
    with PoliteSession() as session:
        for key in keys:
            results.append(
                run_source(
                    scrapers[key], store, run_group=run_group, options=options, session=session
                )
            )

    changed = store.refresh_statuses()
    log.info("refreshed status on %s opportunit%s", changed, "y" if changed == 1 else "ies")
    return results
